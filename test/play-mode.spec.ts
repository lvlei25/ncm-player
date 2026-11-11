import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayMode, Track } from '../src/shared/types'

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  loadConfig: vi.fn(() => ({ volume: 60, playMode: 'order' })),
  saveConfig: vi.fn(),
  readFileSync: vi.fn(() => '{"items":[]}'),
}))

vi.mock('../electron/ncm/runner', () => ({ runCli: mocks.runCli, cliQueue: { busy: false } }))
vi.mock('../electron/store', () => ({ loadConfig: mocks.loadConfig, saveConfig: mocks.saveConfig }))
vi.mock('node:fs', () => ({
  default: { readFileSync: mocks.readFileSync },
  readFileSync: mocks.readFileSync,
}))

const tracks: Track[] = ['ENC_A', 'ENC_B', 'ENC_C'].map((id, i) => ({
  id,
  name: ['歌一', '歌二', '歌三'][i],
  artists: [`歌手${i}`],
  album: '专辑',
  durationMs: 200000,
  playable: true,
}))

async function freshPlayer(playMode: PlayMode = 'order') {
  vi.resetModules()
  mocks.loadConfig.mockReturnValue({ volume: 60, playMode } as ReturnType<typeof mocks.loadConfig>)
  return (await import('../electron/ncm/player')).player
}

/** 构造「刚播放到曲末」的 CLI 状态 */
function nearEnd(index = 0) {
  return {
    raw: '',
    json: {
      state: {
        status: 'playing',
        position: 199,
        duration: 200,
        queueLength: tracks.length,
        currentIndex: index,
        title: `${tracks[index].name} - 歌手${index}`,
      },
    },
  }
}

const playIds = () =>
  mocks.runCli.mock.calls
    .filter(([args]) => args[0] === 'play' && args[1] === '--song')
    .map(([args]) => args[args.indexOf('--encrypted-id') + 1])

const stopCalls = () => mocks.runCli.mock.calls.filter(([args]) => args[0] === 'stop')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({ volume: 60, playMode: 'order' } as ReturnType<typeof mocks.loadConfig>)
  mocks.readFileSync.mockReturnValue('{"items":[]}')
  mocks.runCli.mockResolvedValue({ raw: '', json: { success: true } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('播放模式', () => {
  it('setPlayMode 持久化并通过状态推送更新 UI', async () => {
    const player = await freshPlayer()
    const listener = vi.fn()
    player.subscribe(listener)

    player.setPlayMode('repeat-one')

    expect(player.snapshot().playMode).toBe('repeat-one')
    expect(mocks.saveConfig).toHaveBeenCalledWith({ playMode: 'repeat-one' })
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ playMode: 'repeat-one' }))
    player.dispose()
  })

  it('非法旧配置回退到顺序播放', async () => {
    const player = await freshPlayer('loop' as PlayMode)
    expect(player.snapshot().playMode).toBe('order')
    player.dispose()
  })

  it('顺序播放：曲末播下一首', async () => {
    const player = await freshPlayer()
    player.setQueue(tracks, 0, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(0))

    await player.refreshState()

    expect(playIds()).toEqual(['ENC_B'])
    player.dispose()
  })

  it('顺序播放：最后一首播完停止', async () => {
    const player = await freshPlayer()
    player.setQueue(tracks, 2, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(2))

    await player.refreshState()

    expect(playIds()).toHaveLength(0)
    expect(stopCalls()).toHaveLength(1)
    expect(player.snapshot().status).toBe('stopped')
    player.dispose()
  })

  it('列表循环：最后一首回到第一首', async () => {
    const player = await freshPlayer('repeat-all')
    player.setQueue(tracks, 2, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(2))

    await player.refreshState()

    expect(playIds()).toEqual(['ENC_A'])
    player.dispose()
  })

  it('单曲循环：曲末重播当前曲目', async () => {
    const player = await freshPlayer('repeat-one')
    player.setQueue(tracks, 1, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(1))

    await player.refreshState()

    expect(playIds()).toEqual(['ENC_B'])
    expect(player.snapshot().currentIndex).toBe(1)
    player.dispose()
  })

  it('随机播放：曲末切到另一首', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const player = await freshPlayer('shuffle')
    player.setQueue(tracks, 0, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(0))

    await player.refreshState()

    expect(playIds()).toEqual(['ENC_C'])
    player.dispose()
  })

  it('手动下一首在单曲循环模式下仍能切歌', async () => {
    const player = await freshPlayer('repeat-one')
    player.setQueue(tracks, 0, false)

    await player.step(1)

    expect(playIds()).toEqual(['ENC_B'])
    player.dispose()
  })
})
