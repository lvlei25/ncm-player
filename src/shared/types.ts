/** 渲染进程与主进程共享的数据契约 */

export interface Track {
  /** 加密 ID（32 位 hex），调用 ncm-cli API 用 */
  id: string
  /** 明文数字 ID，用于 music.163.com 链接 */
  originalId?: string
  name: string
  artists: string[]
  album: string
  albumId?: string
  durationMs: number
  coverUrl?: string
  /** visible=false 的歌曲不可播放 */
  playable: boolean
  reason?: string
}

export interface Playlist {
  id: string
  name: string
  coverUrl?: string
  trackCount?: number
  creator?: string
  description?: string
  playable?: boolean
}

export type SearchType = 'song' | 'artist' | 'album' | 'playlist'

export interface SearchResult {
  type: SearchType
  tracks: Track[]
  playlists: Playlist[]
  total?: number
}

export type PlaybackStatus = 'playing' | 'paused' | 'stopped'

export interface PlaybackState {
  status: PlaybackStatus
  /** 秒 */
  position: number
  /** 秒 */
  duration: number
  volume: number | null
  currentIndex: number
  queueLength: number
  current: Track | null
}

export interface LyricLine {
  timeMs: number
  text: string
  translation?: string
}

export interface LyricPayload {
  songId: string
  lines: LyricLine[]
  plain?: string
}

export interface EnvReport {
  node: { ok: boolean; version: string }
  ncmCli: { ok: boolean; version: string }
  mpv: { ok: boolean; version: string }
  configured: boolean
  loggedIn: boolean
  player: string | null
  error?: string
}

export interface SessionStatus {
  configured: boolean
  loggedIn: boolean
  nickname?: string
  avatarUrl?: string
  appId?: string
}

export interface LoginTicket {
  ok: boolean
  link?: string
  raw?: string
  message?: string
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiToolStep {
  tool: string
  summary: string
  ok: boolean
}

export interface AiReply {
  reply: string
  steps: AiToolStep[]
  /** true 表示走了本地规则兜底（未配置模型） */
  local?: boolean
}

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
  hasKey: boolean
}

export interface QueueSnapshot {
  tracks: Track[]
  currentIndex: number
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
}

export type NcmErrorCode =
  | 'MISSING_CLI'
  | 'MISSING_MPV'
  | 'CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'QUOTA'
  | 'UNSUPPORTED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UNKNOWN'

export interface IpcFailure {
  ok: false
  code: NcmErrorCode
  message: string
}

export type IpcOk<T> = { ok: true; data: T }
export type IpcResult<T> = IpcOk<T> | IpcFailure
