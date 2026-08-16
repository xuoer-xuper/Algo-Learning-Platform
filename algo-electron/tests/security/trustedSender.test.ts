import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import {
  MockWebContents,
  MockWebFrame,
  protocolHandlers,
  protocolSchemes,
  resetElectronMock,
} from 'electron'
import {
  SHELL_CSP,
  registerShellSchemeAsPrivileged,
  registerShellProtocol,
  resetShellProtocolForTests,
  resolveShellAsset,
  shellUrl,
} from '../../electron/app/appProtocol.ts'
import {
  checkIpcPayload,
  checkOjSender,
  checkShellSender,
  registerOjWebContents,
  registerShellWebContents,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender.ts'

function eventFor(sender: MockWebContents, senderFrame: MockWebFrame = sender.mainFrame) {
  return { sender, senderFrame } as never
}

test('app shell protocol is privileged, origin-stable, CSP-bound, and traversal-safe', async () => {
  resetElectronMock()
  resetShellProtocolForTests()
  registerShellSchemeAsPrivileged()

  assert.strictEqual(shellUrl(), 'app://shell/index.html')
  assert.match(SHELL_CSP, /default-src 'self'/)
  assert.match(SHELL_CSP, /object-src 'none'/)
  assert.match(SHELL_CSP, /frame-ancestors 'none'/)
  assert.ok(JSON.stringify(protocolSchemes).includes('supportFetchAPI'))

  const root = path.resolve('dist')
  assert.strictEqual(resolveShellAsset(root, 'app://shell/assets/index.js'), path.join(root, 'assets', 'index.js'))
  assert.strictEqual(resolveShellAsset(root, 'app://other/index.html'), null)
  assert.strictEqual(resolveShellAsset(root, 'app://shell/%2e%2e%2fpackage.json'), null)

  const rendererDist = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-shell-protocol-'))
  try {
    fs.writeFileSync(path.join(rendererDist, 'index.html'), '<!doctype html><title>shell</title>', 'utf8')
    registerShellProtocol(rendererDist)
    const handler = protocolHandlers.get('app') as ((request: { url: string }) => Promise<Response>) | undefined
    assert.ok(handler)
    const response = await handler({ url: 'app://shell/index.html' })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.headers.get('content-security-policy'), SHELL_CSP)
  } finally {
    fs.rmSync(rendererDist, { recursive: true, force: true })
  }
})

test('trusted shell sender rejects remote views, iframes, forged origins, and non-local dev origins', async () => {
  resetTrustedSenderRegistry()
  const originalDevUrl = process.env.VITE_DEV_SERVER_URL

  try {
    const shell = new MockWebContents()
    await shell.loadURL('app://shell/index.html')
    registerShellWebContents(shell)
    assert.strictEqual(checkShellSender(eventFor(shell)).trusted, true)

    const remote = new MockWebContents()
    await remote.loadURL('https://codeforces.com/problemset')
    assert.deepStrictEqual(checkShellSender(eventFor(remote)), { trusted: false, reason: 'sender' })

    const iframe = new MockWebFrame()
    iframe.url = 'app://shell/index.html'
    assert.deepStrictEqual(checkShellSender(eventFor(shell, iframe)), { trusted: false, reason: 'frame' })

    const forged = new MockWebContents()
    await forged.loadURL('https://evil.example/')
    registerShellWebContents(forged)
    forged.mainFrame.url = 'app://shell/index.html'
    assert.deepStrictEqual(checkShellSender(eventFor(forged)), { trusted: false, reason: 'origin' })

    process.env.VITE_DEV_SERVER_URL = 'https://evil.example:5173'
    const evilDev = new MockWebContents()
    await evilDev.loadURL('https://evil.example:5173/')
    registerShellWebContents(evilDev)
    assert.strictEqual(checkShellSender(eventFor(evilDev)).trusted, false)

    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'
    const localDev = new MockWebContents()
    await localDev.loadURL('http://localhost:5173/')
    registerShellWebContents(localDev)
    assert.strictEqual(checkShellSender(eventFor(localDev)).trusted, true)
  } finally {
    if (originalDevUrl === undefined) delete process.env.VITE_DEV_SERVER_URL
    else process.env.VITE_DEV_SERVER_URL = originalDevUrl
  }
})

test('OJ sender validator and payload guard fail closed', async () => {
  resetTrustedSenderRegistry()
  const oj = new MockWebContents()
  await oj.loadURL('https://leetcode.cn/problems/two-sum/')
  registerOjWebContents(oj)
  assert.strictEqual(checkOjSender(eventFor(oj)).trusted, true)

  await oj.loadURL('http://localhost:3000/')
  assert.deepStrictEqual(checkOjSender(eventFor(oj)), { trusted: false, reason: 'origin' })

  assert.strictEqual(checkIpcPayload([{ adapterId: 'leetcode-cn', result: { status: 'Accepted' } }]).trusted, true)
  assert.deepStrictEqual(checkIpcPayload([Number.NaN]), { trusted: false, reason: 'payload' })
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.deepStrictEqual(checkIpcPayload([cyclic]), { trusted: false, reason: 'payload' })
})
