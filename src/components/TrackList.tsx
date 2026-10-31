import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Clock3, ListPlus, Pause, Play } from 'lucide-react'
import type { Track } from '../shared/types'
import { artistsText, cn, formatDuration } from '../lib/format'
import { useAppStore } from '../lib/store'
import { Cover } from './Cover'

interface TrackListProps {
  tracks: Track[]
  showAlbum?: boolean
  heightClass?: string
  emptyHint?: string
}

export function TrackList({ tracks, showAlbum = true, heightClass = 'h-[calc(100vh-360px)]', emptyHint }: TrackListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const playback = useAppStore((s) => s.playback)
  const playQueue = useAppStore((s) => s.playQueue)
  const queueAdd = useAppStore((s) => s.queueAdd)
  const toggle = useAppStore((s) => s.toggle)

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 12,
  })

  if (tracks.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/8 text-cloud-500">
        <Clock3 className="h-5 w-5" />
        <p className="text-xs">{emptyHint ?? '这里还没有歌曲'}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-[46px_1fr_120px_86px_76px] items-center gap-3 border-b border-white/[0.06] px-4 pb-2.5 text-[10.5px] uppercase tracking-[0.18em] text-cloud-500">
        <span>#</span>
        <span>标题</span>
        {showAlbum ? <span className="truncate">专辑</span> : <span />}
        <span className="text-right">时长</span>
        <span className="text-right">操作</span>
      </div>

      <div ref={scrollRef} className={cn('overflow-y-auto', heightClass)}>
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const track = tracks[item.index]
            const isCurrent = playback.current?.id === track.id
            const isPlaying = isCurrent && playback.status === 'playing'

            return (
              <div
                key={`${track.id}-${item.index}`}
                className={cn(
                  'absolute left-0 top-0 grid w-full grid-cols-[46px_1fr_120px_86px_76px] items-center gap-3 rounded-xl px-4 transition-colors',
                  isCurrent ? 'bg-ncm/[0.09]' : 'hover:bg-white/[0.045]',
                  !track.playable && 'opacity-40',
                )}
                style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
              >
                <div className="flex items-center">
                  <span className={cn('text-[12px] tabular-nums', isCurrent ? 'text-ncm-light' : 'text-cloud-500')}>
                    {String(item.index + 1).padStart(2, '0')}
                  </span>
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  <Cover
                    src={track.coverUrl}
                    alt={track.name}
                    className="h-9 w-9 shrink-0"
                    rounded="rounded-md"
                    seed={track.name}
                  />
                  <div className="min-w-0">
                    <p className={cn('truncate text-[13px]', isCurrent ? 'text-ncm-light' : 'text-cloud-100')}>
                      {track.name}
                      {!track.playable && (
                        <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-cloud-400">不可播放</span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-cloud-500">{artistsText(track.artists)}</p>
                  </div>
                </div>

                {showAlbum ? <span className="truncate text-[11.5px] text-cloud-500">{track.album || '—'}</span> : <span />}

                <span className="text-right text-[11.5px] tabular-nums text-cloud-500">
                  {formatDuration(track.durationMs)}
                </span>

                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    aria-label={isPlaying ? '暂停' : '播放'}
                    disabled={!track.playable}
                    onClick={() => (isCurrent ? void toggle() : void playQueue(tracks, item.index))}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full transition',
                      track.playable
                        ? 'text-cloud-400 hover:bg-ncm hover:text-white'
                        : 'cursor-not-allowed text-cloud-500',
                    )}
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  </button>
                  <button
                    type="button"
                    aria-label="加入队列"
                    disabled={!track.playable}
                    onClick={() => void queueAdd(track)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full transition',
                      track.playable
                        ? 'text-cloud-500 hover:bg-white/10 hover:text-cloud-100'
                        : 'cursor-not-allowed text-cloud-500',
                    )}
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
