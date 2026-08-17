import assert from 'node:assert'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'

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

async function runSmokeElectron(userDataDir: string): Promise<void> {
  writeSmokePage(path.join('dist', 'index.html'), 'Smoke Renderer', '<h1>renderer-ready</h1>')
  writeSmokePage('default-home.html', 'Smoke OJ', '<h1>default-home-ready</h1>')
  writeSmokePage('popup-get.html', 'Popup GET', '<h1>popup-get-ready</h1>')
  writeSmokePage(
    'popup-oauth.html',
    'Popup OAuth',
    '<h1>popup-oauth-ready</h1><script>window.opener?.postMessage("oauth-complete", location.origin)</script>',
  )
  const { server, origin } = await startSmokeServer()
  const defaultHomeUrl = `${origin}/default-home.html`

  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ defaultHomeUrl }, null, 2),
    'utf-8',
  )

  let stdout = ''
  let stderr = ''
  try {
    const child = spawn(electronBin, [mainBundle], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ALGO_ELECTRON_SMOKE: '1',
        ALGO_ELECTRON_SMOKE_USER_DATA: userDataDir,
        ALGO_ELECTRON_SMOKE_DEFAULT_URL: defaultHomeUrl,
        ALGO_ELECTRON_SMOKE_PRELOAD_PATH: preloadBundle,
        ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH: ojPreloadBundle,
        ALGO_ELECTRON_SMOKE_RENDERER_DIST: path.join(buildDir, 'dist'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        VITE_DEV_SERVER_URL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (action: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        action()
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        settle(() => reject(new Error(`Electron smoke process timed out\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)))
      }, 30000)

      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        if (/\[startup-smoke\] ok /.test(stdout)) {
          child.kill('SIGKILL')
          child.stdout.destroy()
          child.stderr.destroy()
          settle(resolve)
        }
      })
      child.stderr.on('data', (chunk: string) => { stderr += chunk })

      child.once('error', (error) => {
        settle(() => reject(new Error(`${error.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)))
      })

      child.once('exit', (code, signal) => {
        if (code === 0 && /\[startup-smoke\] ok /.test(`${stdout}\n${stderr}`)) {
          child.stdout.destroy()
          child.stderr.destroy()
          settle(resolve)
          return
        }
        settle(() => reject(new Error(
          `Electron smoke process failed with status ${code} signal ${signal}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
        )))
      })
    })
  } finally {
    await closeServer(server)
  }

  assert.match(`${stdout}\n${stderr}`, /\[startup-smoke\] ok mainWindow=1 tab=.+ url=http:\/\/127\.0\.0\.1:/)
}

function writeSmokePage(fileName: string, title: string, body: string): void {
  const filePath = path.join(buildDir, fileName)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`,
    'utf-8',
  )
}

async function startSmokeServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'POST' && requestUrl.pathname === '/popup-post.html') {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => { body += chunk.slice(0, 16_384) })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(`<!doctype html><title>Popup POST</title><h1>post-body:${escapeHtml(body)}</h1>`)
      })
      return
    }

    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '')
    const filePath = path.resolve(buildDir, relativePath)
    if (!filePath.startsWith(`${path.resolve(buildDir)}${path.sep}`) || !fs.existsSync(filePath)) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(fs.readFileSync(filePath))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

async function removeDirectoryWithRetry(directory: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await new Promise<void>((resolve) => { setTimeout(resolve, 250) })
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to remove ${directory}`)
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
  await runSmokeElectron(userDataDir)

  console.log('[PASS] Electron startup smoke test')
} finally {
  assert.ok(userDataDir.startsWith(os.tmpdir()), 'Refusing to clean a directory outside os.tmpdir()')
  await removeDirectoryWithRetry(userDataDir)
}
