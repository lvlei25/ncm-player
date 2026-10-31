import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CornerDownLeft, Settings2, Sparkles, XCircle } from 'lucide-react'
import type { AiMessage, AiToolStep } from '../shared/types'
import { api, failureText } from '../lib/api'
import { cn } from '../lib/format'
import { useAppStore } from '../lib/store'

interface Bubble {
  id: number
  role: 'user' | 'assistant'
  text: string
  steps?: AiToolStep[]
  local?: boolean
}

const SUGGESTIONS = ['放点适合写代码的歌', '来点林俊杰', '音量调到 40', '今天听什么']

let seq = 0

export function AiPanel({ compact = false }: { compact?: boolean }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([
    {
      id: ++seq,
      role: 'assistant',
      text: '我是你的音乐助手。可以说「放点适合深夜的歌」，也可以让我管队列、调音量。',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const notify = useAppStore((s) => s.notify)

  useEffect(() => {
    api.ai
      .configGet()
      .then((res) => {
        if (!res.ok) return
        setHasKey(res.data.hasKey)
        setModel(res.data.model)
        setBaseUrl(res.data.baseUrl)
      })
      .catch((error) => console.error('[ai:config]', error))
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, busy])

  const send = (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    const history: AiMessage[] = [
      ...bubbles.filter((b) => b.text).map((b) => ({ role: b.role, content: b.text })),
      { role: 'user', content },
    ]
    setBubbles((prev) => [...prev, { id: ++seq, role: 'user', text: content }])
    setInput('')
    setBusy(true)

    api.ai
      .chat(history)
      .then((res) => {
        if (!res.ok) {
          const message = failureText(res) ?? res.message
          notify({ kind: 'error', text: message })
          setBubbles((prev) => [...prev, { id: ++seq, role: 'assistant', text: `出了点问题：${message}` }])
          return
        }
        setBubbles((prev) => [
          ...prev,
          { id: ++seq, role: 'assistant', text: res.data.reply, steps: res.data.steps, local: res.data.local },
        ])
      })
      .catch((error) => {
        console.error('[ai]', error)
        notify({ kind: 'error', text: 'AI 请求失败' })
      })
      .finally(() => setBusy(false))
  }

  const saveConfig = () => {
    api.ai
      .configSet({ baseUrl: baseUrl.trim() || undefined, model: model.trim() || undefined, apiKey })
      .then((res) => {
        if (!res.ok) {
          notify({ kind: 'error', text: failureText(res) ?? '保存失败' })
          return
        }
        setHasKey(Boolean(apiKey) || hasKey)
        setShowConfig(false)
        setApiKey('')
        notify({ kind: 'success', text: '模型配置已保存' })
      })
      .catch((error) => console.error('[ai:config]', error))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-ncm-light" />
          <span className="text-[11px] uppercase tracking-[0.22em] text-cloud-500">AI 点歌</span>
          {hasKey ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400">模型已接入</span>
          ) : (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-cloud-500">本地理解</span>
          )}
        </div>
        <button
          type="button"
          aria-label="模型设置"
          onClick={() => setShowConfig((v) => !v)}
          className="text-cloud-500 transition hover:text-cloud-100"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {showConfig && (
        <div className="mx-4 mb-2 space-y-2 rounded-xl border border-white/8 bg-white/[0.03] p-3">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com/v1"
            className="w-full rounded-lg border border-white/8 bg-ink-900 px-2.5 py-1.5 text-[11px] text-cloud-100 outline-none focus:border-ncm/60"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-chat"
            className="w-full rounded-lg border border-white/8 bg-ink-900 px-2.5 py-1.5 text-[11px] text-cloud-100 outline-none focus:border-ncm/60"
          />
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-... （仅保存在本机）"
            className="w-full rounded-lg border border-white/8 bg-ink-900 px-2.5 py-1.5 text-[11px] text-cloud-100 outline-none focus:border-ncm/60"
          />
          <button
            type="button"
            onClick={saveConfig}
            className="w-full rounded-lg bg-ncm/90 py-1.5 text-[11px] font-medium text-white transition hover:bg-ncm"
          >
            保存配置
          </button>
        </div>
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
        {bubbles.map((bubble) => (
          <div key={bubble.id} className={cn('flex', bubble.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                bubble.role === 'user'
                  ? 'bg-ncm/90 text-white'
                  : 'border border-white/6 bg-white/[0.04] text-cloud-300',
                compact && 'text-[12px]',
              )}
            >
              <p className="whitespace-pre-wrap">{bubble.text}</p>
              {bubble.steps && bubble.steps.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-white/8 pt-2">
                  {bubble.steps.map((step, i) => (
                    <li key={`${step.tool}-${i}`} className="flex items-start gap-1.5 text-[10.5px] text-cloud-500">
                      {step.ok ? (
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-ncm" />
                      )}
                      <span>{step.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 pl-1 text-[11px] text-cloud-500">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-ncm/70"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
            正在挑选合适的歌…
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-1">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-white/8 px-2.5 py-1 text-[10.5px] text-cloud-400 transition hover:border-ncm/40 hover:text-cloud-100"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2 focus-within:border-ncm/50">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(input)
            }}
            placeholder="想听什么？告诉我"
            className="flex-1 bg-transparent text-[12.5px] text-cloud-100 outline-none placeholder:text-cloud-500"
          />
          <button
            type="button"
            aria-label="发送"
            onClick={() => send(input)}
            disabled={busy}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-ncm/90 text-white transition hover:bg-ncm disabled:opacity-40"
          >
            <CornerDownLeft className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
