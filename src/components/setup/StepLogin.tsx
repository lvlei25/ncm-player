import { ExternalLink, Loader2, QrCode } from 'lucide-react'

interface StepLoginProps {
  loginLink: string
  loginBusy: boolean
  onStart: () => void
  onRefresh: () => void
  onOpenLink: (link: string) => void
}

export function StepLogin({ loginLink, loginBusy, onStart, onRefresh, onOpenLink }: StepLoginProps) {
  return (
    <div>
      <h1 className="text-[22px] font-semibold text-cloud-100">扫码登录网易云音乐</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-cloud-500">
        点击生成登录链接，会调用 ncm-cli 的后台登录并在浏览器打开授权页。用网易云音乐 App 扫码后，这里会自动进入下一步。
      </p>

      <div className="mt-6 flex items-start gap-4 rounded-2xl border border-white/6 bg-white/[0.02] p-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/12 text-cloud-500">
          <QrCode className="h-9 w-9" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-cloud-300">
            {loginLink ? '登录链接已生成，在浏览器完成扫码即可' : '还没有生成登录链接'}
          </p>
          <p className="mt-1.5 break-all text-[10.5px] leading-relaxed text-cloud-500">
            {loginLink || '也可以直接在终端执行 ncm-cli login，本页面会自动轮询登录状态。'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={loginBusy}
              className="flex items-center gap-1.5 rounded-full bg-ncm px-3.5 py-1.5 text-[11.5px] text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {loginBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
              生成登录链接
            </button>
            {loginLink && (
              <button
                type="button"
                onClick={() => onOpenLink(loginLink)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-[11.5px] text-cloud-300 transition hover:border-white/25"
              >
                <ExternalLink className="h-3 w-3" />
                打开浏览器
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-[11px] text-cloud-500">
        <Loader2 className="h-3 w-3 animate-spin text-ncm/70" />
        正在每 3 秒检查一次登录状态
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border border-white/10 px-4 py-2 text-[12px] text-cloud-300 transition hover:border-white/20 hover:text-cloud-100"
        >
          我已扫码，刷新状态
        </button>
      </div>
    </div>
  )
}
