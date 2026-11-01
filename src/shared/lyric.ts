import type { LyricLine } from './types'

/**
 * 二分查找当前行下标。主进程与渲染层共用这一份实现，
 * 避免两边各写一套时间轴定位逻辑。
 */
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
