import { Disc3, Minus, Square, X } from 'lucide-react'
import { api, isDesktop, runtimeMode } from '../lib/api'
import { useAppStore } from '../lib/store'

export function TitleBar() {
  const env = useAppStore((s) => s.env)
  const cliOk = env?.ncmCli.ok
  const mpvOk = env?.mpv.ok
  return (
    <header className="drag-region relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-ncm-light to-ncm-deep shadow-glow">
          <Disc3 className="h-4 w-4 text-white" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tracking-[0.2em] text-cloud-100">黑胶</span>
          <span className="hidden text-[10px] uppercase tracking-[0.28em] text-cloud-500 sm:block">
            netease cloud music
          </span>
        </div>
      </div>

      <div className="no-drag flex items-center gap-3">
        {!isDesktop && (
          <span className="rounded-full border border-ncm/30 bg-ncm/10 px-2.5 py-1 text-[10px] tracking-widest text-ncm-light">
            预览模式 · MOCK
          </span>
        )}
        {isDesktop ? (
          <span className="hidden items-center gap-1.5 text-[10px] tracking-widest text-cloud-500 md:flex">
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
          <span className="hidden text-[10px] tracking-widest text-cloud-500 md:block">UI PREVIEW</span>
        )}
        {isDesktop && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="最小化"
              onClick={() => api.app.minimize()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-cloud-400 transition hover:bg-white/10 hover:text-cloud-100"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="最大化"
              onClick={() => api.app.maximize()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-cloud-400 transition hover:bg-white/10 hover:text-cloud-100"
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="关闭到托盘"
              onClick={() => api.app.close()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-cloud-400 transition hover:bg-ncm hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
