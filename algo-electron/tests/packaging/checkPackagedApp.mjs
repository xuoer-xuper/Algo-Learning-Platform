import assert from 'node:assert'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectRoot = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
const releaseDir = path.join(projectRoot, 'release', packageJson.version, 'win-unpacked')
const executable = path.join(releaseDir, 'AlgoLearningPlatform.exe')

assert.ok(fs.existsSync(executable), `Missing packaged executable: ${executable}`)

function writeSmokePages(webRoot, rendererDist) {
  fs.mkdirSync(webRoot, { recursive: true })
  fs.mkdirSync(rendererDist, { recursive: true })
  fs.writeFileSync(path.join(rendererDist, 'index.html'), '<!doctype html><html><body><h1>packaged-renderer-ready</h1></body></html>')
  fs.writeFileSync(path.join(webRoot, 'default-home.html'), '<!doctype html><html><body><h1>packaged-home-ready</h1></body></html>')
  fs.writeFileSync(path.join(webRoot, 'popup-get.html'), '<!doctype html><html><body><h1>popup-get-ready</h1></body></html>')
  fs.writeFileSync(path.join(webRoot, 'popup-oauth.html'), '<!doctype html><html><body><h1>popup-oauth-ready</h1><script>window.opener?.postMessage("oauth-complete", location.origin)</script></body></html>')
}

async function startSmokeServer(webRoot) {
  const requests = []
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    requests.push(`${request.method} ${requestUrl.pathname}`)
    if (request.method === 'POST' && requestUrl.pathname === '/popup-post.html') {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk) => { body += chunk.slice(0, 16_384) })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(`<!doctype html><html><body><h1>post-body:${body.replace(/[&<>]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value])}</h1></body></html>`)
      })
      return
    }

    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '')
    const filePath = path.resolve(webRoot, relativePath)
    if (!filePath.startsWith(`${path.resolve(webRoot)}${path.sep}`) || !fs.existsSync(filePath)) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(fs.readFileSync(filePath))
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, origin: `http://127.0.0.1:${address.port}`, requests }
}

function runPackagedApp(env) {
  return new Promise((resolve) => {
    const child = spawn(executable, [], {
      cwd: releaseDir,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 45_000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => {
      clearTimeout(timeout)
      resolve({ error, status: null, signal: null, stdout, stderr, timedOut })
    })
    child.once('close', (status, signal) => {
      clearTimeout(timeout)
      resolve({ error: null, status, signal, stdout, stderr, timedOut })
    })
  })
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-packaged-smoke-'))
  const userDataDir = path.join(tempRoot, 'user-data')
  const webRoot = path.join(tempRoot, 'web')
  const rendererDist = path.join(tempRoot, 'renderer-dist')
  fs.mkdirSync(userDataDir)
  writeSmokePages(webRoot, rendererDist)
  const { server, origin, requests } = await startSmokeServer(webRoot)
  const defaultHomeUrl = `${origin}/default-home.html`

  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ defaultHomeUrl }, null, 2),
  )

  try {
    const result = await runPackagedApp({
      ...process.env,
      ALGO_ELECTRON_SMOKE: '1',
      ALGO_ELECTRON_SMOKE_USER_DATA: userDataDir,
      ALGO_ELECTRON_SMOKE_DEFAULT_URL: defaultHomeUrl,
      ALGO_ELECTRON_SMOKE_RENDERER_DIST: rendererDist,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      VITE_DEV_SERVER_URL: '',
    })

    assert.ifError(result.error)
    assert.strictEqual(
      result.status,
      0,
      `Packaged app exited with ${result.status}, signal ${result.signal}, timedOut=${result.timedOut}\nRequests:\n${requests.join('\n')}\nLogs:\n${fs.existsSync(path.join(userDataDir, 'logs', 'main.log')) ? fs.readFileSync(path.join(userDataDir, 'logs', 'main.log'), 'utf8') : '(no log file)'}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    )

    const output = `${result.stdout}\n${result.stderr}`
    assert.match(
      output,
      /\[startup-smoke\] ok mainWindow=1 tab=.+ url=http:\/\/127\.0\.0\.1:/,
      `Packaged startup smoke marker missing\n${output}`,
    )

    const databasePath = path.join(userDataDir, 'data', 'algo-learning.sqlite')
    assert.ok(fs.existsSync(databasePath), 'Packaged app did not create its isolated SQLite database')
    assert.ok(fs.statSync(databasePath).size > 0, 'Packaged app created an empty SQLite database')

    console.log('[PASS] Packaged win-unpacked app starts with isolated userData and loads SQLite')
  } finally {
    await new Promise((resolve) => server.close(() => resolve()))
    assert.ok(tempRoot.startsWith(os.tmpdir()), 'Refusing to clean outside the system temp directory')
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
