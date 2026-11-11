/**
 * Tauri 阶段 1 桥接：与 Electron 共用 NcmBridge 契约。
 * CLI 调用统一走 Rust 的 cli_invoke（白名单 + 串行 + 错误码），
 * 归一化复用 electron/ncm 下的纯 TS 模块，避免两边各写一套。
 */
import { invoke } from '@tauri-apps/api/core'
import type { NcmBridge } from '../shared/api'
import { PLAY_MODES } from '../shared/types'
import type {
  IpcResult,
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
    message: `Tauri 阶段 2 提供：${feature}`,
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

/** CLI 的 state 输出兼容 {state:{...}} 与裸对象两种形状 */
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

/** 阶段 1 的队列镜像是内存态，阶段 2 再落盘并接入自动续播 */
let queue: Track[] = []
let index = -1
let playMode: PlayMode = 'order'

const okTrue = (): Promise<IpcResult<boolean>> => Promise.resolve({ ok: true, data: true })

function playArgs(track: Track): string[] {
  const args = ['play', '--song', '--encrypted-id', track.id]
  if (track.originalId) args.push('--original-id', track.originalId)
  return args
}

export const tauriBridge: NcmBridge = {
  env: {
    check: (force) => call('env_check', { force: Boolean(force) }),
  },

  session: {
    status: () =>
      wrap(async () => {
        const config = await call<string>('cli_text', { args: ['config', 'list'] })
        const configured = config.ok && /^\s*appId\s*:\s*(?!未配置)\S+/m.test(config.data)
        let loggedIn = false
        if (configured) {
          const check = await call<Json>('cli_invoke', { args: ['login', '--check'] })
          loggedIn = check.ok && (check.data as Json)?.success === true
        }
        const result: SessionStatus = { configured, loggedIn }
        return result
      }),
    onChange: () => () => undefined,
    save: () => unsupported('凭证加密存储'),
    loginStart: () => unsupported('扫码登录'),
    logout: () => unsupported('退出登录'),
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
    state: () => wrap(async () => mapPlaybackState(await cliJson(['state']), queue, index, playMode)),
    queue: async () => ({ ok: true, data: { tracks: queue, currentIndex: index } satisfies QueueSnapshot }),
    playTrack: (track) =>
      wrap(async () => {
        const existing = queue.findIndex((t) => t.id === track.id)
        if (existing >= 0) index = existing
        else {
          queue = [track, ...queue]
          index = 0
        }
        await cliJson(playArgs(track))
        return true
      }),
    playQueue: (tracks, startIndex = 0) =>
      wrap(async () => {
        queue = tracks.filter((t) => t.playable !== false)
        index = Math.min(Math.max(startIndex, 0), Math.max(queue.length - 1, 0))
        const track = queue[index]
        if (track) await cliJson(playArgs(track))
        return true
      }),
    playPlaylist: (id, tracks, originalId) =>
      wrap(async () => {
        queue = tracks.filter((t) => t.playable !== false)
        index = 0
        await cliJson(['play', '--playlist', '--encrypted-id', id, '--original-id', originalId ?? id])
        return true
      }),
    toggle: () =>
      wrap(async () => {
        const current = mapPlaybackState(await cliJson(['state']), queue, index, playMode)
        if (current.status === 'playing') await cliJson(['pause'])
        else if (current.status === 'paused') await cliJson(['resume'])
        else if (queue[index]) await cliJson(playArgs(queue[index]))
        return true
      }),
    next: () =>
      wrap(async () => {
        if (queue.length === 0) return false
        index = (index + 1) % queue.length
        await cliJson(playArgs(queue[index]))
        return true
      }),
    prev: () =>
      wrap(async () => {
        if (queue.length === 0) return false
        index = (index - 1 + queue.length) % queue.length
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
        await cliJson(['volume', String(Math.max(0, Math.min(100, Math.round(level))))])
        return true
      }),
    setPlayMode: (mode) => {
      if (!PLAY_MODES.includes(mode)) return unsupported('未知播放模式')
      playMode = mode
      return okTrue()
    },
    queueAdd: (track, next) =>
      wrap(async () => {
        queue = [...queue, track]
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
      }
      return okTrue()
    },
    onState: (cb) => {
      // 阶段 1 用 1.5s 轮询；阶段 2 换成 Rust 侧 player:state-changed 事件
      const timer = setInterval(() => {
        void tauriBridge.player.state().then((res) => {
          if (res.ok) cb(res.data)
        })
      }, 1500)
      return () => clearInterval(timer)
    },
  },

  ai: {
    chat: () => unsupported('AI 点歌'),
    configGet: () => unsupported('AI 配置'),
    configSet: () => unsupported('AI 配置'),
  },

  app: {
    info: () => call('app_info'),
    // 阶段 1 不落盘：向导完成后再次进入也由 session 状态决定
    setOnboarded: () => okTrue(),
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
