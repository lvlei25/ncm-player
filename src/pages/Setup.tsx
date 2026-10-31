import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, Copy, ExternalLink, KeyRound, Loader2, QrCode, RefreshCw, Terminal } from 'lucide-react'
import type { EnvReport, SessionStatus } from '../shared/types'
import { api, failureText } from '../lib/api'
import { cn } from '../lib/format'
import { useAppStore } from '../lib/store'

interface SetupProps {
  env: EnvReport | null
  session: SessionStatus | null
  onDone: () => void
}

const PLATFORM_URL = 'https://developer.music.163.com/st/developer/'

export function Setup({ env, session, onDone }: SetupProps) {
  const refreshEnv = useAppStore((s) => s.refreshEnv)
  const refreshSession = useAppStore((s) => s.refreshSession)
  const notify = useAppStore((s) => s.notify)

  const [appId, setAppId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [loginLink, setLoginLink] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const checking = env === null
  const envOk = Boolean(env?.ncmCli.ok && env?.mpv.ok)
  const configured = Boolean(session?.configured)
  const loggedIn = Boolean(session?.loggedIn)

  const [params] = useSearchParams()
  const autoStep = !envOk ? 0 : !configured ? 1 : !loggedIn ? 2 : 3
  const forced = params.get('step')
  const step = forced === null ? autoStep : Math.min(Math.max(Number(forced) || 0, 0), 3)

  useEffect(() => {
    if (step !== 2) return
    const timer = setInterval(() => {
      api.session.status().then((res) => {
        if (res.ok && res.data.loggedIn) {
          void refreshSession()
          notify({ kind: 'success', text: '登录成功，欢迎回来' })
        }
      })
    }, 3000)
    return () => clearInterval(timer)
  }, [step, refreshSession, notify])

  const copy = (text: string, key: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied(''), 1600)
      })
      .catch((error) => console.error('[copy]', error))
  }

  const saveCredentials = () => {
    if (!appId.trim() || !privateKey.trim()) {
      notify({ kind: 'error', text: '请填写 appId 与 privateKey' })
      return
    }
    setSaving(true)
    api.session
      .save(appId.trim(), privateKey.trim())
      .then((res) => {
        if (!res.ok) {
          notify({ kind: 'error', text: failureText(res) ?? '保存失败' })
          return
        }
        notify({ kind: 'success', text: '凭证已写入 ncm-cli 配置' })
        setPrivateKey('')
        return Promise.all([refreshSession(), refreshEnv()])
      })
      .catch((error) => console.error('[setup]', error))
      .finally(() => setSaving(false))
  }

  const startLogin = () => {
    setLoginBusy(true)
    api.session
      .loginStart()
      .then((res) => {
        if (!res.ok) {
          notify({ kind: 'error', text: failureText(res) ?? '登录启动失败' })
          return
        }
        if (res.data.link) {
          setLoginLink(res.data.link)
          void api.app.openExternal(res.data.link)
        } else {
          notify({ kind: 'error', text: res.data.message ?? '未能获取登录链接，请在终端执行 ncm-cli login' })
        }
      })
      .catch((error) => console.error('[login]', error))
      .finally(() => setLoginBusy(false))
  }

  const steps = ['环境自检', '开放平台凭证', '扫码登录', '完成']

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-ink-950 px-6 py-10">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-ncm/10 blur-[120px]" />

      <div className="relative w-full max-w-[720px]">
        <div className="mb-9 flex items-center gap-3.5">
          <div className="relative h-11 w-11 animate-spin-slow rounded-full bg-ink-800 vinyl-grooves ring-1 ring-white/10">
            <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-ncm-light to-ncm-deep" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950" />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-[0.18em] text-cloud-100">黑胶</p>
            <p className="mt-0.5 text-[10.5px] tracking-wide text-cloud-500">
              网易云音乐桌面播放器 · 首次配置向导
            </p>
          </div>
        </div>

        <div className="mb-8 flex items-center justify-between">
          {steps.map((label, index) => {
            const active = index === step
            const done = index < step
            return (
              <div key={label} className="flex flex-1 items-center gap-2.5 last:flex-none">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] transition',
                    done && 'border-ncm/40 bg-ncm/15 text-ncm-light',
                    active && 'border-ncm bg-ncm text-white shadow-glow',
                    !done && !active && 'border-white/10 text-cloud-500',
                  )}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-[11.5px]',
                    active ? 'text-cloud-100' : done ? 'text-cloud-400' : 'text-cloud-500',
                  )}
                >
                  {label}
                </span>
                {index < steps.length - 1 && <span className="mx-2 h-px flex-1 bg-white/8" />}
              </div>
            )
          })}
        </div>

        <div className="glass rounded-3xl p-8">
          {step === 0 && (
            <div>
              <h1 className="text-[22px] font-semibold text-cloud-100">先确认运行环境</h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-cloud-500">
                播放器通过 ncm-cli 调用网易云音乐开放平台，声音由 mpv 输出。缺什么就装什么，装完点重新检测。
              </p>

              <div className="mt-6 space-y-2.5">
                {[
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
                ].map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3"
                  >
                    {row.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-cloud-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-cloud-100">{row.label}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-cloud-500">
                        {checking
                          ? '正在检测…'
                          : row.ok
                            ? `v${row.version ?? '—'} 可用`
                            : `未检测到，执行：${row.cmd}`}
                      </p>
                      {!checking && row.key === 'node' && env?.node.promptSupport === false && (
                        <p className="mt-0.5 text-[10.5px] leading-relaxed text-amber-400">
                          当前版本会让 ncm-cli 的交互式命令报 ERR_REQUIRE_ESM（@clack/prompts 是纯 ESM 包），请升级到 22.12+
                        </p>
                      )}
                    </div>
                    {!row.ok && (
                      <button
                        type="button"
                        onClick={() => copy(row.cmd, row.key)}
                        className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] text-cloud-400 transition hover:border-ncm/40 hover:text-cloud-100"
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
                  onClick={() => void refreshEnv()}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-[12px] text-cloud-300 transition hover:border-white/20 hover:text-cloud-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新检测
                </button>
                <button
                  type="button"
                  disabled={!envOk || checking}
                  onClick={() => void refreshSession()}
                  className="rounded-full bg-gradient-to-r from-ncm to-ncm-deep px-5 py-2 text-[12.5px] font-medium text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一步
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 className="text-[22px] font-semibold text-cloud-100">填入开放平台凭证</h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-cloud-500">
                在网易云音乐开放平台完成入驻后，应用详情里能看到 appId 与 privateKey。也可以用终端执行
                <code className="mx-1 rounded bg-white/8 px-1.5 py-0.5 text-[11px] text-cloud-300">ncm-cli configure</code>
                交互式写入。
              </p>

              <div className="mt-6 space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] tracking-wide text-cloud-500">appId</span>
                  <input
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    placeholder="例如 2025010112000001"
                    className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3.5 py-2.5 text-[13px] text-cloud-100 outline-none transition focus:border-ncm/60"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] tracking-wide text-cloud-500">privateKey</span>
                  <input
                    type="password"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="仅保存到本机 ncm-cli 配置"
                    className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3.5 py-2.5 text-[13px] text-cloud-100 outline-none transition focus:border-ncm/60"
                  />
                </label>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => void api.app.openExternal(PLATFORM_URL)}
                  className="flex items-center gap-1.5 text-[11.5px] text-cloud-400 transition hover:text-cloud-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  打开开放平台控制台
                </button>
                <button
                  type="button"
                  onClick={saveCredentials}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-ncm to-ncm-deep px-5 py-2 text-[12.5px] font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  保存并继续
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
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
                      onClick={startLogin}
                      disabled={loginBusy}
                      className="flex items-center gap-1.5 rounded-full bg-ncm px-3.5 py-1.5 text-[11.5px] text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      {loginBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
                      生成登录链接
                    </button>
                    {loginLink && (
                      <button
                        type="button"
                        onClick={() => void api.app.openExternal(loginLink)}
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
                  onClick={() => void refreshSession()}
                  className="rounded-full border border-white/10 px-4 py-2 text-[12px] text-cloud-300 transition hover:border-white/20 hover:text-cloud-100"
                >
                  我已扫码，刷新状态
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ncm/15 text-ncm-light">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="mt-4 text-[22px] font-semibold text-cloud-100">一切就绪</h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-cloud-500">
                已连接 {session?.nickname ?? '你的账号'}，播放后端 mpv 已就绪。开始听歌吧。
              </p>
              <button
                type="button"
                onClick={() => {
                  void api.app.setOnboarded(true)
                  onDone()
                }}
                className="mt-6 rounded-full bg-gradient-to-r from-ncm to-ncm-deep px-6 py-2.5 text-[12.5px] font-medium text-white shadow-glow transition hover:brightness-110"
              >
                进入播放器
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[10.5px] text-cloud-500">
          <Terminal className="h-3 w-3" />
          所有命令均在主进程以 ncm-cli 参数数组方式执行，凭证不会经过渲染层
        </p>
      </div>
    </div>
  )
}
