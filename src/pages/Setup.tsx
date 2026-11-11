import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Terminal } from 'lucide-react'
import { StepCredential, PLATFORM_URL } from '../components/setup/StepCredential'
import { StepDone } from '../components/setup/StepDone'
import { StepEnv } from '../components/setup/StepEnv'
import { StepLogin } from '../components/setup/StepLogin'
import { Stepper } from '../components/setup/Stepper'
import type { EnvReport, SessionStatus } from '../shared/types'
import { api, failureText } from '../lib/api'
import { useAppStore } from '../lib/store'

interface SetupProps {
  env: EnvReport | null
  session: SessionStatus | null
  onDone: () => void
}

/** 向导只负责「状态 + 编排」，四步 UI 在 components/setup 下 */
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

  const [params] = useSearchParams()
  const autoStep = !envOk ? 0 : !configured ? 1 : !session?.loggedIn ? 2 : 3
  const forced = params.get('step')
  const step = forced === null ? autoStep : Math.min(Math.max(Number(forced) || 0, 0), 3)

  // 登录轮询：必须绕过 60s 会话缓存，否则永远检测不到「刚扫码成功」
  useEffect(() => {
    if (step !== 2) return
    const timer = setInterval(() => {
      api.session.status(true).then((res) => {
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
        return Promise.all([refreshSession(), refreshEnv(true)])
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

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-ink-950 px-6 py-10">

      <div className="relative w-full max-w-[720px]">
        <div className="mb-9 flex items-center gap-3.5">
          <div className="relative h-11 w-11 animate-spin-slow rounded-full bg-ink-800 vinyl-grooves ring-1 ring-white/10">
            <div className="absolute inset-[30%] rounded-full bg-ncm" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950" />
          </div>
          <div>
            <p className="text-[16px] font-medium text-cloud-100">黑胶</p>
            <p className="mt-0.5 text-[11px] text-cloud-500">
              网易云音乐桌面播放器 · 首次配置向导
            </p>
          </div>
        </div>

        <Stepper step={step} />

        <div className="glass rounded-3xl p-8">
          {step === 0 && (
            <StepEnv
              env={env}
              checking={checking}
              envOk={envOk}
              copied={copied}
              onCopy={copy}
              onRefresh={() => void refreshEnv(true)}
              onNext={() => void refreshSession()}
            />
          )}

          {step === 1 && (
            <StepCredential
              appId={appId}
              privateKey={privateKey}
              saving={saving}
              onAppId={setAppId}
              onPrivateKey={setPrivateKey}
              onSave={saveCredentials}
              onOpenPlatform={() => void api.app.openExternal(PLATFORM_URL)}
            />
          )}

          {step === 2 && (
            <StepLogin
              loginLink={loginLink}
              loginBusy={loginBusy}
              onStart={startLogin}
              onRefresh={() => void refreshSession(true)}
              onOpenLink={(link) => void api.app.openExternal(link)}
            />
          )}

          {step === 3 && (
            <StepDone
              nickname={session?.nickname}
              onDone={() => {
                void api.app.setOnboarded(true)
                onDone()
              }}
            />
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-cloud-500">
          <Terminal className="h-3 w-3" />
          所有命令均在主进程以 ncm-cli 参数数组方式执行，凭证不会经过渲染层
        </p>
      </div>
    </div>
  )
}
