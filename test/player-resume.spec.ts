import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../src/shared/types'

const BASE = 1_700_000_000_000
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

let nowSpy: ReturnType<typeof vi.spyOn>

async function freshPlayer() {
  vi.resetModules()
  return (await import('../electron/ncm/player')).player
}

function stoppedState(position = 0, duration = 200) {
  return {
    raw: '',
    json: {
      state: {
        status: 'stopped', position, duration, queueLength: 1,
        title: '歌一 - 歌手A', currentIndex: 0,
      },
    },
  }
}

function mockCli(stateEnvelope: ReturnType<typeof stoppedState>) {
  mocks.runCli.mockImplementation(async (args: string[]) => {
    if (args[0] === 'state') return stateEnvelope
    return { raw: '', json: { success: true } }
  })
}

const playCalls = () => mocks.runCli.mock.calls.filter(([args]) => args[0] === 'play')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({ volume: 60 })
  mocks.readFileSync.mockReturnValue('{"items":[]}')
  mocks.runCli.mockResolvedValue({ raw: '', json: { success: true } })
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(BASE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('断流后自动恢复播放', () => {
  it('意外停止且持续超过 3 秒时，自动重播当前曲目', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA], 0, false)
    mockCli(stoppedState())

    await player.refreshState()
    nowSpy.mockReturnValue(BASE + 4000)
    await player.refreshState()

    expect(playCalls()).toHaveLength(1)
    expect(playCalls()[0][0]).toContain('ENC_A')
    expect(player.snapshot().status).toBe('playing')
    player.dispose()
  })

  it('用户主动停止后不自动恢复', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA], 0, false)
    await player.stop()
    mockCli(stoppedState())

    await player.refreshState()
    nowSpy.mockReturnValue(BASE + 4000)
    await player.refreshState()

    expect(playCalls()).toHaveLength(0)
    player.dispose()
  })

  it('曲末停顿不误触发恢复（交给 CLI 自动切歌）', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA], 0, false)
    mockCli(stoppedState(199, 200))

    await player.refreshState()
    nowSpy.mockReturnValue(BASE + 4000)
    await player.refreshState()

    expect(playCalls()).toHaveLength(0)
    player.dispose()
  })

  it('连续断流最多自动重试 3 次', async () => {
    const player = await freshPlayer()
    player.setQueue([trackA], 0, false)
    mockCli(stoppedState())

    for (let i = 0; i < 8; i += 1) {
      nowSpy.mockReturnValue(BASE + 4000 + i * 6000)
      await player.refreshState()
    }

    expect(playCalls()).toHaveLength(3)
    player.dispose()
  })
})
