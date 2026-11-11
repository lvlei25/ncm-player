import type { NcmBridge } from '../../shared/api'
import type { IpcResult, LyricPayload, PlaybackState, PlayMode, Track } from '../../shared/types'
import { MOCK_PLAYLISTS, MOCK_TRACKS, SAMPLE_LRC } from './data'

/** 浏览器预览模式（dev:web）下的本地桥接，用于 UI 迭代与截图验收 */

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let queue: Track[] = [...MOCK_TRACKS.slice(0, 8)]
let index = 3
let status: PlaybackState['status'] = 'playing'
let position = 46
let volume = 68
let playMode: PlayMode = 'order'
const listeners = new Set<(s: PlaybackState) => void>()

function snapshot(): PlaybackState {
  const current = queue[index] ?? null
  return {
    status,
    position,
    duration: current ? current.durationMs / 1000 : 0,
    volume,
    currentIndex: index,
    queueLength: queue.length,
    current,
    playMode,
  }
}

function emit(): void {
  const state = snapshot()
  for (const cb of listeners) cb(state)
}

setInterval(() => {
  if (status !== 'playing') return
  position += 1
  const duration = snapshot().duration
  if (duration > 0 && position >= duration - 1) {
    if (playMode === 'repeat-one') {
      position = 0
    } else if (playMode === 'order' && index >= queue.length - 1) {
      status = 'stopped'
      position = 0
    } else if (playMode === 'shuffle' && queue.length > 1) {
      let next = index
      for (let i = 0; i < 8 && next === index; i += 1) next = Math.floor(Math.random() * queue.length)
      index = next === index ? (index + 1) % queue.length : next
      position = 0
    } else {
      index = (index + 1) % Math.max(queue.length, 1)
      position = 0
    }
  }
  emit()
}, 1000)

/** 模拟模型回复，让 AI 面板在无 Key 时也有完整演示效果 */
function mockAiReply(text: string): { reply: string; steps: { tool: string; summary: string; ok: boolean }[] } {
  if (/音量/.test(text)) {
    const level = Number(text.match(/\d{1,3}/)?.[0] ?? 50)
    volume = Math.min(100, level)
    emit()
    return { reply: `音量已调到 ${level}%，慢慢听。`, steps: [{ tool: 'set_volume', summary: `音量设为 ${level}%`, ok: true }] }
  }
  if (/暂停/.test(text)) {
    status = 'paused'
    emit()
    return { reply: '已暂停，回来时叫我。', steps: [{ tool: 'pause', summary: '已暂停', ok: true }] }
  }
  const keyword = text.replace(/^(帮我|给我)?\s*(放|播放|来点|听)\s*/u, '').trim() || '林俊杰'
  const hits = MOCK_TRACKS.filter((t) => t.name.includes(keyword) || t.artists.join('').includes(keyword))
  const picked = hits.length > 0 ? hits : MOCK_TRACKS.slice(3, 8)
  queue = picked
  index = 0
  position = 0
  status = 'playing'
  emit()
  return {
    reply: `找到 ${picked.length} 首「${keyword}」相关的歌，已开播并排队。`,
    steps: [
      { tool: 'search_songs', summary: `搜索「${keyword}」得到 ${picked.length} 首`, ok: true },
      { tool: 'play_by_keyword', summary: `播放「${picked[0].name}」`, ok: true },
    ],
  }
}

