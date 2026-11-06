import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc'
import { ensurePlayerBackend, setSessionListener } from './ncm/session'
import { player } from './ncm/player'
import { createTray, destroyTray } from './tray'

const DEV_URL = process.env.NCM_DEV_SERVER
const bootAt = Date.now()
let mainWindow: BrowserWindow | null = null
let shuttingDown = false

// 虚拟机 / 无 GPU 环境下强制软件渲染，避免 GPU 进程反复崩溃
if (process.env.NCM_DISABLE_GPU === '1') app.disableHardwareAcceleration()

/** 窗口/任务栏图标：优先 512 多尺寸图标，找不到时回落到单图 */
function resolveWindowIcon(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const candidates = [
    path.join(base, 'icons', '512x512.png'),
    path.join(base, 'build', 'icons', '512x512.png'),
    path.join(base, 'icon.png'),
    path.join(base, 'build', 'icon.png'),
  ]
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[candidates.length - 1]
}

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
    icon: resolveWindowIcon(),
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (process.env.NCM_DEBUG === '1') {
      console.log(`[boot] window ready ${Date.now() - bootAt}ms`)
    }
  })

  // 外链一律交给系统浏览器，应用内不开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
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

/** 真正退出：先停播放，再清理资源，最后结束进程 */
async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  await player.stop().catch((error) => console.error('[shutdown] stop failed', error))
  globalShortcut.unregisterAll()
  destroyTray()
  player.dispose()
  app.exit(0)
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
    // 后台会话探测完成后推给渲染层（冷启动时先用本地缓存渲染）
    setSessionListener((session) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('session:changed', session)
      }
    })
    await ensurePlayerBackend().catch(() => undefined)
    // 后台同步 CLI 真实播放态与队列（mpv 可能在应用重启期间仍在播放），不阻塞首屏
    void player.hydrate().catch(() => undefined)
  })

  app.on('activate', () => showWindow())

  app.on('window-all-closed', () => {
    app.quit()
  })

  /**
   * 退出前必须停掉播放：mpv 是 ncm-cli 拉起的独立进程，
   * 不显式 `ncm-cli stop` 的话，应用退出后音乐还会继续响。
   */
  app.on('before-quit', (event) => {
    if (shuttingDown) return
    event.preventDefault()
    void shutdown()
  })

  app.on('will-quit', () => {
    // 兜底清理（正常路径已在 shutdown 里做过，这里都幂等）
    globalShortcut.unregisterAll()
    destroyTray()
    player.dispose()
  })
}
