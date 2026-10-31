import { useEffect, useRef, useState } from 'react'
import { Music4 } from 'lucide-react'
import type { LyricLine } from '../shared/types'
import { api } from '../lib/api'
import { activeIndex } from '../lib/lrc'
import { cn } from '../lib/format'
import { useAppStore } from '../lib/store'

interface LyricPanelProps {
  variant?: 'panel' | 'stage'
}

export function LyricPanel({ variant = 'panel' }: LyricPanelProps) {
  const playback = useAppStore((s) => s.playback)
  const seek = useAppStore((s) => s.seek)
  const [lines, setLines] = useState<LyricLine[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentId = playback.current?.id

  useEffect(() => {
    if (!currentId) {
      setLines([])
      return
    }
    setLoading(true)
    api.catalog
      .lyric(currentId)
      .then((res) => setLines(res.ok ? res.data.lines : []))
      .catch((error) => console.error('[lyric]', error))
      .finally(() => setLoading(false))
  }, [currentId])

  const idx = activeIndex(lines, playback.position)

  useEffect(() => {
    if (idx < 0) return
    const node = containerRef.current?.querySelector<HTMLElement>(`[data-line="${idx}"]`)
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [idx])

  const isStage = variant === 'stage'

  if (!playback.current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-cloud-500">
        <Music4 className="h-7 w-7" />
        <p className="text-xs tracking-wide">播放一首歌，这里就会浮现歌词</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 px-6">
        {[76, 58, 90, 64, 82].map((w, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-full bg-white/[0.06]"
            style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-cloud-500">
        <Music4 className="h-7 w-7" />
        <p className="text-xs leading-relaxed">
          这首歌暂时没有歌词
          <br />
          让它安静地播放完吧
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full overflow-y-auto scroll-smooth px-6',
        isStage ? 'py-[38vh]' : 'py-[34%]',
      )}
    >
      <div className={cn('flex flex-col', isStage ? 'gap-6 text-center' : 'gap-4')}>
        {lines.map((line, i) => {
          const active = i === idx
          const distance = Math.abs(i - idx)
          return (
            <button
              key={`${line.timeMs}-${i}`}
              type="button"
              data-line={i}
              onClick={() => void seek(line.timeMs / 1000)}
              className={cn(
                'transition-all duration-500',
                isStage ? 'text-center' : 'origin-left text-left',
                active
                  ? isStage
                    ? 'text-[26px] font-medium leading-relaxed text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.32)]'
                    : 'text-[15px] font-medium leading-relaxed text-white'
                  : 'text-cloud-500 hover:text-cloud-300',
                !active && isStage && (distance === 1 ? 'text-[17px]' : 'text-[15px]'),
                !active && !isStage && 'text-[12.5px]',
                !active && distance > 3 && 'opacity-45',
              )}
            >
              <span className="block">{line.text}</span>
              {line.translation && (
                <span
                  className={cn(
                    'mt-1 block transition-colors',
                    active ? 'text-cloud-300' : 'text-cloud-500/70',
                    isStage ? 'text-[14px]' : 'text-[11px]',
                  )}
                >
                  {line.translation}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
