import type { AiReply, AiToolStep } from '../../src/shared/types'
import { execTool } from './tools'

/**
 * 未配置模型 Key 时的本地意图解析：
 * 用固定规则覆盖最高频的几种说法，保证开箱可用。
 */
export async function localChat(text: string): Promise<AiReply> {
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
