import type { EnvReport, LoginTicket, SessionStatus } from '../../src/shared/types'
import { loadConfig, saveConfig } from '../store'
import { execRaw, NcmError, runCli } from './runner'

const CLI_BIN = process.env.NCM_CLI_BIN || 'ncm-cli'
const URL_RE = /https?:\/\/[^\s"'<>）)]+/

/** 会话探测很贵（config list + login --check + user info ≈ 3.6s），缓存 60s */
const SESSION_TTL = 60_000

interface CacheEntry {
  value: SessionStatus
  at: number
}

let cache: CacheEntry | null = null
let listener: ((value: SessionStatus) => void) | null = null
let probing: Promise<SessionStatus> | null = null

export function invalidateSession(): void {
  cache = null
}

/** 后台探测完成后的回调，用于把「先渲染后校验」的结果推给渲染层 */
export function setSessionListener(cb: (value: SessionStatus) => void): void {
  listener = cb
}

/** 读取 `ncm-cli config list` 的文本输出，判断凭证是否齐备 */
async function readConfig(): Promise<Record<string, string>> {
  const res = await execRaw(CLI_BIN, ['config', 'list'], 12000)
  const out: Record<string, string> = {}
  for (const line of `${res.stdout}`.split(/\r?\n/)) {
    const m = line.match(/^([\w.]+):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function versionOf(text: string): string {
  const m = text.match(/v?(\d+\.\d+\.\d+[\w.-]*)/)
  return m ? m[1] : text.trim().split(/\s+/)[0] || ''
}

function safeParse(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  const parsed = JSON.parse(text.slice(start, end + 1))
  return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : null
}

/** 昵称与头像：优先取 user info，失败时回落到本地缓存 */
async function fetchProfile(): Promise<{ nickname?: string; avatarUrl?: string }> {
  const res = await execRaw(CLI_BIN, ['user', 'info', '--output', 'json'], 8000)
  const text = `${res.stdout}${res.stderr}`
  const info = text.includes('{') ? safeParse(text) : null
  const data = (info?.data ?? info) as Record<string, unknown> | null
  const cached = loadConfig()
  const nickname = data && typeof data.nickname === 'string' ? data.nickname : cached.nickname
  const rawAvatar = data && typeof data.avatarUrl === 'string' ? data.avatarUrl : cached.avatarUrl
  const avatarUrl = rawAvatar ? rawAvatar.replace(/^http:/, 'https:') : undefined
  if (nickname || avatarUrl) saveConfig({ nickname, avatarUrl })
  return { nickname, avatarUrl }
}

/**
 * 会话状态（缓存 60s）。
 * force=true 用于用户显式点「刷新状态」的场景。
 */
async function probeSession(fresh = false): Promise<SessionStatus> {
  const config = await readConfig()
  const appId = config.appId && !/未配置/.test(config.appId) ? config.appId : undefined

  if (!appId) {
    const value: SessionStatus = { configured: false, loggedIn: false }
    cache = { value, at: Date.now() }
    saveConfig({ configured: false, loggedIn: false })
    return value
  }

  const checkRes = await execRaw(CLI_BIN, ['login', '--check', '--output', 'json'], 6000)
  const text = `${checkRes.stdout}${checkRes.stderr}`
  const parsed = text.includes('{') ? safeParse(text) : null
  const loggedIn = Boolean(parsed && parsed.success === true)

  let profile: { nickname?: string; avatarUrl?: string } = {
    nickname: loadConfig().nickname,
    avatarUrl: loadConfig().avatarUrl,
  }
  // 只有确认已登录、且本地还没有昵称（或显式刷新）时才发起这次网络调用
  if (loggedIn && (fresh || !profile.nickname)) {
    profile = await fetchProfile()
  }
  if (!loggedIn && (profile.nickname || profile.avatarUrl)) {
    saveConfig({ nickname: undefined, avatarUrl: undefined })
    profile = {}
  }

  const value: SessionStatus = {
    configured: true,
    loggedIn,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    appId,
  }
  cache = { value, at: Date.now() }
  saveConfig({ configured: value.configured, loggedIn: value.loggedIn })
  return value
}

/** 同一时刻只跑一次探测，避免并发打满 CLI 队列 */
function probeOnce(): Promise<SessionStatus> {
  if (probing) return probing
  probing = probeSession().finally(() => {
    probing = null
  })
  return probing
}

export async function getSession(force = false): Promise<SessionStatus> {
  if (!force && cache && Date.now() - cache.at < SESSION_TTL) return cache.value

  const persisted = loadConfig()
  // 冷启动：先用上次探测结果渲染首屏，真实探测在后台完成后通过 listener 更正
  if (!force && !cache && persisted.loggedIn !== undefined) {
    const stale: SessionStatus = {
      configured: persisted.configured ?? true,
      loggedIn: persisted.loggedIn,
      nickname: persisted.nickname,
      avatarUrl: persisted.avatarUrl,
    }
    void probeOnce()
      .then((value) => {
        if (listener) listener(value)
      })
      .catch(() => undefined)
    return stale
  }

  if (force) return probeSession(true)
  return probeOnce()
}

/** 环境自检只做本地探测，登录态直接读会话缓存 */
export async function checkEnv(): Promise<EnvReport> {
  const [cli, mpv, node] = await Promise.all([
    execRaw(CLI_BIN, ['--version'], 10000),
    execRaw('mpv', ['--version'], 8000),
    // 必须看「系统 node」：ncm-cli 的 shebang 是 /usr/bin/env node，与 Electron 内置 node 无关
    execRaw('node', ['--version'], 8000),
  ])

  const cliOk = /^\d+\.\d+\.\d+/m.test(cli.stdout.trim())
  const mpvOk = /mpv/i.test(mpv.stdout)

  const config = await readConfig()
  const appId = config.appId && !/未配置|^$/.test(config.appId) ? config.appId : ''
  const player = config.player && !/未配置/.test(config.player) ? config.player.replace(/\(.*\)/, '').trim() : null

  const session = await getSession()

  const nodeVersion = versionOf(node.stdout) || process.versions.node
  const nodeOk = /^\d+\.\d+\.\d+/.test(nodeVersion)
  const [major = 0, minor = 0] = nodeVersion.split('.').map(Number)
  const promptSupport = nodeOk && (major > 22 || (major === 22 && minor >= 12))

  return {
    node: { ok: nodeOk, version: nodeVersion, promptSupport },
    ncmCli: { ok: cliOk, version: versionOf(cli.stdout) },
    mpv: { ok: mpvOk, version: versionOf(mpv.stdout) },
    configured: Boolean(appId),
    loggedIn: session.loggedIn,
    player,
    error: cliOk ? undefined : '未检测到 ncm-cli',
  }
}

export async function setCredentials(appId: string, privateKey: string): Promise<void> {
  if (!appId.trim() || !privateKey.trim()) {
    throw new NcmError('CREDENTIALS', 'appId 与 privateKey 不能为空')
  }
  await runCli(['config', 'set', 'appId', appId.trim()], { json: false })
  await runCli(['config', 'set', 'privateKey', privateKey.trim()], { json: false })
  // 播放后端固定为内置 mpv（本机无网易云桌面客户端）
  await runCli(['config', 'set', 'player', 'mpv'], { json: false }).catch(() => undefined)
  invalidateSession()
}

/** 绑定播放器后端，安装后首次调用 */
export async function ensurePlayerBackend(): Promise<void> {
  const config = await readConfig()
  if (!config.player || /未配置/.test(config.player)) {
    await runCli(['config', 'set', 'player', 'mpv'], { json: false }).catch(() => undefined)
  }
}

/**
 * 触发扫码登录。--background 模式会立即返回登录链接，
 * 真实的登录完成需要用户手机扫码，UI 侧轮询 loginCheck。
 */
export async function startLogin(): Promise<LoginTicket> {
  try {
    const result = await runCli(['login', '--background'], { json: false, timeout: 30000 })
    const link = result.raw.match(URL_RE)?.[0]
    return { ok: Boolean(link), link, raw: result.raw, message: link ? undefined : '未从输出中解析到登录链接' }
  } catch (error) {
    const raw = error instanceof NcmError ? error.raw ?? error.message : String(error)
    const link = raw.match(URL_RE)?.[0]
    return { ok: Boolean(link), link, raw, message: error instanceof Error ? error.message : '登录启动失败' }
  }
}

export async function logout(): Promise<void> {
  await runCli(['logout'], { json: false })
  invalidateSession()
}
