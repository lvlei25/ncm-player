import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcResult, PlaybackState, Track } from '../src/shared/types'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ ok: true, data: null })),
  listen: vi.fn(async () => () => undefined),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import {
  buildSearchArgs,
  invalidateSessionCache,
  mapPlaybackState,
  nextPlayableIndex,
  tauriBridge,
} from '../src/lib/tauriBridge'

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })

const track: Track = {
  id: 'ENC_A',
  name: '歌一',
  artists: ['歌手A'],
  album: '专辑',
  durationMs: 200000,
  playable: true,
}

const snapshot: PlaybackState = {
  status: 'stopped',
  position: 0,
  duration: 200,
  volume: 70,
  currentIndex: -1,
  queueLength: 0,
  current: null,
  playMode: 'order',
}

beforeEach(() => {
  invalidateSessionCache()
  mocks.invoke.mockReset()
  mocks.invoke.mockResolvedValue(ok(null))
  mocks.listen.mockReset()
  mocks.listen.mockResolvedValue(() => undefined)
})

describe('Tauri 桥接：纯函数', () => {
  it('搜索命令模板带 --keyword 与 --userInput', () => {
    const argv = buildSearchArgs('song', '  林俊杰  ')
    expect(argv).toEqual([
      'search', 'song', '--keyword', '林俊杰',
      '--userInput', '用户在播放器中搜索「林俊杰」',
    ])
    expect(buildSearchArgs('playlist', '民谣')[1]).toBe('playlist')
  })

  it('state 兼容 {state:{...}} 与裸对象，毫秒位置换算为秒', () => {
    const nested = mapPlaybackState(
      { state: { status: 'playing', position: 46000, duration: 200, volume: 60 } },
      [track], 0, 'shuffle',
    )
    expect(nested).toMatchObject({
      status: 'playing', position: 46, duration: 200, volume: 60,
      currentIndex: 0, queueLength: 1, playMode: 'shuffle', current: track,
    })

    const flat = mapPlaybackState({ status: 'paused', position: 12, duration: 180 }, [], -1, 'order')
    expect(flat).toMatchObject({
      status: 'paused', position: 12, volume: null, current: null, queueLength: 0, playMode: 'order',
    })
  })
})

