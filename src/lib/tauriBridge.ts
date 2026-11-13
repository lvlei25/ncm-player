/**
 * Tauri 阶段 2 桥接：与 Electron 共用 NcmBridge 契约。
 * CLI 调用走 Rust 的 cli_invoke（白名单 + 串行 + 错误码），
 * 播放状态由 Rust 侧持久化并通过 player:state-changed 推送，
 * 归一化复用 electron/ncm 下的纯 TS 模块，避免两边各写一套。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { NcmBridge } from '../shared/api'
import { PLAY_MODES } from '../shared/types'
import type {
  IpcResult,
  LoginTicket,
  NcmErrorCode,
  PlaybackState,
  PlaybackStatus,
  Playlist,
  PlayMode,
  QueueSnapshot,
  SearchResult,
  SearchType,
  SessionStatus,
  Track,
} from '../shared/types'
import { CAPABILITY_COMMANDS, fillTemplate } from '../../electron/ncm/command-map'
import { extractLyricPayload } from '../../electron/ncm/lyric'
import { dedupePlaylists, dedupeTracks, harvest, normalizeSearch } from '../../electron/ncm/normalize'

type Json = Record<string, unknown> | null

const call = <T>(cmd: string, args: Record<string, unknown> = {}): Promise<IpcResult<T>> =>
  invoke<IpcResult<T>>(cmd, args).catch((error: unknown) => ({
    ok: false as const,
    code: 'UNKNOWN' as const,
    message: error instanceof Error ? error.message : String(error),
  }))

class CliInvokeError extends Error {
  constructor(readonly code: NcmErrorCode, message: string) {
    super(message)
  }
}

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    if (error instanceof CliInvokeError) return { ok: false, code: error.code, message: error.message }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function cliJson(argv: string[]): Promise<Json> {
  const res = await call<Json>('cli_invoke', { args: argv })
  if (!res.ok) throw new CliInvokeError(res.code, res.message)
  return res.data ?? null
}

function unsupported<T>(feature: string): Promise<IpcResult<T>> {
  return Promise.resolve({
    ok: false as const,
    code: 'UNSUPPORTED' as const,
    message: `Tauri 后续阶段提供：${feature}`,
  })
}

const SEARCH_CAP = {
  song: 'searchSong',
  artist: 'searchArtist',
  album: 'searchAlbum',
  playlist: 'searchPlaylist',
} as const

/** 与 catalog.ts 的 search 等价：命令模板 + --userInput */
export function buildSearchArgs(type: SearchType, keyword: string): string[] {
  const trimmed = keyword.trim()
  const spec = CAPABILITY_COMMANDS[SEARCH_CAP[type]][0]
  const argv = [...fillTemplate(spec.argv, { keyword: trimmed })]
  if (spec.requiresUserInput) argv.push('--userInput', `用户在播放器中搜索「${trimmed}」`)
  return argv
}

/**
 * 从 start 起沿方向找最近可播放的曲目（含加密 ID），与 Electron 侧 Player 行为一致：
 * 不可播放曲目仍留在列表里，播控时自动跳过；全部不可播时返回 -1。
 */
export function nextPlayableIndex(tracks: Track[], start: number, direction: 1 | -1 = 1, wrap = true): number {
  const n = tracks.length
  if (n === 0) return -1
  for (let i = 0; i < n; i += 1) {
    const idx = wrap ? ((start + i * direction) % n + n) % n : start + i * direction
    if (!wrap && (idx < 0 || idx >= n)) break
    const track = tracks[idx]
    if (track && track.playable !== false && track.id) return idx
  }
  return -1
}

