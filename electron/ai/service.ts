import type { AiMessage, AiReply, AiToolStep } from '../../src/shared/types'
import { getAiKey, loadConfig } from '../store'
import { getDailyRecommend, search } from '../ncm/catalog'
import { player } from '../ncm/player'
import { runCli } from '../ncm/runner'

interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const SYSTEM_PROMPT = `你是「黑胶」播放器里的音乐助手，用户用自然语言点歌与控播。
规则：
1. 需要歌曲时优先调用工具，不要编造歌曲 ID 或链接。
2. 一次最多播一首，其余加入队列。
3. 回复使用简体中文，控制在 60 字以内，语气自然，不要罗列 JSON。
4. 若工具返回「请求总量超限」，原样告知用户并停止后续调用。`

const TOOLS: ToolDef[] = [
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
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' } },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause',
      description: '暂停播放',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume',
      description: '继续播放',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'next_track',
      description: '播放下一首',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'previous_track',
      description: '播放上一首',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_volume',
      description: '设置音量百分比 0-100',
      parameters: {
        type: 'object',
        properties: { level: { type: 'number' } },
        required: ['level'],
      },
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

interface ToolOutcome {
  ok: boolean
  summary: string
  content: string
}

async function execTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const keyword = typeof args.keyword === 'string' ? args.keyword : ''

  if (name === 'play_by_keyword') {
    const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 10)
    const result = await search('song', keyword)
    const playable = result.tracks.filter((t) => t.playable)
    if (playable.length === 0) return { ok: false, summary: `搜索「${keyword}」失败`, content: '没有找到可播放的歌曲' }
    player.setQueue(playable.slice(0, limit), 0, true)
    return {
      ok: true,
      summary: `播放「${playable[0].name}」，队列 ${Math.min(playable.length, limit)} 首`,
      content: playable
        .slice(0, limit)
        .map((t, i) => `${i + 1}. ${t.name} - ${t.artists.join('/')}`)
        .join('\n'),
    }
  }

  if (name === 'search_songs') {
    const result = await search('song', keyword)
    return {
      ok: true,
      summary: `搜索「${keyword}」得到 ${result.tracks.length} 首`,
      content: result.tracks
        .slice(0, 8)
        .map((t, i) => `${i + 1}. ${t.name} - ${t.artists.join('/')}`)
        .join('\n'),
    }
  }

  if (name === 'pause') {
    if (player.snapshot().status === 'playing') await player.toggle()
    return { ok: true, summary: '已暂停', content: 'paused' }
  }

  if (name === 'resume') {
    if (player.snapshot().status === 'paused') await player.toggle()
    return { ok: true, summary: '已继续播放', content: 'resumed' }
  }

  if (name === 'next_track') {
    await player.step(1)
    return { ok: true, summary: '已切到下一首', content: 'next' }
  }

  if (name === 'previous_track') {
    await player.step(-1)
    return { ok: true, summary: '已切到上一首', content: 'prev' }
  }

  if (name === 'set_volume') {
    const level = Number(args.level ?? 60)
    player.setVolume(level)
    return { ok: true, summary: `音量设为 ${Math.round(level)}%`, content: `volume=${level}` }
  }

  if (name === 'daily_recommend') {
    const tracks = await getDailyRecommend()
    if (tracks.length === 0) return { ok: false, summary: '每日推荐为空', content: '空' }
    player.setQueue(tracks.slice(0, 10), 0, true)
    return { ok: true, summary: `播放每日推荐第一首「${tracks[0].name}」`, content: tracks[0].name }
  }

  if (name === 'create_playlist') {
    const name2 = typeof args.name === 'string' ? args.name : '我的歌单'
    const result = await search('song', keyword)
    await runCli(['playlist', 'create', '--playlistName', name2, '--userInput', `创建歌单 ${name2}`])
    return {
      ok: true,
      summary: `已创建歌单「${name2}」`,
      content: `候选歌曲 ${result.tracks.length} 首`,
    }
  }

  return { ok: false, summary: `未知工具 ${name}`, content: 'unknown tool' }
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
    }
  }>
}

/** OpenAI 兼容的对话 + function calling 循环 */
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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

/** 未配置模型 Key 时的本地意图解析，保证开箱可用 */
async function localChat(text: string): Promise<AiReply> {
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
    return { reply: outcome.ok ? '每日推荐已经开播。' : '每日推荐暂时取不到，检查一下登录状态？', steps, local: true }
  }

  const keyword = t
    .replace(/^(帮我|给我|我想|想|请|麻烦)?\s*(播放|放|来点|听|搜索|搜一下|搜|找)\s*(一下)?\s*/u, '')
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

export async function chat(messages: AiMessage[]): Promise<AiReply> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const apiKey = getAiKey()

  if (!apiKey) return localChat(lastUser?.content ?? '')

  try {
    return await remoteChat(messages)
  } catch (error) {
    console.error('[ai] remote failed, fallback to local', error)
    const fallback = await localChat(lastUser?.content ?? '')
    return { ...fallback, reply: `${fallback.reply}\n（模型调用失败，已使用本地理解）` }
  }
}
