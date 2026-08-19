import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'vitest'
import {
  CredentialAutofillCoordinator,
  type AutofillWebContents,
} from '../../electron/credentials/autofill/autofillServiceCore'

class FakeContents extends EventEmitter implements AutofillWebContents {
  readonly sent: Array<{ channel: string; payload: Record<string, unknown> }> = []
  private url: string

  constructor(readonly id: number, url: string) {
    super()
    this.url = url
  }

  getURL(): string { return this.url }
  setURL(url: string): void { this.url = url }
  isDestroyed(): boolean { return false }
  send(channel: string, payload: Record<string, unknown>): void { this.sent.push({ channel, payload }) }
}

function createCoordinator(options: { credentialCount?: number; delayed?: boolean } = {}) {
  let resolveAutofill: ((value: any) => void) | null = null
  const credentials = Array.from({ length: options.credentialCount ?? 1 }, (_, index) => ({
    credentialId: `credential-${index + 1}`,
    siteId: 'codeforces',
    username: `alice-${index + 1}`,
    displayName: null,
    masked: '********',
    lastUsedAt: null,
    createdAt: 'now',
    updatedAt: 'now',
  }))
  const coordinator = new CredentialAutofillCoordinator({
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
    listCredentials: () => credentials,
    getForAutofill: async (credentialId) => {
      if (options.delayed) {
        return new Promise(resolve => { resolveAutofill = resolve })
      }
      return { credentialId, siteId: 'codeforces', username: 'alice', password: 'secret' }
    },
  })
  return { coordinator, resolveAutofill: (value: unknown) => resolveAutofill?.(value) }
}

test('fills one credential independently in every attached split-window webContents', async () => {
  const { coordinator } = createCoordinator()
  const first = new FakeContents(1, 'https://codeforces.com/enter')
  const second = new FakeContents(2, 'https://www.codeforces.com/enter')
  coordinator.attach(first)
  coordinator.attach(second)

  assert.strictEqual(await coordinator.tryAutofill(first), true)
  assert.strictEqual(await coordinator.tryAutofill(second), true)
  assert.strictEqual(first.sent[0].channel, 'oj-credentials:fill')
  assert.strictEqual(first.sent[0].payload.pageUrl, 'https://codeforces.com/enter')
  assert.strictEqual(first.sent[0].payload.password, 'secret')
  assert.strictEqual(second.sent.length, 1)
  assert.strictEqual(await coordinator.tryAutofill(first), false, 'same document must not be filled twice')
})

test('fails closed among multiple saved accounts when no selection host is provided', async () => {
  const { coordinator } = createCoordinator({ credentialCount: 2 })
  const contents = new FakeContents(1, 'https://codeforces.com/enter')
  coordinator.attach(contents)
  assert.strictEqual(await coordinator.tryAutofill(contents), false)
  assert.deepStrictEqual(contents.sent, [])
})

test('fills only the explicitly selected account and drops a selection after navigation', async () => {
  const credentials = [
    { credentialId: 'credential-1', siteId: 'codeforces', username: 'alice-1', displayName: null, masked: '********', lastUsedAt: null, createdAt: 'now', updatedAt: 'now' },
    { credentialId: 'credential-2', siteId: 'codeforces', username: 'alice-2', displayName: 'Primary', masked: '********', lastUsedAt: null, createdAt: 'now', updatedAt: 'now' },
  ]
  let resolveSelection: ((value: string | null) => void) | null = null
  const coordinator = new CredentialAutofillCoordinator({
    getSites: () => [{
      id: 'codeforces', name: 'Codeforces', domains: ['codeforces.com'], homeUrl: 'https://codeforces.com', enabled: true, isBuiltin: true,
      loginUrlPatterns: ['/enter'], loginUsernameSelectors: ['input[name="handleOrEmail"]'], loginPasswordSelectors: ['input[name="password"]'],
    }],
    listCredentials: () => credentials,
    selectCredential: async (_contents, request) => {
      assert.strictEqual(request.credentials.length, 2)
      return new Promise(resolve => { resolveSelection = resolve })
    },
    getForAutofill: async (credentialId) => ({ credentialId, siteId: 'codeforces', username: 'alice-2', password: 'secret-2' }),
  })
  const contents = new FakeContents(1, 'https://codeforces.com/enter')
  coordinator.attach(contents)
  const pending = coordinator.tryAutofill(contents)
  resolveSelection?.('credential-2')
  assert.strictEqual(await pending, true)
  assert.strictEqual(contents.sent[0].payload.credentialId, 'credential-2')
  assert.strictEqual(contents.sent[0].payload.username, 'alice-2')

  const secondContents = new FakeContents(2, 'https://codeforces.com/enter')
  coordinator.attach(secondContents)
  const delayed = coordinator.tryAutofill(secondContents)
  secondContents.setURL('https://codeforces.com/problemset')
  coordinator.invalidate(secondContents.id)
  resolveSelection?.(null)
  assert.strictEqual(await delayed, false)
  assert.deepStrictEqual(secondContents.sent, [])
})

test('drops decrypted values when navigation changes before the async vault read returns', async () => {
  const { coordinator, resolveAutofill } = createCoordinator({ delayed: true })
  const contents = new FakeContents(1, 'https://codeforces.com/enter')
  coordinator.attach(contents)
  const pending = coordinator.tryAutofill(contents)
  contents.setURL('https://codeforces.com/problemset')
  coordinator.invalidate(contents.id)
  resolveAutofill({ credentialId: 'credential-1', siteId: 'codeforces', username: 'alice', password: 'secret' })
  assert.strictEqual(await pending, false)
  assert.deepStrictEqual(contents.sent, [])
})
