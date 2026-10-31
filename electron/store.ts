import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface AppConfig {
  /** AI 模型配置（apiKey 单独加密存储） */
  aiBaseUrl: string
  aiModel: string
  aiApiKeyEnc: string
  /** 是否已完成首次引导 */
  onboarded: boolean
  /** 上次播放的音量（0-100） */
  volume: number
  /** 播放模式 */
  playMode: 'order' | 'repeat-one' | 'shuffle'
  /** 运行期命令覆盖（能力 → argv） */
  commandOverrides: Record<string, string[]>
}

const DEFAULTS: AppConfig = {
  aiBaseUrl: 'https://api.deepseek.com/v1',
  aiModel: 'deepseek-chat',
  aiApiKeyEnc: '',
  onboarded: false,
  volume: 70,
  playMode: 'order',
  commandOverrides: {},
}

let cache: AppConfig | null = null

function configDir(): string {
  return path.join(app.getPath('userData'))
}

function configPath(): string {
  return path.join(configDir(), 'ncm-player.json')
}

export function loadConfig(): AppConfig {
  if (cache) return cache
  const file = configPath()
  if (!fs.existsSync(file)) {
    cache = { ...DEFAULTS }
    saveConfig(cache)
    return cache
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppConfig>
  cache = { ...DEFAULTS, ...parsed }
  return cache
}

export function saveConfig(next: Partial<AppConfig>): AppConfig {
  const merged = { ...(cache ?? DEFAULTS), ...next }
  cache = merged
  fs.mkdirSync(configDir(), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), { mode: 0o600 })
  return merged
}

/** API Key 用系统钥匙串加密后落盘，明文只在内存中短暂存在 */
export function setAiKey(plain: string): void {
  if (!plain) {
    saveConfig({ aiApiKeyEnc: '' })
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    saveConfig({ aiApiKeyEnc: safeStorage.encryptString(plain).toString('base64') })
  } else {
    saveConfig({ aiApiKeyEnc: `plain:${Buffer.from(plain, 'utf8').toString('base64')}` })
  }
}

export function getAiKey(): string {
  const enc = loadConfig().aiApiKeyEnc
  if (!enc) return ''
  if (enc.startsWith('plain:')) return Buffer.from(enc.slice(6), 'base64').toString('utf8')
  if (!safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return ''
  }
}

export function configFilePath(): string {
  return configPath()
}
