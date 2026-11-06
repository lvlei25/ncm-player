import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  getCommandTree: vi.fn(),
  resolveCommand: vi.fn(),
  specExists: vi.fn(),
}))

vi.mock('../electron/ncm/runner', () => ({ runCli: mocks.runCli }))
vi.mock('../electron/ncm/discovery', () => ({
  getCommandTree: mocks.getCommandTree,
  resolveCommand: mocks.resolveCommand,
  specExists: mocks.specExists,
}))

import { getPlaylistDetail } from '../electron/ncm/catalog'

const meta = (id: string) => ({
  json: {
    code: 200,
    data: {
      id,
      name: '测试歌单',
      trackCount: 35,
      coverImgUrl: 'http://p1.music.126.net/cover.jpg',
      creatorNickName: '云音乐官方歌单',
      describe: '测试描述',
    },
  },
  raw: '',
})

const tracks = {
  json: {
    code: 200,
    data: [
      {
        id: 'SONG_A',
        originalId: 111,
        name: '歌一',
        artists: [{ name: '歌手A' }],
        album: { name: '专辑A' },
        duration: 256782,
        coverImgUrl: 'http://p1.music.126.net/a.jpg',
      },
      {
        id: 'SONG_B',
        originalId: 222,
        name: '歌二',
        artists: [{ name: '歌手B' }],
        duration: 198000,
      },
    ],
  },
  raw: '',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getCommandTree.mockResolvedValue({ top: ['playlist'], paths: ['playlist get', 'playlist tracks'], raw: '', fetchedAt: Date.now() })
  mocks.resolveCommand.mockImplementation((capability: string, params: Record<string, string>) => {
    const sub = capability === 'playlistTracks' ? 'tracks' : 'get'
    const argv = ['playlist', sub, '--playlistId', params.playlistId]
    const spec = { argv, requiresUserInput: true }
    return { capability, spec, params, argv }
  })
  mocks.specExists.mockReturnValue(true)
})

describe('getPlaylistDetail 曲目链路', () => {
  it('playlist get 只有元数据时，补调 playlist tracks 得到曲目', async () => {
    mocks.runCli.mockResolvedValueOnce(meta('P1')).mockResolvedValueOnce(tracks)

    const result = await getPlaylistDetail('P1')

    expect(result.playlist?.name).toBe('测试歌单')
    expect(result.playlist?.trackCount).toBe(35)
    expect(result.tracks).toHaveLength(2)
    expect(result.tracks[0]).toMatchObject({ id: 'SONG_A', name: '歌一', durationMs: 256782, playable: true })
    expect(result.tracks[0].artists).toEqual(['歌手A'])
    expect(mocks.runCli).toHaveBeenCalledTimes(2)
    expect(mocks.runCli.mock.calls[1][0]).toContain('tracks')
    expect(mocks.runCli.mock.calls[1][0]).toContain('--limit')
  })

  it('命令树没有 playlist tracks 时保持空态，不调用不存在的命令', async () => {
    mocks.specExists.mockReturnValue(false)
    mocks.runCli.mockResolvedValueOnce(meta('P2'))

    const result = await getPlaylistDetail('P2')

    expect(result.playlist?.id).toBe('P2')
    expect(result.tracks).toHaveLength(0)
    expect(mocks.runCli).toHaveBeenCalledTimes(1)
  })

  it('曲目命令失败时降级为空态且不抛错', async () => {
    mocks.runCli.mockResolvedValueOnce(meta('P3')).mockRejectedValueOnce(new Error('unknown command'))

    const result = await getPlaylistDetail('P3')

    expect(result.playlist?.id).toBe('P3')
    expect(result.tracks).toHaveLength(0)
  })

  it('同一歌单二次读取命中缓存，不再重复调用 CLI', async () => {
    mocks.runCli.mockResolvedValueOnce(meta('P4')).mockResolvedValueOnce(tracks)

    await getPlaylistDetail('P4')
    const second = await getPlaylistDetail('P4')

    expect(second.tracks).toHaveLength(2)
    expect(mocks.runCli).toHaveBeenCalledTimes(2)
  })
})
