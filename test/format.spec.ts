import { describe, expect, it } from 'vitest'
import { artistsText, cn, formatCount, formatDuration, formatSeconds } from '../src/lib/format'

describe('formatDuration', () => {
  it('毫秒转 m:ss', () => {
    expect(formatDuration(289_093)).toBe('4:49')
    expect(formatDuration(0)).toBe('--:--')
    expect(formatDuration(-1)).toBe('--:--')
    expect(formatDuration(59_000)).toBe('0:59')
  })

  it('NaN 不抛错', () => {
    expect(formatDuration(Number.NaN)).toBe('--:--')
  })
})

describe('formatSeconds', () => {
  it('秒转 m:ss', () => {
    expect(formatSeconds(46.7)).toBe('0:47')
    expect(formatSeconds(0)).toBe('--:--')
  })
})

describe('formatCount', () => {
  it('万 / 亿 缩写', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(36_399)).toBe('3.6万')
    expect(formatCount(363_998_848)).toBe('3.6亿')
  })

  it('空值返回空串', () => {
    expect(formatCount(undefined)).toBe('')
    expect(formatCount(0)).toBe('')
  })
})

describe('artistsText', () => {
  it('多歌手用斜杠连接', () => {
    expect(artistsText(['徐秉龙', '沈以诚'])).toBe('徐秉龙 / 沈以诚')
  })

  it('空数组给出兜底文案', () => {
    expect(artistsText([])).toBe('未知歌手')
  })
})

describe('cn', () => {
  it('合并冲突的 tailwind 类并保留后者', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4')
  })

  it('忽略假值', () => {
    expect(cn('text-sm', false, undefined, null, 'text-white')).toBe('text-sm text-white')
  })
})
