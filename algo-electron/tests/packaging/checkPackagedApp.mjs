import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const projectRoot = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
const releaseDir = path.join(projectRoot, 'release', packageJson.version, 'win-unpacked')
const executable = path.join(releaseDir, 'AlgoLearningPlatform.exe')

assert.ok(fs.existsSync(executable), `Missing packaged executable: ${executable}`)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-packaged-smoke-'))
const userDataDir = path.join(tempRoot, 'user-data')
const rendererPath = path.join(tempRoot, 'renderer.html')
const defaultHomePath = path.join(tempRoot, 'default-home.html')
fs.mkdirSync(userDataDir)
fs.writeFileSync(rendererPath, '<!doctype html><html><body><h1>packaged-renderer-ready</h1></body></html>')
fs.writeFileSync(defaultHomePath, '<!doctype html><html><body><h1>packaged-home-ready</h1></body></html>')

const rendererUrl = pathToFileURL(rendererPath).toString()
const defaultHomeUrl = pathToFileURL(defaultHomePath).toString()
fs.writeFileSync(
  path.join(userDataDir, 'config.json'),
  JSON.stringify({ defaultHomeUrl }, null, 2),
)

try {
  const result = spawnSync(executable, [], {
    cwd: releaseDir,
    env: {
      ...process.env,
      ALGO_ELECTRON_SMOKE: '1',
      ALGO_ELECTRON_SMOKE_USER_DATA: userDataDir,
      ALGO_ELECTRON_SMOKE_DEFAULT_URL: defaultHomeUrl,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      VITE_DEV_SERVER_URL: rendererUrl,
    },
    encoding: 'utf8',
    timeout: 45_000,
  })

  assert.ifError(result.error)
  assert.strictEqual(
    result.status,
    0,
    `Packaged app exited with ${result.status}, signal ${result.signal}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )

  const output = `${result.stdout}\n${result.stderr}`
  assert.match(
    output,
    /\[startup-smoke\] ok mainWindow=1 tab=.+ url=file:\/\//,
    `Packaged startup smoke marker missing\n${output}`,
  )

  const databasePath = path.join(userDataDir, 'data', 'algo-learning.sqlite')
  assert.ok(fs.existsSync(databasePath), 'Packaged app did not create its isolated SQLite database')
  assert.ok(fs.statSync(databasePath).size > 0, 'Packaged app created an empty SQLite database')

  console.log('[PASS] Packaged win-unpacked app starts with isolated userData and loads SQLite')
} finally {
  assert.ok(tempRoot.startsWith(os.tmpdir()), 'Refusing to clean outside the system temp directory')
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
