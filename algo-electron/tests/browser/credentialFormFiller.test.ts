import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  fillCredentialForm,
  fillCredentialFormWithRetry,
  isCredentialFormFillPayload,
  type CredentialFormFillPayload,
} from '../../electron/credentials/autofill/formFiller'

function createField(type = 'text') {
  const events: string[] = []
  return {
    value: '',
    type,
    disabled: false,
    readOnly: false,
    dispatchEvent: (event: Event) => { events.push(event.type); return true },
    events,
  }
}

const payload: CredentialFormFillPayload = {
  credentialId: 'credential-1',
  siteId: 'codeforces',
  username: 'alice',
  password: 'secret',
  pageUrl: 'https://codeforces.com/enter',
  usernameSelectors: ['input[name="username"]'],
  passwordSelectors: ['input[name="password"]'],
}

test('fills username and password through input/change events without submitting the form', () => {
  const username = createField()
  const password = createField('password')
  let submitted = false
  const fields = new Map<string, unknown>([
    ['input[name="username"]', username],
    ['input[name="password"]', password],
  ])
  const result = fillCredentialForm({
    querySelector: (selector: string) => fields.get(selector) ?? null,
  } as never, payload)

  assert.deepStrictEqual(result, { usernameFilled: true, passwordFilled: true })
  assert.strictEqual(username.value, 'alice')
  assert.strictEqual(password.value, 'secret')
  assert.deepStrictEqual(username.events, ['input', 'change'])
  assert.deepStrictEqual(password.events, ['input', 'change'])
  assert.strictEqual(submitted, false)
})

test('retries briefly for SPA-rendered login fields and rejects malformed payloads', async () => {
  const username = createField()
  const password = createField('password')
  let queries = 0
  const result = await fillCredentialFormWithRetry({
    querySelector: (selector: string) => {
      queries += 1
      if (queries <= 2) return null
      return selector.includes('username') ? username : password
    },
  } as never, payload, { maxAttempts: 3, delayMs: 0 })
  assert.deepStrictEqual(result, { usernameFilled: true, passwordFilled: true })
  assert.strictEqual(isCredentialFormFillPayload(payload), true)
  assert.strictEqual(isCredentialFormFillPayload({ ...payload, passwordSelectors: [''] }), false)
  assert.strictEqual(isCredentialFormFillPayload({ ...payload, pageUrl: 42 }), false)
})
