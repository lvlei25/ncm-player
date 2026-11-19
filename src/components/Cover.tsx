import { useEffect, useState } from 'react'
import { Disc3 } from 'lucide-react'
import { thumbnailUrl } from '../lib/coverUrl'
import { cn } from '../lib/format'

interface CoverProps {
  src?: string
  alt: string
  className?: string
  rounded?: string
}

export function Cover({ src, alt, className, rounded = 'rounded-xl' }: CoverProps) {
  const [failed, setFailed] = useState(false)
  const source = thumbnailUrl(src)
  useEffect(() => setFailed(false), [src])
  const showFallback = !source || failed

  return (
    <div className={cn('relative overflow-hidden bg-ink-700', rounded, className)}>
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center text-white/25">
          <Disc3 className="h-1/3 w-1/3" />
        </div>
      ) : (
        <img
          src={source}
          alt={alt}
          // 首屏封面立即加载；列表本身已虚拟化，不需要 lazy 延迟
          loading="eager"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
