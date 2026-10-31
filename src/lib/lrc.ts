import type { LyricLine } from '../shared/types'

/** 二分查找当前行；歌词行由主进程解析好，这里只做定位 */
export function activeIndex(lines: LyricLine[], positionSec: number): number {
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
