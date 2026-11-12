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

const track = (id: string, name: string, playable = true): Track => ({
  id,
  name,
  artists: ['歌手'],
  album: '专辑',
  durationMs: 200000,
  playable,
})

/** A/C 可播、B/D 无版权：模拟真实每日推荐的混合列表 */
const mixed = [
  track('ENC_A', '歌一'),
  track('ENC_B', '歌二', false),
  track('ENC_C', '歌三'),
  track('ENC_D', '歌四', false),
]

async function freshPlayer(playMode: PlayMode = 'order') {
  vi.resetModules()
  mocks.loadConfig.mockReturnValue({ volume: 60, playMode } as ReturnType<typeof mocks.loadConfig>)
  return (await import('../electron/ncm/player')).player
}

const playIds = () =>
  mocks.runCli.mock.calls
    .filter(([args]) => args[0] === 'play' && args[1] === '--song')
    .map(([args]) => args[args.indexOf('--encrypted-id') + 1])

const stopCalls = () => mocks.runCli.mock.calls.filter(([args]) => args[0] === 'stop')

/** 构造「刚播放到曲末」的 CLI 状态，标题需命中本地曲目以免触发队列重建 */
function nearEnd(index: number) {
  return {
    raw: '',
    json: {
      state: {
        status: 'playing',
        position: 199,
        duration: 200,
        queueLength: mixed.length,
        currentIndex: index,
        title: `${mixed[index].name} - 歌手`,
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({ volume: 60, playMode: 'order' } as ReturnType<typeof mocks.loadConfig>)
  mocks.readFileSync.mockReturnValue('{"items":[]}')
  mocks.runCli.mockResolvedValue({ raw: '', json: { success: true } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('播放全部保留完整队列并跳过无版权曲目', () => {
  it('setQueue 不再丢弃不可播放曲目，队列长度与展示一致', async () => {
    const player = await freshPlayer()
    player.setQueue(mixed, 0, false)

    expect(player.getQueue().tracks).toHaveLength(4)
    expect(player.snapshot().queueLength).toBe(4)
    expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ queueTracks: mixed }))
    player.dispose()
  })

  it('playPlaylist 同样保留完整曲目镜像', async () => {
    const player = await freshPlayer()
    await player.playPlaylist('PL_1', mixed)

    expect(player.getQueue().tracks).toHaveLength(4)
    player.dispose()
  })

  it('从不可播放的起点开始，自动跳到下一首可播放', async () => {
    const player = await freshPlayer()
    player.setQueue(mixed, 1, false)

    await player.playAt(1)

    expect(playIds()).toEqual(['ENC_C'])
    expect(player.snapshot().currentIndex).toBe(2)
    player.dispose()
  })

  it('下一首 / 上一首沿各自方向跳过不可播放曲目', async () => {
    const player = await freshPlayer()
    player.setQueue(mixed, 0, false)

    await player.step(1)
    await player.step(1)
    await player.step(-1)

    expect(playIds()).toEqual(['ENC_C', 'ENC_A', 'ENC_C'])
    player.dispose()
  })

  it('顺序播放：末尾只剩不可播放曲目时停止，不绕回开头', async () => {
    const player = await freshPlayer()
    player.setQueue(mixed, 2, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(2))

    await player.refreshState()

    expect(playIds()).toHaveLength(0)
    expect(stopCalls()).toHaveLength(1)
    expect(player.snapshot().status).toBe('stopped')
    player.dispose()
  })

  it('列表循环：跳过末尾不可播放曲目回到开头', async () => {
    const player = await freshPlayer('repeat-all')
    player.setQueue(mixed, 2, false)
    mocks.runCli.mockResolvedValueOnce(nearEnd(2))

    await player.refreshState()

    expect(playIds()).toEqual(['ENC_A'])
    player.dispose()
  })

  it('整列都不可播放时不下发播放命令', async () => {
    const player = await freshPlayer()
    player.setQueue([track('ENC_B', '歌二', false), track('ENC_D', '歌四', false)], 0, false)

    await player.playAt(0)

    expect(playIds()).toHaveLength(0)
    expect(player.snapshot().status).toBe('stopped')
    player.dispose()
  })

  it('状态推送的 queueLength 与完整队列一致', async () => {
    const player = await freshPlayer()
    const listener = vi.fn()
    player.subscribe(listener)

    player.setQueue(mixed, 0, false)

    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ queueLength: 4 }))
    player.dispose()
  })
})
