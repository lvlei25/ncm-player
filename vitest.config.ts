import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // 主进程模块会 import electron，用替身让纯逻辑能在 node 下测试
      electron: path.resolve(__dirname, 'test/stubs/electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['electron/ncm/normalize.ts', 'electron/ncm/lyric.ts', 'electron/ncm/command-map.ts', 'src/shared/lyric.ts', 'src/lib/format.ts'],
    },
  },
})
