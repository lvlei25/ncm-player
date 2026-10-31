import { app, Menu, nativeImage, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { player } from './ncm/player'

let tray: Tray | null = null

function resolveIcon(): Electron.NativeImage {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.cwd(), 'build', 'icon.png'),
  ]
  for (const file of candidates) {
    if (file && fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file)
      if (!img.isEmpty()) return img.resize({ width: 22, height: 22 })
    }
  }
  return nativeImage.createEmpty()
}

function buildMenu(onShow: () => void): Menu {
  const state = player.snapshot()
  const current = state.current
  return Menu.buildFromTemplate([
    { label: current ? `正在播放：${current.name}` : '暂无播放', enabled: false },
    { type: 'separator' },
    { label: state.status === 'playing' ? '暂停' : '播放', click: () => void player.toggle() },
    { label: '下一首', click: () => void player.step(1) },
    { label: '上一首', click: () => void player.step(-1) },
    { type: 'separator' },
    { label: '显示主窗口', click: onShow },
    { label: '退出', click: () => app.quit() },
  ])
}

export function createTray(onShow: () => void): void {
  if (tray) return
  const icon = resolveIcon()
  if (icon.isEmpty()) return
  tray = new Tray(icon)
  tray.setToolTip('黑胶 · 网易云音乐')
  tray.setContextMenu(buildMenu(onShow))
  tray.on('click', onShow)

  player.subscribe(() => {
    tray?.setContextMenu(buildMenu(onShow))
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
