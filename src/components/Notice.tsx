import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../lib/format'
import { useAppStore } from '../lib/store'

const ICONS = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
}

export function Notice() {
  const notice = useAppStore((s) => s.notice)
  const notify = useAppStore((s) => s.notify)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => notify(null), 3600)
    return () => clearTimeout(timer)
  }, [notice, notify])

  if (!notice) return null
  const Icon = ICONS[notice.kind]

  return (
    <div className="pointer-events-none fixed bottom-[118px] left-1/2 z-50 -translate-x-1/2">
      <div
        className={cn(
          'glass pointer-events-auto flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[12px] shadow-glass animate-fade-up',
          notice.kind === 'error' && 'border-ncm/40 text-ncm-light',
          notice.kind === 'success' && 'border-emerald-500/30 text-emerald-300',
          notice.kind === 'info' && 'text-cloud-300',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="max-w-[420px] truncate">{notice.text}</span>
        <button
          type="button"
          aria-label="关闭提示"
          onClick={() => notify(null)}
          className="text-cloud-500 transition-colors hover:text-cloud-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