/** CLI 的 state 输出兼容 {state:{...}} 与裸对象两种形状（保留供回归测试与降级使用） */
export function mapPlaybackState(
  raw: Json,
  tracks: Track[],
  currentIndex: number,
  playMode: PlayMode,
): PlaybackState {
  const state = ((raw?.state as Json) ?? raw ?? {}) as Record<string, unknown>
  const rawStatus = String(state.status ?? 'stopped')
  const status: PlaybackStatus =
    rawStatus === 'playing' ? 'playing' : rawStatus === 'paused' ? 'paused' : 'stopped'
  const num = (value: unknown): number =>
    typeof value === 'number' ? value : Number(value ?? 0) || 0
  const duration = num(state.duration)
  let position = num(state.position)
  // CLI 某些版本把 position 写成毫秒：超过 100 秒量级，或远超本曲时长时换算
  if (position > 100_000 || (duration > 0 && position > duration * 10)) position /= 1000
  const volume = state.volume === null || state.volume === undefined ? null : num(state.volume)

  return {
    status,
    position: Math.max(0, position),
    duration,
    volume,
    currentIndex,
    queueLength: tracks.length,
    current: tracks[currentIndex] ?? null,
    playMode,
  }
}

interface PlayStateShape {
  queue: Track[]
  index: number
  play_mode: PlayMode
  volume: number
}

/** 渲染层镜像；真正的状态在 Rust 侧，启动时恢复、每次写操作同步落盘 */
let queue: Track[] = []
let index = -1
let playMode: PlayMode = 'order'

const persist = (
  patch: Partial<{ queue: Track[]; index: number; playMode: PlayMode; volume: number }>,
): void => {
  const payload: Record<string, unknown> = { ...patch }
  // Tauri 命令参数是 camelCase，Rust 侧字段为 snake_case；两种键都带上，避免版本差异漏写
  if (patch.playMode) payload.play_mode = patch.playMode
  void call('player_state_set', payload).catch(() => undefined)
}

void call<PlayStateShape>('player_state_get')
  .then((res) => {
    if (!res.ok || !res.data) return
    if (Array.isArray(res.data.queue)) queue = res.data.queue
    if (typeof res.data.index === 'number') index = res.data.index
    if (PLAY_MODES.includes(res.data.play_mode)) playMode = res.data.play_mode
  })
  .catch(() => undefined)

const okTrue = (): Promise<IpcResult<boolean>> => Promise.resolve({ ok: true, data: true })

function playArgs(track: Track): string[] {
  const args = ['play', '--song', '--encrypted-id', track.id]
  if (track.originalId) args.push('--original-id', track.originalId)
  return args
}

/** 会话探测 60s 缓存，与 Electron 版 session.ts 一致 */
let sessionCache: { value: SessionStatus; at: number } | null = null

/** 凭证/登录态变化后失效缓存（也用于测试隔离） */
export function invalidateSessionCache(): void {
  sessionCache = null
}

