import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  isUserScriptConnectDeclared,
  resolveUserScriptRequestTarget,
} from '../../electron/scripts/userScriptConnectPolicy'

test('accepts secure targets and limits insecure HTTP to explicit loopback development mode', () => {
  assert.deepStrictEqual(resolveUserScriptRequestTarget('https://API.Example.com/v1?q=1'), {
    url: 'https://api.example.com/v1?q=1',
    origin: 'https://api.example.com',
    hostname: 'api.example.com',
    permissionHost: 'api.example.com',
  })
  assert.strictEqual(resolveUserScriptRequestTarget('https://user:secret@example.com/'), null)
  assert.strictEqual(resolveUserScriptRequestTarget('http://api.example.com/'), null)
  assert.strictEqual(resolveUserScriptRequestTarget('http://127.0.0.1:3000/', true)?.hostname, '127.0.0.1')
  assert.strictEqual(resolveUserScriptRequestTarget('file:///tmp/data'), null)
})

test('@connect matching uses exact hostname labels for self, domains, wildcards, and global grants', () => {
  const target = resolveUserScriptRequestTarget('https://api.example.com/data')!
  assert.strictEqual(isUserScriptConnectDeclared(['self'], 'https://api.example.com/page', target), true)
  assert.strictEqual(isUserScriptConnectDeclared(['self'], 'https://example.com/page', target), false)
  assert.strictEqual(isUserScriptConnectDeclared(['example.com'], 'https://unrelated.test/', target), true)
  assert.strictEqual(isUserScriptConnectDeclared(['*.example.com'], 'https://unrelated.test/', target), true)
  assert.strictEqual(isUserScriptConnectDeclared(['*'], 'https://unrelated.test/', target), true)
  assert.strictEqual(isUserScriptConnectDeclared(['example.com.evil'], 'https://unrelated.test/', target), false)
  assert.strictEqual(isUserScriptConnectDeclared(['https://example.com', 'exa mple.com'], 'https://unrelated.test/', target), false)
})

test('a declared parent domain does not match a deceptive suffix', () => {
  const target = resolveUserScriptRequestTarget('https://example.com.attacker.test/')!
  assert.strictEqual(isUserScriptConnectDeclared(['example.com'], 'https://example.com/', target), false)
})
