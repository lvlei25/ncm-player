import type { LyricPayload, Playlist, SearchResult, SearchType, Track } from '../../src/shared/types'
import { getCommandTree, resolveCommand } from './discovery'
import { extractLyricPayload } from './lyric'
import { dedupePlaylists, dedupeTracks, harvest, normalizeSearch } from './normalize'
import { runCli } from './runner'

/** 轻量 LRU：降低 CLI 冷启动与开放平台配额消耗 */
class Lru<T> {
  private map = new Map<string, { value: T; at: number }>()

  constructor(private limit: number, private ttlMs = 5 * 60_000) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key)
    if (!hit) return undefined
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, hit)
    return hit.value
  }

  set(key: string, value: T): void {
    this.map.set(key, { value, at: Date.now() })
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }
}

const searchCache = new Lru<SearchResult>(50)
const lyricCache = new Lru<LyricPayload>(30, 30 * 60_000)
const playlistCache = new Lru<{ playlist: Playlist | null; tracks: Track[] }>(30)

const CAP_BY_TYPE: Record<SearchType, 'searchSong' | 'searchArtist' | 'searchAlbum' | 'searchPlaylist'> = {
  song: 'searchSong',
  artist: 'searchArtist',
  album: 'searchAlbum',
  playlist: 'searchPlaylist',
}

export async function search(type: SearchType, keyword: string): Promise<SearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) return { type, tracks: [], playlists: [] }

  const cacheKey = `${type}:${trimmed.toLowerCase()}`
  const cached = searchCache.get(cacheKey)
  if (cached) return cached

  const tree = await getCommandTree()
  const cmd = resolveCommand(CAP_BY_TYPE[type], { keyword: trimmed }, tree)

  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', `用户在播放器中搜索「${trimmed}」`)

  const { json } = await runCli(argv)
  const { tracks, playlists } = normalizeSearch(json)

  // 综合搜索兜底：结果里可能同时带歌单与歌曲，按类型分流
  const result: SearchResult =
    type === 'playlist'
      ? { type, tracks: [], playlists }
      : { type, tracks, playlists: type === 'song' ? playlists.slice(0, 0) : playlists }

  searchCache.set(cacheKey, result)
  return result
}

export async function getDailyRecommend(): Promise<Track[]> {
  const tree = await getCommandTree()
  const cmd = resolveCommand('dailyRecommend', {}, tree)
  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', '打开播放器首页，查看今日推荐歌曲')

  const { json } = await runCli(argv)
  const { tracks } = harvest(json ?? {})
  return dedupeTracks(tracks)
}

export async function getRecommendedPlaylists(): Promise<Playlist[]> {
  const tree = await getCommandTree()
  const cmd = resolveCommand('recommendPlaylists', {}, tree)
  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', '浏览播放器首页的推荐歌单')

  const { json } = await runCli(argv)
  const { playlists } = harvest(json ?? {})
  return dedupePlaylists(playlists)
}

export async function getPlaylistDetail(playlistId: string): Promise<{ playlist: Playlist | null; tracks: Track[] }> {
  const cached = playlistCache.get(playlistId)
  if (cached) return cached

  const tree = await getCommandTree()
  const cmd = resolveCommand('playlistDetail', { playlistId }, tree)
  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', `查看歌单 ${playlistId} 的详情`)

  const { json } = await runCli(argv)
  const result = harvest(json ?? {})
  const payload = {
    playlist: dedupePlaylists(result.playlists)[0] ?? null,
    tracks: dedupeTracks(result.tracks),
  }
  playlistCache.set(playlistId, payload)
  return payload
}

export async function getLyric(songId: string): Promise<LyricPayload> {
  const cached = lyricCache.get(songId)
  if (cached) return cached

  const tree = await getCommandTree()
  const cmd = resolveCommand('getLyric', { songId }, tree)
  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', '查看当前歌曲的歌词')

  const { json } = await runCli(argv)
  const payload = extractLyricPayload(json, songId)
  lyricCache.set(songId, payload)
  return payload
}

export function invalidateSearchCache(): void {
  // 预留：切换账号后清理
}
