import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { registerOjWebContents, resetTrustedSenderRegistry } from '../../electron/ipc/trustedSender'
import { installUserScriptRuntimeBridge } from '../../electron/scripts/userScriptRuntimeBridge'
import type { UserScriptRuntimeScriptSnapshot } from '../../electron/scripts/userScriptRuntimeProtocol'

const userscriptPreloadPath = requiredEnvironment('ALGO_USERSCRIPT_SMOKE_PRELOAD')
const ordinaryPreloadPath = requiredEnvironment('ALGO_USERSCRIPT_SMOKE_ORDINARY_PRELOAD')
const nonce = 'algo-smoke'
const stageFile = path.join(process.cwd(), 'tmp', `userscript-runtime-smoke-${process.pid}.log`)
const catalogPreloadPath = path.join(process.cwd(), 'tmp', `userscript-runtime-catalog-${process.pid}.mjs`)
function recordStage(value: string): void {
  fs.mkdirSync(path.dirname(stageFile), { recursive: true })
  fs.appendFileSync(stageFile, `${new Date().toISOString()} ${value}\n`, 'utf8')
}
recordStage('module-loaded')

app.commandLine.appendSwitch('disable-gpu')

class SmokeRuntime {
  generation = 1
  raceSnapshotGeneration: number | null = null
  private listener: ((generation: number) => void) | null = null

  getNavigationSnapshot(rawUrl: string, isMainFrame: boolean) {
    const url = new URL(rawUrl)
    if (url.pathname === '/race') this.raceSnapshotGeneration = this.generation
    let scripts: UserScriptRuntimeScriptSnapshot[] = []
    if (url.pathname === '/main' || url.pathname === '/frame') {
      scripts = [
        smokeScript('start', 'document-start', "globalThis.__runtimeOrder ??= []; globalThis.__runtimeOrder.push('userscript-start:' + document.readyState)"),
        smokeScript('end', 'document-end', "globalThis.__runtimeOrder.push('userscript-end:' + document.readyState)"),
        smokeScript('idle', 'document-idle', "globalThis.__runtimeOrder.push('userscript-idle:' + document.readyState)"),
        ...(isMainFrame ? [smokeScript('noframes', 'document-start', 'globalThis.__noframesRuns = (globalThis.__noframesRuns || 0) + 1')] : []),
      ]
    }
    else if (url.pathname === '/spa-matched') {
      scripts = [smokeScript('spa', 'document-start', 'globalThis.__spaRuns = (globalThis.__spaRuns || 0) + 1')]
    }
    else if (url.pathname === '/race') {
      const version = this.generation === 1 ? 'v1' : 'v2'
      scripts = [
        smokeScript(`race-start-${version}`, 'document-start', `globalThis.__raceRuns ??= []; globalThis.__raceRuns.push('${version}-start')`),
        smokeScript(`race-end-${version}`, 'document-end', `globalThis.__raceRuns.push('${version}-end')`),
        smokeScript(`race-idle-${version}`, 'document-idle', `globalThis.__raceRuns.push('${version}-idle')`),
      ]
    }
    return { generation: this.generation, scripts }
  }

  getCatalogSnapshot() {
    return {
      generation: this.generation,
      scripts: [
        smokeScript('start', 'document-start', "globalThis.__runtimeOrder ??= []; globalThis.__runtimeOrder.push('userscript-start:' + document.readyState)"),
        smokeScript('end', 'document-end', "globalThis.__runtimeOrder.push('userscript-end:' + document.readyState)"),
        smokeScript('idle', 'document-idle', "globalThis.__runtimeOrder.push('userscript-idle:' + document.readyState)"),
        smokeScript('noframes', 'document-start', 'globalThis.__noframesRuns = (globalThis.__noframesRuns || 0) + 1'),
        smokeScript('spa', 'document-start', 'globalThis.__spaRuns = (globalThis.__spaRuns || 0) + 1'),
        smokeScript('race-start-v1', 'document-start', "globalThis.__raceRuns ??= []; globalThis.__raceRuns.push('v1-start')"),
        smokeScript('race-end-v1', 'document-end', "globalThis.__raceRuns.push('v1-end')"),
        smokeScript('race-idle-v1', 'document-idle', "globalThis.__raceRuns.push('v1-idle')"),
        smokeScript('race-start-v2', 'document-start', "globalThis.__raceRuns ??= []; globalThis.__raceRuns.push('v2-start')"),
        smokeScript('race-end-v2', 'document-end', "globalThis.__raceRuns.push('v2-end')"),
        smokeScript('race-idle-v2', 'document-idle', "globalThis.__raceRuns.push('v2-idle')"),
      ],
    }
  }

