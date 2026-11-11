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

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
