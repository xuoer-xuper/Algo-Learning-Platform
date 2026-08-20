import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test, vi } from 'vitest'
import {
  prepareUserScriptResources,
  selectUserScriptIntegrity,
} from '../../electron/scripts/UserScriptResourceCache'

test('selects the last supported integrity hash and canonicalizes hex or base64url digests', () => {
  const sha = createHash('sha256').update('dependency').digest()
  const md5 = createHash('md5').update('dependency').digest('hex')
  const selected = selectUserScriptIntegrity(`sha384=ignored;md5=${md5};sha256=${sha.toString('base64url')}`)
  assert.strictEqual(selected?.algorithm, 'sha256')
  assert.strictEqual(selected?.canonical, `sha256-${sha.toString('base64')}`)
  assert.throws(() => selectUserScriptIntegrity('sha384=unsupported'), /no supported/)
  assert.throws(() => selectUserScriptIntegrity('sha256=short'), /digest length/)
})

test('downloads resources in declaration order, verifies SRI, and stores bounded cache rows', async () => {
  const dependency = 'globalThis.__dependencyOrder = 1'
  const style = 'body { color: red; }'
  const dependencyHash = createHash('sha256').update(dependency).digest('hex')
  const styleHash = createHash('md5').update(style).digest('base64')
  const fetch = vi.fn(async (url: string) => new Response(
    url.endsWith('.js') ? dependency : style,
    { headers: { 'content-type': url.endsWith('.js') ? 'application/javascript' : 'text/css' } },
  ))

  const prepared = await prepareUserScriptResources({
    requires: [{ url: 'https://cdn.example.com/dependency.js', integrity: `sha256=${dependencyHash}` }],
    resources: [{ name: 'theme', url: 'https://cdn.example.com/theme.css', integrity: `md5-${styleHash}` }],
  }, {
    fetch,
    now: () => '2026-08-20 10:00:00',
  })

  assert.deepStrictEqual(prepared.map(resource => [
    resource.kind,
    resource.key,
    resource.declarationOrder,
    resource.sourceUrl,
    resource.contentEncoding,
    resource.contentType,
    resource.fetchedAt,
  ]), [
    ['require', 'require-0', 0, 'https://cdn.example.com/dependency.js', 'utf8', 'application/javascript', '2026-08-20 10:00:00'],
    ['resource', 'theme', 0, 'https://cdn.example.com/theme.css', 'binary', 'text/css', '2026-08-20 10:00:00'],
  ])
  assert.strictEqual(Buffer.from(prepared[0].content ?? []).toString('utf8'), dependency)
  assert.strictEqual(fetch.mock.calls.length, 2)
})

test('fails before persistence on integrity mismatch, insecure URLs, duplicate names, or oversized bodies', async () => {
  await assert.rejects(() => prepareUserScriptResources({
    requires: [{ url: 'https://cdn.example.com/dependency.js', integrity: `sha256=${'00'.repeat(32)}` }],
    resources: [],
  }, { fetch: async () => new Response('different') }), /integrity mismatch/)

  await assert.rejects(() => prepareUserScriptResources({
    requires: [{ url: 'http://cdn.example.com/dependency.js', integrity: null }],
    resources: [],
  }, { fetch: async () => new Response('unused') }), /must be HTTPS/)

  await assert.rejects(() => prepareUserScriptResources({
    requires: [],
    resources: [
      { name: 'same', url: 'https://cdn.example.com/a', integrity: null },
      { name: 'same', url: 'https://cdn.example.com/b', integrity: null },
    ],
  }, { fetch: async () => new Response('unused') }), /unique/)

  await assert.rejects(() => prepareUserScriptResources({
    requires: [],
    resources: [{ name: 'large', url: 'https://cdn.example.com/large', integrity: null }],
  }, {
    fetch: async () => new Response('x', { headers: { 'content-length': String(4 * 1024 * 1024 + 1) } }),
  }), /per-resource size limit/)
})
