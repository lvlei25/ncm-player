import { create } from 'zustand'
import type { EnvReport, PlaybackState, QueueSnapshot, SessionStatus, Track } from '../shared/types'
import { api, failureText } from './api'

interface Notice {
  kind: 'error' | 'success' | 'info'
  text: string
}

interface AppState {
  env: EnvReport | null
  session: SessionStatus | null
  playback: PlaybackState
  queue: QueueSnapshot
  ready: boolean
  notice: Notice | null
  bootstrapped: boolean
  /** 队列改为懒加载：首次打开抽屉时才真正走 IPC */
  queueLoaded: boolean

  bootstrap: () => Promise<void>
  refreshEnv: () => Promise<void>
  refreshSession: (force?: boolean) => Promise<void>
  refreshQueue: () => Promise<void>
  setPlayback: (state: PlaybackState) => void
  notify: (notice: Notice | null) => void

  toggle: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  seek: (seconds: number) => Promise<void>
  setVolume: (level: number) => Promise<void>
  playTrack: (track: Track) => Promise<void>
  playQueue: (tracks: Track[], index?: number) => Promise<void>
  playPlaylist: (id: string, tracks: Track[], originalId?: string) => Promise<void>
  queueAdd: (track: Track) => Promise<void>
  queueClear: () => Promise<void>
  queueRemove: (index: number) => Promise<void>
  queueMove: (from: number, to: number) => Promise<void>
}

const EMPTY_PLAYBACK: PlaybackState = {
  status: 'stopped',
  position: 0,
  duration: 0,
  volume: 60,
  currentIndex: -1,
  queueLength: 0,
  current: null,
}

export const useAppStore = create<AppState>((set, get) => ({
  env: null,
  session: null,
  playback: EMPTY_PLAYBACK,
  queue: { tracks: [], currentIndex: -1 },
  ready: false,
  notice: null,
  bootstrapped: false,
  queueLoaded: false,

  bootstrap: async () => {
    if (get().bootstrapped) return
    set({ bootstrapped: true })

    // 首屏只等「会话 + 播放态」两次轻量调用，队列留到真正要用时再拉
    const [sessionRes, stateRes] = await Promise.all([api.session.status(), api.player.state()])

    set({
      session: sessionRes.ok ? sessionRes.data : null,
      playback: stateRes.ok ? stateRes.data : EMPTY_PLAYBACK,
      queue: { tracks: [], currentIndex: -1 },
      ready: true,
    })

    api.player.onState((state) => {
      set({ playback: state })
      const q = get().queue
      if (get().queueLoaded && q.tracks.length !== state.queueLength) void get().refreshQueue()
    })

    // 冷启动时先用本地缓存渲染，真实探测结果回来后在这里更正
    api.session.onChange((next) => set({ session: next }))

    // 环境探测较慢（要拉起 mpv / ncm-cli），放到后台补全，不阻塞首屏
    void get().refreshEnv()
  },

  refreshEnv: async () => {
    const res = await api.env.check()
    set({ env: res.ok ? res.data : null })
  },

  refreshSession: async (force = false) => {
    const res = await api.session.status(force)
    set({ session: res.ok ? res.data : null })
  },

  refreshQueue: async () => {
    const res = await api.player.queue()
    set({ queue: res.ok ? res.data : get().queue, queueLoaded: true })
  },

  setPlayback: (state) => set({ playback: state }),
  notify: (notice) => set({ notice }),

  toggle: async () => {
    const res = await api.player.toggle()
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
  },
  next: async () => {
    const res = await api.player.next()
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
    void get().refreshQueue()
  },
  prev: async () => {
    const res = await api.player.prev()
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
    void get().refreshQueue()
  },
  seek: async (seconds) => {
    set({ playback: { ...get().playback, position: seconds } })
    const res = await api.player.seek(seconds)
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
  },
  setVolume: async (level) => {
    set({ playback: { ...get().playback, volume: level } })
    const res = await api.player.volume(level)
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
  },
  playTrack: async (track) => {
    const res = await api.player.playTrack(track)
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
    void get().refreshQueue()
  },
  playQueue: async (tracks, index = 0) => {
    const res = await api.player.playQueue(tracks, index)
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
    set({ queue: { tracks, currentIndex: index } })
  },
  playPlaylist: async (id, tracks, originalId) => {
    const res = await api.player.playPlaylist(id, tracks, originalId)
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
    set({ queue: { tracks, currentIndex: 0 } })
  },
  queueAdd: async (track) => {
    const res = await api.player.queueAdd(track)
    const err = failureText(res)
    if (err) get().notify({ kind: 'error', text: err })
    else get().notify({ kind: 'success', text: `已加入队列：${track.name}` })
    void get().refreshQueue()
  },
  queueClear: async () => {
    await api.player.queueClear()
    set({ queue: { tracks: [], currentIndex: -1 } })
  },
  queueRemove: async (index) => {
    await api.player.queueRemove(index)
    void get().refreshQueue()
  },
  queueMove: async (from, to) => {
    await api.player.queueMove(from, to)
    void get().refreshQueue()
  },
}))
