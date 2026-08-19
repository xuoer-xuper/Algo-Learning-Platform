import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { resetElectronMock, session, webContents } from '../electron/electronMock'
import { configureOjSession } from '../../electron/browser/ojSession'

afterEach(() => {
  resetElectronMock()
  webContents.fromId = () => undefined
})

test('does not install a global CORS response rewriter and preserves HTML stealth injection', async () => {
  const executeJavaScript = vi.fn(async () => undefined)
  webContents.fromId = () => ({ executeJavaScript }) as never
  const ojSession = configureOjSession({ getSiteById: () => null }) as unknown as ReturnType<typeof session.fromPartition>

  assert.strictEqual(ojSession.webRequest.headersReceivedHandler, null)
  assert.ok(ojSession.webRequest.responseStartedHandler)
  ojSession.webRequest.responseStartedHandler?.({
    webContentsId: 42,
    resourceType: 'mainFrame',
    url: 'https://example.com/problem/1',
    responseHeaders: { 'Content-Type': ['text/html; charset=utf-8'] },
  })
  await Promise.resolve()
  assert.strictEqual(executeJavaScript.mock.calls.length, 1)
  assert.match(String(executeJavaScript.mock.calls[0][0]), /navigator/)
})
