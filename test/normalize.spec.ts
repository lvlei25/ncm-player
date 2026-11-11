import { describe, expect, it } from 'vitest'
import { dedupeTracks, deepString, harvest, normalizeSearch } from '../electron/ncm/normalize'
import { nestedTrapResponse, playlistRadarResponse, searchSongResponse } from './fixtures'

describe('normalize.harvest / 歌曲', () => {
  it('从真实搜索结果里取出歌曲字段', () => {
    const { tracks } = harvest(searchSongResponse)
    expect(tracks).toHaveLength(2)

    const first = tracks[0]
    expect(first.id).toBe('AC34480C9320CE5652E2BCB41AEFA265')
    expect(first.originalId).toBe('108965')
    expect(first.name).toBe('冻结')
    expect(first.artists).toEqual(['林俊杰'])
    expect(first.album).toBe('乐行者')
    expect(first.durationMs).toBe(289093)
    expect(first.playable).toBe(true)
  })

  it('封面统一升级为 https', () => {
    const { tracks } = harvest(searchSongResponse)
    expect(tracks[0].coverUrl).toMatch(/^https:\/\/p1\.music\.126\.net\//)
  })

  it('noCopyrightRcmd 非空时判定为不可播放', () => {
    const { tracks } = harvest(searchSongResponse)
    expect(tracks[1].playable).toBe(false)
    expect(tracks[1].reason).toBeTruthy()
  })

  it('不会把 album / artists 嵌套对象误判成歌曲', () => {
    const { tracks } = harvest(nestedTrapResponse)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].name).toBe('外层歌曲')
  })

  it('搜索综合结果按类型分流', () => {
    const result = normalizeSearch(searchSongResponse)
    expect(result.tracks).toHaveLength(2)
    expect(result.playlists).toHaveLength(0)
  })

  it('歌手字符串按斜杠、顿号、逗号与 & 分割', () => {
    const { tracks } = harvest({
      data: [{ id: 'X'.repeat(32), name: '合唱', artists: '张三 / 李四、王五,赵六&钱七', duration: 200000 }],
    })
    expect(tracks[0].artists).toEqual(['张三', '李四', '王五', '赵六', '钱七'])
  })

  it('duration 以毫秒原样保留（大于 10000 视为 ms）', () => {
    const { tracks } = harvest({ data: [{ id: 'X'.repeat(32), name: '短', duration: 5 }] })
    expect(tracks[0].durationMs).toBe(5000)
  })
})

describe('normalize.harvest / 歌单', () => {
  it('识别雷达歌单并映射真实字段名', () => {
    const { playlists } = harvest(playlistRadarResponse)
    expect(playlists).toHaveLength(1)

    const playlist = playlists[0]
    expect(playlist.id).toBe('9C2708922E4E0E0B61EBB3598C81F381')
    expect(playlist.originalId).toBe('5300458264')
    expect(playlist.name).toContain('庄淇玟')
    expect(playlist.trackCount).toBe(30)
    // 真实字段是 creatorNickName / describe
    expect(playlist.creator).toBe('云音乐私人雷达')
    expect(playlist.description).toBe('你最爱的歌手 新鲜发行的作品 都在新歌雷达')
    expect(playlist.coverUrl).toMatch(/^https:\/\//)
  })

  it('带 trackCount 的对象不会被当成歌曲', () => {
    const { tracks } = harvest(playlistRadarResponse)
    expect(tracks).toHaveLength(0)
  })
})

describe('normalize 工具', () => {
  it('dedupeTracks 去掉同名同 id 的重复项', () => {
    const { tracks } = harvest(searchSongResponse)
    const merged = dedupeTracks([...tracks, ...tracks])
    expect(merged).toHaveLength(2)
  })

  it('deepString 能挖到深层字符串', () => {
    const value = deepString({ a: { b: [{ lrc: { lyric: '[00:01.00]hello' } }] } }, ['lyric'])
    expect(value).toBe('[00:01.00]hello')
  })

  it('空输入不抛错', () => {
    expect(harvest(null).tracks).toHaveLength(0)
    expect(harvest({}).tracks).toHaveLength(0)
  })
})
