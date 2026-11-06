import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../src/shared/types'

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  loadConfig: vi.fn(() => ({ volume: 60 })),
  saveConfig: vi.fn(),
  readFileSync: vi.fn(() => '{"items":[]}'),
}))

vi.mock('../electron/ncm/runner', () => ({ runCli: mocks.runCli, cliQueue: { busy: false } }))
vi.mock('../electron/store', () => ({ loadConfig: mocks.loadConfig, saveConfig: mocks.saveConfig }))
vi.mock('node:fs', () => ({
  default: { readFileSync: mocks.readFileSync },
  readFileSync: mocks.readFileSync,
}))

const trackA: Track = {
  id: 'ENC_A', name: '歌一', artists: ['歌手A'], album: '专辑A', durationMs: 200000, playable: true,
}
const trackB: Track = {
  id: 'ENC_B', name: '歌二', artists: ['歌手B'], album: '专辑B', durationMs: 180000, playable: true,
}

async function freshPlayer() {
  vi.resetModules()
  return (await import('../electron/ncm/player')).player
}

const state = (title: string, extra: Record<string, unknown> = {}) => ({
  raw: '',
  json: { state: { status: 'playing', position: 12, duration: 180, queueLength: 2, title, ...extra } },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({ volume: 60 })
  mocks.readFileSync.mockReturnValue('{"items":[]}')
})

describe('播放态轮询随歌曲自动更新', () => {
  it('CLI 切到队列内下一首时，同步当前曲目、时长并落盘索引', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA, trackB], 0, false)
    mocks.runCli.mockResolvedValue(state('歌二 - 歌手B'))

    await player.refreshState()

    const snap = player.snapshot()
    expect(snap.current?.id).toBe('ENC_B')
    expect(snap.currentIndex).toBe(1)
    expect(snap.duration).toBe(180)
    expect(mocks.saveConfig).toHaveBeenLastCalledWith(expect.objectContaining({ queueIndex: 1 }))
    expect(mocks.runCli.mock.calls.every(([args]) => args[0] !== 'play')).toBe(true)
    player.dispose()
  })

  it('曲目标题未变时不误切', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA, trackB], 1, false)
    mocks.runCli.mockResolvedValue(state('歌二 - 歌手B', { position: 30 }))

    await player.refreshState()

    expect(player.snapshot().currentIndex).toBe(1)
    expect(player.getQueue().tracks).toHaveLength(2)
    player.dispose()
  })

  it('CLI 切到本地镜像之外的曲目时，重建队列并定位当前曲目', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA], 0, false)
    mocks.readFileSync.mockReturnValue(JSON.stringify({
      items: [{ title: '歌三 - 歌手C', encryptedId: 'ENC_C', originalId: 333, duration: 210 }],
    }))
    mocks.runCli.mockImplementation(async (args: string[]) => {
      if (args[0] === 'queue') {
        return { raw: '', json: { queue: [{ index: 1, current: true, label: '歌三 - 歌手C' }] } }
      }
      return state('歌三 - 歌手C', { duration: 210, queueLength: 1 })
    })

    await player.refreshState()
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.runCli.mock.calls.some(([args]) => args[0] === 'queue')).toBe(true)
    expect(player.snapshot().current?.name).toBe('歌三')
    expect(player.snapshot().current?.id).toBe('ENC_C')
    player.dispose()
  })
})
