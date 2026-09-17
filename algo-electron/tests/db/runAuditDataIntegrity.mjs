import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = fileURLToPath(new URL('../..', import.meta.url))
const outfile = path.join(root, 'tmp/audit-20260911/data-integrity-repro.mjs')
await build({
  absWorkingDir: root,
  entryPoints: ['tests/db/auditDataIntegrity.repro.ts'],
  bundle: true, platform: 'node', format: 'esm',
  external: ['electron', 'better-sqlite3'], outfile,
})
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(electron, [outfile], { cwd: root, env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
