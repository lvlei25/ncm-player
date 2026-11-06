/**
 * 能力 → ncm-cli 命令模板的声明式映射。
 * 命令树由服务端动态下发（本地仅内置核心播控命令），因此每个能力可挂多条候选模板，
 * 运行期按 discovery 的结果挑第一条真实存在的命令；也支持用户通过 overrides 覆盖。
 */
export type CapabilityId =
  | 'searchSong'
  | 'searchArtist'
  | 'searchAlbum'
  | 'searchPlaylist'
  | 'getLyric'
  | 'playlistDetail'
  | 'playlistTracks'
  | 'dailyRecommend'
  | 'recommendPlaylists'
  | 'userPlaylists'
  | 'redHeart'
  | 'addToQueue'

export interface CommandSpec {
  /** 子命令路径 + 参数模板，占位符形如 {keyword} */
  argv: string[]
  /** 非播控命令需按官方 skill 规则附加 --userInput */
  requiresUserInput?: boolean
}

export const CAPABILITY_COMMANDS: Record<CapabilityId, CommandSpec[]> = {
  searchSong: [
    { argv: ['search', 'song', '--keyword', '{keyword}'], requiresUserInput: true },
    { argv: ['search', 'all', '--keyword', '{keyword}'], requiresUserInput: true },
    { argv: ['search', '--keyword', '{keyword}'], requiresUserInput: true },
  ],
  searchArtist: [
    { argv: ['search', 'artist', '--keyword', '{keyword}'], requiresUserInput: true },
    { argv: ['search', 'all', '--keyword', '{keyword}'], requiresUserInput: true },
  ],
  searchAlbum: [
    { argv: ['search', 'album', '--keyword', '{keyword}'], requiresUserInput: true },
    { argv: ['search', 'all', '--keyword', '{keyword}'], requiresUserInput: true },
  ],
  searchPlaylist: [
    { argv: ['search', 'playlist', '--keyword', '{keyword}'], requiresUserInput: true },
    { argv: ['search', 'all', '--keyword', '{keyword}'], requiresUserInput: true },
  ],
  getLyric: [
    { argv: ['song', 'lyric', '--songId', '{songId}'], requiresUserInput: true },
    { argv: ['lyric', '--songId', '{songId}'], requiresUserInput: true },
  ],
  playlistDetail: [
    { argv: ['playlist', 'get', '--playlistId', '{playlistId}'], requiresUserInput: true },
    { argv: ['playlist', 'detail', '--playlistId', '{playlistId}'], requiresUserInput: true },
    { argv: ['playlist', '--playlistId', '{playlistId}'], requiresUserInput: true },
  ],
  // `playlist get` 只返回歌单元数据，曲目列表由这条动态命令单独提供
  playlistTracks: [
    { argv: ['playlist', 'tracks', '--playlistId', '{playlistId}'], requiresUserInput: true },
  ],
  dailyRecommend: [
    { argv: ['recommend', 'daily'], requiresUserInput: true },
    { argv: ['daily'], requiresUserInput: true },
    { argv: ['recommend'], requiresUserInput: true },
  ],
  recommendPlaylists: [
    // 实测：recommend 只有 daily/fm/heartbeat，没有 playlist 子命令；雷达歌单才是个性化推荐
    { argv: ['playlist', 'radar'], requiresUserInput: true },
    { argv: ['playlist', 'collected'], requiresUserInput: true },
    { argv: ['recommend'], requiresUserInput: true },
  ],
  userPlaylists: [
    { argv: ['playlist', 'collected'], requiresUserInput: true },
    { argv: ['playlist', 'created'], requiresUserInput: true },
    { argv: ['user', 'playlists'], requiresUserInput: true },
  ],
  redHeart: [
    { argv: ['song', 'like'], requiresUserInput: true },
    { argv: ['like', '--encrypted-id', '{encryptedId}'], requiresUserInput: true },
  ],
  addToQueue: [
    { argv: ['queue', 'add'], requiresUserInput: false },
  ],
}

/** 能力的中文名，用于 UI 提示缺失能力 */
export const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  searchSong: '搜索歌曲',
  searchArtist: '搜索歌手',
  searchAlbum: '搜索专辑',
  searchPlaylist: '搜索歌单',
  getLyric: '获取歌词',
  playlistDetail: '歌单详情',
  playlistTracks: '歌单曲目',
  dailyRecommend: '每日推荐',
  recommendPlaylists: '推荐歌单',
  userPlaylists: '我的歌单',
  redHeart: '红心收藏',
  addToQueue: '加入队列',
}

/** 模板中的占位符替换 */
export function fillTemplate(argv: string[], params: Record<string, string | number | undefined>): string[] {
  return argv.map((token) =>
    token.replace(/\{(\w+)\}/g, (_m, key: string) => {
      const value = params[key]
      return value === undefined || value === null ? '' : String(value)
    }),
  )
}

/** 取出模板里所有占位符名字 */
export function templateParams(argv: string[]): string[] {
  const found: string[] = []
  for (const token of argv) {
    const matches = token.matchAll(/\{(\w+)\}/g)
    for (const m of matches) found.push(m[1])
  }
  return found
}
