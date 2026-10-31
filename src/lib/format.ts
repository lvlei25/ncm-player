import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--'
  const total = Math.round(ms / 1000)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function formatSeconds(sec: number): string {
  return formatDuration(Math.max(0, sec) * 1000)
}

export function formatCount(count?: number): string {
  if (!count || count <= 0) return ''
  if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}亿`
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万`
  return String(count)
}

export function artistsText(artists: string[]): string {
  return artists.length > 0 ? artists.join(' / ') : '未知歌手'
}

/** 从封面取色用于背景光晕，失败时回落到品牌红 */
export function coverGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360
  const hue = hash
  return `radial-gradient(120% 120% at 20% 0%, hsl(${hue} 62% 34% / 0.75) 0%, transparent 60%), radial-gradient(100% 100% at 85% 15%, hsl(${(hue + 48) % 360} 58% 28% / 0.6) 0%, transparent 55%)`
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
