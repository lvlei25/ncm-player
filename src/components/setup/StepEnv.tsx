import { CheckCircle2, Circle, Copy, RefreshCw } from 'lucide-react'
import type { EnvReport } from '../../shared/types'

interface StepEnvProps {
  env: EnvReport | null
  checking: boolean
  envOk: boolean
  copied: string
  onCopy: (text: string, key: string) => void
  onRefresh: () => void
  onNext: () => void
}

export function StepEnv({ env, checking, envOk, copied, onCopy, onRefresh, onNext }: StepEnvProps) {
  const rows = [
    {
      key: 'node',
      label: 'Node.js（需 ≥ 22.12）',
      ok: env?.node.ok ?? false,
      version: env?.node.version,
      cmd: 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs',
    },
    {
      key: 'cli',
      label: 'ncm-cli',
      ok: env?.ncmCli.ok ?? false,
      version: env?.ncmCli.version,
      cmd: 'npm install -g @music163/ncm-cli',
    },
    { key: 'mpv', label: 'mpv 播放后端', ok: env?.mpv.ok ?? false, version: env?.mpv.version, cmd: 'sudo apt install -y mpv' },
  ]

  return (
    <div>
      <h1 className="text-[22px] font-medium text-cloud-100">先确认运行环境</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-cloud-500">
        播放器通过 ncm-cli 调用网易云音乐开放平台，声音由 mpv 输出。缺什么就装什么，装完点重新检测。
      </p>

      <div className="mt-6 space-y-2.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
            {row.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-cloud-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-cloud-100">{row.label}</p>
              <p className="mt-0.5 truncate text-[11px] text-cloud-500">
                {checking
                  ? '正在检测…'
                  : row.ok
                    ? `v${row.version ?? '—'} 可用`
                    : `未检测到，执行：${row.cmd}`}
              </p>
              {!checking && row.key === 'node' && env?.node.promptSupport === false && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-400">
                  当前版本会让 ncm-cli 的交互式命令报 ERR_REQUIRE_ESM（@clack/prompts 是纯 ESM 包），请升级到 22.12+
                </p>
              )}
            </div>
            {!row.ok && (
              <button
                type="button"
                onClick={() => onCopy(row.cmd, row.key)}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-cloud-400 transition-colors hover:border-ncm/40 hover:text-cloud-100"
              >
                <Copy className="h-3 w-3" />
                {copied === row.key ? '已复制' : '复制'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-[12px] text-cloud-300 transition-colors hover:border-white/20 hover:text-cloud-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重新检测
        </button>
        <button
          type="button"
          disabled={!envOk || checking}
          onClick={onNext}
          className="rounded-lg bg-ncm px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ncm-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步
        </button>
      </div>
    </div>
  )
}
