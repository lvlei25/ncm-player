import { CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/format'

const STEPS = ['环境自检', '开放平台凭证', '扫码登录', '完成']

export function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      {STEPS.map((label, index) => {
        const active = index === step
        const done = index < step
        return (
          <div key={label} className="flex flex-1 items-center gap-2.5 last:flex-none">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors',
                done && 'border-ncm/40 bg-ncm/15 text-ncm-light',
                active && 'border-ncm bg-ncm text-white',
                !done && !active && 'border-white/10 text-cloud-500',
              )}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                'whitespace-nowrap text-[12px]',
                active ? 'text-cloud-100' : done ? 'text-cloud-400' : 'text-cloud-500',
              )}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && <span className="mx-2 h-px flex-1 bg-white/8" />}
          </div>
        )
      })}
    </div>
  )
}
