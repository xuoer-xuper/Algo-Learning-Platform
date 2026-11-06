import path from 'node:path'
import { build as bundle } from 'esbuild'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const projectRoot = process.cwd()
const tmpRoot = path.resolve(projectRoot, 'tmp')
const outputDir = path.resolve(process.argv[2] ?? '')
if (!outputDir.startsWith(`${tmpRoot}${path.sep}`)) {
  throw new Error('Refusing to build the data-refresh fixture outside tmp')
}

await bundle({
  entryPoints: ['tests/ui/dataRefreshMain.ts'],
  outfile: path.join(outputDir, 'dataRefreshMain.mjs'),
  platform: 'node',
  format: 'esm',
  bundle: true,
  external: ['electron', 'better-sqlite3', 'electron-log', 'electron-log/*', 'electron-store'],
})
await bundle({
  entryPoints: ['src/preload/index.ts'],
  outfile: path.join(outputDir, 'dataRefreshPreload.cjs'),
  platform: 'node',
  format: 'cjs',
  bundle: true,
  external: ['electron'],
})
await build({
  root: path.join(projectRoot, 'tests', 'ui'),
  base: './',
  configFile: false,
  publicDir: false,
  plugins: [tailwindcss(), react()],
  resolve: { alias: { '@shared': path.join(projectRoot, 'src', 'shared') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('test') },
  build: {
    outDir: path.join(outputDir, 'renderer'),
    emptyOutDir: false,
    rolldownOptions: { input: path.join(projectRoot, 'tests', 'ui', 'dataRefreshHarness.html') },
  },
})
