import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cliBin } from '../electron/ncm/cli-bin'
import { execRaw } from '../electron/ncm/runner'

const KEYS = ['PATH', 'HOME', 'NCM_CLI_BIN', 'NPM_CONFIG_PREFIX'] as const
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ncm-cli-bin-'))
  process.env.HOME = tmp
  // 模拟图形会话：PATH 里只有系统目录，没有 npm 全局 bin
  process.env.PATH = path.join(tmp, 'no-cli')
  delete process.env.NCM_CLI_BIN
  delete process.env.NPM_CONFIG_PREFIX
})

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** 造一个可执行的假 ncm-cli，输出可识别的版本号 */
function makeCli(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'ncm-cli')
  fs.writeFileSync(file, '#!/bin/sh\necho 0.1.7\n', { mode: 0o755 })
  return file
}

describe('cliBin', () => {
  it('显式 NCM_CLI_BIN 优先', () => {
    process.env.NCM_CLI_BIN = '/opt/custom/ncm-cli'
    expect(cliBin()).toBe('/opt/custom/ncm-cli')
  })

  it('PATH 中能找到时返回绝对路径', () => {
    const dir = path.join(tmp, 'pathbin')
    const file = makeCli(dir)
    process.env.PATH = dir
    expect(cliBin()).toBe(file)
  })

  it('GUI 会话 PATH 缺失时回落到 ~/.npm-global/bin，并补进 PATH', () => {
    const dir = path.join(tmp, '.npm-global', 'bin')
    const file = makeCli(dir)
    expect(cliBin()).toBe(file)
    expect(process.env.PATH?.split(path.delimiter)).toContain(dir)
  })

  it('支持 ~/.npmrc 自定义 npm prefix', () => {
    const dir = path.join(tmp, 'custom-prefix', 'bin')
    const file = makeCli(dir)
    fs.writeFileSync(path.join(tmp, '.npmrc'), `prefix=${path.join(tmp, 'custom-prefix')}\n`)
    expect(cliBin()).toBe(file)
  })

  it('支持 NPM_CONFIG_PREFIX 环境变量', () => {
    const dir = path.join(tmp, 'env-prefix', 'bin')
    const file = makeCli(dir)
    process.env.NPM_CONFIG_PREFIX = path.join(tmp, 'env-prefix')
    expect(cliBin()).toBe(file)
  })

  it('全都找不到时回落到裸命令名（保留原 MISSING_CLI 提示）', () => {
    expect(cliBin()).toBe('ncm-cli')
  })

  it('精简 PATH 下解析出的 CLI 能真实执行 --version', async () => {
    makeCli(path.join(tmp, '.npm-global', 'bin'))
    const res = await execRaw(cliBin(), ['--version'], 5000)
    expect(res.stdout.trim()).toBe('0.1.7')
    expect(res.code).toBe(0)
  })

  it('真实图形会话 PATH 下能解析并执行本机全局 ncm-cli', async () => {
    const realHome = original.HOME ?? os.homedir()
    const globalBin = path.join(realHome, '.npm-global', 'bin', 'ncm-cli')
    if (!fs.existsSync(globalBin)) return
    process.env.HOME = realHome
    process.env.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    expect(cliBin()).toBe(globalBin)
    // 与 checkEnv 判定 cliOk 的条件一致
    const res = await execRaw(cliBin(), ['--version'], 10000)
    expect(/^\d+\.\d+\.\d+/m.test(res.stdout.trim())).toBe(true)
  })
})
