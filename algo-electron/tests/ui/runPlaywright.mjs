import { spawnSync } from 'node:child_process'
import path from 'node:path'

const projectRoot = process.cwd()
const playwrightBin = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js')
const env = { ...process.env }
delete env.NO_COLOR

const result = spawnSync(process.execPath, [playwrightBin, 'test', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
