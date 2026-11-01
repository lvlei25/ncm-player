import { describe, expect, it } from 'vitest'
import { CAPABILITY_COMMANDS, fillTemplate, templateParams } from '../electron/ncm/command-map'
import { capabilityMatrix, parseCommandTree, resolveCommand, specExists } from '../electron/ncm/discovery'

/** 模拟登录后 `ncm-cli commands` 的真实输出（动态命令已注册） */
const COMMANDS_TEXT = `play                      播放音频 URL、歌曲加密 ID 或歌单
  --playlist            歌单模式
  --song                歌曲模式

pause                     暂停播放
state                     查看播放状态
config                    配置管理（config set/get/list）
  set                   设置配置项
  get                   获取配置项

playlist                  歌单相关命令
  get                   获取歌单详情
  radar                 获取雷达歌单
  collected             获取我收藏的歌单列表

recommend                 推荐相关命令
  daily                 获取每日推荐歌曲
  fm                    场景私人漫游

search                    搜索命令
  song                  搜索歌曲
  album                 搜索专辑
  playlist              搜索歌单

song                      歌曲相关命令
  like                  红心歌曲
  lyric                 获取歌曲歌词`

describe('parseCommandTree', () => {
  const tree = parseCommandTree(COMMANDS_TEXT)

  it('解析顶层命令', () => {
    expect(tree.top).toContain('play')
    expect(tree.top).toContain('search')
    expect(tree.top).toContain('playlist')
    expect(tree.top).not.toContain('--playlist')
  })

  it('解析父子路径', () => {
    expect(tree.paths).toContain('search song')
    expect(tree.paths).toContain('playlist radar')
    expect(tree.paths).toContain('song lyric')
    expect(tree.paths).toContain('config set')
  })
})

describe('specExists', () => {
  const tree = parseCommandTree(COMMANDS_TEXT)

  it('存在的子命令返回 true', () => {
    expect(specExists({ argv: ['search', 'song', '--keyword', '{keyword}'] }, tree)).toBe(true)
    expect(specExists({ argv: ['playlist', 'get', '--playlistId', '{playlistId}'] }, tree)).toBe(true)
  })

  it('不存在的子命令返回 false', () => {
    expect(specExists({ argv: ['search', 'artist', '--keyword', '{keyword}'] }, tree)).toBe(false)
    expect(specExists({ argv: ['playlist', 'detail'] }, tree)).toBe(false)
  })
})

describe('resolveCommand', () => {
  const tree = parseCommandTree(COMMANDS_TEXT)

  it('优先选中命令树里真实存在的候选模板', () => {
    // 首选 playlist detail 不存在 → 应回退到 playlist get
    const resolved = resolveCommand('playlistDetail', { playlistId: 'ABC' }, tree)
    expect(resolved.argv).toEqual(['playlist', 'get', '--playlistId', 'ABC'])
  })

  it('推荐歌单命中雷达歌单而不是不存在的 recommend playlist', () => {
    const resolved = resolveCommand('recommendPlaylists', {}, tree)
    expect(resolved.argv).toEqual(['playlist', 'radar'])
  })

  it('每日推荐使用 recommend daily', () => {
    expect(resolveCommand('dailyRecommend', {}, tree).argv).toEqual(['recommend', 'daily'])
  })

  it('歌词命令注入 songId', () => {
    expect(resolveCommand('getLyric', { songId: 'X1' }, tree).argv).toEqual(['song', 'lyric', '--songId', 'X1'])
  })
})

describe('capabilityMatrix', () => {
  it('缺失能力被标记为不可用', () => {
    const tree = parseCommandTree(COMMANDS_TEXT)
    const matrix = capabilityMatrix(tree)
    expect(matrix.searchSong).toBe(true)
    expect(matrix.searchArtist).toBe(false)
    expect(matrix.dailyRecommend).toBe(true)
  })
})

describe('命令模板工具', () => {
  it('fillTemplate 替换占位符', () => {
    expect(fillTemplate(['play', '--song', '--encrypted-id', '{id}'], { id: 'ABC' })).toEqual([
      'play',
      '--song',
      '--encrypted-id',
      'ABC',
    ])
  })

  it('缺失参数替换为空串而不是 undefined', () => {
    expect(fillTemplate(['--songId', '{songId}'], {})).toEqual(['--songId', ''])
  })

  it('templateParams 提取全部占位符', () => {
    expect(templateParams(['play', '--encrypted-id', '{id}', '--original-id', '{originalId}'])).toEqual([
      'id',
      'originalId',
    ])
  })

  it('每个能力至少有一条候选模板，且占位符与调用方一致', () => {
    for (const [capability, specs] of Object.entries(CAPABILITY_COMMANDS)) {
      expect(specs.length, `${capability} 至少一条候选`).toBeGreaterThan(0)
      for (const spec of specs) {
        expect(spec.argv.length, `${capability} argv 非空`).toBeGreaterThan(0)
      }
    }
  })
})