describe('Tauri 桥接：IPC', () => {
  it('env.check 转发到 Rust env_check', async () => {
    const report = { node: { ok: true, version: '22.22.1' }, ncmCli: { ok: true, version: '0.1.7' } }
    mocks.invoke.mockResolvedValueOnce(ok(report))

    const res = await tauriBridge.env.check(true)

    expect(mocks.invoke).toHaveBeenCalledWith('env_check', { force: true })
    expect(res).toEqual(ok(report))
  })

  it('会话状态从 config list 与 login --check 组装', async () => {
    mocks.invoke
      .mockResolvedValueOnce(ok('appId: abc123\nprivateKey: ****'))
      .mockResolvedValueOnce(ok({ success: true }))

    const res = await tauriBridge.session.status()

    expect(res).toEqual(ok({ configured: true, loggedIn: true }))
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'cli_invoke', { args: ['login', '--check'] })
  })

  it('未配置凭证时不发起登录检查', async () => {
    mocks.invoke.mockResolvedValueOnce(ok('appId: 未配置'))
    const res = await tauriBridge.session.status()
    expect(res).toEqual(ok({ configured: false, loggedIn: false }))
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })

  it('每日推荐走 recommend daily 并归一化 CLI 结果', async () => {
    mocks.invoke.mockResolvedValueOnce(ok({
      success: true,
      data: { songs: [{ id: 'ENC_A', name: '歌一', artists: [{ name: '歌手A' }], album: { name: '专辑' }, duration: 200000 }] },
    }))

    const res = await tauriBridge.catalog.daily()

    expect(mocks.invoke.mock.calls[0][1].args.slice(0, 2)).toEqual(['recommend', 'daily'])
    expect(res.ok && res.data).toHaveLength(1)
    expect(res.ok && res.data[0].name).toBe('歌一')
  })

  it('歌单元数据无曲目时补取 playlist tracks', async () => {
    mocks.invoke
      .mockResolvedValueOnce(ok({ success: true, data: { id: 'PL_1', name: '我的歌单', trackCount: 2 } }))
      .mockResolvedValueOnce(ok({ success: true, data: { songs: [{ id: 'ENC_A', name: '歌一', duration: 200000 }] } }))

    const res = await tauriBridge.catalog.playlist('PL_1')

    expect(res.ok && res.data.playlist?.name).toBe('我的歌单')
    expect(res.ok && res.data.tracks).toHaveLength(1)
    expect(mocks.invoke.mock.calls[1][1].args.slice(0, 2)).toEqual(['playlist', 'tracks'])
  })

  it('CLI 失败码透传为 IpcResult，不抛异常', async () => {
    mocks.invoke.mockResolvedValueOnce({ ok: false, code: 'UNAUTHORIZED', message: '尚未登录' })
    const res = await tauriBridge.catalog.daily()
    expect(res).toEqual({ ok: false, code: 'UNAUTHORIZED', message: '尚未登录' })
  })

  it('AI 点歌仍留待后续阶段', async () => {
    const chat = await tauriBridge.ai.chat([{ role: 'user', content: '放点音乐' }])
    expect(chat).toMatchObject({ ok: false, code: 'UNSUPPORTED' })
  })

  it('player.state 走 Rust player_snapshot 而不是 CLI 轮询', async () => {
    mocks.invoke.mockResolvedValueOnce(ok(snapshot))
    const res = await tauriBridge.player.state()
    expect(mocks.invoke).toHaveBeenCalledWith('player_snapshot', {})
    expect(res).toEqual(ok(snapshot))
  })

  it('播放模式切换落盘，非法模式被拒绝', async () => {
    expect(await tauriBridge.player.setPlayMode('repeat-one')).toEqual(ok(true))
    expect(mocks.invoke).toHaveBeenCalledWith(
      'player_state_set',
      expect.objectContaining({ playMode: 'repeat-one', play_mode: 'repeat-one' }),
    )
    expect(await tauriBridge.player.setPlayMode('unknown' as never)).toMatchObject({ ok: false, code: 'UNSUPPORTED' })
  })

  it('队列写操作同步持久化', async () => {
    mocks.invoke.mockResolvedValue(ok(true))
    await tauriBridge.player.playQueue([track], 0)
    expect(mocks.invoke).toHaveBeenCalledWith('player_state_set', { queue: [track], index: 0 })
  })

  it('onState 订阅 Rust 事件，取消时解绑', async () => {
    const unlisten = vi.fn()
    let handler: ((event: { payload: PlaybackState }) => void) | null = null
    mocks.listen.mockImplementation(async (_name: string, cb: (event: { payload: PlaybackState }) => void) => {
      handler = cb
      return unlisten
    })

    const received: PlaybackState[] = []
    const dispose = tauriBridge.player.onState((state) => received.push(state))
    await vi.waitFor(() => expect(handler).not.toBeNull())

    handler!({ payload: snapshot })
    expect(received).toEqual([snapshot])
    expect(mocks.listen).toHaveBeenCalledWith('player:state-changed', expect.any(Function))

    dispose()
    expect(unlisten).toHaveBeenCalled()
  })

  it('nextPlayableIndex 双向跳过无版权曲目，末端无解返回 -1', () => {
    const blocked = { ...track, id: 'ENC_B', name: '歌二', playable: false }
    const list = [track, blocked, { ...track, id: 'ENC_C', name: '歌三' }, { ...blocked, id: 'ENC_D', name: '歌四' }]

    expect(nextPlayableIndex(list, 1, 1)).toBe(2)
    expect(nextPlayableIndex(list, 1, -1)).toBe(0)
    expect(nextPlayableIndex(list, 3, 1, false)).toBe(-1)
    expect(nextPlayableIndex([blocked], 0, 1)).toBe(-1)
  })

  it('播放全部保留完整队列，并从首个可播曲目开始', async () => {
    const blocked = { ...track, id: 'ENC_B', name: '歌二', playable: false }
    const list = [blocked, { ...track, id: 'ENC_C', name: '歌三' }]

    const res = await tauriBridge.player.playQueue(list, 0)

    expect(res.ok).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('player_state_set', { queue: list, index: 1 })
    expect(mocks.invoke).toHaveBeenCalledWith('cli_invoke', {
      args: expect.arrayContaining(['play', '--song', '--encrypted-id', 'ENC_C']),
    })
  })

  it('保存凭证转发到 Rust session_save', async () => {
    const res = await tauriBridge.session.save(' app-1 ', ' key-1 ')

    expect(res.ok).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('session_save', {
      appId: ' app-1 ', privateKey: ' key-1 ',
      app_id: ' app-1 ', private_key: ' key-1 ',
    })
  })

  it('凭证为空时透传 Rust 的 CREDENTIALS 错误码', async () => {
    mocks.invoke.mockResolvedValueOnce({ ok: false, code: 'CREDENTIALS', message: 'appId 与 privateKey 不能为空' })

    const res = await tauriBridge.session.save('', '')

    expect(res).toMatchObject({ ok: false, code: 'CREDENTIALS' })
  })

  it('扫码登录返回 Rust 提取的链接票据', async () => {
    const ticket = { ok: true, link: 'https://music.163.com/login?code=abc', raw: '扫码：https://music.163.com/login?code=abc' }
    mocks.invoke.mockResolvedValueOnce(ok(ticket))

    const res = await tauriBridge.session.loginStart()

    expect(mocks.invoke).toHaveBeenCalledWith('session_login_start', {})
    expect(res.ok && res.data).toEqual(ticket)
  })

  it('退出登录转发到 Rust session_logout', async () => {
    const res = await tauriBridge.session.logout()

    expect(res.ok).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('session_logout', {})
  })

  it('会话状态 60s 内复用缓存，force 强制重新探测', async () => {
    mocks.invoke
      .mockResolvedValueOnce(ok('appId: abc123'))
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(ok('appId: abc123'))
      .mockResolvedValueOnce(ok({ success: false }))

    const first = await tauriBridge.session.status()
    expect(first).toEqual(ok({ configured: true, loggedIn: true }))
    expect(await tauriBridge.session.status()).toEqual(first)
    expect(mocks.invoke).toHaveBeenCalledTimes(2)

    expect(await tauriBridge.session.status(true)).toEqual(ok({ configured: true, loggedIn: false }))
    expect(mocks.invoke).toHaveBeenCalledTimes(4)
  })

  it('会话变更订阅 Rust 事件，事件刷新缓存且取消时解绑', async () => {
    const unlisten = vi.fn()
    let handler: ((event: { payload: { configured: boolean; loggedIn: boolean } }) => void) | null = null
    mocks.listen.mockImplementation(
      async (_name: string, cb: (event: { payload: { configured: boolean; loggedIn: boolean } }) => void) => {
        handler = cb
        return unlisten
      },
    )

    const received: Array<{ configured: boolean; loggedIn: boolean }> = []
    const dispose = tauriBridge.session.onChange((s) => received.push(s))
    await vi.waitFor(() => expect(handler).not.toBeNull())

    const payload = { configured: true, loggedIn: true }
    handler!({ payload })
    expect(received).toEqual([payload])
    expect(mocks.listen).toHaveBeenCalledWith('session:changed', expect.any(Function))
    expect(await tauriBridge.session.status()).toEqual(ok(payload))

    dispose()
    expect(unlisten).toHaveBeenCalled()
  })

  it('会话缓存显式失效后重新探测', async () => {
    mocks.invoke
      .mockResolvedValueOnce(ok('appId: abc'))
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(ok('appId: 未配置'))

    await tauriBridge.session.status()
    invalidateSessionCache()

    expect(await tauriBridge.session.status()).toEqual(ok({ configured: false, loggedIn: false }))
    expect(mocks.invoke).toHaveBeenCalledTimes(3)
  })

  it('保存凭证会立即使会话缓存失效', async () => {
    mocks.invoke
      .mockResolvedValueOnce(ok('appId: abc'))
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok('appId: 未配置'))

    await tauriBridge.session.status()
    await tauriBridge.session.save('a', 'b')

    expect(await tauriBridge.session.status()).toEqual(ok({ configured: false, loggedIn: false }))
    expect(mocks.invoke).toHaveBeenCalledTimes(4)
  })

  it('向导完成标记写入 Rust 侧 prefs', async () => {
    const res = await tauriBridge.app.setOnboarded(true)

    expect(res.ok).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('onboarded_set', { value: true })
  })
})
