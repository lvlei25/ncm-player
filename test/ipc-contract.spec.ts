import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  ipcOn: vi.fn(),
  openExternal: vi.fn(async () => undefined),
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', getPath: () => '/tmp', isPackaged: false },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: { handle: mocks.ipcHandle, on: mocks.ipcOn },
  shell: { openExternal: mocks.openExternal },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

vi.mock('../electron/ncm/catalog', () => ({
  search: vi.fn(),
  getDailyRecommend: vi.fn(),
  getRecommendedPlaylists: vi.fn(),
  getPlaylistDetail: vi.fn(),
  getLyric: vi.fn(),
}))
vi.mock('../electron/ncm/player', () => ({ player: {} }))
vi.mock('../electron/ncm/runner', () => ({
  NcmError: class NcmError extends Error {
    code = 'UNKNOWN'
  },
}))
vi.mock('../electron/ncm/session', () => ({
  checkEnv: vi.fn(),
  getSession: vi.fn(),
  invalidateSession: vi.fn(),
  logout: vi.fn(),
  setCredentials: vi.fn(),
  startLogin: vi.fn(),
}))
vi.mock('../electron/ai/service', () => ({ chat: vi.fn() }))
vi.mock('../electron/store', () => ({
  getAiKey: vi.fn(() => ''),
  loadConfig: vi.fn(() => ({})),
  saveConfig: vi.fn(),
  setAiKey: vi.fn(),
}))

describe('IPC 返回契约', () => {
  it('shell:open-external 返回 IpcResult<boolean> 而不是裸 boolean', async () => {
    const { registerIpc } = await import('../electron/ipc')
    registerIpc()

    const registered = mocks.ipcHandle.mock.calls.find(([channel]) => channel === 'shell:open-external')
    expect(registered).toBeDefined()
    const handler = registered![1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, 'https://music.163.com')
    expect(result).toEqual({ ok: true, data: true })
    expect(mocks.openExternal).toHaveBeenCalledWith('https://music.163.com')
  })

  it('非 http(s) 链接被拒绝且仍返回结构化结果', async () => {
    mocks.openExternal.mockClear()
    const { registerIpc } = await import('../electron/ipc')
    registerIpc()
    const registered = mocks.ipcHandle.mock.calls.find(([channel]) => channel === 'shell:open-external')
    const handler = registered![1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, 'file:///etc/passwd')
    expect(result).toEqual({ ok: true, data: true })
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })

  it('所有 invoke 通道都经统一包装注册', async () => {
    mocks.ipcHandle.mockClear()
    const { registerIpc } = await import('../electron/ipc')
    registerIpc()
    const channels = mocks.ipcHandle.mock.calls.map(([channel]) => channel)
    expect(new Set(channels).size).toBe(channels.length)
    expect(channels).toContain('player:state')
    expect(channels).toContain('shell:open-external')
  })
})
