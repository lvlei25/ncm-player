import { useEffect } from 'react'
import { ListMusic, Trash2, X } from 'lucide-react'
import { artistsText, cn, formatDuration } from '../lib/format'
import { useAppStore } from '../lib/store'
import { Cover } from './Cover'

interface QueueDrawerProps {
  open: boolean
  onClose: () => void
}

export function QueueDrawer({ open, onClose }: QueueDrawerProps) {
  const queue = useAppStore((s) => s.queue)
  const queueLoaded = useAppStore((s) => s.queueLoaded)
  const playback = useAppStore((s) => s.playback)
  const refreshQueue = useAppStore((s) => s.refreshQueue)
  const playQueue = useAppStore((s) => s.playQueue)
  const queueClear = useAppStore((s) => s.queueClear)
  const queueRemove = useAppStore((s) => s.queueRemove)

  // 队列懒加载：抽屉第一次打开时才真正走一次 IPC
  useEffect(() => {
    if (open && !queueLoaded) void refreshQueue()
  }, [open, queueLoaded, refreshQueue])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="关闭队列"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
      />

      <section className="relative flex h-full w-[392px] animate-fade-up flex-col border-l border-white/8 bg-ink-900/95 shadow-glass">
        <header className="flex items-center justify-between border-b border-white/6 px-5 py-4">
          <div className="flex items-center gap-2">
            <ListMusic className="h-4 w-4 text-ncm-light" />
            <h2 className="text-[13px] font-medium text-cloud-100">播放队列</h2>
            <span className="text-[11px] text-cloud-500">{queue.tracks.length} 首</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void queueClear()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-cloud-500 transition-colors hover:bg-white/6 hover:text-ncm-light"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="text-cloud-500 transition-colors hover:text-cloud-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {queue.tracks.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-cloud-500">
              <ListMusic className="h-6 w-6" />
              <p className="text-xs">队列是空的，去发现页挑几首吧</p>
            </div>
          )}

          {queue.tracks.map((track, index) => {
            const isCurrent = playback.current?.id === track.id
            return (
              <div
                key={`${track.id}-${index}`}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                  isCurrent ? 'bg-ncm/10' : 'hover:bg-white/5',
                )}
              >
                <span
                  className={cn(
                    'w-5 shrink-0 text-center text-[11px] tabular-nums',
                    isCurrent ? 'text-ncm-light' : 'text-cloud-500',
                  )}
                >
                  {isCurrent && playback.status === 'playing' ? (
                    <span className="mx-auto flex h-3 items-end gap-[2px]">
                      <span className="h-full w-[2px] origin-bottom animate-bar-dance bg-ncm" />
                      <span className="h-full w-[2px] origin-bottom animate-bar-dance bg-ncm [animation-delay:150ms]" />
                      <span className="h-full w-[2px] origin-bottom animate-bar-dance bg-ncm [animation-delay:300ms]" />
                    </span>
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => void playQueue(queue.tracks, index)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Cover src={track.coverUrl} alt={track.name} className="h-9 w-9 shrink-0" rounded="rounded-md" />
                  <span className="min-w-0">
                    <span className={cn('block truncate text-[13px]', isCurrent ? 'text-ncm-light' : 'text-cloud-100')}>
                      {track.name}
                    </span>
                    <span className="block truncate text-[11px] text-cloud-500">{artistsText(track.artists)}</span>
                  </span>
                </button>

                <span className="text-[11px] tabular-nums text-cloud-500">{formatDuration(track.durationMs)}</span>

                <button
                  type="button"
                  aria-label="移出队列"
                  onClick={() => void queueRemove(index)}
                  className="text-cloud-500 opacity-0 transition-colors hover:text-ncm-light group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
