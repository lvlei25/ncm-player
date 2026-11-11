import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Playlist, Track } from '../src/shared/types'

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  getCommandTree: vi.fn(),
  resolveCommand: vi.fn(),
  specExists: vi.fn(),
  loadConfig: vi.fn(() => ({})),
  saveConfig: vi.fn(),
}))

vi.mock('../electron/ncm/runner', () => ({ runCli: mocks.runCli }))
vi.mock('../electron/ncm/discovery', () => ({
  getCommandTree: mocks.getCommandTree,
  resolveCommand: mocks.resolveCommand,
  specExists: mocks.specExists,
}))
vi.mock('../electron/store', () => ({ loadConfig: mocks.loadConfig, saveConfig: mocks.saveConfig }))

const track: Track = {
  id: 'S1', name: '歌一', artists: ['歌手A'], album: '专辑A', durationMs: 200000, playable: true,
}
const playlist: Playlist = { id: 'P1', name: '推荐歌单', trackCount: 10, playable: true }

async function freshCatalog() {
  vi.resetModules()
  return await import('../electron/ncm/catalog')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({})
  mocks.getCommandTree.mockResolvedValue({ top: ['recommend', 'playlist'], paths: ['recommend daily', 'playlist radar'], raw: '', fetchedAt: Date.now() })
  mocks.resolveCommand.mockImplementation((capability: string) => {
    const sub = capability === 'recommendPlaylists' ? ['playlist', 'radar'] : ['recommend', 'daily']
    const spec = { argv: sub, requiresUserInput: true }
    return { capability, spec, params: {}, argv: sub }
  })
  mocks.specExists.mockReturnValue(true)
  mocks.runCli.mockImplementation(async (args: string[]) => {
    if (args[0] === 'playlist') return { raw: '', json: { data: [{ ...playlist, coverImgUrl: 'http://p1.music.126.net/x.jpg' }] } }
    return { raw: '', json: { data: [track] } }
  })
})

describe('发现页数据缓存', () => {
  it('每日推荐二次读取命中内存缓存，不再调用 CLI', async () => {
    const catalog = await freshCatalog()

    const first = await catalog.getDailyRecommend()
    const calls = mocks.runCli.mock.calls.length
    const second = await catalog.getDailyRecommend()

    expect(first).toHaveLength(1)
    expect(second).toEqual(first)
    expect(mocks.runCli.mock.calls.length).toBe(calls)
    expect(mocks.saveConfig).toHaveBeenCalled()
  })

  it('重启后读取落盘缓存，零 CLI 调用', async () => {
    const catalog = await freshCatalog()
    mocks.loadConfig.mockReturnValue({ discoverDaily: [track], discoverDailyAt: Date.now() })

    const result = await catalog.getDailyRecommend()

    expect(result).toEqual([track])
    expect(mocks.runCli).not.toHaveBeenCalled()
  })

  it('落盘缓存过期后重新拉取并写回', async () => {
    const catalog = await freshCatalog()
    mocks.loadConfig.mockReturnValue({ discoverDaily: [track], discoverDailyAt: Date.now() - 60 * 60_000 })

    const result = await catalog.getDailyRecommend()

    expect(result).toHaveLength(1)
    expect(mocks.runCli).toHaveBeenCalled()
    expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ discoverDaily: result }))
  })

  it('推荐歌单同样支持内存与落盘缓存', async () => {
    const catalog = await freshCatalog()
    mocks.loadConfig.mockReturnValue({ discoverPlaylists: [playlist], discoverPlaylistsAt: Date.now() })

    const result = await catalog.getRecommendedPlaylists()

    expect(result).toEqual([playlist])
    expect(mocks.runCli).not.toHaveBeenCalled()
  })

  it('空结果不污染缓存', async () => {
    const catalog = await freshCatalog()
    mocks.runCli.mockResolvedValue({ raw: '', json: { data: [] } })

    await catalog.getDailyRecommend()
    await catalog.getDailyRecommend()

    expect(mocks.runCli.mock.calls.length).toBe(2)
    expect(mocks.saveConfig).not.toHaveBeenCalled()
  })
})
