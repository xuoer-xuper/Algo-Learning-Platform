import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserScript } from '../../electron/db/repositories/userScriptRepository'
import { UserScriptUpdateService } from '../../electron/scripts/UserScriptUpdateService'

function script(overrides: Partial<UserScript> = {}): UserScript {
  return {
    id: 'script-1',
    name: 'Helper',
    namespace: 'helper.namespace',
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    include_rules_json: '[]',
    exclude_rules_json: '[]',
    exclude_match_rules_json: '[]',
    grant_json: '[]',
    connect_json: '[]',
    noframes: false,
    run_at: 'document-idle',
    update_url: 'https://example.com/helper.meta.js',
    download_url: 'https://example.com/helper.user.js',
    last_install_url: 'https://origin.example/helper.user.js',
    antifeature_json: '[]',
    icon_url: null,
    code: userscript('Helper', '1.0.0'),
    file_path: 'C:/userscripts/helper.user.js',
    site_ids_json: '[]',
    enabled: true,
    auto_update_enabled: true,
    created_at: '2026-08-19T00:00:00.000',
    updated_at: '2026-08-19T00:00:00.000',
    deleted_at: null,
    ...overrides,
  }
}

function userscript(name: string, version: string, body = 'globalThis.__helper = true'): string {
  return [
    '// ==UserScript==',
    `// @name ${name}`,
    '// @namespace helper.namespace',
    `// @version ${version}`,
    '// @match https://example.com/*',
    '// @updateURL https://example.com/helper.meta.js',
    '// @downloadURL https://example.com/helper.user.js',
    '// ==/UserScript==',
    body,
  ].join('\n')
}

function metadata(name: string, version: string): string {
  return userscript(name, version, '').trimEnd()
}

describe('UserScriptUpdateService', () => {
  const marks = {
    checking: vi.fn(),
    available: vi.fn(),
    current: vi.fn(),
    error: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses validators, downloads the advertised script, and persists a newer version', async () => {
    const installed = script()
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('.meta.js')) {
        expect(new Headers(init?.headers).get('if-none-match')).toBe('"old"')
        return new Response(metadata('Helper', '2.0.0'), { headers: { etag: '"new"' } })
      }
      return new Response(userscript('Helper', '2.0.0'))
    })
    const persistInstall = vi.fn(async () => installed.id)
    const service = createService(installed, fetch, persistInstall)

    const summary = await service.checkAll(true)

    expect(summary).toMatchObject({ checked: 1, updated: 1, failed: 0 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(marks.available).toHaveBeenCalledWith(installed.id, '2.0.0')
    expect(persistInstall).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: installed.last_install_url,
      etag: '"new"',
      lastModified: null,
    }))
  })

  it('falls back from updateURL to downloadURL when the metadata endpoint fails', async () => {
    const installed = script()
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('.meta.js')) return new Response('offline', { status: 503 })
      return new Response(userscript('Helper', '2.0.0'))
    })
    const persistInstall = vi.fn(async () => installed.id)
    const service = createService(installed, fetch, persistInstall)

    const summary = await service.checkAll(true)

    expect(summary.updated).toBe(1)
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      installed.update_url,
      installed.download_url,
    ])
  })

  it('treats a 304 response as current and preserves existing validators', async () => {
    const installed = script()
    const fetch = vi.fn(async () => new Response(null, { status: 304 }))
    const service = createService(installed, fetch, vi.fn())

    const summary = await service.checkAll(true)

    expect(summary.current).toBe(1)
    expect(marks.current).toHaveBeenCalledWith(installed.id, expect.objectContaining({
      etag: '"old"',
      lastModified: 'Wed, 19 Aug 2026 12:00:00 GMT',
    }))
  })

  it('keeps validators across same-origin redirects and a headerless 304', async () => {
    const installed = script()
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('if-none-match')).toBe('"old"')
      expect(headers.get('if-modified-since')).toBe('Wed, 19 Aug 2026 12:00:00 GMT')
      if (url === installed.update_url) {
        return new Response(null, {
          status: 302,
          headers: { location: '/releases/helper.meta.js' },
        })
      }
      return new Response(null, { status: 304 })
    })
    const service = createService(installed, fetch, vi.fn())

    const summary = await service.checkAll(true)

    expect(summary.current).toBe(1)
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      installed.update_url,
      'https://example.com/releases/helper.meta.js',
    ])
    expect(marks.current).toHaveBeenCalledWith(installed.id, expect.objectContaining({
      etag: '"old"',
      lastModified: 'Wed, 19 Aug 2026 12:00:00 GMT',
    }))
  })

  it('fails closed when downloaded metadata changes script identity', async () => {
    const installed = script()
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('.meta.js')) return new Response(metadata('Helper', '2.0.0'))
      return new Response(userscript('Different Helper', '2.0.0'))
    })
    const persistInstall = vi.fn()
    const service = createService(installed, fetch, persistInstall)

    const summary = await service.checkAll(true)

    expect(summary.failed).toBe(1)
    expect(persistInstall).not.toHaveBeenCalled()
    expect(marks.error).toHaveBeenCalledWith(installed.id, expect.any(Error), expect.any(Date))
  })

  it('skips automatic checks until next_check_at is due', async () => {
    const installed = script()
    const fetch = vi.fn()
    const service = createService(installed, fetch, vi.fn(), '2026-08-21T12:00:00.000')

    const summary = await service.checkAll(false)

    expect(summary).toMatchObject({ checked: 0, skipped: 1 })
    expect(fetch).not.toHaveBeenCalled()
  })

  function createService(
    installed: UserScript,
    fetch: (input: string, init?: RequestInit) => Promise<Response>,
    persistInstall: ReturnType<typeof vi.fn>,
    nextCheckAt = '2026-08-19T12:00:00.000',
  ): UserScriptUpdateService {
    return new UserScriptUpdateService({
      fetch,
      scriptsDirectory: path.join(process.cwd(), 'tmp', 'userscript-update-tests'),
      clock: () => new Date('2026-08-20T12:00:00.000Z'),
      dependencies: {
        getAllScripts: () => [installed],
        getScriptById: id => id === installed.id ? installed : null,
        getUpdateState: () => ({
          script_id: installed.id,
          last_checked_at: '2026-08-19T12:00:00.000',
          next_check_at: nextCheckAt,
          etag: '"old"',
          last_modified: 'Wed, 19 Aug 2026 12:00:00 GMT',
          available_version: null,
          status: 'current',
          last_error: null,
          updated_at: '2026-08-19T12:00:00.000',
        }),
        prepareResources: async () => [],
        persistInstall,
        markChecking: marks.checking,
        markAvailable: marks.available,
        markCurrent: marks.current,
        markError: marks.error,
        logger: { warn: vi.fn() } as never,
      },
    })
  }
})
