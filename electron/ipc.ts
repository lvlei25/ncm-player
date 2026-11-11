import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { z } from 'zod'
import type { AiMessage, IpcResult, Track } from '../src/shared/types'
import { chat } from './ai/service'
import { getDailyRecommend, getLyric, getPlaylistDetail, getRecommendedPlaylists, search } from './ncm/catalog'
import { player } from './ncm/player'
import { NcmError } from './ncm/runner'
import { checkEnv, getSession, invalidateSession, logout, setCredentials, startLogin } from './ncm/session'
import { getAiKey, loadConfig, saveConfig, setAiKey } from './store'

const trackSchema = z
  .object({
    id: z.string(),
    originalId: z.string().optional(),
    name: z.string(),
    artists: z.array(z.string()),
    album: z.string(),
    albumId: z.string().optional(),
    durationMs: z.number(),
    coverUrl: z.string().optional(),
    playable: z.boolean(),
    reason: z.string().optional(),
  })
  .passthrough()

const trackListSchema = z.array(trackSchema)

const searchSchema = z.object({
  type: z.enum(['song', 'artist', 'album', 'playlist']),
  keyword: z.string().min(1).max(120),
})

const lyricsSchema = z.object({ songId: z.string().min(1) })

const playModeSchema = z.enum(['order', 'repeat-all', 'repeat-one', 'shuffle'])

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(20),
})

const aiConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  model: z.string().max(80).optional(),
  apiKey: z.string().max(300).optional(),
})

/** 统一包装：把异常转成带错误码的结构化返回，渲染层无需 try/catch */
function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<TResult>> => {
    try {
      const data = await fn(...(args as TArgs))
      return { ok: true, data }
    } catch (error) {
      const code = error instanceof NcmError ? error.code : 'UNKNOWN'
      const message = error instanceof Error ? error.message : String(error)
      // 登录态失效时立刻让会话缓存过期，下次探测会自动纠正
      if (code === 'UNAUTHORIZED') invalidateSession()
      console.error(`[ipc:${channel}]`, code, message)
      return { ok: false, code, message }
    }
  })
}

function requireTrack(value: unknown): Track {
  return trackSchema.parse(value) as Track
}

export function registerIpc(): void {
  handle('env:check', (force?: boolean) => checkEnv(Boolean(force)))
  handle('session:status', (force?: boolean) => getSession(Boolean(force)))
  handle('session:save', (appId: string, privateKey: string) => setCredentials(appId, privateKey))
  handle('session:login-start', () => startLogin())
  handle('session:logout', async () => {
    await logout()
    return true
  })

  handle('catalog:search', (payload: unknown) => {
    const input = searchSchema.parse(payload)
    return search(input.type, input.keyword)
  })
  handle('catalog:daily', () => getDailyRecommend())
  handle('catalog:recommend-playlists', () => getRecommendedPlaylists())
  handle('catalog:playlist', (id: string) => getPlaylistDetail(String(id)))
  handle('catalog:lyric', (payload: unknown) => {
    const input = lyricsSchema.parse(payload)
    return getLyric(input.songId)
  })

  handle('player:state', () => player.snapshot())
  handle('player:queue', () => player.getQueue())
  handle('player:play-track', (track: unknown) => player.playTrack(requireTrack(track)).then(() => true))
  handle('player:play-queue', (tracks: unknown, index: number) => {
    player.setQueue(trackListSchema.parse(tracks) as Track[], Number(index) || 0, true)
    return true
  })
  handle('player:play-playlist', (id: string, tracks: unknown, originalId?: string) =>
    player
      .playPlaylist(String(id), trackListSchema.parse(tracks) as Track[], originalId ? String(originalId) : undefined)
      .then(() => true),
  )
  handle('player:toggle', () => player.toggle().then(() => true))
  handle('player:next', () => player.step(1).then(() => true))
  handle('player:prev', () => player.step(-1).then(() => true))
  handle('player:seek', (seconds: number) => player.seek(Number(seconds)).then(() => true))
  handle('player:volume', (level: number) => {
    player.setVolume(Number(level))
    return true
  })
  handle('player:play-mode', (mode: unknown) => {
    player.setPlayMode(playModeSchema.parse(mode))
    return true
  })
  handle('player:queue-add', (track: unknown, next: boolean) =>
    player.queueAdd(requireTrack(track), Boolean(next)).then(() => true),
  )
  handle('player:queue-clear', () => player.queueClear().then(() => true))
  handle('player:queue-remove', (index: number) => {
    player.removeAt(Number(index))
    return true
  })
  handle('player:queue-move', (from: number, to: number) => {
    player.move(Number(from), Number(to))
    return true
  })

  handle('ai:chat', (payload: unknown) => {
    const input = chatSchema.parse(payload)
    return chat(input.messages as AiMessage[])
  })
  handle('ai:config-get', () => {
    const config = loadConfig()
    return {
      baseUrl: config.aiBaseUrl,
      model: config.aiModel,
      apiKey: '',
      hasKey: getAiKey().length > 0,
    }
  })
  handle('ai:config-set', (payload: unknown) => {
    const input = aiConfigSchema.parse(payload)
    if (input.baseUrl) saveConfig({ aiBaseUrl: input.baseUrl })
    if (input.model) saveConfig({ aiModel: input.model })
    if (typeof input.apiKey === 'string') setAiKey(input.apiKey)
    return true
  })

  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  }))
  handle('app:onboarded', (value: boolean) => {
    saveConfig({ onboarded: Boolean(value) })
    return true
  })

  // 与其余通道一样走统一包装，返回 IpcResult<boolean> 而不是裸 boolean
  handle('shell:open-external', async (url: unknown) => {
    const target = typeof url === 'string' ? url : ''
    if (/^https?:\/\//i.test(target)) await shell.openExternal(target)
    return true
  })

  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  // 点标题栏的关闭 = 真正退出（退出流程会先停播放），而不是藏到托盘
  ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
}