  addGenerationChangeListener(listener: (generation: number) => void): () => void {
    this.listener = listener
    return () => { this.listener = null }
  }

  advanceGeneration(): void {
    this.generation += 1
    this.listener?.(this.generation)
  }

  setValue(): void { /* no privileged APIs are used by this smoke */ }
  deleteValue(): void { /* no privileged APIs are used by this smoke */ }
}

async function runSmoke(): Promise<void> {
recordStage('waiting-for-ready')
await app.whenReady()
recordStage('ready')
const runtime = new SmokeRuntime()
const smokeSession = session.fromPartition(`persist:userscript-runtime-smoke-${process.pid}`)
const bridge = installUserScriptRuntimeBridge({
  runtime: runtime as never,
  session: smokeSession,
  preloadPath: userscriptPreloadPath,
  catalogPreloadPath,
  allowInsecureLocalhost: true,
})
const serverState: { heldScriptResponse: ServerResponse | null; holdFirstRace: boolean } = {
  heldScriptResponse: null,
  holdFirstRace: true,
}
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  response.setHeader('content-security-policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'`)
  response.setHeader('content-type', 'text/html; charset=utf-8')
  if (url.pathname === '/hold.js' && serverState.holdFirstRace) {
    serverState.holdFirstRace = false
    serverState.heldScriptResponse = response
    return
  }
  if (url.pathname === '/hold.js') {
    response.setHeader('content-type', 'application/javascript; charset=utf-8')
    response.end('globalThis.__raceRuns.push("page-script")')
    return
  }
  if (url.pathname === '/main') {
    response.end(page(`
      <script nonce="${nonce}">
        globalThis.__runtimeOrder ??= [];
        globalThis.__runtimeOrder.push('inline:' + document.readyState);
        globalThis.__capturedPortCount = 0;
        addEventListener('message', event => { globalThis.__capturedPortCount += event.ports.length; });
        addEventListener('DOMContentLoaded', () => globalThis.__runtimeOrder.push('page-dom-content'));
        addEventListener('load', () => globalThis.__runtimeOrder.push('page-load'));
      </script>
      <iframe src="/frame"></iframe>
    `))
    return
  }
  if (url.pathname === '/frame') {
    response.end(page(`<script nonce="${nonce}">globalThis.__runtimeOrder ??= []; globalThis.__runtimeOrder.push('inline:' + document.readyState)</script>`))
    return
  }
  if (url.pathname === '/race') {
    response.write(pageStart(`<script nonce="${nonce}">globalThis.__raceRuns ??= []; globalThis.__raceRuns.push('inline-before-hold')</script><script src="/hold.js"></script>`))
    response.end('</body></html>')
    return
  }
  response.end(page(`<script nonce="${nonce}">globalThis.__spaRuns = globalThis.__spaRuns || 0</script>`))
})

const windows: BrowserWindow[] = []
let stage = 'starting server'
let smokeError: unknown = null
const watchdog = setTimeout(() => {
  recordStage(`watchdog:${stage}`)
  console.error(`[FAIL] Userscript runtime Electron smoke timed out during: ${stage}`)
  app.exit(1)
}, 30_000)
try {
  stage = 'loading main frame and iframe'
  recordStage(stage)
  const origin = await listen(server)
  const mainWindow = createHiddenWindow(smokeSession)
  windows.push(mainWindow)
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    recordStage(`console:${level}:${message}`)
    console.error(`[userscript-smoke-console] ${level}: ${message}`)
  })
  await mainWindow.loadURL(`${origin}/main`)
  const mainResult = await mainWindow.webContents.executeJavaScript(`({
    order: globalThis.__runtimeOrder,
    noframesRuns: globalThis.__noframesRuns,
    capturedPortCount: globalThis.__capturedPortCount,
  })`) as { order: string[]; noframesRuns: number; capturedPortCount: number }
  assertOrder(mainResult.order, [
    'ordinary-preload',
    'userscript-start:loading',
    'inline:loading',
    'userscript-end:interactive',
    'page-dom-content',
    'page-load',
    'userscript-idle:complete',
  ])
  assert.strictEqual(mainResult.noframesRuns, 1)
  assert.strictEqual(mainResult.capturedPortCount, 0)

  const childFrame = mainWindow.webContents.mainFrame.framesInSubtree.find(frame => frame !== mainWindow.webContents.mainFrame)
  assert.ok(childFrame, 'Expected the same-origin smoke iframe')
  const frameResult = await childFrame.executeJavaScript(`({
    order: globalThis.__runtimeOrder,
    noframesRuns: globalThis.__noframesRuns,
  })`) as { order: string[]; noframesRuns?: number }
  recordStage(`frame-result:${JSON.stringify(frameResult)}`)
  // Electron 43 does not run session.registerPreloadScript({ type: 'frame' })
  // in ordinary iframe documents; retain the child-frame bridge coverage in
  // unit tests and record this runtime limitation as best-effort.
  assert.ok(frameResult.order.includes('inline:loading'))
  assert.strictEqual(frameResult.noframesRuns, undefined)

  stage = 'syncing SPA matches'
  recordStage(stage)
  const spaWindow = createHiddenWindow(smokeSession)
  windows.push(spaWindow)
  await spaWindow.loadURL(`${origin}/spa-unmatched`)
  assert.strictEqual(await spaWindow.webContents.executeJavaScript('globalThis.__spaRuns'), 0)
  await spaWindow.webContents.executeJavaScript("history.pushState({}, '', '/spa-matched')")
  await waitFor(async () => await spaWindow.webContents.executeJavaScript('globalThis.__spaRuns') === 1)
  await spaWindow.webContents.executeJavaScript("history.pushState({}, '', '/spa-unmatched'); history.pushState({}, '', '/spa-matched')")
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.strictEqual(await spaWindow.webContents.executeJavaScript('globalThis.__spaRuns'), 1)

  stage = 'invalidating a delayed document'
  recordStage(stage)
  const raceWindow = createHiddenWindow(smokeSession)
  windows.push(raceWindow)
  const firstRaceLoad = raceWindow.loadURL(`${origin}/race`)
  try {
    await waitFor(async () => (
      serverState.heldScriptResponse !== null
      && runtime.raceSnapshotGeneration === 1
    ))
  }
  catch (error) {
    recordStage('race-wait-failed')
    throw error
  }
  runtime.advanceGeneration()
  serverState.heldScriptResponse?.end('globalThis.__raceRuns.push("page-script")')
  serverState.heldScriptResponse = null
  await firstRaceLoad
  assert.deepStrictEqual(
    await raceWindow.webContents.executeJavaScript('globalThis.__raceRuns'),
    ['v1-start', 'inline-before-hold', 'page-script'],
  )

  stage = 'reloading the document with the new generation'
  recordStage(stage)
  await new Promise<void>((resolve) => {
    raceWindow.webContents.once('did-finish-load', () => resolve())
    raceWindow.reload()
  })
  assert.deepStrictEqual(
    await raceWindow.webContents.executeJavaScript('globalThis.__raceRuns'),
    ['v2-start', 'inline-before-hold', 'page-script', 'v2-end', 'v2-idle'],
  )
  console.log('[PASS] Userscript runtime Electron smoke')
}
catch (error) {
  recordStage(`error:${error instanceof Error ? error.message : String(error)}`)
  smokeError = error
  console.error('[FAIL] Userscript runtime Electron smoke', error)
}
finally {
  recordStage('cleanup')
  clearTimeout(watchdog)
  for (const window of windows) window.destroy()
  bridge.dispose()
  resetTrustedSenderRegistry()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  app.exit(smokeError ? 1 : 0)
}
}

void runSmoke()

function createHiddenWindow(targetSession: Electron.Session): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: targetSession,
      preload: ordinaryPreloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  registerOjWebContents(window.webContents)
  return window
}

function smokeScript(
  id: string,
  runAt: UserScriptRuntimeScriptSnapshot['runAt'],
  code: string,
): UserScriptRuntimeScriptSnapshot {
  return {
    id,
    revision: `${id}-revision`,
    name: id,
    namespace: null,
    description: null,
    version: '1.0.0',
    runAt,
    grants: [],
    connects: [],
    values: [],
    code,
  }
}

function page(body: string): string {
  return `${pageStart(body)}</body></html>`
}

function pageStart(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}`
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for the userscript runtime smoke condition')
}

function assertOrder(actual: string[], expected: string[]): void {
  let previous = -1
  for (const item of expected) {
    const index = actual.indexOf(item)
    assert.ok(index > previous, `Expected ${item} after ${expected[Math.max(0, expected.indexOf(item) - 1)]}; got ${actual.join(', ')}`)
    previous = index
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}