export const mockBridge: NcmBridge = {
  env: {
    check: async () =>
      ok({
        node: { ok: true, version: '22.12.0', promptSupport: true },
        ncmCli: { ok: true, version: '0.1.7' },
        mpv: { ok: true, version: '0.37.0' },
        configured: true,
        loggedIn: true,
        player: 'mpv',
      }),
  },
  session: {
    status: async () => ok({ configured: true, loggedIn: true, nickname: '夜航星', appId: 'demo_appid' }),
    save: async () => ok(true),
    loginStart: async () => ok({ ok: true, link: 'https://music.163.com/login?codekey=demo' }),
    logout: async () => ok(true),
    onChange: () => () => undefined,
  },
  catalog: {
    search: async (type, keyword) => {
      await wait(220)
      const k = keyword.trim()
      const tracks = MOCK_TRACKS.filter(
        (t) => !k || t.name.includes(k) || t.artists.join('').includes(k) || t.album.includes(k),
      )
      return ok({
        type,
        tracks: type === 'playlist' ? [] : tracks,
        playlists: MOCK_PLAYLISTS.filter((p) => !k || p.name.includes(k)),
        total: tracks.length,
      })
    },
    daily: async () => ok(MOCK_TRACKS.slice(0, 10)),
    recommendPlaylists: async () => {
      await wait(160)
      return ok(MOCK_PLAYLISTS)
    },
    playlist: async (id) => {
      await wait(180)
      const playlist = MOCK_PLAYLISTS.find((p) => p.id === id) ?? MOCK_PLAYLISTS[0]
      return ok({ playlist, tracks: MOCK_TRACKS })
    },
    lyric: async (songId): Promise<IpcResult<LyricPayload>> => {
      await wait(120)
      const lines = SAMPLE_LRC.split('\n').map((line) => {
        const match = line.match(/\[(\d+):(\d+)\.(\d+)\](.*)/)
        if (!match) return { timeMs: 0, text: '' }
        return {
          timeMs: Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3]) * 10,
          text: match[4],
          translation: undefined,
        }
      })
      return ok({ songId, lines: lines.filter((l) => l.text) })
    },
  },
  player: {
    state: async () => ok(snapshot()),
    queue: async () => ok({ tracks: queue, currentIndex: index }),
    playTrack: async (track) => {
      const found = queue.findIndex((t) => t.id === track.id)
      if (found >= 0) index = found
      else {
        queue = [track, ...queue]
        index = 0
      }
      position = 0
      status = 'playing'
      emit()
      return ok(true)
    },
    playQueue: async (tracks, startIndex = 0) => {
      queue = tracks
      index = startIndex
      position = 0
      status = 'playing'
      emit()
      return ok(true)
    },
    playPlaylist: async (_id, tracks) => {
      queue = tracks
      index = 0
      position = 0
      status = 'playing'
      emit()
      return ok(true)
    },
    toggle: async () => {
      status = status === 'playing' ? 'paused' : 'playing'
      emit()
      return ok(true)
    },
    next: async () => {
      index = (index + 1) % Math.max(queue.length, 1)
      position = 0
      emit()
      return ok(true)
    },
    prev: async () => {
      index = (index - 1 + queue.length) % Math.max(queue.length, 1)
      position = 0
      emit()
      return ok(true)
    },
    seek: async (seconds) => {
      position = seconds
      emit()
      return ok(true)
    },
    volume: async (level) => {
      volume = level
      emit()
      return ok(true)
    },
    setPlayMode: async (mode) => {
      playMode = mode
      emit()
      return ok(true)
    },
    queueAdd: async (track) => {
      queue = [...queue, track]
      emit()
      return ok(true)
    },
    queueClear: async () => {
      queue = []
      index = -1
      status = 'stopped'
      position = 0
      emit()
      return ok(true)
    },
    queueRemove: async (i) => {
      queue = queue.filter((_, idx) => idx !== i)
      emit()
      return ok(true)
    },
    queueMove: async (from, to) => {
      const next = [...queue]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      queue = next
      emit()
      return ok(true)
    },
    onState: (cb) => {
      listeners.add(cb)
      cb(snapshot())
      return () => listeners.delete(cb)
    },
  },
  ai: {
    chat: async (messages) => {
      await wait(520)
      const text = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      return ok({ ...mockAiReply(text), local: true })
    },
    configGet: async () =>
      ok({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '', hasKey: false }),
    configSet: async () => ok(true),
  },
  app: {
    info: async () => ok({ version: '1.0.0', electron: '33.2.0', platform: 'browser' }),
    setOnboarded: async () => ok(true),
    openExternal: async (url) => {
      window.open(url, '_blank')
      return ok(true)
    },
    minimize: () => undefined,
    maximize: () => undefined,
    close: () => undefined,
  },
}
