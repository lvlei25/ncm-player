/** 网易云原图动辄数百 KB，CDN 缩略图约 15 KB；已有缩略参数的歌单封面保持原样 */
export function thumbnailUrl(url?: string): string | undefined {
  if (!url || url.includes('imageView=')) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}imageView=1&thumbnail=480x480&quality=80`
}
