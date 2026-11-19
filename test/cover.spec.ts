import { describe, expect, it } from 'vitest'
import { thumbnailUrl } from '../src/lib/coverUrl'

describe('封面缩略图', () => {
  it('无地址时不生成请求', () => {
    expect(thumbnailUrl()).toBeUndefined()
    expect(thumbnailUrl('')).toBe('')
  })

  it('原图追加 480 缩略参数，体积从百 KB 降到约 15 KB', () => {
    expect(thumbnailUrl('https://p1.music.126.net/x.jpg')).toBe(
      'https://p1.music.126.net/x.jpg?imageView=1&thumbnail=480x480&quality=80',
    )
  })

  it('歌单封面已有缩略参数时保持原样', () => {
    const url = 'https://p1.music.126.net/x.jpg?imageView=1&thumbnail=800y800&enlarge=1'
    expect(thumbnailUrl(url)).toBe(url)
  })

  it('已有其他查询参数时用 & 追加', () => {
    expect(thumbnailUrl('https://p1.music.126.net/x.jpg?foo=1')).toBe(
      'https://p1.music.126.net/x.jpg?foo=1&imageView=1&thumbnail=480x480&quality=80',
    )
  })
})
