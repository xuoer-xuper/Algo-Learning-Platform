import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = path.join(root, 'tmp/renderer-performance/audit-import-20260911/main.mjs')
const scenarios = process.argv.slice(2)
if (!scenarios.length || scenarios.some(scenario => !['D0', 'D1', 'D2'].includes(scenario))) {
  throw new Error('Pass bounded scenarios, for example: D0 D1 D1 D1 D2 D2 D2')
}
await build({ absWorkingDir: root, entryPoints: ['tests/performance/auditImportPerformance.repro.ts'], bundle: true, platform: 'node', format: 'esm', external: ['electron', 'better-sqlite3'], outfile: output })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
for (const scenario of scenarios) {
  const result = spawnSync(electron, ['--js-flags=--expose-gc', output, scenario], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 180_000 })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
