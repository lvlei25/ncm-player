import os from 'node:os'
import path from 'node:path'

/** 让主进程模块里的 `import { app } from 'electron'` 能在 node 测试环境跑起来 */
export const app = {
  getPath: () => path.join(os.tmpdir(), 'ncm-player-test'),
  getAppPath: () => process.cwd(),
  getVersion: () => '0.0.0-test',
  isPackaged: false,
}

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (value: Buffer) => value.toString(),
}

export default { app, safeStorage }
