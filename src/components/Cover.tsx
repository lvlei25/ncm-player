import { useState } from 'react'
import { Disc3 } from 'lucide-react'
import { cn } from '../lib/format'

interface CoverProps {
  src?: string
  alt: string
  className?: string
  rounded?: string
}

export function Cover({ src, alt, className, rounded = 'rounded-xl' }: CoverProps) {
  const [failed, setFailed] = useState(false)
  const showFallback = !src || failed

  return (
    <div className={cn('relative overflow-hidden bg-ink-700', rounded, className)}>
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center text-white/25">
          <Disc3 className="h-1/3 w-1/3" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
