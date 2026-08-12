import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const projectRoot = process.cwd()
const tmpRoot = path.join(projectRoot, 'tmp')
const outputDir = path.resolve(process.argv[2] ?? '')
const uiRoot = path.join(projectRoot, 'tests', 'ui')

if (!outputDir.startsWith(`${tmpRoot}${path.sep}`)) {
  throw new Error('Refusing to build the screenshot harness outside tmp')
}

await build({
  root: uiRoot,
  base: './',
  configFile: false,
  publicDir: false,
  plugins: [tailwindcss(), react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
  build: {
    outDir: outputDir,
    emptyOutDir: false,
    rolldownOptions: {
      input: path.join(uiRoot, 'rendererScreenshotHarness.html'),
    },
  },
})
