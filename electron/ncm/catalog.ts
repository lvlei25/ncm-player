import type { LyricPayload, Playlist, SearchResult, SearchType, Track } from '../../src/shared/types'
import { getCommandTree, resolveCommand, specExists } from './discovery'
import { extractLyricPayload } from './lyric'
import { dedupePlaylists, dedupeTracks, harvest, normalizeSearch } from './normalize'
import { runCli } from './runner'
import { loadConfig, saveConfig } from '../store'

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
/** 发现页数据在进程内缓存，并落盘供冷启动复用（每日推荐一天一变，30 分钟足够新鲜） */
const DISCOVER_TTL = 30 * 60_000
const dailyCache = new Lru<Track[]>(4, DISCOVER_TTL)
const playlistsCache = new Lru<Playlist[]>(4, DISCOVER_TTL)

function freshPersisted(at?: number): boolean {
  return typeof at === 'number' && at > 0 && Date.now() - at < DISCOVER_TTL
}

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
  const mem = dailyCache.get('daily')
  if (mem) return mem

  const saved = loadConfig()
  if (freshPersisted(saved.discoverDailyAt) && saved.discoverDaily?.length) {
    dailyCache.set('daily', saved.discoverDaily)
    return saved.discoverDaily
  }

  const tree = await getCommandTree()
  const cmd = resolveCommand('dailyRecommend', {}, tree)
  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', '打开播放器首页，查看今日推荐歌曲')

  const { json } = await runCli(argv)
  const { tracks } = harvest(json ?? {})
  const result = dedupeTracks(tracks)
  if (result.length) {
    dailyCache.set('daily', result)
    saveConfig({ discoverDaily: result, discoverDailyAt: Date.now() })
  }
  return result
}

export async function getRecommendedPlaylists(): Promise<Playlist[]> {
  const mem = playlistsCache.get('playlists')
  if (mem) return mem

  const saved = loadConfig()
  if (freshPersisted(saved.discoverPlaylistsAt) && saved.discoverPlaylists?.length) {
    playlistsCache.set('playlists', saved.discoverPlaylists)
    return saved.discoverPlaylists
  }

  const tree = await getCommandTree()
  const cmd = resolveCommand('recommendPlaylists', {}, tree)
  const argv = [...cmd.argv]
  if (cmd.spec.requiresUserInput) argv.push('--userInput', '浏览播放器首页的推荐歌单')

  const { json } = await runCli(argv)
  const { playlists } = harvest(json ?? {})
  const result = dedupePlaylists(playlists)
  if (result.length) {
    playlistsCache.set('playlists', result)
    saveConfig({ discoverPlaylists: result, discoverPlaylistsAt: Date.now() })
  }
  return result
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

  // `playlist get` 只返回歌单元数据（含 trackCount），曲目必须再取一次。
  // 服务端动态下发命令，先确认 `playlist tracks` 存在，缺失时保持空态。
  if (payload.tracks.length === 0) {
    const tracksCmd = resolveCommand('playlistTracks', { playlistId }, tree)
    if (specExists(tracksCmd.spec, tree)) {
      const tracksArgv = [...tracksCmd.argv, '--limit', '100']
      if (tracksCmd.spec.requiresUserInput) tracksArgv.push('--userInput', `查看歌单 ${playlistId} 的曲目`)
      try {
        const { json: tracksJson } = await runCli(tracksArgv)
        payload.tracks = dedupeTracks(harvest(tracksJson ?? {}).tracks)
      } catch {
        // 命令被服务端移除时退回空列表，由 UI 展示空态
      }
    }
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
