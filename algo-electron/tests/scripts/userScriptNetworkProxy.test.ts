import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { UserScriptNetworkProxy } from '../../electron/scripts/UserScriptNetworkProxy'
import {
  USER_SCRIPT_RUNTIME_MAX_RESPONSE_BYTES,
  type UserScriptRuntimeEvent,
} from '../../electron/scripts/userScriptRuntimeProtocol'

const context = {
  scriptId: 'script-1',
  scriptName: 'Ratings helper',
  frameUrl: 'https://codeforces.com/problemset/problem/1/A',
  connects: ['api.example.com', 'cdn.example.net'],
  webContentsId: 42,
}

const details = {
  method: 'GET',
  url: 'https://api.example.com/start',
  headers: { Authorization: 'Bearer secret', Accept: 'application/json' },
  data: null,
  responseType: 'json' as const,
  timeout: 0,
  anonymous: false,
}

afterEach(() => {
  vi.useRealTimers()
})

test('checks and persists authorization for the initial URL and every redirect hop', async () => {
  const permissions = new Set<string>()
  const requested: string[] = []
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url)
    if (target === 'https://api.example.com/start') {
      return new Response(null, { status: 302, headers: { location: 'https://cdn.example.net/result' } })
    }
    assert.strictEqual((init?.headers as Record<string, string>).Authorization, undefined)
    return new Response('{"rating":1900}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'secret=1' },
    })
  })
  const events: UserScriptRuntimeEvent[] = []
  const proxy = new UserScriptNetworkProxy({
    fetch: fetch as never,
    hasPermission: (_scriptId, host) => permissions.has(host),
    requestPermission: async (_requestContext, target) => {
      requested.push(target.permissionHost)
      permissions.add(target.permissionHost)
      return true
    },
    markPermissionUsed: vi.fn(() => true),
  })

  proxy.start('port:request-1', context, 'request-1', details, event => events.push(event))
  await vi.waitFor(() => assert.ok(events.some(event => event.type === 'xhr:complete')))
  assert.deepStrictEqual(requested, ['api.example.com', 'cdn.example.net'])
  assert.strictEqual(fetch.mock.calls.length, 2)
  const completed = events.find(event => event.type === 'xhr:complete')
  assert.ok(completed?.type === 'xhr:complete')
  assert.strictEqual(completed.response.finalUrl, 'https://cdn.example.net/result')
  assert.strictEqual(completed.response.responseHeaders.includes('set-cookie'), false)
  assert.strictEqual(new TextDecoder().decode(completed.response.body), '{"rating":1900}')
})

test('fails closed before fetching an undeclared initial or redirect target', async () => {
  const fetch = vi.fn(async () => new Response(null, {
    status: 302,
    headers: { location: 'https://attacker.test/collect' },
  }))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = new UserScriptNetworkProxy({
    fetch: fetch as never,
    hasPermission: () => true,
    requestPermission: async () => true,
    markPermissionUsed: () => true,
  })

  proxy.start('port:request-1', context, 'request-1', details, event => events.push(event))
  await vi.waitFor(() => assert.ok(events.some(event => event.type === 'xhr:failed')))
  assert.deepStrictEqual(events.at(-1), { type: 'xhr:failed', requestId: 'request-1', reason: 'denied' })
  assert.strictEqual(fetch.mock.calls.length, 1)
})

test('aborts active requests and reports abort without exposing the internal error', async () => {
  const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = new UserScriptNetworkProxy({
    fetch: fetch as never,
    hasPermission: () => true,
    requestPermission: async () => true,
    markPermissionUsed: () => true,
  })
  proxy.start('port:request-1', context, 'request-1', details, event => events.push(event))
  await vi.waitFor(() => assert.strictEqual(fetch.mock.calls.length, 1))
  assert.strictEqual(proxy.abort('port:request-1'), true)
  await vi.waitFor(() => assert.deepStrictEqual(events.at(-1), {
    type: 'xhr:failed', requestId: 'request-1', reason: 'abort',
  }))
})

