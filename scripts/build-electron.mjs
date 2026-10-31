import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [
    { in: 'electron/main.ts', out: 'main' },
    { in: 'electron/preload.ts', out: 'preload' },
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[electron] watching...')
} else {
  await esbuild.build(options)
  console.log('[electron] build done')
}
