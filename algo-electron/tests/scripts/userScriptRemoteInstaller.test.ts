import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  UserScriptRemoteInstaller,
  type RemoteFetch,
} from '../../electron/scripts/UserScriptRemoteInstaller'
import {
  MAX_PENDING_USER_SCRIPT_INSTALLS,
  PendingUserScriptInstallRegistry,
} from '../../electron/downloads/userScriptNavigation'

function sha256Base64(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64')
}

function response(body: string, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers })
}

function request(overrides: Partial<PendingUserScriptInstall> = {}): PendingUserScriptInstall {
  return {
    installId: 'install-1',
    sourceUrl: 'https://example.com/helper.user.js',
    sourceFileName: 'helper.user.js',
    createdAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('UserScriptRemoteInstaller', () => {
  it('downloads metadata and resources before exposing a safe preview', async () => {
    const required = 'globalThis.__required = true'
    const script = [
      '// ==UserScript==',
      '// @name Helper',
      '// @namespace https://example.com/scripts',
      '// @version 2.1.0',
      '// @match https://example.com/*',
      '// @grant GM_getValue',
      `// @require https://cdn.example.com/helper.js#sha256-${sha256Base64(required)}`,
      '// @resource icon https://cdn.example.com/icon.svg',
      '// ==/UserScript==',
      'globalThis.__installed = true',
    ].join('\n')
    const fetch: RemoteFetch = async (input) => {
      if (input.endsWith('/helper.user.js')) {
        return response(script, { etag: '"v2"', 'last-modified': 'Wed, 20 Aug 2026 10:00:00 GMT' })
      }
      if (input.endsWith('/helper.js')) return response(required, { 'content-type': 'text/javascript' })
      if (input.endsWith('/icon.svg')) return response('<svg/>', { 'content-type': 'image/svg+xml' })
      return response('missing', {}, 404)
    }
    const installer = new UserScriptRemoteInstaller({ fetch })

    const preview = await installer.prepare(request(), [])

    expect(preview).toMatchObject({
      name: 'Helper',
      namespace: 'https://example.com/scripts',
      version: '2.1.0',
      action: 'create',
      grants: ['GM_getValue'],
      requires: 1,
      resources: ['icon'],
    })
    expect(preview).not.toHaveProperty('etag')
    expect(preview).not.toHaveProperty('lastModified')
    expect(installer.getPrepared('install-1', request().sourceUrl)?.preview).toEqual(preview)
    expect(installer.consume('install-1')?.resources).toHaveLength(2)
    expect(installer.getPrepared('install-1', request().sourceUrl)).toBeNull()
  })

  it('rejects unsafe redirects and non-userscript content', async () => {
    const redirectFetch: RemoteFetch = async () => response('', { location: 'http://evil.example/script.user.js' }, 302)
    await expect(new UserScriptRemoteInstaller({ fetch: redirectFetch }).prepare(request(), []))
      .rejects.toThrow('must be HTTPS')

    const plainFetch: RemoteFetch = async () => response('console.log("plain")')
    await expect(new UserScriptRemoteInstaller({ fetch: plainFetch }).prepare(request(), []))
      .rejects.toThrow('not a userscript')

    const incompleteFetch: RemoteFetch = async () => response([
      '// ==UserScript==',
      '// @name Incomplete',
      'console.log("not metadata closed")',
    ].join('\n'))
    await expect(new UserScriptRemoteInstaller({ fetch: incompleteFetch }).prepare(request(), []))
      .rejects.toThrow('not a userscript')
  })

  it('expires staged source and resource material without retaining it', async () => {
    let now = 0
    const fetch: RemoteFetch = async () => response([
      '// ==UserScript==',
      '// @name Expiring',
      '// ==/UserScript==',
    ].join('\n'))
    const installer = new UserScriptRemoteInstaller({ fetch, clock: () => now, ttlMs: 100 })
    await installer.prepare(request(), [])
    now = 100
    expect(installer.getPrepared('install-1', request().sourceUrl)).toBeNull()
    expect(installer.consume('install-1')).toBeNull()
  })

  it('shares its default capacity with the pending registry cleanup lifecycle', async () => {
    let id = 0
    const fetch: RemoteFetch = async () => response([
      '// ==UserScript==',
      '// @name Capacity',
      '// ==/UserScript==',
    ].join('\n'))
    const installer = new UserScriptRemoteInstaller({ fetch })
    const registry = new PendingUserScriptInstallRegistry({
      idFactory: () => `install-${++id}`,
      onRemove: installId => installer.clear(installId),
    })
    const routes = []

    for (let index = 0; index <= MAX_PENDING_USER_SCRIPT_INSTALLS; index += 1) {
      const route = registry.register(`https://example.com/${index}.user.js`)
      expect(route).not.toBeNull()
      routes.push(route!)
      await installer.prepare(route!.request, [])
    }

    expect(registry.get(routes[0].request.installId)).toBeNull()
    expect(installer.getPrepared(routes[0].request.installId, routes[0].request.sourceUrl)).toBeNull()
    for (const route of routes.slice(1)) {
      expect(installer.getPrepared(route.request.installId, route.request.sourceUrl)).not.toBeNull()
    }
  })
})
