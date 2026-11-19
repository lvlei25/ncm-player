/**
 * Tauri 侧 AI 逻辑：提示词与工具定义对齐 Electron 版 `electron/ai/*`，
 * 工具执行通过注入的 executor 走 Tauri 桥接，不在渲染层直接碰主进程模块。
 */
import type { AiConfig, AiMessage, AiReply, AiToolStep } from '../shared/types'

export interface ToolOutcome {
  ok: boolean
  summary: string
  content: string
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>

export const AI_SYSTEM_PROMPT = `你是「黑胶」播放器里的音乐助手，用户用自然语言点歌与控播。
规则：
1. 需要歌曲时优先调用工具，不要编造歌曲 ID 或链接。
2. 一次最多播一首，其余加入队列。
3. 回复使用简体中文，控制在 60 字以内，语气自然，不要罗列 JSON。
4. 若工具返回「请求总量超限」，原样告知用户并停止后续调用。`

interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const AI_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'play_by_keyword',
      description: '按关键词（歌名/歌手/心情描述）搜索并立即播放第一首匹配歌曲，同时把后续匹配歌曲加入队列',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '加入队列的数量，1-10，默认 5' },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_songs',
      description: '只搜索歌曲并返回列表，不播放',
      parameters: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] },
    },
  },
  { type: 'function', function: { name: 'pause', description: '暂停播放', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'resume', description: '继续播放', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'next_track', description: '播放下一首', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'previous_track', description: '播放上一首', parameters: { type: 'object', properties: {} } } },
  {
    type: 'function',
    function: {
      name: 'set_volume',
      description: '设置音量百分比 0-100',
      parameters: { type: 'object', properties: { level: { type: 'number' } }, required: ['level'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'daily_recommend',
      description: '获取「每日推荐」歌曲并开始播放',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_playlist',
      description: '用给定关键词搜索歌曲并创建一个新歌单',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '歌单名称' },
          keyword: { type: 'string', description: '用于挑选歌曲的关键词' },
        },
        required: ['name', 'keyword'],
      },
    },
  },
]

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
    }
  }>
}

/** 未配置模型 Key 时的本地意图解析（与 Electron 版 local.ts 同规则） */
export async function tauriLocalChat(text: string, execTool: ToolExecutor): Promise<AiReply> {
  const steps: AiToolStep[] = []
  const t = text.trim()

  const volumeMatch = t.match(/音量[^\d]{0,6}(\d{1,3})|(\d{1,3})\s*%/)
  if (/音量|声音/.test(t) && volumeMatch) {
    const level = Number(volumeMatch[1] ?? volumeMatch[2])
    const outcome = await execTool('set_volume', { level })
    steps.push({ tool: 'set_volume', summary: outcome.summary, ok: outcome.ok })
    return { reply: `音量已调到 ${level}%。`, steps, local: true }
  }

  if (/暂停|安静一下/.test(t)) {
    const outcome = await execTool('pause', {})
    steps.push({ tool: 'pause', summary: outcome.summary, ok: outcome.ok })
    return { reply: '已暂停，随时叫我继续。', steps, local: true }
  }

  if (/继续播放|接着放|恢复/.test(t)) {
    const outcome = await execTool('resume', {})
    steps.push({ tool: 'resume', summary: outcome.summary, ok: outcome.ok })
    return { reply: '继续播放中。', steps, local: true }
  }

  if (/下一首|切歌/.test(t)) {
    const outcome = await execTool('next_track', {})
    steps.push({ tool: 'next_track', summary: outcome.summary, ok: outcome.ok })
    return { reply: '换到下一首了。', steps, local: true }
  }

  if (/上一首/.test(t)) {
    const outcome = await execTool('previous_track', {})
    steps.push({ tool: 'previous_track', summary: outcome.summary, ok: outcome.ok })
    return { reply: '回到上一首。', steps, local: true }
  }

  if (/每日推荐|今天听什么/.test(t)) {
    const outcome = await execTool('daily_recommend', {})
    steps.push({ tool: 'daily_recommend', summary: outcome.summary, ok: outcome.ok })
    return {
      reply: outcome.ok ? '每日推荐已经开播。' : '每日推荐暂时取不到，检查一下登录状态？',
      steps,
      local: true,
    }
  }

  const keyword = t
    .replace(/^(帮我|给我|我想|想|请|麻烦)?\s*(播放|来点|搜一下|搜索|放点|放|听|搜|找)\s*(一下)?\s*/u, '')
    .replace(/[，。！？~…]+$/u, '')
    .trim()
  if (keyword) {
    const outcome = await execTool('play_by_keyword', { keyword, limit: 5 })
    steps.push({ tool: 'play_by_keyword', summary: outcome.summary, ok: outcome.ok })
    return {
      reply: outcome.ok ? `为你播放「${keyword}」相关的歌，其余已排队。` : `没找到「${keyword}」，换个说法试试？`,
      steps,
      local: true,
    }
  }

  return {
    reply: '可以说「放点林俊杰」「音量 40」「下一首」，配置模型 Key 后能听懂更复杂的话。',
    steps,
    local: true,
  }
}

/** OpenAI 兼容的对话 + function calling 循环（最多 3 轮） */
async function remoteChat(
  messages: AiMessage[],
  config: AiConfig,
  execTool: ToolExecutor,
): Promise<AiReply> {
  const steps: AiToolStep[] = []
  const history: Array<Record<string, unknown>> = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ]

  for (let round = 0; round < 3; round += 1) {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: history,
        tools: AI_TOOLS,
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
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      const outcome = await execTool(call.function.name, args)
      steps.push({ tool: call.function.name, summary: outcome.summary, ok: outcome.ok })
      history.push({ role: 'tool', tool_call_id: call.id, content: outcome.content })
    }
  }

  return { reply: '已经帮你处理好了，需要我继续找几首同类型的吗？', steps }
}

export async function tauriChat(
  messages: AiMessage[],
  config: AiConfig,
  execTool: ToolExecutor,
): Promise<AiReply> {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  if (!config.apiKey) return tauriLocalChat(lastUser?.content ?? '', execTool)

  try {
    return await remoteChat(messages, config, execTool)
  } catch {
    const fallback = await tauriLocalChat(lastUser?.content ?? '', execTool)
    return { ...fallback, reply: `${fallback.reply}\n（模型调用失败，已使用本地理解）` }
  }
}
