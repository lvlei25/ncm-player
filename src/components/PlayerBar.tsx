import { useEffect, useState } from 'react'
import { Heart, ListMusic, ListOrdered, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { PLAY_MODE_LABELS } from '../shared/types'
import { useNavigate } from 'react-router-dom'
import { cn, artistsText, formatSeconds } from '../lib/format'
import { useAppStore } from '../lib/store'
import { Cover } from './Cover'

interface PlayerBarProps {
  onOpenQueue: () => void
  onOpenLyric: () => void
  activeLyric: boolean
}

export function PlayerBar({ onOpenQueue, onOpenLyric, activeLyric }: PlayerBarProps) {
  const playback = useAppStore((s) => s.playback)
  const { toggle, next, prev, seek, setVolume, cyclePlayMode } = useAppStore()
  const navigate = useNavigate()
  const [dragging, setDragging] = useState<number | null>(null)
  const [liked, setLiked] = useState(false)
  const [volumeHover, setVolumeHover] = useState(false)

  const duration = playback.duration || (playback.current ? playback.current.durationMs / 1000 : 0)
  const position = dragging ?? playback.position
  const percent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const volume = playback.volume ?? 60
  const playMode = playback.playMode ?? 'order'
  const modeIcon = {
    order: <ListOrdered className="h-[18px] w-[18px]" />,
    'repeat-all': <Repeat className="h-[18px] w-[18px]" />,
    'repeat-one': <Repeat1 className="h-[18px] w-[18px]" />,
    shuffle: <Shuffle className="h-[18px] w-[18px]" />,
  }[playMode]

  useEffect(() => {
    setLiked(false)
  }, [playback.current?.id])

  return (
    <footer className="relative z-30 shrink-0 px-4 pb-4 pt-1">
      <div className="glass flex h-[88px] items-center gap-5 rounded-2xl px-5 shadow-glass">
        {/* 当前曲目 */}
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <button
            type="button"
            aria-label="打开全屏播放页"
            onClick={() => navigate('/now')}
            className="relative shrink-0 rounded-full transition-colors hover:opacity-90"
          >
            <Cover
              src={playback.current?.coverUrl}
              alt={playback.current?.name ?? '暂无播放'}
              className="h-[54px] w-[54px] shadow-lg"
              rounded="rounded-full"
            />
            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950 ring-2 ring-white/15" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-cloud-100">
              {playback.current?.name ?? '还没有播放任何歌曲'}
            </p>
            <p className="mt-1 truncate text-[12px] text-cloud-500">
              {playback.current ? artistsText(playback.current.artists) : '试试搜索或让 AI 帮你点一首'}
            </p>
          </div>
          <button
            type="button"
            aria-label="喜欢"
            onClick={() => setLiked((v) => !v)}
            className={cn(
              'ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
              liked ? 'text-ncm' : 'text-cloud-500 hover:text-cloud-100',
            )}
          >
            <Heart className={cn('h-[18px] w-[18px]', liked && 'fill-ncm')} />
          </button>
        </div>

        {/* 控制与进度 */}
        <div className="flex w-[44%] max-w-[560px] flex-col items-center gap-1.5">
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label={`播放模式：${PLAY_MODE_LABELS[playMode]}`}
              title={`播放模式：${PLAY_MODE_LABELS[playMode]}（点击切换）`}
              onClick={() => void cyclePlayMode()}
              className={cn(
                'transition-colors hover:text-cloud-100',
                playMode === 'order' ? 'text-cloud-500' : 'text-ncm',
              )}
            >
              {modeIcon}
            </button>
            <button
              type="button"
              aria-label="上一首"
              onClick={() => void prev()}
              className="text-cloud-300 transition-colors hover:text-white active:scale-95"
            >
              <SkipBack className="h-[18px] w-[18px] fill-current" />
            </button>
            <button
              type="button"
              aria-label={playback.status === 'playing' ? '暂停' : '播放'}
              onClick={() => void toggle()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ncm text-white transition-colors hover:bg-ncm-deep active:scale-95"
            >
              {playback.status === 'playing' ? (
                <Pause className="h-[18px] w-[18px] fill-current" />
              ) : (
                <Play className="ml-0.5 h-[18px] w-[18px] fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label="下一首"
              onClick={() => void next()}
              className="text-cloud-300 transition-colors hover:text-white active:scale-95"
            >
              <SkipForward className="h-[18px] w-[18px] fill-current" />
            </button>
            <button
              type="button"
              aria-label="歌词"
              onClick={onOpenLyric}
              className={cn(
                'transition-colors hover:text-cloud-100',
                activeLyric ? 'text-ncm' : 'text-cloud-500',
              )}
            >
              <Mic2 className="h-[18px] w-[18px]" />
            </button>
          </div>

          <div className="flex w-full items-center gap-2.5">
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-cloud-500">
              {formatSeconds(position)}
            </span>
            <div className="relative flex flex-1 items-center">
              <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-ncm"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                step={1}
                value={position}
                aria-label="播放进度"
                onChange={(e) => setDragging(Number(e.target.value))}
                onPointerUp={() => {
                  if (dragging !== null) void seek(dragging)
                  setDragging(null)
                }}
                onKeyUp={() => {
                  if (dragging !== null) void seek(dragging)
                  setDragging(null)
                }}
                className="slider relative w-full bg-transparent"
                style={{ background: 'transparent' }}
              />
              {dragging !== null && (
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-ink-700 px-2 py-1 text-[11px] tabular-nums text-cloud-100 shadow-lg">
                  {formatSeconds(dragging)}
                </span>
              )}
            </div>
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-cloud-500">{formatSeconds(duration)}</span>
          </div>
        </div>

        {/* 音量与面板：悬浮展开滑块，滚轮微调 */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <div
            className="relative flex items-center gap-2"
            onMouseEnter={() => setVolumeHover(true)}
            onMouseLeave={() => setVolumeHover(false)}
            onWheel={(event) => {
              const delta = event.deltaY < 0 ? 5 : -5
              void setVolume(Math.max(0, Math.min(100, volume + delta)))
            }}
            title="鼠标悬浮展开音量，滚轮可微调"
          >
            <button
              type="button"
              aria-label="静音"
              onClick={() => void setVolume(volume === 0 ? 60 : 0)}
              className="text-cloud-500 transition-colors hover:text-cloud-100"
            >
              {volume === 0 ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
            </button>
            <div
              className={cn(
                'overflow-hidden transition-[width,opacity] duration-200',
                volumeHover ? 'w-24 opacity-100' : 'pointer-events-none w-0 opacity-0',
              )}
            >
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                aria-label="音量"
                onChange={(e) => void setVolume(Number(e.target.value))}
                className="slider w-24"
              />
            </div>
            {volumeHover && (
              <span className="pointer-events-none absolute -top-8 right-0 rounded-md bg-ink-700 px-2 py-1 text-[11px] tabular-nums text-cloud-100 shadow-lg">
                {volume}%
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="播放队列"
            onClick={onOpenQueue}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-cloud-400 transition-colors hover:bg-white/10 hover:text-cloud-100"
          >
            <ListMusic className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </footer>
  )
}
