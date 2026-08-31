import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { resetElectronMock, session, webContents } from '../electron/electronMock'
import { configureOjSession } from '../../electron/browser/ojSession'

afterEach(() => {
  resetElectronMock()
  webContents.fromId = () => undefined
})

/**
 * 替身要带上它所替代的签名。
 *
 * 原先写的是 `vi.fn(async () => undefined)`，形参是空的，`mock.calls` 于是被推成 `[][]`，
 * 读 `calls[0][0]` 报 "Tuple type '[]' of length '0' has no element at index '0'"——
 * 也就是说这几处断言一直在对类型上并不存在的位置取值。标上真实签名之后
 * `calls[0][0]` 是 string、`calls[0][1]` 是 `boolean | undefined`，下标写错会当场报错。
 */
const createExecuteJavaScriptSpy = () => vi.fn(async (_code: string, _userGesture?: boolean) => undefined)

test('does not install a global CORS response rewriter and preserves HTML stealth injection', async () => {
  const executeJavaScript = createExecuteJavaScriptSpy()
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

test('injects the realtime hook before page scripts run and pins the top page url', async () => {
  const executeJavaScript = createExecuteJavaScriptSpy()
  webContents.fromId = () => ({ executeJavaScript }) as never
  const ojSession = configureOjSession({ getSiteById: () => null }) as unknown as ReturnType<typeof session.fromPartition>

  const url = 'https://codeforces.com/problemset/problem/1900/A'
  ojSession.webRequest.responseStartedHandler?.({
    webContentsId: 42,
    resourceType: 'mainFrame',
    url,
    responseHeaders: { 'Content-Type': ['text/html; charset=utf-8'] },
  })
  await Promise.resolve()

  // Some OJ bundles capture fetch/XMLHttpRequest while their modules start up,
  // so a hook that waits for dom-ready is already too late. The response-started
  // hook is the last point that still runs ahead of page scripts.
  const hookCall = executeJavaScript.mock.calls.find(call => String(call[0]).includes('__ALGO_TOP_PAGE_URL'))
  assert.ok(hookCall, 'A realtime adapter page must get its hook injected at response time')
  // The adapter gates on the top document url, and an iframe reading
  // location.href there would resolve to the frame instead.
  assert.match(String(hookCall[0]), /window\.__ALGO_TOP_PAGE_URL = "https:\/\/codeforces\.com\/problemset\/problem\/1900\/A"/)
  assert.strictEqual(hookCall[1], true, 'Early injection has to land in the main world to be visible to page scripts')
})

test('honours a disabled site and ignores pages without a realtime adapter', async () => {
  const executeJavaScript = createExecuteJavaScriptSpy()
  webContents.fromId = () => ({ executeJavaScript }) as never
  const disabled = configureOjSession({ getSiteById: () => ({ enabled: false }) }) as unknown as ReturnType<typeof session.fromPartition>

  disabled.webRequest.responseStartedHandler?.({
    webContentsId: 42,
    resourceType: 'mainFrame',
    url: 'https://codeforces.com/problemset/problem/1900/A',
    responseHeaders: { 'Content-Type': ['text/html; charset=utf-8'] },
  })
  await Promise.resolve()
  assert.ok(
    !executeJavaScript.mock.calls.some(call => String(call[0]).includes('__ALGO_TOP_PAGE_URL')),
    'Disabling a site must also stop early injection, not just the tab-level hook',
  )

  executeJavaScript.mockClear()
  const enabled = configureOjSession({ getSiteById: () => null }) as unknown as ReturnType<typeof session.fromPartition>
  enabled.webRequest.responseStartedHandler?.({
    webContentsId: 42,
    resourceType: 'mainFrame',
    url: 'https://example.com/problem/1',
    responseHeaders: { 'Content-Type': ['text/html; charset=utf-8'] },
  })
  await Promise.resolve()
  assert.ok(
    !executeJavaScript.mock.calls.some(call => String(call[0]).includes('__ALGO_TOP_PAGE_URL')),
    'Unsupported hosts must not receive realtime hooks',
  )
})
