import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const projectRoot = process.cwd()
const tmpRoot = path.join(projectRoot, 'tmp')
const buildDir = path.join(tmpRoot, 'electron-startup-smoke')
const mainBundle = path.join(buildDir, 'main.mjs')
const preloadBundle = path.join(buildDir, 'preload.cjs')
const ojPreloadBundle = path.join(buildDir, 'ojPreload.cjs')
const esbuildBin = path.join(projectRoot, 'node_modules', 'esbuild', 'bin', 'esbuild')
const electronBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')

function runEsbuild(input: string, outfile: string, format: 'esm' | 'cjs' = 'esm'): void {
  const result = spawnSync(process.execPath, [
    esbuildBin,
    input,
    '--bundle',
    '--platform=node',
    `--format=${format}`,
    '--external:electron',
    '--external:better-sqlite3',
    `--outfile=${outfile}`,
  ], {
    cwd: projectRoot,
    encoding: 'utf-8',
  })

  assert.strictEqual(
    result.status,
    0,
    `Failed to bundle ${input}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )
}

function runSmokeElectron(userDataDir: string): void {
  const rendererUrl = writeSmokePage('renderer.html', 'Smoke Renderer', '<h1>renderer-ready</h1>')
  const defaultHomeUrl = writeSmokePage('default-home.html', 'Smoke OJ', '<h1>default-home-ready</h1>')

  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ defaultHomeUrl }, null, 2),
    'utf-8',
  )

  const result = spawnSync(electronBin, [mainBundle], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ALGO_ELECTRON_SMOKE: '1',
      ALGO_ELECTRON_SMOKE_USER_DATA: userDataDir,
      ALGO_ELECTRON_SMOKE_DEFAULT_URL: defaultHomeUrl,
      ALGO_ELECTRON_SMOKE_PRELOAD_PATH: preloadBundle,
      ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH: ojPreloadBundle,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      VITE_DEV_SERVER_URL: rendererUrl,
    },
    encoding: 'utf-8',
    timeout: 30000,
  })

  assert.ifError(result.error)
  assert.strictEqual(
    result.status,
    0,
    `Electron smoke process failed with status ${result.status} signal ${result.signal}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /\[startup-smoke\] ok mainWindow=1 tab=.+ url=file:\/\//,
  )
}

function writeSmokePage(fileName: string, title: string, body: string): string {
  const filePath = path.join(buildDir, fileName)
  fs.writeFileSync(
    filePath,
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`,
    'utf-8',
  )
  return pathToFileURL(filePath).toString()
}

if (fs.existsSync(buildDir)) {
  assert.ok(buildDir.startsWith(tmpRoot), 'Refusing to clean a directory outside tmp')
  fs.rmSync(buildDir, { recursive: true, force: true })
}
fs.mkdirSync(buildDir, { recursive: true })

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-electron-smoke-user-data-'))

try {
  runEsbuild('electron/main.ts', mainBundle)
  runEsbuild('electron/preload.ts', preloadBundle, 'cjs')
  runEsbuild('electron/browser/ojPreload.ts', ojPreloadBundle, 'cjs')
  runSmokeElectron(userDataDir)

  console.log('[PASS] Electron startup smoke test')
} finally {
  assert.ok(userDataDir.startsWith(os.tmpdir()), 'Refusing to clean a directory outside os.tmpdir()')
  fs.rmSync(userDataDir, { recursive: true, force: true })
}
