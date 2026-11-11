import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execRaw: vi.fn(),
  runCli: vi.fn(),
  loadConfig: vi.fn(() => ({})),
  saveConfig: vi.fn(),
}))

vi.mock('../electron/ncm/runner', () => ({
  execRaw: mocks.execRaw,
  runCli: mocks.runCli,
  NcmError: class extends Error {},
}))
vi.mock('../electron/ncm/cli-bin', () => ({ cliBin: () => 'ncm-cli' }))
vi.mock('../electron/store', () => ({ loadConfig: mocks.loadConfig, saveConfig: mocks.saveConfig }))

const stdout = (text: string) => ({ stdout: text, stderr: '', code: 0 })

async function freshSession() {
  vi.resetModules()
  return await import('../electron/ncm/session')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({})
  mocks.execRaw.mockImplementation(async (_bin: string, args: string[]) => {
    const cmd = args[0]
    if (cmd === 'config') return stdout('appId: demo_appid\nplayer: mpv\n')
    if (cmd === 'login') return stdout('{"success": true}')
    if (cmd === 'user') return stdout('{"success":true,"data":{"nickname":"测试用户"}}')
    if (cmd === '--version') return stdout('0.1.7')
    if (cmd === 'mpv') return stdout('mpv 0.41.0')
    if (cmd === 'node') return stdout('v22.22.1')
    return stdout('')
  })
})

describe('会话冷启动不阻塞首屏', () => {
  it('无本地登录记录时立即返回默认值，后台探测后推送真实状态', async () => {
    const session = await freshSession()
    const listener = vi.fn()
    session.setSessionListener(listener)

    const started = Date.now()
    const value = await session.getSession()

    expect(Date.now() - started).toBeLessThan(50)
    expect(value).toMatchObject({ configured: false, loggedIn: false })
    await new Promise((r) => setTimeout(r, 30))
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ configured: true, loggedIn: true, nickname: '测试用户' }),
    )
  })

  it('后台探测完成后 60s 内重复读取不再调用 CLI', async () => {
    const session = await freshSession()
    mocks.loadConfig.mockReturnValue({ loggedIn: true, configured: true, nickname: '缓存用户' })
    session.setSessionListener(vi.fn())

    await session.getSession()
    await new Promise((r) => setTimeout(r, 30))
    const before = mocks.execRaw.mock.calls.length

    const again = await session.getSession()

    expect(again.loggedIn).toBe(true)
    expect(mocks.execRaw.mock.calls.length).toBe(before)
  })

  it('force=true 仍执行真实探测', async () => {
    const session = await freshSession()
    session.setSessionListener(vi.fn())
    await session.getSession()
    await new Promise((r) => setTimeout(r, 30))
    const before = mocks.execRaw.mock.calls.length

    const value = await session.getSession(true)

    expect(value.configured).toBe(true)
    expect(mocks.execRaw.mock.calls.length).toBeGreaterThan(before)
  })

  it('环境自检 30s 内复用结果，force 可强制刷新', async () => {
    const session = await freshSession()
    session.setSessionListener(vi.fn())
    mocks.loadConfig.mockReturnValue({ loggedIn: true, configured: true, nickname: '缓存用户' })
    await session.getSession()
    await new Promise((r) => setTimeout(r, 30))
    const before = mocks.execRaw.mock.calls.length

    const first = await session.checkEnv()
    const afterFirst = mocks.execRaw.mock.calls.length
    const second = await session.checkEnv()
    const afterSecond = mocks.execRaw.mock.calls.length

    expect(afterFirst).toBeGreaterThan(before)
    expect(second).toEqual(first)
    expect(afterSecond).toBe(afterFirst)

    await session.checkEnv(true)
    expect(mocks.execRaw.mock.calls.length).toBeGreaterThan(afterSecond)
  })
})
