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
  Playlist,
  QueueSnapshot,
  SearchResult,
  SearchType,
  SessionStatus,
  Track,
} from './types'

/** 预加载脚本暴露给渲染层的桥接契约（主进程与 mock 都要实现它） */
export interface NcmBridge {
  env: {
    check: () => Promise<IpcResult<EnvReport>>
  }
  session: {
    /** force=true 绕过 60s 会话缓存（用户显式点刷新时用） */
    status: (force?: boolean) => Promise<IpcResult<SessionStatus>>
    /** 后台探测修正后的会话状态（冷启动先用本地缓存渲染） */
    onChange: (cb: (session: SessionStatus) => void) => () => void
    save: (appId: string, privateKey: string) => Promise<IpcResult<boolean>>
    loginStart: () => Promise<IpcResult<LoginTicket>>
    logout: () => Promise<IpcResult<boolean>>
  }
  catalog: {
    search: (type: SearchType, keyword: string) => Promise<IpcResult<SearchResult>>
    daily: () => Promise<IpcResult<Track[]>>
    recommendPlaylists: () => Promise<IpcResult<Playlist[]>>
    playlist: (id: string) => Promise<IpcResult<{ playlist: Playlist | null; tracks: Track[] }>>
    lyric: (songId: string) => Promise<IpcResult<LyricPayload>>
  }
  player: {
    state: () => Promise<IpcResult<PlaybackState>>
    queue: () => Promise<IpcResult<QueueSnapshot>>
    playTrack: (track: Track) => Promise<IpcResult<boolean>>
    playQueue: (tracks: Track[], index?: number) => Promise<IpcResult<boolean>>
    playPlaylist: (id: string, tracks: Track[], originalId?: string) => Promise<IpcResult<boolean>>
    toggle: () => Promise<IpcResult<boolean>>
    next: () => Promise<IpcResult<boolean>>
    prev: () => Promise<IpcResult<boolean>>
    seek: (seconds: number) => Promise<IpcResult<boolean>>
    volume: (level: number) => Promise<IpcResult<boolean>>
    queueAdd: (track: Track, next?: boolean) => Promise<IpcResult<boolean>>
    queueClear: () => Promise<IpcResult<boolean>>
    queueRemove: (index: number) => Promise<IpcResult<boolean>>
    queueMove: (from: number, to: number) => Promise<IpcResult<boolean>>
    onState: (cb: (state: PlaybackState) => void) => () => void
  }
  ai: {
    chat: (messages: AiMessage[]) => Promise<IpcResult<AiReply>>
    configGet: () => Promise<IpcResult<AiConfig>>
    configSet: (payload: Partial<AiConfig>) => Promise<IpcResult<boolean>>
  }
  app: {
    info: () => Promise<IpcResult<AppInfo>>
    setOnboarded: (value: boolean) => Promise<IpcResult<boolean>>
    openExternal: (url: string) => Promise<IpcResult<boolean>>
    minimize: () => void
    maximize: () => void
    close: () => void
  }
}
