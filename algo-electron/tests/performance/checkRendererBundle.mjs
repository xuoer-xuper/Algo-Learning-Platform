import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const projectRoot = process.cwd()
const tmpRoot = path.join(projectRoot, 'tmp')
const outputDir = path.join(tmpRoot, 'renderer-performance')
const baselineEntryBytes = 2_221_300
const maxEntryBytes = Math.floor(baselineEntryBytes * 0.65)

if (fs.existsSync(outputDir)) {
  assert.ok(outputDir.startsWith(tmpRoot), 'Refusing to clean outside tmp')
  fs.rmSync(outputDir, { recursive: true, force: true })
}

await build({
  root: projectRoot,
  base: './',
  configFile: false,
  publicDir: false,
  logLevel: 'silent',
  plugins: [tailwindcss(), react()],
  build: {
    outDir: outputDir,
    emptyOutDir: true,
  },
})

const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8')
const entryMatch = html.match(/<script[^>]+src="\.\/assets\/(index-[^"]+\.js)"/)
assert.ok(entryMatch, 'Renderer build did not emit an index entry script')

const entryFile = entryMatch[1]
const entryBytes = fs.statSync(path.join(outputDir, 'assets', entryFile)).size
assert.ok(
  entryBytes <= maxEntryBytes,
  `Renderer entry ${entryFile} is ${entryBytes} bytes; expected <= ${maxEntryBytes} bytes (35% below ${baselineEntryBytes})`,
)

const assetNames = fs.readdirSync(path.join(outputDir, 'assets'))
const requiredLazyChunks = [
  /^SettingsPage-.*\.js$/,
  /^Dashboard-.*\.js$/,
  /^CoachMetricsView-.*\.js$/,
  /^CoachChatPanel-.*\.js$/,
  /^MilkdownEditor-.*\.js$/,
]

for (const pattern of requiredLazyChunks) {
  assert.ok(assetNames.some((name) => pattern.test(name)), `Missing lazy renderer chunk matching ${pattern}`)
}

assert.ok(
  assetNames.some((name) => /^(?:BarChart|PieChart)-.*\.js$/.test(name)),
  'Recharts must remain outside the initial renderer entry',
)
assert.ok(!html.includes('MilkdownEditor-'), 'Milkdown must not be preloaded by the initial renderer HTML')
assert.ok(!html.includes('CoachChatPanel-'), 'Markdown chat must not be preloaded by the initial renderer HTML')

const reduction = (1 - entryBytes / baselineEntryBytes) * 100
console.log(`[PASS] Renderer entry: ${entryBytes} bytes (${reduction.toFixed(1)}% below ${baselineEntryBytes})`)
console.log('[PASS] Settings, dashboard, Coach metrics, Markdown chat, Milkdown and Recharts remain lazy chunks')
