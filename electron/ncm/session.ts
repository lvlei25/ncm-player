import type { EnvReport, LoginTicket, SessionStatus } from '../../src/shared/types'
import { execRaw, runCli, NcmError } from './runner'

const CLI_BIN = process.env.NCM_CLI_BIN || 'ncm-cli'

const URL_RE = /https?:\/\/[^\s"'<>）)]+/

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

export async function checkEnv(): Promise<EnvReport> {
  const [cli, mpv] = await Promise.all([
    execRaw(CLI_BIN, ['--version'], 10000),
    execRaw('mpv', ['--version'], 8000),
  ])

  const cliOk = /^\d+\.\d+\.\d+/m.test(cli.stdout.trim())
  const mpvOk = /mpv/i.test(mpv.stdout)

  let config: Record<string, string> = {}
  config = await readConfig()

  const appId = config.appId && !/未配置|^$/.test(config.appId) ? config.appId : ''
  const player = config.player && !/未配置/.test(config.player) ? config.player.replace(/\(.*\)/, '').trim() : null

  let loggedIn = false
  if (cliOk && appId) {
    const res = await execRaw(CLI_BIN, ['login', '--check', '--output', 'json'], 6000)
    const json = res.stdout.includes('{')
    loggedIn = json ? /"success"\s*:\s*true/.test(res.stdout) && !/未登录/.test(res.stdout) : false
  }

  return {
    node: { ok: Boolean(process.versions.node), version: process.versions.node },
    ncmCli: { ok: cliOk, version: versionOf(cli.stdout) },
    mpv: { ok: mpvOk, version: versionOf(mpv.stdout) },
    configured: Boolean(appId),
    loggedIn,
    player,
    error: cliOk ? undefined : '未检测到 ncm-cli',
  }
}

export async function getSession(): Promise<SessionStatus> {
  const config = await readConfig()
  const appId = config.appId && !/未配置/.test(config.appId) ? config.appId : undefined

  let loggedIn = false
  let nickname: string | undefined
  let avatarUrl: string | undefined

  if (appId) {
    const res = await execRaw(CLI_BIN, ['login', '--check', '--output', 'json'], 6000)
    const text = `${res.stdout}${res.stderr}`
    const parsed = text.includes('{') ? safeParse(text) : null
    loggedIn = Boolean(parsed && parsed.success === true)
    if (loggedIn && parsed) {
      const data = (parsed.data ?? parsed.user ?? parsed) as Record<string, unknown>
      nickname = typeof data.nickname === 'string' ? data.nickname : undefined
      avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined
    }
  }

  return { configured: Boolean(appId), loggedIn, nickname, avatarUrl, appId }
}

function safeParse(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  const parsed = JSON.parse(text.slice(start, end + 1))
  return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : null
}

export async function setCredentials(appId: string, privateKey: string): Promise<void> {
  if (!appId.trim() || !privateKey.trim()) {
    throw new NcmError('CREDENTIALS', 'appId 与 privateKey 不能为空')
  }
  await runCli(['config', 'set', 'appId', appId.trim()], { json: false })
  await runCli(['config', 'set', 'privateKey', privateKey.trim()], { json: false })
  // 播放后端固定为内置 mpv（本机无网易云桌面客户端）
  await runCli(['config', 'set', 'player', 'mpv'], { json: false }).catch(() => undefined)
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
}
