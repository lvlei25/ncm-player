import type { PlaybackState, PlaybackStatus, QueueSnapshot, Track } from '../../src/shared/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, saveConfig } from '../store'
import { cliQueue, runCli } from './runner'

type Listener = (state: PlaybackState) => void

interface CliQueueItem {
  title?: string
  encryptedId?: string
  originalId?: number | string
  duration?: number
}

/** CLI 的 queue 命令只给标题，跳播需要加密 ID；尽力从 CLI 自己的队列缓存补齐 */
function readCliQueueItems(): CliQueueItem[] {
  try {
    const file = path.join(os.homedir(), '.config', 'ncm-cli', 'queue.json')
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { items?: CliQueueItem[] }
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

/** 一阶段：完全遥控 ncm-cli 内置 mpv 后端；本地维护队列镜像用于 UI 与自动续播 */
class Player {
  private tracks: Track[] = []
  private index = -1
  private status: PlaybackStatus = 'stopped'
  private position = 0
  private duration = 0
  private volume: number | null = loadConfig().volume
  private listeners = new Set<Listener>()
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private advancing = false
  private volumeTimer: NodeJS.Timeout | null = null
  /** 刚下发 play 的时间，用于 mpv 启动前的宽限期，避免过早判定为 stopped */
  private startedAt = 0

  constructor() {
    // 队列镜像是内存态，重启后从应用配置恢复，避免抽屉空白
    const saved = loadConfig()
    if (Array.isArray(saved.queueTracks)) {
      this.tracks = saved.queueTracks.filter((t) => t && typeof t.id === 'string')
      const savedIndex = typeof saved.queueIndex === 'number' ? saved.queueIndex : -1
      this.index = this.tracks.length ? Math.min(Math.max(savedIndex, 0), this.tracks.length - 1) : -1
    }
  }

  /** 队列变化即落盘（Track 均为纯数据，可直接 JSON 序列化） */
  private persistQueue(): void {
    saveConfig({ queueTracks: [...this.tracks], queueIndex: this.index })
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb)
    cb(this.snapshot())
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const state = this.snapshot()
    for (const cb of this.listeners) cb(state)
  }

  snapshot(): PlaybackState {
    return {
      status: this.status,
      position: this.position,
      duration: this.duration,
      volume: this.volume,
      currentIndex: this.index,
      queueLength: this.tracks.length,
      current: this.current(),
    }
  }

  current(): Track | null {
    return this.index >= 0 && this.index < this.tracks.length ? this.tracks[this.index] : null
  }

  getQueue(): QueueSnapshot {
    return { tracks: this.tracks, currentIndex: this.index }
  }

  setQueue(tracks: Track[], startIndex = 0, autoPlay = true): void {
    this.tracks = tracks.filter((t) => t.playable !== false)
    this.index = Math.min(Math.max(startIndex, 0), Math.max(this.tracks.length - 1, 0))
    this.persistQueue()
    this.emit()
    if (autoPlay) void this.playAt(this.index)
  }

  async playTrack(track: Track): Promise<void> {
    const existing = this.tracks.findIndex((t) => t.id === track.id)
    if (existing >= 0) {
      await this.playAt(existing)
      return
    }
    this.tracks = [track, ...this.tracks]
    this.index = 0
    this.persistQueue()
    await this.playAt(0)
  }

  async playAt(index: number): Promise<void> {
    const track = this.tracks[index]
    if (!track) return
    if (!track.playable) {
      this.errorState('该歌曲不可播放，已跳过')
      return
    }
    // 从 CLI 队列恢复的条目若没补到加密 ID，只能展示，不能下发播放
    if (!track.id) {
      console.warn('[player] 曲目缺少加密 ID，请从搜索或歌单重新播放')
      return
    }

    this.index = index
    this.persistQueue()
    this.status = 'playing'
    this.position = 0
    this.duration = track.durationMs / 1000
    this.startedAt = Date.now()
    this.emit()

    const args = ['play', '--song', '--encrypted-id', track.id]
    if (track.originalId) args.push('--original-id', track.originalId)

    await runCli(args)
    this.startPolling()
  }

  /** 播放整个歌单：交给 CLI 的 playlist 模式，同时保留本地镜像 */
  async playPlaylist(playlistId: string, tracks: Track[], originalId?: string): Promise<void> {
    this.tracks = tracks.filter((t) => t.playable !== false)
    this.index = 0
    this.persistQueue()
    this.status = 'playing'
    this.position = 0
    this.duration = this.tracks[0] ? this.tracks[0].durationMs / 1000 : 0
    this.startedAt = Date.now()
    this.emit()

    await runCli(['play', '--playlist', '--encrypted-id', playlistId, '--original-id', originalId ?? playlistId])
    this.startPolling()
  }

  async toggle(): Promise<void> {
    if (this.status === 'playing') {
      await runCli(['pause'])
      this.status = 'paused'
      this.emit()
      this.stopPolling()
      return
    }
    if (this.status === 'paused') {
      await runCli(['resume'])
      this.status = 'playing'
      this.emit()
      this.startPolling()
      return
    }
    if (this.tracks.length > 0) await this.playAt(Math.max(this.index, 0))
  }

  async step(delta: 1 | -1): Promise<void> {
    if (this.tracks.length === 0) return
    const nextIndex = (this.index + delta + this.tracks.length) % this.tracks.length
    await this.playAt(nextIndex)
  }

  async seek(seconds: number): Promise<void> {
    const target = Math.max(0, Math.min(seconds, this.duration || seconds))
    this.position = target
    this.emit()
    await runCli(['seek', String(Math.round(target))])
  }

  setVolume(level: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(level)))
    this.volume = clamped
    this.emit()
    saveConfig({ volume: clamped })

    if (this.volumeTimer) clearTimeout(this.volumeTimer)
    this.volumeTimer = setTimeout(() => {
      runCli(['volume', String(clamped)]).catch(() => undefined)
    }, 140)
  }

  async queueAdd(track: Track, next = false): Promise<void> {
    this.tracks.push(track)
    this.persistQueue()
    this.emit()
    const args = ['queue', 'add', '--encrypted-id', track.id]
    if (track.originalId) args.push('--original-id', track.originalId)
    if (next) args.push('--next')
    await runCli(args).catch(() => undefined)
  }

  /** 应用退出时调用：mpv 是独立进程，必须显式 stop 才不会继续出声 */
  async stop(): Promise<void> {
    this.stopPolling()
    this.status = 'stopped'
    this.position = 0
    this.emit()
    await runCli(['stop'], { timeout: 5000 }).catch(() => undefined)
  }

  async queueClear(): Promise<void> {
    this.tracks = []
    this.index = -1
    this.persistQueue()
    this.status = 'stopped'
    this.position = 0
    this.duration = 0
    this.emit()
    this.stopPolling()
    await runCli(['queue', 'clear']).catch(() => undefined)
  }

  removeAt(index: number): void {
    if (index < 0 || index >= this.tracks.length) return
    this.tracks.splice(index, 1)
    if (index < this.index) this.index -= 1
    if (index === this.index) this.index = Math.min(this.index, this.tracks.length - 1)
    this.persistQueue()
    this.emit()
  }

  move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return
    const [item] = this.tracks.splice(from, 1)
    this.tracks.splice(to, 0, item)
    if (this.index === from) this.index = to
    else if (from < this.index && to >= this.index) this.index -= 1
    else if (from > this.index && to <= this.index) this.index += 1
    this.persistQueue()
    this.emit()
  }

  private errorState(message: string): void {
    this.status = 'stopped'
    this.position = 0
    this.emit()
    console.error('[player]', message)
  }

  /** 避免多个心跳同时重建队列 */
  private syncing = false

  /** 从 CLI 队列重建镜像：queue 命令只给标题，加密 ID 由 CLI 队列缓存补齐 */
  private async syncQueueFromCli(): Promise<void> {
    const { json: queueJson } = await runCli(['queue'])
    const rows: Array<{ label?: string; current?: boolean }> = Array.isArray(queueJson?.queue)
      ? (queueJson?.queue as Array<{ label?: string; current?: boolean }>)
      : []
    const cached = readCliQueueItems()
    this.tracks = rows.map((row, i) => {
      const label = typeof row.label === 'string' ? row.label : ''
      const [name, ...artists] = label.split(' - ')
      const meta = cached.find((item) => item.title === label)
      return {
        id: meta?.encryptedId ?? '',
        originalId: meta?.originalId !== undefined ? String(meta.originalId) : undefined,
        name: name || label || `曲目 ${i + 1}`,
        artists: artists.length ? [artists.join(' - ')] : [],
        album: '',
        durationMs: meta?.duration ? Math.round(meta.duration * 1000) : 0,
        playable: true,
      } satisfies Track
    })
    const current = rows.findIndex((row) => row.current)
    this.index = current >= 0 ? current : 0
    this.persistQueue()
  }

  /** 从 CLI 的 `title` 里取出歌名（格式：歌名 - 歌手） */
  private static titleName(title: string): string {
    return title.split(' - ')[0].trim()
  }

  /**
   * 冷启动同步 CLI 真实播放态。mpv 是独立进程，应用重启时可能仍在播放；
   * 内存队列镜像为空时从 CLI 队列恢复，加密 ID 由 CLI 队列缓存补齐，
   * 读不到时只展示标题（跳播会提示重新选择）。
   */
  async hydrate(): Promise<void> {
    try {
      const { json } = await runCli(['state'])
      const state = (json?.state ?? json) as Record<string, unknown> | undefined
      if (!state) return

      const rawStatus = typeof state.status === 'string' ? state.status : 'stopped'
      const mapped: PlaybackStatus =
        rawStatus === 'playing' ? 'playing' : rawStatus === 'paused' ? 'paused' : 'stopped'
      const rawPos = typeof state.position === 'number' ? state.position : Number(state.position ?? 0)
      this.position = rawPos > 100_000 ? rawPos / 1000 : Math.max(0, rawPos)
      const rawDuration = typeof state.duration === 'number' ? state.duration : Number(state.duration ?? 0)
      if (Number.isFinite(rawDuration) && rawDuration > 0) this.duration = rawDuration
      if (typeof state.volume === 'number') this.volume = state.volume
      this.status = mapped

      if (this.tracks.length === 0 && Number(state.queueLength ?? 0) > 0) {
        await this.syncQueueFromCli()
      }

      const cliName = Player.titleName(typeof state.title === 'string' ? state.title : '')
      const matched = cliName ? this.tracks.findIndex((t) => t.name === cliName) : -1
      if (matched >= 0) this.index = matched
      else if (typeof state.currentIndex === 'number' && state.currentIndex >= 0 && state.currentIndex < this.tracks.length) {
        this.index = state.currentIndex
      }

      this.emit()
      if (mapped === 'playing') this.startPolling()
    } catch {
      // CLI 不可用（未登录 / 未配置）时保持本地状态，不影响首屏
    }
  }

  /** 轮询 `ncm-cli state`，驱动进度条与自动续播 */
  async refreshState(): Promise<void> {
    if (this.polling) return
    // 用户操作优先：队列里还有任务时，本次心跳直接跳过而不是排队
    if (cliQueue.busy) return
    this.polling = true
    try {
      const { json } = await runCli(['state'])
      const state = (json?.state ?? json) as Record<string, unknown> | undefined
      if (!state) return

      const rawStatus = typeof state.status === 'string' ? state.status : 'stopped'
      const mapped: PlaybackStatus =
        rawStatus === 'playing' ? 'playing' : rawStatus === 'paused' ? 'paused' : 'stopped'

      const rawPos = typeof state.position === 'number' ? state.position : Number(state.position ?? 0)
      const posSec = rawPos > 100_000 ? rawPos / 1000 : rawPos
      const rawVol = typeof state.volume === 'number' ? state.volume : null
      const rawDuration = typeof state.duration === 'number' ? state.duration : Number(state.duration ?? 0)

      const inGrace = Date.now() - this.startedAt < 4000

      if (Number.isFinite(posSec)) this.position = Math.max(0, posSec)
      if (rawVol !== null) this.volume = rawVol
      if (this.status !== mapped && !(inGrace && this.status === 'playing')) this.status = mapped

      // CLI 可能自己切歌（放完自动续播、外部 next、队列驱动）：用真实标题校正当前曲目，
      // 否则全屏播放页的标题/封面/歌词会一直停在上一首。
      const cliName = Player.titleName(typeof state.title === 'string' ? state.title : '')
      let trackChanged = false
      let needsQueueSync = false
      if (cliName && this.tracks.length > 0) {
        const matched = this.tracks.findIndex((t) => t.name === cliName)
        if (matched >= 0 && matched !== this.index) {
          this.index = matched
          this.persistQueue()
          trackChanged = true
        } else if (matched < 0) {
          needsQueueSync = true
        }
      }

      if (Number.isFinite(rawDuration) && rawDuration > 0) this.duration = rawDuration
      else if (this.current()) this.duration = this.current()!.durationMs / 1000

      if (needsQueueSync && !this.syncing) {
        this.syncing = true
        void this.syncQueueFromCli()
          .then(() => this.emit())
          .catch(() => undefined)
          .finally(() => {
            this.syncing = false
          })
      }

      if (mapped !== 'playing' && !inGrace) this.stopTimerOnly()
      this.emit()

      // 自动续播：CLI 已切歌时不再重复下发 play
      if (mapped === 'playing' && !trackChanged && !needsQueueSync && this.duration > 0 && this.position >= this.duration - 1.2 && !this.advancing) {
        this.advancing = true
        await this.step(1)
        this.advancing = false
      }
      if (mapped === 'stopped' && this.tracks.length > 0 && this.position > 0 && this.status === 'stopped') {
        this.position = 0
      }
    } catch {
      // 状态读取失败不打断播放，仅停止轮询
      this.stopTimerOnly()
    } finally {
      this.polling = false
    }
  }

  startPolling(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.refreshState()
    }, 1500)
  }

  private stopTimerOnly(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  stopPolling(): void {
    this.stopTimerOnly()
  }

  dispose(): void {
    this.stopTimerOnly()
    if (this.volumeTimer) clearTimeout(this.volumeTimer)
    this.listeners.clear()
  }
}

export const player = new Player()