export const tauriBridge: NcmBridge = {
  env: {
    check: (force) => call('env_check', { force: Boolean(force) }),
  },

  session: {
    status: (force) =>
      wrap(async () => {
        if (!force && sessionCache && Date.now() - sessionCache.at < 60_000) return sessionCache.value
        const config = await call<string>('cli_text', { args: ['config', 'list'] })
        const configured = config.ok && /^\s*appId\s*:\s*(?!未配置)\S+/m.test(config.data ?? '')
        let loggedIn = false
        if (configured) {
          const check = await call<Json>('cli_invoke', { args: ['login', '--check'] })
          loggedIn = check.ok && (check.data as Json)?.success === true
        }
        const value: SessionStatus = { configured, loggedIn }
        sessionCache = { value, at: Date.now() }
        return value
      }),
    onChange: (cb) => {
      let disposed = false
      let unlisten: (() => void) | null = null
      void listen<SessionStatus>('session:changed', (event) => {
        if (disposed) return
        sessionCache = { value: event.payload, at: Date.now() }
        cb(event.payload)
      })
        .then((fn) => {
          if (disposed) fn()
          else unlisten = fn
        })
        .catch(() => undefined)
      return () => {
        disposed = true
        unlisten?.()
      }
    },
    save: (appId, privateKey) => {
      sessionCache = null
      // Rust 参数为 snake_case，两种键都带上以兼容 Tauri 版本差异
      return call<boolean>('session_save', {
        appId, privateKey, app_id: appId, private_key: privateKey,
      })
    },
    loginStart: () => call<LoginTicket>('session_login_start'),
    logout: () => {
      sessionCache = null
      return call<boolean>('session_logout')
    },
  },

  catalog: {
    search: (type, keyword) =>
      wrap(async (): Promise<SearchResult> => {
        const trimmed = keyword.trim()
        if (!trimmed) return { type, tracks: [], playlists: [] }
        const { tracks, playlists } = normalizeSearch(await cliJson(buildSearchArgs(type, trimmed)))
        return type === 'playlist'
          ? { type, tracks: [], playlists }
          : { type, tracks, playlists: type === 'song' ? [] : playlists, total: tracks.length }
      }),
    daily: () =>
      wrap(async () => {
        const spec = CAPABILITY_COMMANDS.dailyRecommend[0]
        const argv = [...spec.argv]
        if (spec.requiresUserInput) argv.push('--userInput', '打开播放器首页，查看今日推荐歌曲')
        return dedupeTracks(harvest(await cliJson(argv)).tracks)
      }),
    recommendPlaylists: () =>
      wrap(async () => {
        const spec = CAPABILITY_COMMANDS.recommendPlaylists[0]
        const argv = [...spec.argv]
        if (spec.requiresUserInput) argv.push('--userInput', '浏览播放器首页的推荐歌单')
        return dedupePlaylists(harvest(await cliJson(argv)).playlists)
      }),
    playlist: (id) =>
      wrap(async () => {
        const spec = CAPABILITY_COMMANDS.playlistDetail[0]
        const argv = [...fillTemplate(spec.argv, { playlistId: id })]
        if (spec.requiresUserInput) argv.push('--userInput', `查看歌单 ${id} 的详情`)
        const result = harvest(await cliJson(argv))
        const payload: { playlist: Playlist | null; tracks: Track[] } = {
          playlist: dedupePlaylists(result.playlists)[0] ?? null,
          tracks: dedupeTracks(result.tracks),
        }
        // playlist get 只返回元数据，曲目另取一次（与 Electron 版一致）
        if (payload.tracks.length === 0) {
          const tracksSpec = CAPABILITY_COMMANDS.playlistTracks[0]
          const tracksArgv = [...fillTemplate(tracksSpec.argv, { playlistId: id }), '--limit', '100']
          if (tracksSpec.requiresUserInput) tracksArgv.push('--userInput', `查看歌单 ${id} 的曲目`)
          try {
            payload.tracks = dedupeTracks(harvest(await cliJson(tracksArgv)).tracks)
          } catch {
            // 服务端未提供该命令时保持空态
          }
        }
        return payload
      }),
    lyric: (songId) =>
      wrap(async () => {
        const spec = CAPABILITY_COMMANDS.getLyric[0]
        const argv = [...fillTemplate(spec.argv, { songId })]
        if (spec.requiresUserInput) argv.push('--userInput', '查看当前歌曲的歌词')
        return extractLyricPayload(await cliJson(argv), songId)
      }),
  },

  player: {
    // Rust 侧合并 CLI state 与持久化的队列/模式，一次 invoke 拿到完整快照
    state: () => call<PlaybackState>('player_snapshot'),
    queue: async () => ({ ok: true, data: { tracks: queue, currentIndex: index } satisfies QueueSnapshot }),
    playTrack: (track) =>
      wrap(async () => {
        const existing = queue.findIndex((t) => t.id === track.id)
        if (existing >= 0) index = existing
        else {
          queue = [track, ...queue]
          index = 0
        }
        persist({ queue, index })
        await cliJson(playArgs(track))
        return true
      }),
    playQueue: (tracks, startIndex = 0) =>
      wrap(async () => {
        queue = tracks
        index = Math.min(Math.max(startIndex, 0), Math.max(queue.length - 1, 0))
        const target = nextPlayableIndex(queue, index, 1)
        if (target >= 0) index = target
        persist({ queue, index })
        if (target >= 0) await cliJson(playArgs(queue[index]))
        return true
      }),
    playPlaylist: (id, tracks, originalId) =>
      wrap(async () => {
        queue = tracks
        index = 0
        persist({ queue, index })
        await cliJson(['play', '--playlist', '--encrypted-id', id, '--original-id', originalId ?? id])
        return true
      }),
    toggle: () =>
      wrap(async () => {
        const current = mapPlaybackState(await cliJson(['state']), queue, index, playMode)
        if (current.status === 'playing') await cliJson(['pause'])
        else if (current.status === 'paused') await cliJson(['resume'])
        else {
          const target = nextPlayableIndex(queue, Math.max(index, 0), 1)
          if (target >= 0) {
            index = target
            persist({ index })
            await cliJson(playArgs(queue[index]))
          }
        }
        return true
      }),
    next: () =>
      wrap(async () => {
        if (queue.length === 0) return false
        const target = nextPlayableIndex(queue, (index + 1) % queue.length, 1)
        if (target < 0) return false
        index = target
        persist({ index })
        await cliJson(playArgs(queue[index]))
        return true
      }),
    prev: () =>
      wrap(async () => {
        if (queue.length === 0) return false
        const target = nextPlayableIndex(queue, (index - 1 + queue.length) % queue.length, -1)
        if (target < 0) return false
        index = target
        persist({ index })
        await cliJson(playArgs(queue[index]))
        return true
      }),
    seek: (seconds) =>
      wrap(async () => {
        await cliJson(['seek', String(Math.max(0, Math.round(seconds)))])
        return true
      }),
    volume: (level) =>
      wrap(async () => {
        const clamped = Math.max(0, Math.min(100, Math.round(level)))
        persist({ volume: clamped })
        await cliJson(['volume', String(clamped)])
        return true
      }),
    setPlayMode: (mode) => {
      if (!PLAY_MODES.includes(mode)) return unsupported('未知播放模式')
      playMode = mode
      persist({ playMode: mode })
      return okTrue()
    },
    queueAdd: (track, next) =>
      wrap(async () => {
        queue = [...queue, track]
        persist({ queue })
        const args = ['queue', 'add', '--encrypted-id', track.id]
        if (track.originalId) args.push('--original-id', track.originalId)
        if (next) args.push('--next')
        try {
          await cliJson(args)
        } catch {
          // CLI 队列不可用不影响本地镜像
        }
        return true
      }),
    queueClear: () =>
      wrap(async () => {
        queue = []
        index = -1
        persist({ queue, index })
        try {
          await cliJson(['queue', 'clear'])
        } catch {
          // 同上
        }
        return true
      }),
    queueRemove: (at) => {
      if (at >= 0 && at < queue.length) {
        queue = queue.filter((_, i) => i !== at)
        if (at < index) index -= 1
        else if (at === index) index = Math.min(index, queue.length - 1)
        persist({ queue, index })
      }
      return okTrue()
    },
    queueMove: (from, to) => {
      if (from >= 0 && to >= 0 && from < queue.length && to < queue.length && from !== to) {
        const next = [...queue]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item)
        queue = next
        if (index === from) index = to
        else if (from < index && to >= index) index -= 1
        else if (from > index && to <= index) index += 1
        persist({ queue, index })
      }
      return okTrue()
    },
    onState: (cb) => {
      // 阶段 2：订阅 Rust 侧 1.5s 推送，渲染层不再自行轮询
      let disposed = false
      let unlisten: (() => void) | null = null
      void listen<PlaybackState>('player:state-changed', (event) => {
        if (!disposed) cb(event.payload)
      })
        .then((fn) => {
          if (disposed) fn()
          else unlisten = fn
        })
        .catch(() => undefined)
      return () => {
        disposed = true
        unlisten?.()
      }
    },
  },

  ai: {
    chat: () => unsupported('AI 点歌'),
    configGet: () => unsupported('AI 配置'),
    configSet: () => unsupported('AI 配置'),
  },

  app: {
    info: () => call('app_info'),
    setOnboarded: (value) => call<boolean>('onboarded_set', { value }),
    openExternal: (url) => call<boolean>('open_external', { url }),
    minimize: () => {
      void call('window_minimize')
    },
    maximize: () => {
      void call('window_maximize')
    },
    close: () => {
      void call('window_close')
    },
  },
}
