import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiConfig,
  AiMessage,
  AiReply,
  AppInfo,
  EnvReport,
  IpcResult,
  LoginTicket,
  LyricPayload,
  PlaybackState,
  PlayMode,
  Playlist,
  QueueSnapshot,
  SearchResult,
  SearchType,
  SessionStatus,
  Track,
} from '../src/shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> =>
  ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>

const api = {
  env: {
    check: (force?: boolean) => invoke<EnvReport>('env:check', force),
  },
  session: {
    status: (force?: boolean) => invoke<SessionStatus>('session:status', force),
    save: (appId: string, privateKey: string) => invoke<boolean>('session:save', appId, privateKey),
    loginStart: () => invoke<LoginTicket>('session:login-start'),
    onChange: (cb: (session: SessionStatus) => void) => {
      const listener = (_e: unknown, session: SessionStatus) => cb(session)
      ipcRenderer.on('session:changed', listener)
      return () => ipcRenderer.removeListener('session:changed', listener)
    },
    logout: () => invoke<boolean>('session:logout'),
  },
  catalog: {
    search: (type: SearchType, keyword: string) => invoke<SearchResult>('catalog:search', { type, keyword }),
    daily: () => invoke<Track[]>('catalog:daily'),
    recommendPlaylists: () => invoke<Playlist[]>('catalog:recommend-playlists'),
    playlist: (id: string) => invoke<{ playlist: Playlist | null; tracks: Track[] }>('catalog:playlist', id),
    lyric: (songId: string) => invoke<LyricPayload>('catalog:lyric', { songId }),
  },
  player: {
    state: () => invoke<PlaybackState>('player:state'),
    queue: () => invoke<QueueSnapshot>('player:queue'),
    playTrack: (track: Track) => invoke<boolean>('player:play-track', track),
    playQueue: (tracks: Track[], index = 0) => invoke<boolean>('player:play-queue', tracks, index),
    playPlaylist: (id: string, tracks: Track[], originalId?: string) =>
      invoke<boolean>('player:play-playlist', id, tracks, originalId),
    toggle: () => invoke<boolean>('player:toggle'),
    next: () => invoke<boolean>('player:next'),
    prev: () => invoke<boolean>('player:prev'),
    seek: (seconds: number) => invoke<boolean>('player:seek', seconds),
    volume: (level: number) => invoke<boolean>('player:volume', level),
    setPlayMode: (mode: PlayMode) => invoke<boolean>('player:play-mode', mode),
    queueAdd: (track: Track, next = false) => invoke<boolean>('player:queue-add', track, next),
    queueClear: () => invoke<boolean>('player:queue-clear'),
    queueRemove: (index: number) => invoke<boolean>('player:queue-remove', index),
    queueMove: (from: number, to: number) => invoke<boolean>('player:queue-move', from, to),
    onState: (cb: (state: PlaybackState) => void) => {
      const listener = (_e: unknown, state: PlaybackState) => cb(state)
      ipcRenderer.on('player:state-changed', listener)
      return () => ipcRenderer.removeListener('player:state-changed', listener)
    },
  },
  ai: {
    chat: (messages: AiMessage[]) => invoke<AiReply>('ai:chat', { messages }),
    configGet: () => invoke<AiConfig>('ai:config-get'),
    configSet: (payload: Partial<AiConfig>) => invoke<boolean>('ai:config-set', payload),
  },
  app: {
    info: () => invoke<AppInfo>('app:info'),
    setOnboarded: (value: boolean) => invoke<boolean>('app:onboarded', value),
    openExternal: (url: string) => invoke<boolean>('shell:open-external', url),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
}

export type NcmApi = typeof api

contextBridge.exposeInMainWorld('ncm', api)
