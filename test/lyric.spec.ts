import { describe, expect, it } from 'vitest'
import { extractLyricPayload, mergeTranslation, parseLrc } from '../electron/ncm/lyric'
import { activeIndex } from '../src/shared/lyric'
import { lrcText, translationLrc } from './fixtures'

describe('parseLrc', () => {
  it('解析时间戳并按时间升序排列', () => {
    const lines = parseLrc(lrcText)
    expect(lines.map((l) => l.text)).toEqual([
      '江南',
      '林俊杰',
      '风到这里就是黏',
      '爱有万分之一甜',
      '重复时间戳的行',
    ])
    expect(lines[0].timeMs).toBe(0)
    expect(lines[2].timeMs).toBe(12_400)
    expect(lines[3].timeMs).toBe(62_100)
  })

  it('忽略无时间戳的空行与纯文本', () => {
    const lines = parseLrc('纯文本\n\n[00:01.00]有歌词')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('有歌词')
  })

  it('空输入返回空数组', () => {
    expect(parseLrc('')).toEqual([])
  })
})

describe('mergeTranslation', () => {
  it('按时间戳对齐翻译歌词', () => {
    const main = parseLrc(lrcText)
    const trans = parseLrc(translationLrc)
    const merged = mergeTranslation(main, trans)

    const wind = merged.find((l) => l.text === '风到这里就是黏')
    expect(wind?.translation).toBe('The wind is sticky here')
    expect(merged[0].translation).toBeUndefined()
  })

  it('无翻译时原样返回', () => {
    const main = parseLrc(lrcText)
    expect(mergeTranslation(main, [])).toEqual(main)
  })
})

describe('extractLyricPayload', () => {
  it('从嵌套 JSON 里取出 LRC 文本', () => {
    const payload = extractLyricPayload({ data: { lrc: { lyric: '[00:01.00]第一句' } } }, 'song-1')
    expect(payload.songId).toBe('song-1')
    expect(payload.lines).toHaveLength(1)
    expect(payload.lines[0].text).toBe('第一句')
  })

  it('把 \\n 转义还原成换行', () => {
    const payload = extractLyricPayload({ data: { lyric: '[00:01.00]a\\n[00:02.00]b' } }, 'song-2')
    expect(payload.lines).toHaveLength(2)
  })

  it('没有歌词时保留原文而不是抛错', () => {
    const payload = extractLyricPayload({ data: { lyric: '纯歌词没有时间轴' } }, 'song-3')
    expect(payload.lines).toHaveLength(0)
    expect(payload.plain).toBe('纯歌词没有时间轴')
  })
})

describe('activeIndex（共享实现）', () => {
  const lines = parseLrc(lrcText)

  it('播放位置早于第一句时返回 -1', () => {
    expect(activeIndex(parseLrc('[00:10.00]later'), 5)).toBe(-1)
  })

  it('返回最后一个 timeMs <= position 的行', () => {
    expect(activeIndex(lines, 0)).toBe(0)
    expect(activeIndex(lines, 12.5)).toBe(2)
    expect(activeIndex(lines, 200)).toBe(4)
  })

  it('空歌词返回 -1', () => {
    expect(activeIndex([], 10)).toBe(-1)
  })
})
