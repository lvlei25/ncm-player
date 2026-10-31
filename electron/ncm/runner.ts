import { execFile } from 'node:child_process'
import type { NcmErrorCode } from '../../src/shared/types'

const CLI_BIN = process.env.NCM_CLI_BIN || 'ncm-cli'
const DEFAULT_TIMEOUT = 25000

export class NcmError extends Error {
  code: NcmErrorCode
  raw?: string

  constructor(code: NcmErrorCode, message: string, raw?: string) {
    super(message)
    this.name = 'NcmError'
    this.code = code
    this.raw = raw
  }
}

/** 简单串行队列：播控命令必须按顺序下发，避免与 mpv 抢状态 */
export class SerialQueue {
  private chain: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task)
    this.chain = next.catch(() => undefined)
    return next
  }
}

export const playerQueue = new SerialQueue()
/**
 * 所有 CLI 调用共用的串行队列。
 * 并行拉起多个 ncm-cli 进程会让刷新 token 的写操作互相覆盖，
 * 实测表现为「其中一个请求返回空数据」，因此统一排队执行。
 */
export const cliQueue = new SerialQueue()

interface RunOptions {
  timeout?: number
  /** 是否追加 --output json（默认追加，CLI 默认也是 json，显式指定更稳） */
  json?: boolean
  cwd?: string
}

export interface CliEnvelope {
  raw: string
  json: Record<string, unknown> | null
}

const ERR_PATTERNS: Array<{ re: RegExp; code: NcmErrorCode; hint: string }> = [
  { re: /API ?key 未设置|API key 未配置|请先配置/i, code: 'CREDENTIALS', hint: '尚未配置 appId / privateKey' },
  { re: /未登录|请先登录|未授权|登录已过期|token.*(无效|失效)/i, code: 'UNAUTHORIZED', hint: '尚未登录网易云音乐' },
  { re: /请求总量超限|总量超限|频率限制|too many requests/i, code: 'QUOTA', hint: '请求总量超限' },
  { re: /unknown command|未知命令/i, code: 'UNSUPPORTED', hint: '当前 ncm-cli 未提供该命令' },
  { re: /ETIMEDOUT|timed? ?out|超时/i, code: 'TIMEOUT', hint: '命令执行超时' },
  { re: /ENOTFOUND|ECONNREFUSED|network|网络/i, code: 'NETWORK', hint: '网络异常' },
]

function classify(text: string): { code: NcmErrorCode; hint: string } | null {
  for (const p of ERR_PATTERNS) {
    if (p.re.test(text)) return { code: p.code, hint: p.hint }
  }
  return null
}

/** 从混合 stdout/stderr 中抠出第一段完整 JSON 对象 */
export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const slice = text.slice(start, end + 1)
  try {
    const parsed = JSON.parse(slice)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

/** 直接执行命令（不解析、不抛错），用于环境探测类调用 */
export function execRaw(bin: string, args: string[], timeout = 8000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const exitCode = err && typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as NodeJS.ErrnoException).code) : err ? 1 : 0
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: exitCode })
    })
  })
}

/**
 * 执行 ncm-cli 子命令。
 * 命令树由服务端下发，参数一律以数组传递（不经过 shell），避免注入。
 */
export function runCli(args: string[], options: RunOptions = {}): Promise<CliEnvelope> {
  return cliQueue.run(() => execCli(args, options))
}

async function execCli(args: string[], options: RunOptions = {}): Promise<CliEnvelope> {
  const argv = options.json === false ? [...args] : [...args, '--output', 'json']
  const timeout = options.timeout ?? DEFAULT_TIMEOUT

  const result = await new Promise<ExecResult>((resolve, reject) => {
    execFile(
      CLI_BIN,
      argv,
      {
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
        cwd: options.cwd,
        env: { ...process.env, NCM_CLI_NO_UPDATE_CHECK: '1' },
      },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new NcmError('MISSING_CLI', '未找到 ncm-cli，请先安装：npm install -g @music163/ncm-cli'))
          return
        }
        if (err && (err as NodeJS.ErrnoException).killed) {
          reject(new NcmError('TIMEOUT', `ncm-cli ${args[0]} 执行超时`, stderr))
          return
        }
        const exitCode = err ? 1 : 0
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: exitCode })
      },
    )
  })

  const combined = `${result.stdout}\n${result.stderr}`
  const json = extractJson(combined)

  if (json && json.success === false) {
    const message = typeof json.message === 'string' ? json.message : 'ncm-cli 返回失败'
    const kind = classify(message) ?? { code: 'UNKNOWN' as NcmErrorCode, hint: message }
    throw new NcmError(kind.code, message, combined)
  }

  if (!json && result.code !== 0) {
    const kind = classify(combined)
    throw new NcmError(kind?.code ?? 'UNKNOWN', kind?.hint ?? `ncm-cli 执行失败 (${args.join(' ')})`, combined)
  }

  if (!json) {
    const kind = classify(combined)
    if (kind) throw new NcmError(kind.code, kind.hint, combined)
  }

  return { raw: combined, json }
}

/** 检查某条命令是否存在于当前命令树 */
export async function commandExists(argv: string[]): Promise<boolean> {
  const res = await execRaw(CLI_BIN, [...argv, '--help'])
  const text = `${res.stdout}${res.stderr}`
  if (/unknown command/i.test(text)) return false
  return /usage:/i.test(text)
}
