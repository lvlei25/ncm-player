import { ChevronDown, Heart, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Cover } from '../components/Cover'
import { LyricPanel } from '../components/LyricPanel'
import { artistsText, cn, formatSeconds } from '../lib/format'
import { useAppStore } from '../lib/store'

export function NowPlaying() {
  const navigate = useNavigate()
  const playback = useAppStore((s) => s.playback)
  const { toggle, next, prev } = useAppStore()
  const track = playback.current
  const playing = playback.status === 'playing'

  return (
    <div className="relative flex h-full flex-col animate-fade-up">
      <div className="flex items-center justify-between px-8 pt-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-[11.5px] text-cloud-500 transition hover:text-cloud-100"
        >
          <ChevronDown className="h-4 w-4" />
          收起播放页
        </button>
        <p className="text-[10.5px] uppercase tracking-[0.3em] text-cloud-500">now playing</p>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-10 px-10 pb-4">
        {/* 黑胶唱片 */}
        <div className="flex w-[42%] min-w-[300px] flex-col items-center">
          <div className="relative aspect-square w-full max-w-[420px]">
            <div
              className={cn(
                'absolute inset-0 rounded-full bg-ink-950 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)]',
                playing ? 'animate-spin-slow' : '',
              )}
            >
              <div className="absolute inset-0 rounded-full vinyl-grooves" />
              <div className="absolute inset-[16%] overflow-hidden rounded-full border border-white/10">
                <Cover
                  src={track?.coverUrl}
                  alt={track?.name ?? '暂无播放'}
                  className="h-full w-full"
                  rounded="rounded-full"
                  seed={track?.name ?? 'vinyl'}
                />
              </div>
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950 ring-2 ring-white/15" />
            </div>
            <div className="pointer-events-none absolute -inset-8 rounded-full bg-ncm/10 blur-3xl" />
          </div>

          <div className="mt-8 w-full max-w-[420px] text-center">
            <h1 className="truncate text-[21px] font-semibold text-cloud-100">{track?.name ?? '暂无播放'}</h1>
            <p className="mt-1.5 truncate text-[12.5px] text-cloud-500">
              {track ? artistsText(track.artists) : '从搜索或推荐里挑一首'}
            </p>
            {track?.album && <p className="mt-1 truncate text-[11px] text-cloud-500/80">《{track.album}》</p>}

            <div className="mt-6 flex items-center justify-center gap-6">
              <button
                type="button"
                aria-label="上一首"
                onClick={() => void prev()}
                className="text-cloud-300 transition hover:text-white active:scale-95"
              >
                <SkipBack className="h-6 w-6 fill-current" />
              </button>
              <button
                type="button"
                aria-label={playing ? '暂停' : '播放'}
                onClick={() => void toggle()}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-950 shadow-2xl transition hover:scale-105 active:scale-95"
              >
                {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}
              </button>
              <button
                type="button"
                aria-label="下一首"
                onClick={() => void next()}
                className="text-cloud-300 transition hover:text-white active:scale-95"
              >
                <SkipForward className="h-6 w-6 fill-current" />
              </button>
              <button
                type="button"
                aria-label="喜欢"
                className="ml-2 text-cloud-500 transition hover:text-ncm"
              >
                <Heart className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-4 text-[11px] tabular-nums text-cloud-500">
              {formatSeconds(playback.position)} / {formatSeconds(playback.duration)}
            </p>
          </div>
        </div>

        {/* 歌词舞台 */}
        <div className="relative min-h-0 min-w-0 flex-1 self-stretch">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-ink-950 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-ink-950 to-transparent" />
          <LyricPanel variant="stage" />
        </div>
      </div>
    </div>
  )
}
