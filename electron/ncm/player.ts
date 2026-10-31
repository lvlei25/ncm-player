import type { PlaybackState, PlaybackStatus, QueueSnapshot, Track } from '../../src/shared/types'
import { loadConfig, saveConfig } from '../store'
import { runCli } from './runner'

type Listener = (state: PlaybackState) => void

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
    await this.playAt(0)
  }

  async playAt(index: number): Promise<void> {
    const track = this.tracks[index]
    if (!track) return
    if (!track.playable) {
      this.errorState('该歌曲不可播放，已跳过')
      return
    }

    this.index = index
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
    this.emit()
    const args = ['queue', 'add', '--encrypted-id', track.id]
    if (track.originalId) args.push('--original-id', track.originalId)
    if (next) args.push('--next')
    await runCli(args).catch(() => undefined)
  }

  async queueClear(): Promise<void> {
    this.tracks = []
    this.index = -1
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
    this.emit()
  }

  move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return
    const [item] = this.tracks.splice(from, 1)
    this.tracks.splice(to, 0, item)
    if (this.index === from) this.index = to
    else if (from < this.index && to >= this.index) this.index -= 1
    else if (from > this.index && to <= this.index) this.index += 1
    this.emit()
  }

  private errorState(message: string): void {
    this.status = 'stopped'
    this.position = 0
    this.emit()
    console.error('[player]', message)
  }

  /** 轮询 `ncm-cli state`，驱动进度条与自动续播 */
  async refreshState(): Promise<void> {
    if (this.polling) return
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

      const inGrace = Date.now() - this.startedAt < 4000

      if (Number.isFinite(posSec)) this.position = Math.max(0, posSec)
      if (rawVol !== null) this.volume = rawVol
      if (this.status !== mapped && !(inGrace && this.status === 'playing')) this.status = mapped
      if (this.duration === 0 && this.current()) this.duration = this.current()!.durationMs / 1000

      if (mapped !== 'playing' && !inGrace) this.stopTimerOnly()
      this.emit()

      // 自动续播
      if (mapped === 'playing' && this.duration > 0 && this.position >= this.duration - 1.2 && !this.advancing) {
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
    }, 1000)
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
