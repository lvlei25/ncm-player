import { ExternalLink, KeyRound, Loader2 } from 'lucide-react'

const PLATFORM_URL = 'https://developer.music.163.com/st/developer/'

interface StepCredentialProps {
  appId: string
  privateKey: string
  saving: boolean
  onAppId: (value: string) => void
  onPrivateKey: (value: string) => void
  onSave: () => void
  onOpenPlatform: () => void
}

export function StepCredential({
  appId,
  privateKey,
  saving,
  onAppId,
  onPrivateKey,
  onSave,
  onOpenPlatform,
}: StepCredentialProps) {
  return (
    <div>
      <h1 className="text-[22px] font-medium text-cloud-100">填入开放平台凭证</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-cloud-500">
        在网易云音乐开放平台完成入驻后，应用详情里能看到 appId 与 privateKey。也可以用终端执行
        <code className="mx-1 rounded bg-white/8 px-1.5 py-0.5 text-[11px] text-cloud-300">ncm-cli configure</code>
        交互式写入。
      </p>

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-cloud-500">appId</span>
          <input
            value={appId}
            onChange={(e) => onAppId(e.target.value)}
            placeholder="例如 2025010112000001"
            className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3.5 py-2.5 text-[13px] text-cloud-100 outline-none transition-colors focus:border-ncm/60"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-cloud-500">privateKey</span>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => onPrivateKey(e.target.value)}
            placeholder="仅保存到本机 ncm-cli 配置"
            className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3.5 py-2.5 text-[13px] text-cloud-100 outline-none transition-colors focus:border-ncm/60"
          />
        </label>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenPlatform}
          className="flex items-center gap-1.5 text-[12px] text-cloud-400 transition-colors hover:text-cloud-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          打开开放平台控制台
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-ncm px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ncm-deep disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          保存并继续
        </button>
      </div>
    </div>
  )
}

export { PLATFORM_URL }
