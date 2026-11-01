import type { Playlist, Track } from '../../shared/types'

/** 浏览器预览模式的演示数据（真实运行时全部来自 ncm-cli） */

const cover = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`

const C = {
  vinyl: cover('photo-1511671782779-c97d3d27a1d4'),
  stage: cover('photo-1470225620780-dba8ba36b745'),
  neon: cover('photo-1493225457124-a3eb161ffa5f'),
  guitar: cover('photo-1506157786151-b8491531f063'),
  crowd: cover('photo-1459749411175-04bf5292ceea'),
  studio: cover('photo-1499415479124-43c32433a620'),
  piano: cover('photo-1471478331149-c72f17e33c73'),
  player: cover('photo-1518609878373-06d740f60d8b'),
  night: cover('photo-1445985543470-41fba5c3144a'),
  tape: cover('photo-1483412033650-1015ddeb83d1'),
}

type Seed = [string, string[], string, number, string, string]

const SEEDS: Seed[] = [
  ['江南', ['林俊杰'], '第二天堂', 260, C.vinyl, '1001'],
  ['富士山下', ['陈奕迅'], 'What’s Going On…?', 259, C.neon, '1002'],
  ['稻香', ['周杰伦'], '魔杰座', 223, C.guitar, '1003'],
  ['云烟成雨', ['房东的猫'], '春生', 244, C.night, '1004'],
  ['爱人错过', ['告五人'], '我肯定在几百年前就说过爱你', 292, C.stage, '1005'],
  ['温柔', ['五月天'], '天空之城', 268, C.crowd, '1006'],
  ['贝加尔湖畔', ['李健'], '依然', 245, C.piano, '1007'],
  ['夜航西飞', ['陈鸿宇'], '一如年少模样', 258, C.player, '1008'],
  ['Merry Christmas Mr. Lawrence', ['坂本龍一'], '1996', 285, C.studio, '1009'],
  ['光年之外', ['邓紫棋'], '光年之外', 235, C.tape, '1010'],
  ['山海', ['草东没有派对'], '丑奴儿', 267, C.crowd, '1011'],
  ['句号', ['邓紫棋'], '启示录', 258, C.neon, '1012'],
  ['漠河舞厅', ['柳爽'], '冬眠', 273, C.night, '1013'],
  ['出现又离开', ['梁博'], '梁博', 252, C.studio, '1014'],
  ['南方姑娘', ['赵雷'], '赵小雷', 278, C.guitar, '1015'],
  ['世界这么大还是遇见你', ['程响'], '世界这么大还是遇见你', 214, C.vinyl, '1016'],
  ['雨爱', ['杨丞琳'], 'Rainie & Love', 254, C.tape, '1017'],
  ['小情歌', ['苏打绿'], '小宇宙', 246, C.player, '1018'],
  ['蓝莲花', ['许巍'], '时光·漫步', 259, C.stage, '1019'],
  ['若把你', ['梁静茹'], '静茹&情歌', 241, C.piano, '1020'],
  ['月半小夜曲', ['李克勤'], '演奏厅', 262, C.vinyl, '1021'],
  ['白羊', ['徐秉龙', '沈以诚'], '白羊', 238, C.night, '1022'],
  ['水星记', ['郭顶'], '飞行器的执行周期', 296, C.studio, '1023'],
  ['我们的歌', ['王力宏'], '改变自己', 249, C.crowd, '1024'],
]

const hex = (n: number) => n.toString(16).toUpperCase().padStart(32, '3A7F')

export const MOCK_TRACKS: Track[] = SEEDS.map(([name, artists, album, dur, c, originalId], i) => ({
  id: `${hex(0x9000 + i)}`,
  originalId,
  name,
  artists,
  album,
  durationMs: dur * 1000,
  coverUrl: c,
  playable: i !== 10,
  reason: i === 10 ? '版权受限，暂不可播放' : undefined,
}))

export const MOCK_PLAYLISTS: Playlist[] = [
  { id: '8801', name: '深夜编码 · 专注电波', coverUrl: C.studio, trackCount: 32, creator: '夜航星', description: '没有歌词的夜里，只有键盘与低频。' },
  { id: '8802', name: '通勤路上的城市噪音', coverUrl: C.neon, trackCount: 46, creator: '夜航星' },
  { id: '8803', name: '华语民谣 · 旧木吉他', coverUrl: C.guitar, trackCount: 28, creator: '拾光' },
  { id: '8804', name: '冬日暖炉与黑胶', coverUrl: C.vinyl, trackCount: 19, creator: '唱片店老板' },
  { id: '8805', name: '复古 Disco 舞池', coverUrl: C.stage, trackCount: 54, creator: '周六夜现场' },
  { id: '8806', name: '城市夜景 · 霓虹呼吸', coverUrl: C.night, trackCount: 37, creator: '夜航星' },
  { id: '8807', name: '钢琴与雨声', coverUrl: C.piano, trackCount: 25, creator: '雨录' },
  { id: '8808', name: '现场感 · 万人合唱', coverUrl: C.crowd, trackCount: 41, creator: 'Livehouse' },
]

export const SAMPLE_LRC = `[00:00.00]江南
[00:03.20]林俊杰
[00:12.40]风到这里就是黏
[00:17.10]黏住过客的思念
[00:22.80]雨到了这里缠成线
[00:28.30]缠着我们流连人世间
[00:34.50]你在身边就是缘
[00:39.80]缘分写在三生石上面
[01:02.10]爱有万分之一甜
[01:07.40]宁愿我就葬在这一点
[01:15.60]圈圈圆圆圈圈
[01:18.20]天天年年天天的我
[01:21.90]深深看你的脸
[01:26.30]生气的温柔 埋怨的温柔的脸
[01:34.80]不懂爱恨情愁煎熬的我们
[01:40.10]都以为相爱就像风云的善变
[01:46.50]相信爱一天 抵过永远
[01:52.20]在这一刹那冻结了时间`
