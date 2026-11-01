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
      <h1 className="mt-4 text-[22px] font-semibold text-cloud-100">一切就绪</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-cloud-500">
        已连接 {nickname ?? '你的账号'}，播放后端 mpv 已就绪。开始听歌吧。
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-6 rounded-full bg-gradient-to-r from-ncm to-ncm-deep px-6 py-2.5 text-[12.5px] font-medium text-white shadow-glow transition hover:brightness-110"
      >
        进入播放器
      </button>
    </div>
  )
}
