import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const mainBundlePath = path.join(projectRoot, 'dist-electron', 'main.js')

assert.ok(fs.existsSync(mainBundlePath), 'dist-electron/main.js must exist before packaging')

const mainBundle = fs.readFileSync(mainBundlePath, 'utf8')
assert.match(
  mainBundle,
  /from\s*["']better-sqlite3["']|require\(["']better-sqlite3["']\)/,
  'better-sqlite3 must remain external in the packaged main-process bundle',
)
assert.ok(
  !mainBundle.includes('prebuilds/${') && !mainBundle.includes('build/Release/better_sqlite3.node'),
  'better-sqlite3 native binding loader must not be inlined into the ESM bundle',
)
// electron-log 内部 require('electron')，内联进 ESM 包会在启动时抛
// "Dynamic require of electron is not supported"，必须同样保持外置。
assert.match(
  mainBundle,
  /from\s*["']electron-log\/main["']|require\(["']electron-log\/main["']\)/,
  'electron-log must remain external in the packaged main-process bundle',
)

console.log('[PASS] Packaged main keeps better-sqlite3 external')
