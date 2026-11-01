import { getDailyRecommend, search } from '../ncm/catalog'
import { player } from '../ncm/player'
import { runCli } from '../ncm/runner'

/** 暴露给模型的工具定义与本地执行器（不依赖远端 LLM，可被本地兜底复用） */

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const TOOLS: ToolDef[] = [
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

export interface ToolOutcome {
  ok: boolean
  summary: string
  content: string
}

export async function execTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
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
    const playlistName = typeof args.name === 'string' ? args.name : '我的歌单'
    const result = await search('song', keyword)
    await runCli(['playlist', 'create', '--playlistName', playlistName, '--userInput', `创建歌单 ${playlistName}`])
    return { ok: true, summary: `已创建歌单「${playlistName}」`, content: `候选歌曲 ${result.tracks.length} 首` }
  }

  return { ok: false, summary: `未知工具 ${name}`, content: 'unknown tool' }
}
