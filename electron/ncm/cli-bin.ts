import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BIN_NAME = 'ncm-cli'

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/** 读取 ~/.npmrc 里自定义的 npm prefix（npm install -g 会装到 <prefix>/bin） */
function readNpmrcPrefix(file: string, home: string): string | null {
  try {
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*prefix\s*=/.test(l))
    const value = line?.split('=')[1]?.trim()
    if (!value) return null
    return value.replace(/^~(?=\/|$)/, home)
  } catch {
    return null
  }
}

/**
 * npm / 版本管理器装的全局命令常见位置。
 * 从应用列表启动时 Electron 继承的是图形会话环境，不会加载 .zshrc / .bashrc，
 * 因此 `${HOME}/.npm-global/bin`、nvm 目录等往往不在 PATH 里。
 */
function globalBinDirs(home: string): string[] {
  const prefix = process.env.NPM_CONFIG_PREFIX || readNpmrcPrefix(path.join(home, '.npmrc'), home)
  const dirs = [
    ...(prefix ? [path.join(prefix, 'bin')] : []),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.local', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
  ]

  const versionRoots = [
    path.join(home, '.nvm', 'versions', 'node'),
    path.join(home, '.local', 'share', 'fnm', 'node-versions'),
  ]
  for (const root of versionRoots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        dirs.push(path.join(root, entry.name, 'bin'))
        dirs.push(path.join(root, entry.name, 'installation', 'bin'))
      }
    } catch {
      // 未装该版本管理器，目录不存在
    }
  }

  return [...new Set(dirs)]
}

/** 把找到的目录并入进程 PATH，让 ncm-cli 的 `/usr/bin/env node` 及其子进程也能解析 */
function augmentPath(dir: string): void {
  const parts = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  if (!parts.includes(dir)) process.env.PATH = [...parts, dir].join(path.delimiter)
}

/**
 * 解析 ncm-cli 可执行文件。
 * 优先显式 NCM_CLI_BIN，其次 PATH，最后常见全局安装位置；
 * 找不到时返回裸命令名，沿用原有的 MISSING_CLI 提示。
 */
export function cliBin(): string {
  const override = process.env.NCM_CLI_BIN?.trim()
  if (override) return override

  const home = os.homedir()
  const dirs = [
    ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean),
    ...globalBinDirs(home),
  ]
  for (const dir of dirs) {
    const file = path.join(dir, BIN_NAME)
    if (isExecutable(file)) {
      augmentPath(dir)
      return file
    }
  }
  return BIN_NAME
}
