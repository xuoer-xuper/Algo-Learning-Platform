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

console.log('[PASS] Packaged main keeps better-sqlite3 external')
