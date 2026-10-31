import type { LyricLine, LyricPayload } from '../../src/shared/types'
import { deepString } from './normalize'

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** 解析 LRC 文本，支持一行多时间戳；返回按时间升序的行 */
export function parseLrc(text: string): LyricLine[] {
  if (!text) return []
  const lines: LyricLine[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const stamps: number[] = []
    let match: RegExpExecArray | null
    TIME_TAG.lastIndex = 0
    while ((match = TIME_TAG.exec(line)) !== null) {
      const min = Number(match[1])
      const sec = Number(match[2])
      const fracRaw = match[3] ?? '0'
      const frac = Number(fracRaw.padEnd(3, '0').slice(0, 3))
      stamps.push(min * 60_000 + sec * 1000 + frac)
    }
    if (stamps.length === 0) continue
    const content = line.replace(TIME_TAG, '').trim()
    if (!content) continue
    for (const ms of stamps) lines.push({ timeMs: ms, text: content })
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

/** 合并翻译歌词：按时间戳（±80ms）对齐 */
export function mergeTranslation(main: LyricLine[], translation: LyricLine[]): LyricLine[] {
  if (translation.length === 0) return main
  const map = new Map<number, string>()
  for (const line of translation) {
    const bucket = Math.round(line.timeMs / 100) * 100
    map.set(bucket, line.text)
  }
  return main.map((line) => {
    const bucket = Math.round(line.timeMs / 100) * 100
    const hit = map.get(bucket) ?? map.get(bucket - 100) ?? map.get(bucket + 100)
    return hit ? { ...line, translation: hit } : line
  })
}

/** 从 ncm-cli 的 JSON 返回里找出 LRC 文本（结构不固定，做深度探测） */
export function extractLyricPayload(json: Record<string, unknown> | null, songId: string): LyricPayload {
  const plain =
    deepString(json, ['lyric', 'lrc', 'lrcText', 'lyricText']) ??
    deepString(json, ['text']) ??
    ''

  // 翻译歌词：字段名常见为 tlyric / translation
  const translationText =
    deepString(json, ['tlyric', 'translation', 'tLyric', 'translatedLyric']) ?? ''

  const main = parseLrc(cleanEscapes(plain))
  const trans = parseLrc(cleanEscapes(translationText))
  const lines = mergeTranslation(main, trans)

  return { songId, lines, plain: lines.length > 0 ? undefined : cleanEscapes(plain) }
}

/** CLI 返回的文本可能带有 \n 转义 */
function cleanEscapes(text: string): string {
  if (!text) return ''
  return text.includes('\\n') && !text.includes('\n') ? text.replace(/\\n/g, '\n') : text
}

/** 二分查找当前行下标 */
export function activeLineIndex(lines: LyricLine[], positionSec: number): number {
  if (lines.length === 0) return -1
  const ms = positionSec * 1000
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].timeMs <= ms) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
