import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { afterEach, test, vi } from 'vitest'
import type { CredentialVault } from '../../electron/credentials/CredentialVault'
import { CredentialCaptureService } from '../../electron/credentials/CredentialCaptureService'

class FakeContents extends EventEmitter {
  constructor(
    readonly id: number,
    readonly session: object,
    private url: string,
  ) { super() }

  getURL(): string { return this.url }
  setURL(url: string): void { this.url = url }
  isDestroyed(): boolean { return false }
}

function makeSite() {
  return {
    id: 'codeforces',
    name: 'Codeforces',
    domains: ['codeforces.com'],
    homeUrl: 'https://codeforces.com',
    enabled: true,
    isBuiltin: true,
    loginUrlPatterns: ['/enter'],
    loginUsernameSelectors: ['input[name="handleOrEmail"]'],
    loginPasswordSelectors: ['input[name="password"]'],
  }
}

function makeService(options: {
  vault?: Partial<Pick<CredentialVault, 'list' | 'getForAutofill' | 'save'>>
  showPrompt?: (windowId: string, prompt: unknown) => boolean
} = {}) {
  const app = new EventEmitter()
  const ojSession = {}
  const shown: unknown[] = []
  const visible: boolean[] = []
  const results: unknown[] = []
  const service = new CredentialCaptureService(
    { app: app as never, ojSession: ojSession as never },
    {
      vault: {
        list: () => [],
        getForAutofill: async () => null,
        save: async () => undefined,
        ...options.vault,
      } as never,
      getSites: () => [makeSite()],
      captureHost: {
        getWindowId: () => 'shell-1',
        showPrompt: (windowId, prompt) => {
          shown.push({ windowId, prompt })
          return options.showPrompt?.(windowId, prompt) ?? true
        },
        setNoticeVisible: (_windowId, value) => visible.push(value),
        sendResult: (_windowId, result) => results.push(result),
      },
    },
  )
  service.attach()
  return { app, ojSession, service, shown, visible, results }
}

afterEach(() => {
  vi.useRealTimers()
})

test('captures a login submit into a redacted, window-scoped prompt', async () => {
  const ctx = makeService()
  const contents = new FakeContents(1, ctx.ojSession, 'https://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, contents)
  assert.strictEqual(await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'secret' }), true)
  const prompt = ctx.service.getCurrentPrompt('shell-1')!
  assert.strictEqual(prompt.username, 'alice')
  assert.strictEqual(prompt.siteName, 'Codeforces')
  assert.strictEqual(JSON.stringify(prompt).includes('secret'), false)
  assert.strictEqual(prompt.captureId.length > 10, true)
  assert.deepStrictEqual(ctx.visible, [true])
  ctx.service.dispose()
})

test('same username and password is ignored, changed password requests update', async () => {
  const vault = {
    list: () => [{ credentialId: 'credential-1', siteId: 'codeforces', username: 'alice', displayName: 'Main', masked: '********', lastUsedAt: null, createdAt: 'now', updatedAt: 'now' }],
    getForAutofill: async () => ({ credentialId: 'credential-1', siteId: 'codeforces', username: 'alice', password: 'old-secret' }),
    save: async () => undefined,
  }
  const ctx = makeService({ vault })
  const contents = new FakeContents(2, ctx.ojSession, 'https://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, contents)
  assert.strictEqual(await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'old-secret' }), false)
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1'), null)
  assert.strictEqual(await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'new-secret' }), true)
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1')?.isUpdate, true)
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1')?.displayName, 'Main')
  ctx.service.dispose()
})

test('save/update/cancel are one-shot and reject mismatched action', async () => {
  const save = vi.fn(async () => undefined)
  const ctx = makeService({ vault: { save } })
  const contents = new FakeContents(3, ctx.ojSession, 'https://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, contents)
  await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'secret' })
  const captureId = ctx.service.getCurrentPrompt('shell-1')!.captureId
  assert.strictEqual(await ctx.service.respondCapture('shell-1', captureId, 'update'), false)
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1')?.captureId, captureId)
  assert.strictEqual(await ctx.service.respondCapture('shell-1', captureId, 'save'), true)
  assert.strictEqual(await ctx.service.respondCapture('shell-1', captureId, 'save'), false)
  assert.strictEqual(save.mock.calls.length, 1)
  assert.deepStrictEqual(ctx.results, [{ captureId, success: true }])
  assert.deepStrictEqual(ctx.visible, [true, false])
  ctx.service.dispose()
})

test('navigation, destroy, timeout and failed save clear pending state without secrets', async () => {
  vi.useFakeTimers()
  const save = vi.fn(async () => { throw new Error('secret should not escape') })
  const ctx = makeService({ vault: { save } })
  const contents = new FakeContents(4, ctx.ojSession, 'https://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, contents)
  await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'secret' })
  const captureId = ctx.service.getCurrentPrompt('shell-1')!.captureId
  contents.emit('did-navigate')
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1'), null)
  assert.strictEqual(await ctx.service.respondCapture('shell-1', captureId, 'save'), false)

  await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'secret-2' })
  assert.ok(ctx.service.getCurrentPrompt('shell-1'))
  contents.emit('destroyed')
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1'), null)

  const next = new FakeContents(5, ctx.ojSession, 'https://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, next)
  await ctx.service.receiveCapture(next as never, { username: 'bob', password: 'secret-3' })
  const timeoutId = ctx.service.getCurrentPrompt('shell-1')!.captureId
  vi.advanceTimersByTime(30_001)
  assert.strictEqual(ctx.service.getCurrentPrompt('shell-1'), null)
  assert.strictEqual(await ctx.service.respondCapture('shell-1', timeoutId, 'save'), false)

  await ctx.service.receiveCapture(next as never, { username: 'carol', password: 'secret-4' })
  const failedId = ctx.service.getCurrentPrompt('shell-1')!.captureId
  assert.strictEqual(await ctx.service.respondCapture('shell-1', failedId, 'save'), false)
  assert.deepStrictEqual(ctx.results.at(-1), { captureId: failedId, success: false, error: 'save-failed' })
  assert.strictEqual(JSON.stringify(ctx.results).includes('secret'), false)
  ctx.service.dispose()
})

test('rejects non-login, insecure, foreign-session and malformed captures', async () => {
  const ctx = makeService()
  const foreign = new FakeContents(6, {}, 'https://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, foreign)
  assert.strictEqual(await ctx.service.receiveCapture(foreign as never, { username: 'alice', password: 'secret' }), false)
  const contents = new FakeContents(7, ctx.ojSession, 'http://codeforces.com/enter')
  ctx.app.emit('web-contents-created', {}, contents)
  assert.strictEqual(await ctx.service.receiveCapture(contents as never, { username: '', password: 'secret' }), false)
  assert.strictEqual(await ctx.service.receiveCapture(contents as never, { username: 'alice', password: 'secret' }), false)
  ctx.service.dispose()
})
