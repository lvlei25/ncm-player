import { Disc3, Minus, Square, X } from 'lucide-react'
import { api, isDesktop } from '../lib/api'
import { useAppStore } from '../lib/store'

export function TitleBar() {
  const env = useAppStore((s) => s.env)
  const cliOk = env?.ncmCli.ok
  const mpvOk = env?.mpv.ok
  return (
    <header className="drag-region relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-ink-950/80 px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ncm">
          <Disc3 className="h-4 w-4 text-white" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-medium text-cloud-100">黑胶</span>
          <span className="hidden text-[11px] text-cloud-500 sm:block">网易云音乐</span>
        </div>
      </div>

      <div className="no-drag flex items-center gap-3">
        {!isDesktop && (
          <span className="rounded-md border border-ncm/30 bg-ncm/10 px-2.5 py-1 text-[11px] text-ncm-light">
            预览模式
          </span>
        )}
        {isDesktop ? (
          <span className="hidden items-center gap-1.5 text-[11px] text-cloud-500 md:flex">
            <span
              className={
                cliOk && mpvOk
                  ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                  : cliOk
                    ? 'h-1.5 w-1.5 rounded-full bg-amber-500'
                    : 'h-1.5 w-1.5 rounded-full bg-ncm'
              }
            />
            {env === null ? '检测环境中' : cliOk && mpvOk ? 'NCM-CLI 已连接' : cliOk ? 'MPV 未安装' : '未检测到 NCM-CLI'}
          </span>
        ) : (
          <span className="hidden text-[11px] text-cloud-500 md:block">预览模式</span>
        )}
        {isDesktop && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="最小化"
              onClick={() => api.app.minimize()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-cloud-400 transition-colors hover:bg-white/10 hover:text-cloud-100"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="最大化"
              onClick={() => api.app.maximize()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-cloud-400 transition-colors hover:bg-white/10 hover:text-cloud-100"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="退出应用"
              onClick={() => api.app.close()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-cloud-400 transition-colors hover:bg-ncm hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
