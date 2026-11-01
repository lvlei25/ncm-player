/**
 * 探针脚本：把本机 ncm-cli 的真实命令树固化成文档与 JSON，
 * 因为命令树是服务端动态下发的，静态文档会滞后。
 *
 * 用法：node scripts/probe-cli.mjs
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const BIN = process.env.NCM_CLI_BIN || 'ncm-cli'

const PROBE_COMMANDS = [
  'play',
  'pause',
  'resume',
  'stop',
  'next',
  'prev',
  'seek',
  'volume',
  'queue',
  'state',
  'login',
  'logout',
  'config',
  'commands',
]

async function sh(args) {
  try {
    const { stdout, stderr } = await run(BIN, args, { timeout: 20000, maxBuffer: 8 * 1024 * 1024 })
    return `${stdout}${stderr}`.trim()
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`.trim()
  }
}

function parseTree(raw) {
  const top = []
  const paths = []
  let current = ''
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (/^\s/.test(line)) {
      const sub = line.trim().match(/^([a-zA-Z][\w-]*)/)
      if (sub && current && !line.trim().startsWith('-')) paths.push(`${current} ${sub[1]}`)
      continue
    }
    const m = line.match(/^([a-zA-Z][\w-]*)/)
    if (m) {
      current = m[1]
      top.push(m[1])
      paths.push(m[1])
    }
  }
  return { top, paths }
}

const version = await sh(['--version'])
const commandsOut = await sh(['commands'])
const tree = parseTree(commandsOut)

const details = {}
for (const cmd of PROBE_COMMANDS) {
  details[cmd] = await sh([cmd, '--help'])
}

const generatedAt = new Date().toISOString()

const md = [
  '# ncm-cli 真实命令树快照',
  '',
  `- 采集时间：${generatedAt}`,
  `- ncm-cli 版本：${version}`,
  '- 采集方式：`node scripts/probe-cli.mjs`（逐条执行 `ncm-cli <cmd> --help`）',
  '',
  '> 命令由服务端动态下发，本文件只是某一时刻的快照。接入真实账号后请重新执行探针脚本，',
  '> 应用运行期还会通过 `ncm-cli commands` 自动比对能力可用性。',
  '',
  '## 顶层命令',
  '',
  ...tree.top.map((name) => `- \`${name}\``),
  '',
  '## 子命令路径',
  '',
  ...tree.paths.filter((p) => p.includes(' ')).map((p) => `- \`${p}\``),
  '',
  '## 各命令帮助输出',
  '',
  ...PROBE_COMMANDS.flatMap((cmd) => [`### ${cmd}`, '', '```text', details[cmd] || '(无输出)', '```', '']),
].join('\n')

fs.mkdirSync('docs', { recursive: true })
fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync('docs/NCM-COMMANDS.md', md)
fs.writeFileSync(
  path.join('docs', 'command-tree.json'),
  JSON.stringify({ generatedAt, version, ...tree, help: details }, null, 2),
)

console.log(`已写入 docs/NCM-COMMANDS.md 与 docs/command-tree.json（${tree.top.length} 个顶层命令）`)
