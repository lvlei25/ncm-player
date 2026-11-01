import type { AiMessage, AiReply, AiToolStep } from '../../src/shared/types'
import { getAiKey, loadConfig } from '../store'
import { localChat } from './local'
import { execTool, TOOLS } from './tools'

const SYSTEM_PROMPT = `你是「黑胶」播放器里的音乐助手，用户用自然语言点歌与控播。
规则：
1. 需要歌曲时优先调用工具，不要编造歌曲 ID 或链接。
2. 一次最多播一首，其余加入队列。
3. 回复使用简体中文，控制在 60 字以内，语气自然，不要罗列 JSON。
4. 若工具返回「请求总量超限」，原样告知用户并停止后续调用。`

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
    }
  }>
}

/** OpenAI 兼容的对话 + function calling 循环（最多 3 轮，避免模型反复调工具） */
async function remoteChat(messages: AiMessage[]): Promise<AiReply> {
  const config = loadConfig()
  const apiKey = getAiKey()
  const steps: AiToolStep[] = []
  const history: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  for (let round = 0; round < 3; round += 1) {
    const response = await fetch(`${config.aiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.aiModel,
        messages: history,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`模型请求失败 (${response.status}) ${text.slice(0, 120)}`)
    }

    const payload = (await response.json()) as ChatResponse
    const message = payload.choices?.[0]?.message
    const toolCalls = message?.tool_calls ?? []

    if (toolCalls.length === 0) {
      return { reply: (message?.content ?? '我没太听清，可以再说一次吗？').trim(), steps }
    }

    history.push({ role: 'assistant', content: message?.content ?? '', tool_calls: toolCalls })

    for (const call of toolCalls) {
      const parsed = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      const outcome = await execTool(call.function.name, parsed)
      steps.push({ tool: call.function.name, summary: outcome.summary, ok: outcome.ok })
      history.push({ role: 'tool', tool_call_id: call.id, content: outcome.content })
    }
  }

  return { reply: '已经帮你处理好了，需要我继续找几首同类型的吗？', steps }
}

export async function chat(messages: AiMessage[]): Promise<AiReply> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')

  if (!getAiKey()) return localChat(lastUser?.content ?? '')

  try {
    return await remoteChat(messages)
  } catch (error) {
    console.error('[ai] remote failed, fallback to local', error)
    const fallback = await localChat(lastUser?.content ?? '')
    return { ...fallback, reply: `${fallback.reply}\n（模型调用失败，已使用本地理解）` }
  }
}
