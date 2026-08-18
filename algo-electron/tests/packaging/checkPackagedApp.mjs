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
  fs.writeFileSync(path.join(webRoot, 'legacy-home.html'), '<!doctype html><html><body><h1>packaged-home-ready</h1></body></html>')
  fs.writeFileSync(path.join(webRoot, 'popup-get.html'), '<!doctype html><html><body><h1>popup-get-ready</h1></body></html>')
  fs.writeFileSync(path.join(webRoot, 'popup-oauth.html'), '<!doctype html><html><body><h1>popup-oauth-ready</h1><script>window.opener?.postMessage("oauth-complete", location.origin)</script></body></html>')
}

async function startSmokeServer(webRoot) {
  const requests = []
  let releaseLegacyHome
  const legacyHomeGate = new Promise((resolve) => { releaseLegacyHome = resolve })
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

    const sendFile = () => {
      if (response.destroyed) return
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(fs.readFileSync(filePath))
    }
    if (request.method === 'GET' && requestUrl.pathname === '/legacy-home.html') {
      void legacyHomeGate.then(sendFile)
      return
    }
    sendFile()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    releaseLegacyHome: () => releaseLegacyHome(),
  }
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function startPackagedApp(env, timeoutMs = 45_000) {
  const child = spawn(executable, [], {
    cwd: releaseDir,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const startedAt = Date.now()
  let stdout = ''
  let stderr = ''
  let finished = false
  let timedOut = false

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

  const result = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    const finish = (value) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      resolve({
        ...value,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      })
    }

    child.once('error', (error) => {
      finish({ error, status: null, signal: null })
    })
    child.once('close', (status, signal) => {
      finish({ error: null, status, signal })
    })
  })

  return {
    child,
    result,
    async waitForOutput(marker, waitTimeoutMs = 15_000) {
      const deadline = Date.now() + waitTimeoutMs
      while (Date.now() <= deadline) {
        const output = `${stdout}\n${stderr}`
        if (output.includes(marker)) return
        if (finished) throw new Error(`Packaged app exited before output marker ${marker}\n${output}`)
        await delay(25)
      }
      throw new Error(`Timed out waiting for packaged app output marker ${marker}\n${stdout}\n${stderr}`)
    },
    async stop() {
      if (!finished) child.kill()
      if (finished) return result
      return Promise.race([
        result,
        delay(5_000).then(() => {
          throw new Error(`Timed out stopping packaged app pid=${child.pid ?? 'unknown'}`)
        }),
      ])
    },
  }
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-packaged-smoke-'))
  const userDataDir = path.join(tempRoot, 'user-data')
  const webRoot = path.join(tempRoot, 'web')
  const rendererDist = path.join(tempRoot, 'renderer-dist')
  fs.mkdirSync(userDataDir)
  writeSmokePages(webRoot, rendererDist)
  const { server, origin, requests, releaseLegacyHome } = await startSmokeServer(webRoot)
  const legacyHomeUrl = `${origin}/legacy-home.html`
  const logFile = path.join(userDataDir, 'logs', 'main.log')
  let primary = null
  let secondary = null

  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ defaultHomeUrl: legacyHomeUrl }, null, 2),
  )

  try {
    const smokeEnv = {
      ...process.env,
      ALGO_ELECTRON_SMOKE: '1',
      ALGO_ELECTRON_SMOKE_USER_DATA: userDataDir,
      ALGO_ELECTRON_SMOKE_LEGACY_HOME_URL: legacyHomeUrl,
      ALGO_ELECTRON_SMOKE_RENDERER_DIST: rendererDist,
      ALGO_ELECTRON_LOG_STDERR: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      VITE_DEV_SERVER_URL: '',
    }

    primary = startPackagedApp(smokeEnv)
    await primary.waitForOutput('[startup-smoke] step shell-loaded')
    assert.strictEqual(primary.child.exitCode, null, 'Primary packaged app exited before the second launch')
    assert.strictEqual(primary.child.signalCode, null, 'Primary packaged app was terminated before the second launch')

    secondary = startPackagedApp(smokeEnv, 10_000)
    const secondaryResult = await secondary.result
    assert.ifError(secondaryResult.error)
    assert.strictEqual(
      secondaryResult.status,
      0,
      `Second packaged instance exited with ${secondaryResult.status}, signal ${secondaryResult.signal}, timedOut=${secondaryResult.timedOut}\nSTDOUT:\n${secondaryResult.stdout}\nSTDERR:\n${secondaryResult.stderr}`,
    )
    assert.strictEqual(secondaryResult.timedOut, false, 'Second packaged instance did not exit promptly')
    assert.ok(secondaryResult.durationMs < 10_000, `Second packaged instance took ${secondaryResult.durationMs}ms to exit`)
    assert.match(
      `${secondaryResult.stdout}\n${secondaryResult.stderr}`,
      /app\.single-instance-denied/,
      'Second packaged instance did not report the denied single-instance lock',
    )
    assert.strictEqual(primary.child.exitCode, null, 'Primary packaged app exited after the second launch')
    assert.strictEqual(primary.child.signalCode, null, 'Primary packaged app was terminated after the second launch')

    releaseLegacyHome()
    const result = await primary.result

    assert.ifError(result.error)
    assert.strictEqual(
      result.status,
      0,
      `Packaged app exited with ${result.status}, signal ${result.signal}, timedOut=${result.timedOut}\nRequests:\n${requests.join('\n')}\nLogs:\n${fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '(no log file)'}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    )

    const output = `${result.stdout}\n${result.stderr}`
    assert.match(
      output,
      /\[startup-smoke\] ok mainWindow=1 tab=.+ url=http:\/\/127\.0\.0\.1:/,
      `Packaged startup smoke marker missing\n${output}`,
    )
    assert.match(output, /app\.second-instance-focused/, 'Primary packaged app did not focus its window')

    const migratedConfig = JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf8'))
    assert.deepStrictEqual(migratedConfig.homeShortcuts, [legacyHomeUrl])
    assert.strictEqual(Object.hasOwn(migratedConfig, 'defaultHomeUrl'), false)

    const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
    assert.match(logText, /app\.single-instance-acquired/, 'Primary single-instance acquisition was not logged')
    assert.match(logText, /app\.second-instance-focused/, 'Primary second-instance focus was not logged')
    assert.doesNotMatch(logText, /app\.single-instance-denied/, 'Losing instance wrote to the shared log')

    const databasePath = path.join(userDataDir, 'data', 'algo-learning.sqlite')
    assert.ok(fs.existsSync(databasePath), 'Packaged app did not create its isolated SQLite database')
    assert.ok(fs.statSync(databasePath).size > 0, 'Packaged app created an empty SQLite database')

    console.log('[PASS] Packaged win-unpacked app enforces one instance, focuses the primary window, and loads SQLite')
  } finally {
    releaseLegacyHome()
    await Promise.allSettled([
      primary?.stop(),
      secondary?.stop(),
    ].filter(Boolean))
    await new Promise((resolve) => server.close(() => resolve()))
    assert.ok(tempRoot.startsWith(os.tmpdir()), 'Refusing to clean outside the system temp directory')
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
