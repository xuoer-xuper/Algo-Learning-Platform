import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app, BrowserWindow, session } from 'electron'
import {
  OJ_SUBMISSION_BRIDGE_CHANNEL,
  OJ_SUBMISSION_IPC_CHANNEL,
  OJ_SUBMISSION_TOKEN_CHANNEL,
} from '../../electron/browser/ojBridge'
import {
  handleFromOj,
  onFromOj,
  registerOjWebContents,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender'

// Unit tests cover the submission envelope with a mocked preload, so they cannot
// see whether the real preload actually obtains a document token inside a real
// sandboxed renderer. That gap hid a regression where the token was pushed from
// main on did-navigate and silently lost when the push beat preload setup. This
// smoke drives the shipped ojPreload bundle over the real trusted-sender guard.

const ojPreloadPath = requiredEnvironment('ALGO_OJ_BRIDGE_SMOKE_PRELOAD')
const ORIGIN = 'https://oj-bridge.smoke.invalid'
const documentTokens = new Map<number, string>()
const envelopes: Array<{ webContentsId: number; envelope: unknown }> = []

app.commandLine.appendSwitch('disable-gpu')

interface SmokeSubmission {
  adapterId: string
  submissionId: string
  verdict: string
}

async function runSmoke(): Promise<void> {
  await app.whenReady()

  // checkOjSender only trusts https senders, and enabling
  // --ignore-certificate-errors is forbidden project-wide, so the smoke serves
  // real https origins through per-session protocol interception instead.
  const smokeSession = session.fromPartition(`persist:oj-bridge-smoke-${process.pid}`)
  smokeSession.protocol.handle('https', request => respondWithSmokePage(request.url))
  smokeSession.protocol.handle('http', request => respondWithSmokePage(request.url))

  handleFromOj(OJ_SUBMISSION_TOKEN_CHANNEL, event => issueDocumentToken(event.sender.id))
  onFromOj(OJ_SUBMISSION_IPC_CHANNEL, (event: Electron.IpcMainEvent, envelope: unknown) => {
    envelopes.push({ webContentsId: event.sender.id, envelope })
  })

  const windows: BrowserWindow[] = []
  let stage = 'starting'
  let smokeError: unknown = null
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] OJ submission bridge smoke timed out during: ${stage}`)
    app.exit(1)
  }, 30_000)

  try {
    stage = 'reporting through the exposed bridge at document start'
    const bridgeWindow = createHiddenOjWindow(smokeSession, { registered: true })
    windows.push(bridgeWindow)
    await bridgeWindow.loadURL(`${ORIGIN}/?mode=bridge&id=bridge-1`)
    assert.strictEqual(
      await bridgeWindow.webContents.executeJavaScript('globalThis.__bridgeType'),
      'function',
      'The OJ preload must expose reportSubmission before document-start scripts run',
    )
    const bridgeId = bridgeWindow.webContents.id
    assertEnvelope(await waitForEnvelope(bridgeId), bridgeId, submission('bridge-1'))

    stage = 'reusing the document token after a real navigation'
    // The regression case: main used to rotate and push the token on
    // did-navigate, so a document-start report in the next document raced the
    // push and was dropped for the whole page lifetime.
    const tokenBeforeNavigation = documentTokens.get(bridgeId)
    await bridgeWindow.loadURL(`${ORIGIN}/?mode=bridge&id=bridge-2`)
    assertEnvelope(await waitForEnvelope(bridgeId), bridgeId, submission('bridge-2'))
    assert.strictEqual(
      documentTokens.get(bridgeId),
      tokenBeforeNavigation,
      'The document token must stay stable across navigations in the same webContents',
    )

    stage = 'forwarding a same-window postMessage'
    const postMessageWindow = createHiddenOjWindow(smokeSession, { registered: true })
    windows.push(postMessageWindow)
    await postMessageWindow.loadURL(`${ORIGIN}/?mode=postmessage&id=post-1`)
    const postMessageId = postMessageWindow.webContents.id
    assertEnvelope(await waitForEnvelope(postMessageId), postMessageId, submission('post-1'))

    stage = 'forwarding a child-frame postMessage'
    // frontendVerdictHook posts cross-origin to window.top with '*' on vjudge,
    // so the forwarder must accept descendant frames, not just the top window.
    const frameWindow = createHiddenOjWindow(smokeSession, { registered: true })
    windows.push(frameWindow)
    await frameWindow.loadURL(`${ORIGIN}/?mode=iframe&id=frame-1`)
    const frameId = frameWindow.webContents.id
    assertEnvelope(await waitForEnvelope(frameId), frameId, submission('frame-1'))

    // The two negative stages below make the guard throw inside ipcMain.handle,
    // and Electron logs each rejection to stderr. Those lines are expected.
    console.log('[oj-bridge-smoke] expecting 4 "Rejected IPC sender" log lines from the negative stages')

    stage = 'refusing to mint a token for an unregistered webContents'
    const unregisteredWindow = createHiddenOjWindow(smokeSession, { registered: false })
    windows.push(unregisteredWindow)
    await unregisteredWindow.loadURL(`${ORIGIN}/?mode=bridge&id=unregistered-1`)
    await assertNoEnvelope(unregisteredWindow.webContents.id)
    assert.strictEqual(
      documentTokens.has(unregisteredWindow.webContents.id),
      false,
      'An unregistered webContents must never be issued a document token',
    )

    stage = 'refusing to mint a token for a plain http document'
    const insecureWindow = createHiddenOjWindow(smokeSession, { registered: true })
    windows.push(insecureWindow)
    await insecureWindow.loadURL('http://oj-bridge.smoke.invalid/?mode=bridge&id=insecure-1')
    await assertNoEnvelope(insecureWindow.webContents.id)
    assert.strictEqual(
      documentTokens.has(insecureWindow.webContents.id),
      false,
      'A non-https OJ document must never be issued a document token',
    )

    console.log('[PASS] OJ submission bridge Electron smoke')
  }
  catch (error) {
    smokeError = error
    console.error('[FAIL] OJ submission bridge Electron smoke', error)
  }
  finally {
    clearTimeout(watchdog)
    for (const window of windows) window.destroy()
    resetTrustedSenderRegistry()
    app.exit(smokeError ? 1 : 0)
  }
}

void runSmoke()

function createHiddenOjWindow(
  targetSession: Electron.Session,
  options: { registered: boolean },
): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: targetSession,
      preload: ojPreloadPath,
      // Mirrors TabManager.createView: remote OJ pages stay fully sandboxed.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  if (options.registered) registerOjWebContents(window.webContents)
  return window
}

function issueDocumentToken(webContentsId: number): string {
  const existing = documentTokens.get(webContentsId)
  if (existing) return existing
  const token = randomBytes(16).toString('hex')
  documentTokens.set(webContentsId, token)
  return token
}

function submission(submissionId: string): SmokeSubmission {
  return { adapterId: 'smoke', submissionId, verdict: 'Accepted' }
}

function respondWithSmokePage(rawUrl: string): Response {
  const url = new URL(rawUrl)
  const mode = url.searchParams.get('mode') ?? 'blank'
  const submissionId = url.searchParams.get('id') ?? 'unknown'
  return new Response(smokePage(mode, submissionId), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function smokePage(mode: string, submissionId: string): string {
  const payload = JSON.stringify(submission(submissionId))
  const message = `{ channel: ${JSON.stringify(OJ_SUBMISSION_BRIDGE_CHANNEL)}, payload: ${payload} }`
  const head = mode === 'bridge'
    ? `globalThis.__bridgeType = typeof window[${JSON.stringify(OJ_SUBMISSION_BRIDGE_CHANNEL)}]?.reportSubmission;
       window[${JSON.stringify(OJ_SUBMISSION_BRIDGE_CHANNEL)}].reportSubmission(${payload});`
    : mode === 'postmessage'
      ? `window.postMessage(${message}, '*');`
      : mode === 'iframe-child'
        ? `window.top.postMessage(${message}, '*');`
        : ''
  const body = mode === 'iframe'
    ? `<iframe src="/?mode=iframe-child&id=${encodeURIComponent(submissionId)}"></iframe>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>OJ bridge smoke</title>`
    + `<script>${head}</script></head><body>${body}</body></html>`
}

function assertEnvelope(envelope: unknown, webContentsId: number, expectedPayload: SmokeSubmission): void {
  assert.ok(
    envelope !== null && typeof envelope === 'object' && !Array.isArray(envelope),
    'The submission envelope must be a plain object',
  )
  const record = envelope as Record<string, unknown>
  // Mirrors parseSubmissionEnvelope in RealtimeSubmissionService: exactly two
  // keys, a 32-hex token and the untouched payload.
  assert.deepStrictEqual(Object.keys(record).sort(), ['payload', 'token'])
  assert.strictEqual(record.token, documentTokens.get(webContentsId))
  assert.deepStrictEqual(record.payload, expectedPayload)
}

async function waitForEnvelope(webContentsId: number): Promise<unknown> {
  await waitFor(() => envelopes.some(entry => entry.webContentsId === webContentsId))
  const index = envelopes.findIndex(entry => entry.webContentsId === webContentsId)
  return envelopes.splice(index, 1)[0].envelope
}

async function assertNoEnvelope(webContentsId: number): Promise<void> {
  // Two grace periods: the preload retries the token pull once before giving up.
  await new Promise(resolve => setTimeout(resolve, 750))
  assert.strictEqual(
    envelopes.some(entry => entry.webContentsId === webContentsId),
    false,
    `Expected no submission envelope from webContents ${webContentsId}`,
  )
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for the OJ submission bridge smoke condition')
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}
