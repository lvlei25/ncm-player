import type { Playlist, Track } from '../../src/shared/types'

/**
 * ncm-cli 的 JSON 结构随服务端版本演进，且部分命令没有公开 schema。
 * 因此这里做「形状无关」的归一化：深度遍历结果树，按字段别名识别歌曲/歌单对象。
 */

type Dict = Record<string, unknown>

const isObj = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)

const ID_KEYS = ['encryptedId', 'encrypted_id', 'encryptId', 'eId', 'songId', 'trackId', 'id']
const NAME_KEYS = ['name', 'songName', 'songname', 'title']
const ARTIST_KEYS = ['artists', 'ar', 'artist', 'singer', 'singers']
const ALBUM_KEYS = ['album', 'al', 'albumName']
const COVER_KEYS = ['coverImgUrl', 'coverUrl', 'picUrl', 'img1v1Url', 'imageUrl', 'cover', 'img']
const DURATION_KEYS = ['duration', 'dt', 'durationMs', 'interval', 'time']

function pick(o: Dict, keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  }
  return undefined
}

function pickString(o: Dict, keys: string[]): string | undefined {
  const v = pick(o, keys)
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (isObj(v)) return pickString(v, ['name', 'title', 'url'])
  return undefined
}

function pickNumber(o: Dict, keys: string[]): number | undefined {
  const v = pick(o, keys)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v)
  return undefined
}

function pickArtists(o: Dict): string[] {
  const raw = pick(o, ARTIST_KEYS)
  if (!raw) return []
  if (typeof raw === 'string') return raw.split(/[/、,&]/).map((s) => s.trim()).filter(Boolean)
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (isObj(item)) return pickString(item, ['name', 'nickname', 'title']) ?? ''
        return ''
      })
      .filter(Boolean)
  }
  if (isObj(raw)) {
    const single = pickString(raw, ['name', 'nickname'])
    return single ? [single] : []
  }
  return []
}

function hasCover(o: Dict): boolean {
  return COVER_KEYS.some((k) => typeof o[k] === 'string' && (o[k] as string).length > 0)
}

/** 网易云 CDN 同时支持 https，统一升级避免部分环境加载失败 */
function https(url?: string): string | undefined {
  if (!url) return undefined
  return url.startsWith('http://') ? `https://${url.slice(7)}` : url
}

function looksLikeTrack(o: Dict): boolean {
  const hasName = NAME_KEYS.some((k) => typeof o[k] === 'string')
  const hasId = ID_KEYS.some((k) => typeof o[k] === 'string' || typeof o[k] === 'number')
  if (!hasName || !hasId) return false
  // 歌单 / 专辑对象有曲目数字段，优先按歌单处理
  if (o.trackCount !== undefined || o.playCount !== undefined) return false
  return true
}

function looksLikePlaylist(o: Dict): boolean {
  const hasName = typeof o.name === 'string'
  const hasId = o.id !== undefined || o.playlistId !== undefined
  if (!hasName || !hasId) return false
  return o.trackCount !== undefined || hasCover(o) || o.creator !== undefined
}

function durationOf(o: Dict): number {
  const raw = pickNumber(o, DURATION_KEYS)
  if (!raw) return 0
  // 小于 10000 视为秒，否则视为毫秒
  return raw < 10_000 ? Math.round(raw * 1000) : Math.round(raw)
}

function toTrack(o: Dict): Track | null {
  const idRaw = pick(o, ID_KEYS)
  if (idRaw === undefined) return null
  const name = pickString(o, NAME_KEYS)
  if (!name) return null

  const albumObj = pick(o, ALBUM_KEYS)
  const albumName = isObj(albumObj)
    ? pickString(albumObj, ['name', 'albumName']) ?? ''
    : typeof albumObj === 'string'
      ? albumObj
      : ''
  const albumId = isObj(albumObj) ? pickString(albumObj, ['id', 'albumId']) : undefined

  const coverFromAlbum = isObj(albumObj) ? COVER_KEYS.map((k) => albumObj[k]).find((v) => typeof v === 'string') : undefined
  const cover = pickString(o, COVER_KEYS) ?? (typeof coverFromAlbum === 'string' ? coverFromAlbum : undefined)

  const originalIdRaw = pick(o, ['originalId', 'original_id', 'songOriginalId', 'plainId'])
  // visible 是 skill 文档里的字段；真实接口用 noCopyrightRcmd 表示无版权
  const noCopyright = Boolean(o.noCopyrightRcmd && typeof o.noCopyrightRcmd === 'object')
  const visible = o.visible === false || noCopyright ? false : true

  return {
    id: String(idRaw),
    originalId: originalIdRaw !== undefined ? String(originalIdRaw) : undefined,
    name,
    artists: pickArtists(o),
    album: albumName,
    albumId,
    durationMs: durationOf(o),
    coverUrl: https(cover),
    playable: visible,
    reason: visible ? undefined : typeof o.reason === 'string' ? o.reason : '该资源暂不可播放',
  }
}

function toPlaylist(o: Dict): Playlist | null {
  const idRaw = o.id ?? o.playlistId
  const name = typeof o.name === 'string' ? o.name : undefined
  if (idRaw === undefined || !name) return null
  return {
    id: String(idRaw),
    originalId: o.originalId !== undefined ? String(o.originalId) : undefined,
    name,
    coverUrl: https(pickString(o, COVER_KEYS)),
    trackCount: pickNumber(o, ['trackCount', 'songCount', 'count']),
    creator: isObj(o.creator)
      ? pickString(o.creator, ['nickname', 'name'])
      : pickString(o, ['creatorNickName', 'creator', 'creatorName']),
    description: pickString(o, ['describe', 'description']),
    playable: o.playable === false ? false : true,
  }
}

export interface Harvest {
  tracks: Track[]
  playlists: Playlist[]
}

/** 深度遍历任意 JSON，收集歌曲与歌单 */
export function harvest(node: unknown, acc: Harvest = { tracks: [], playlists: [] }, depth = 0): Harvest {
  if (depth > 8 || node === null || node === undefined) return acc

  if (Array.isArray(node)) {
    for (const item of node) harvest(item, acc, depth + 1)
    return acc
  }

  if (isObj(node)) {
    if (looksLikeTrack(node)) {
      const track = toTrack(node)
      if (track) acc.tracks.push(track)
      return acc
    }
    if (looksLikePlaylist(node)) {
      const playlist = toPlaylist(node)
      if (playlist) acc.playlists.push(playlist)
      return acc
    }
    for (const value of Object.values(node)) harvest(value, acc, depth + 1)
  }
  return acc
}

export function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const t of tracks) {
    const key = `${t.id}|${t.name}|${t.artists.join('/')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function dedupePlaylists(playlists: Playlist[]): Playlist[] {
  const seen = new Set<string>()
  const out: Playlist[] = []
  for (const p of playlists) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}

export function normalizeSearch(json: Record<string, unknown> | null): Harvest {
  const result = harvest(json ?? {})
  return { tracks: dedupeTracks(result.tracks), playlists: dedupePlaylists(result.playlists) }
}

/** 从任意层级里抓一个字符串字段（歌词、状态等命令用） */
export function deepString(node: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 8 || node === null || node === undefined) return undefined
  if (isObj(node)) {
    for (const k of keys) {
      const v = node[k]
      if (typeof v === 'string' && v.trim()) return v
    }
    for (const v of Object.values(node)) {
      const found = deepString(v, keys, depth + 1)
      if (found) return found
    }
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = deepString(v, keys, depth + 1)
      if (found) return found
    }
  }
  return undefined
}
