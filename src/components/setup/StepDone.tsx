import { CheckCircle2 } from 'lucide-react'

interface StepDoneProps {
  nickname?: string
  onDone: () => void
}

export function StepDone({ nickname, onDone }: StepDoneProps) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ncm/15 text-ncm-light">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-[22px] font-medium text-cloud-100">一切就绪</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-cloud-500">
        已连接 {nickname ?? '你的账号'}，播放后端 mpv 已就绪。开始听歌吧。
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-6 rounded-lg bg-ncm px-6 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-ncm-deep"
      >
        进入播放器
      </button>
    </div>
  )
}
