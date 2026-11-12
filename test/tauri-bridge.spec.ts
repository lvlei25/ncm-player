import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcResult, PlaybackState, Track } from '../src/shared/types'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ ok: true, data: null })),
  listen: vi.fn(async () => () => undefined),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import { buildSearchArgs, mapPlaybackState, tauriBridge } from '../src/lib/tauriBridge'

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

  it('后续阶段能力返回 UNSUPPORTED', async () => {
    const chat = await tauriBridge.ai.chat([{ role: 'user', content: '放点音乐' }])
    expect(chat).toMatchObject({ ok: false, code: 'UNSUPPORTED' })
    expect(await tauriBridge.session.save('a', 'b')).toMatchObject({ ok: false, code: 'UNSUPPORTED' })
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
})
