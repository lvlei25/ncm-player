import { loadConfig } from '../store'
import { CAPABILITY_COMMANDS, fillTemplate } from './command-map'
import type { CapabilityId, CommandSpec } from './command-map'
import { execRaw } from './runner'

const CLI_BIN = process.env.NCM_CLI_BIN || 'ncm-cli'

export interface CommandTree {
  /** 顶层命令名 */
  top: string[]
  /** "父 子" 形式的完整路径 */
  paths: string[]
  raw: string
  fetchedAt: number
}

let cache: CommandTree | null = null

/** 解析 `ncm-cli commands` 的纯文本输出（该命令不接受 --output json） */
export function parseCommandTree(raw: string): CommandTree {
  const top = new Set<string>()
  const paths = new Set<string>()
  let current = ''

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (/^\s/.test(line)) {
      const sub = line.trim().match(/^([a-zA-Z][\w-]*)/)
      if (sub && current && !line.trim().startsWith('-')) paths.add(`${current} ${sub[1]}`)
      continue
    }
    const m = line.match(/^([a-zA-Z][\w-]*)/)
    if (m) {
      current = m[1]
      top.add(m[1])
      paths.add(m[1])
    }
  }
  return { top: [...top], paths: [...paths], raw, fetchedAt: Date.now() }
}

export async function getCommandTree(force = false): Promise<CommandTree> {
  if (cache && !force && Date.now() - cache.fetchedAt < 60_000) return cache
  const res = await execRaw(CLI_BIN, ['commands'], 15000)
  const text = `${res.stdout}\n${res.stderr}`
  cache = parseCommandTree(text)
  return cache
}

export function resetCommandTree(): void {
  cache = null
}

/** 判断某个模板的命令路径是否存在 */
export function specExists(spec: CommandSpec, tree: CommandTree): boolean {
  const words = spec.argv.filter((t) => !t.startsWith('--') && !t.startsWith('{'))
  if (words.length === 0) return false
  if (words.length === 1) return tree.top.includes(words[0])
  // 子命令必须精确命中：父命令存在不代表子命令存在（如 recommend 有 daily 但没有 playlist）
  return tree.paths.includes(`${words[0]} ${words[1]}`)
}

export interface ResolvedCommand {
  capability: CapabilityId
  spec: CommandSpec
  params: Record<string, string | number | undefined>
  argv: string[]
}

/**
 * 解析一个能力的最终命令。
 * 优先级：用户 overrides > 命令树中真实存在的候选 > 第一条候选（交给 CLI 报错兜底）
 */
export function resolveCommand(
  capability: CapabilityId,
  params: Record<string, string | number | undefined> = {},
  tree?: CommandTree,
): ResolvedCommand {
  const overrides = loadConfig().commandOverrides || {}
  const override = overrides[capability]
  const candidates = CAPABILITY_COMMANDS[capability]

  if (Array.isArray(override) && override.length > 0) {
    const spec: CommandSpec = { argv: override }
    return { capability, spec, params, argv: fillTemplate(override, params) }
  }

  const matched = tree ? candidates.find((spec) => specExists(spec, tree)) : undefined
  const spec = matched ?? candidates[0]
  return { capability, spec, params, argv: fillTemplate(spec.argv, params) }
}

/** 能力可用性矩阵，用于 UI 隐藏不可用入口 */
export function capabilityMatrix(tree: CommandTree): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const key of Object.keys(CAPABILITY_COMMANDS) as CapabilityId[]) {
    result[key] = CAPABILITY_COMMANDS[key].some((spec) => specExists(spec, tree))
  }
  return result
}