test('filters browser-owned and security-sensitive request headers', async () => {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    assert.deepStrictEqual(init?.headers, {
      Accept: 'application/json',
      Authorization: 'Bearer secret',
      'X-Userscript': 'allowed',
    })
    return new Response('ok')
  })
  const events: UserScriptRuntimeEvent[] = []
  const proxy = createAllowedProxy(fetch)

  proxy.start('port\u0000script\u0000headers', context, 'headers', {
    ...details,
    headers: {
      ...details.headers,
      Referer: 'https://spoofed.example/',
      Origin: 'https://spoofed.example',
      ['Cookie']: 'blocked',
      Host: 'spoofed.example',
      'Content-Length': '999',
      'Proxy-Authorization': 'Basic secret',
      'Sec-Fetch-Site': 'same-origin',
      'X-Userscript': 'allowed',
    },
  }, event => events.push(event))

  await vi.waitFor(() => assert.ok(events.some(event => event.type === 'xhr:complete')))
})

test('reports timeout when an active fetch exceeds the bounded request timeout', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = createAllowedProxy(fetch)

  proxy.start('port\u0000script\u0000timeout', context, 'timeout', {
    ...details,
    timeout: 25,
  }, event => events.push(event))
  await vi.advanceTimersByTimeAsync(25)

  assert.deepStrictEqual(events.at(-1), {
    type: 'xhr:failed', requestId: 'timeout', reason: 'timeout',
  })
})

test('reports timeout while the first-host permission decision is still pending', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(async () => new Response('unexpected'))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = new UserScriptNetworkProxy({
    fetch: fetch as never,
    hasPermission: () => false,
    requestPermission: () => new Promise<boolean>(() => undefined),
    markPermissionUsed: () => true,
  })

  proxy.start('port\u0000script\u0000permission-timeout', context, 'permission-timeout', {
    ...details,
    timeout: 25,
  }, event => events.push(event))
  await vi.advanceTimersByTimeAsync(25)

  assert.deepStrictEqual(events.at(-1), {
    type: 'xhr:failed', requestId: 'permission-timeout', reason: 'timeout',
  })
  assert.strictEqual(fetch.mock.calls.length, 0)
})

test('rejects streamed responses that exceed the 16 MiB body limit', async () => {
  const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(USER_SCRIPT_RUNTIME_MAX_RESPONSE_BYTES + 1))
      controller.close()
    },
  })))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = createAllowedProxy(fetch)

  proxy.start('port\u0000script\u0000oversized', context, 'oversized', details, event => events.push(event))

  await vi.waitFor(() => assert.deepStrictEqual(events.at(-1), {
    type: 'xhr:failed', requestId: 'oversized', reason: 'error',
  }))
})

test('limits each runtime port to eight concurrent requests', async () => {
  const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = createAllowedProxy(fetch)

  for (let index = 0; index < 9; index += 1) {
    proxy.start(`port\u0000script\u0000request-${index}`, context, `request-${index}`, details, event => events.push(event))
  }

  await vi.waitFor(() => assert.strictEqual(fetch.mock.calls.length, 8))
  assert.deepStrictEqual(events, [{
    type: 'xhr:failed', requestId: 'request-8', reason: 'error',
  }])
  proxy.abortPrefix('port\u0000')
  await vi.waitFor(() => assert.strictEqual(events.length, 9))
})

test('rejects a redirect containing userinfo before issuing the next fetch', async () => {
  const fetch = vi.fn(async () => new Response(null, {
    status: 302,
    headers: { location: 'https://user:secret@cdn.example.net/result' },
  }))
  const events: UserScriptRuntimeEvent[] = []
  const proxy = createAllowedProxy(fetch)

  proxy.start('port\u0000script\u0000userinfo', context, 'userinfo', details, event => events.push(event))

  await vi.waitFor(() => assert.deepStrictEqual(events.at(-1), {
    type: 'xhr:failed', requestId: 'userinfo', reason: 'denied',
  }))
  assert.strictEqual(fetch.mock.calls.length, 1)
})

function createAllowedProxy(fetch: ReturnType<typeof vi.fn>): UserScriptNetworkProxy {
  return new UserScriptNetworkProxy({
    fetch: fetch as never,
    hasPermission: () => true,
    requestPermission: async () => true,
    markPermissionUsed: () => true,
  })
}
