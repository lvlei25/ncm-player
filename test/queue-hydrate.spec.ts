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
  id: 'ENC_A', originalId: '111', name: '歌一', artists: ['歌手A'], album: '专辑A',
  durationMs: 200000, playable: true,
}
const trackB: Track = {
  id: 'ENC_B', originalId: '222', name: '歌二', artists: ['歌手B'], album: '专辑B',
  durationMs: 180000, playable: true,
}

async function freshPlayer() {
  vi.resetModules()
  return (await import('../electron/ncm/player')).player
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({ volume: 60 })
  mocks.readFileSync.mockReturnValue('{"items":[]}')
  mocks.runCli.mockResolvedValue({ json: {}, raw: '' })
})

describe('播放队列持久化与冷启动恢复', () => {
  it('构造时从应用配置恢复队列与当前曲目', async () => {
    mocks.loadConfig.mockReturnValue({ volume: 60, queueTracks: [trackA, trackB], queueIndex: 1 })
    const player = await freshPlayer()

    const queue = player.getQueue()
    expect(queue.tracks).toHaveLength(2)
    expect(queue.currentIndex).toBe(1)
    expect(player.snapshot().current?.id).toBe('ENC_B')
    player.dispose()
  })

  it('setQueue / queueClear 都会落盘队列镜像', async () => {
    const player = await freshPlayer()

    player.setQueue([trackA, trackB], 0, false)
    expect(mocks.saveConfig).toHaveBeenLastCalledWith({ queueTracks: [trackA, trackB], queueIndex: 0 })

    await player.queueClear()
    expect(mocks.saveConfig).toHaveBeenLastCalledWith({ queueTracks: [], queueIndex: -1 })
    player.dispose()
  })

  it('冷启动从 CLI state + queue 恢复队列、当前曲目与播放态', async () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({
      items: [
        { title: '歌一 - 歌手A', encryptedId: 'ENC_A', originalId: 111, duration: 200 },
        { title: '歌二 - 歌手B', encryptedId: 'ENC_B', originalId: 222, duration: 180 },
      ],
    }))
    mocks.runCli.mockImplementation(async (args: string[]) => {
      if (args[0] === 'state') {
        return {
          raw: '',
          json: { state: { status: 'playing', position: 12, duration: 200, currentIndex: 0, queueLength: 2 } },
        }
      }
      if (args[0] === 'queue') {
        return {
          raw: '',
          json: {
            success: true,
            queue: [
              { index: 1, current: true, label: '歌一 - 歌手A' },
              { index: 2, current: false, label: '歌二 - 歌手B' },
            ],
          },
        }
      }
      return { raw: '', json: {} }
    })

    const player = await freshPlayer()
    await player.hydrate()

    const queue = player.getQueue()
    expect(queue.tracks).toHaveLength(2)
    expect(queue.tracks[0]).toMatchObject({ id: 'ENC_A', name: '歌一', artists: ['歌手A'], durationMs: 200000 })
    expect(queue.currentIndex).toBe(0)
    expect(player.snapshot().status).toBe('playing')
    expect(player.snapshot().position).toBe(12)
    expect(mocks.saveConfig).toHaveBeenCalled()
    player.dispose()
  })

  it('CLI 无队列时保持空队列，且状态同步为 stopped', async () => {
    mocks.runCli.mockResolvedValue({
      raw: '',
      json: { state: { status: 'stopped', position: 0, currentIndex: 0, queueLength: 0 } },
    })

    const player = await freshPlayer()
    await player.hydrate()

    expect(player.getQueue().tracks).toHaveLength(0)
    expect(player.snapshot().status).toBe('stopped')
    expect(mocks.runCli).toHaveBeenCalledTimes(1)
    player.dispose()
  })
})
