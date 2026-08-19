import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'vitest'
import type { CredentialVault } from '../../electron/credentials/CredentialVault'
import { CredentialAutofillService } from '../../electron/credentials/autofill/CredentialAutofillService'

class FakeContents extends EventEmitter {
  readonly sent: Array<{ channel: string; payload: unknown }> = []

  constructor(
    readonly id: number,
    readonly session: object,
    private url: string,
  ) {
    super()
  }

  getURL(): string { return this.url }
  isDestroyed(): boolean { return false }
  send(channel: string, payload: unknown): void { this.sent.push({ channel, payload }) }
}

test('global web-contents-created listener attaches only the persistent OJ session and disposes cleanly', async () => {
  const app = new EventEmitter()
  const ojSession = {}
  const foreignSession = {}
  const vault = {
    list: () => [{
      credentialId: 'credential-1',
      siteId: 'codeforces',
      username: 'alice',
      masked: '********',
      lastUsedAt: null,
      createdAt: 'now',
      updatedAt: 'now',
    }],
    getForAutofill: async () => ({
      credentialId: 'credential-1',
      siteId: 'codeforces',
      username: 'alice',
      password: 'secret',
    }),
  } as unknown as CredentialVault
  const service = new CredentialAutofillService(
    { app: app as never, ojSession: ojSession as never },
    {
      vault,
      getSites: () => [{
        id: 'codeforces',
        name: 'Codeforces',
        domains: ['codeforces.com'],
        homeUrl: 'https://codeforces.com',
        enabled: true,
        isBuiltin: true,
        loginUrlPatterns: ['/enter'],
        loginUsernameSelectors: ['input[name="handleOrEmail"]'],
        loginPasswordSelectors: ['input[name="password"]'],
      }],
    },
  )
  service.attach()

  const oj = new FakeContents(1, ojSession, 'https://codeforces.com/enter')
  const foreign = new FakeContents(2, foreignSession, 'https://codeforces.com/enter')
  app.emit('web-contents-created', {}, oj)
  app.emit('web-contents-created', {}, foreign)
  oj.emit('dom-ready')
  foreign.emit('dom-ready')
  await new Promise(resolve => setImmediate(resolve))

  assert.strictEqual(oj.sent.length, 1)
  assert.strictEqual(oj.sent[0].channel, 'oj-credentials:fill')
  assert.deepStrictEqual(foreign.sent, [])

  service.dispose()
  const afterDispose = new FakeContents(3, ojSession, 'https://codeforces.com/enter')
  app.emit('web-contents-created', {}, afterDispose)
  afterDispose.emit('dom-ready')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepStrictEqual(afterDispose.sent, [])
})
