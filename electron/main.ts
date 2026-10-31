import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc'
import { ensurePlayerBackend } from './ncm/session'
import { player } from './ncm/player'
import { createTray, destroyTray } from './tray'

const DEV_URL = process.env.NCM_DEV_SERVER
let mainWindow: BrowserWindow | null = null
let quitting = false

// 虚拟机 / 无 GPU 环境下强制软件渲染，避免 GPU 进程反复崩溃
if (process.env.NCM_DISABLE_GPU === '1') app.disableHardwareAcceleration()

function broadcast(): void {
  const state = player.snapshot()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('player:state-changed', state)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#08080B',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    title: '黑胶 · 网易云音乐',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  if (DEV_URL) {
    void mainWindow.loadURL(DEV_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 外链一律交给系统浏览器，应用内不开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 关闭时缩到托盘，真正退出走托盘菜单
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function registerMediaKeys(): void {
  const bindings: Array<[string, () => void]> = [
    ['MediaPlayPause', () => void player.toggle()],
    ['MediaNextTrack', () => void player.step(1)],
    ['MediaPreviousTrack', () => void player.step(-1)],
  ]
  for (const [accelerator, handler] of bindings) {
    const ok = globalShortcut.register(accelerator, handler)
    if (!ok) console.warn(`[media-key] 无法注册 ${accelerator}（可能已被桌面环境占用）`)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(async () => {
    registerIpc()
    createWindow()
    createTray(showWindow)
    registerMediaKeys()
    player.subscribe(broadcast)
    await ensurePlayerBackend().catch(() => undefined)
  })

  app.on('activate', () => showWindow())

  app.on('window-all-closed', () => {
    // 保持后台播放，不退出
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    destroyTray()
    player.dispose()
  })
}
