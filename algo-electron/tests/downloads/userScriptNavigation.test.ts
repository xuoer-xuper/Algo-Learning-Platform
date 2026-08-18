import { describe, expect, it } from 'vitest'
import {
  PendingUserScriptInstallRegistry,
  resolveUserScriptNavigation,
} from '../../electron/downloads/userScriptNavigation'

describe('resolveUserScriptNavigation', () => {
  it('recognizes canonical and encoded HTTPS userscript paths', () => {
    expect(resolveUserScriptNavigation(
      'https://greasyfork.org/scripts/123/code/helper.user.js?version=4#install',
    )).toEqual({
      sourceUrl: 'https://greasyfork.org/scripts/123/code/helper.user.js?version=4',
      sourceFileName: 'helper.user.js',
    })
    expect(resolveUserScriptNavigation('https://example.com/code/helper%2Euser%2Ejs')).toEqual({
      sourceUrl: 'https://example.com/code/helper%2Euser%2Ejs',
      sourceFileName: 'helper.user.js',
    })
  })

  it.each([
    'https://example.com/script.js',
    'https://example.com/script.user.js/extra',
    'https://user:password@example.com/script.user.js',
    'http://example.com/script.user.js',
    'file:///tmp/script.user.js',
    'not a url',
  ])('rejects non-install navigation %s', (url) => {
    expect(resolveUserScriptNavigation(url)).toBeNull()
  })

  it('allows loopback HTTP only when development wiring opts in', () => {
    const url = 'http://127.0.0.1:5173/helper.user.js'
    expect(resolveUserScriptNavigation(url)).toBeNull()
    expect(resolveUserScriptNavigation(url, { allowInsecureLocalhost: true })).toEqual({
      sourceUrl: url,
      sourceFileName: 'helper.user.js',
    })
  })
})

describe('PendingUserScriptInstallRegistry', () => {
  it('creates a route containing only a short-lived id and safe request metadata', () => {
    const registry = new PendingUserScriptInstallRegistry({
      clock: () => Date.parse('2026-08-18T12:00:00.000Z'),
      idFactory: () => 'install_123',
    })
    const route = registry.register('https://example.com/scripts/helper.user.js?version=2')

    expect(route).toEqual({
      request: {
        installId: 'install_123',
        sourceUrl: 'https://example.com/scripts/helper.user.js?version=2',
        sourceFileName: 'helper.user.js',
        createdAt: '2026-08-18T12:00:00.000Z',
      },
      page: { type: 'script-install', installId: 'install_123' },
    })
    expect(registry.get('install_123')).toEqual(route?.request)
    expect(registry.consume('install_123')).toEqual(route?.request)
    expect(registry.get('install_123')).toBeNull()
  })

  it('expires requests and evicts the oldest request at the bounded capacity', () => {
    let now = 0
    let id = 0
    const registry = new PendingUserScriptInstallRegistry({
      clock: () => now,
      idFactory: () => `install-${++id}`,
      ttlMs: 100,
      maxPending: 2,
    })
    registry.register('https://example.com/one.user.js')
    registry.register('https://example.com/two.user.js')
    registry.register('https://example.com/three.user.js')
    expect(registry.get('install-1')).toBeNull()
    expect(registry.get('install-2')).not.toBeNull()

    now = 100
    expect(registry.get('install-2')).toBeNull()
    expect(registry.get('install-3')).toBeNull()
  })

  it('rejects unsafe ids and non-userscript registration without retaining state', () => {
    const invalidIds = ['../install', 'contains space', '']
    let index = 0
    const registry = new PendingUserScriptInstallRegistry({
      idFactory: () => invalidIds[index++] ?? 'still invalid!',
    })
    expect(registry.register('https://example.com/plain.js')).toBeNull()
    expect(() => registry.register('https://example.com/helper.user.js')).toThrow('safe userscript install id')
    expect(registry.get('../install')).toBeNull()
  })
})
