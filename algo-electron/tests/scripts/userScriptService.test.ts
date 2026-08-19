import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { SiteConfigData } from '../../electron/db/repositories/site/types'
import type { UserScript } from '../../electron/db/repositories/userScript/types'
import { UserScriptService } from '../../electron/scripts/UserScriptService'

interface ScriptOptions {
  id: string
  code?: string
  filePath?: string | null
  siteIds?: string | null
  matches?: string[]
  includes?: string[]
  excludes?: string[]
  excludeMatches?: string[]
}

function createScript(options: ScriptOptions): UserScript {
  return {
    id: options.id,
    name: options.id,
    namespace: '',
    identity_name: options.id,
    description: null,
    version: '1.0.0',
    match_urls_json: JSON.stringify(options.matches ?? []),
    include_rules_json: JSON.stringify(options.includes ?? []),
    exclude_rules_json: JSON.stringify(options.excludes ?? []),
    exclude_match_rules_json: JSON.stringify(options.excludeMatches ?? []),
    grant_json: '[]',
    connect_json: '[]',
    noframes: false,
    run_at: 'document-idle',
    update_url: null,
    download_url: null,
    last_install_url: null,
    antifeature_json: '[]',
    icon_url: null,
    code: options.code ?? userscript(options.id),
    file_path: options.filePath ?? null,
    site_ids_json: options.siteIds ?? '[]',
    enabled: true,
    auto_update_enabled: true,
    created_at: '2026-08-19 12:00:00',
    updated_at: '2026-08-19 12:00:00',
    deleted_at: null,
  }
}

function createSite(id: string, domains: string[], enabled = true): SiteConfigData {
  return {
    id,
    name: id,
    domains,
    homeUrl: `https://${domains[0]}/`,
    enabled,
    isBuiltin: true,
  }
}

function userscript(name: string, extraMetadata = ''): string {
  return `// ==UserScript==\n// @name ${name}\n${extraMetadata}// ==/UserScript==\nconsole.log(${JSON.stringify(name)})\n`
}

function createService(options: {
  scripts: UserScript[]
  sites?: SiteConfigData[]
  files?: Record<string, string>
}): UserScriptService {
  const files = options.files ?? {}
  return new UserScriptService({
    getEnabledScripts: () => options.scripts,
    getEnabledSites: () => options.sites ?? [],
    fileExists: filePath => Object.hasOwn(files, filePath),
    readFile: filePath => files[filePath],
  })
}

test('non-empty site_ids are authoritative and do not fall back to metadata rules', () => {
  const script = createScript({
    id: 'bound-script',
    siteIds: '["codeforces"]',
    matches: ['https://leetcode.com/*'],
  })
  const service = createService({
    scripts: [script],
    sites: [createSite('codeforces', ['codeforces.com'])],
  })
  assert.deepStrictEqual(service.getMatchingScripts('https://leetcode.com/problems/two-sum/'), [])
  assert.deepStrictEqual(
    service.getMatchingScripts('https://codeforces.com/problemset/problem/1/A').map(item => item.id),
    ['bound-script'],
  )
})

test('exclusions take priority over an explicit site binding', () => {
  const script = createScript({
    id: 'excluded-bound-script',
    siteIds: '["codeforces"]',
    excludes: ['https://codeforces.com/private/*'],
    excludeMatches: ['*://*.codeforces.com/contest/private/*'],
  })
  const service = createService({
    scripts: [script],
    sites: [createSite('codeforces', ['codeforces.com'])],
  })
  assert.deepStrictEqual(
    service.getMatchingScripts('https://codeforces.com/problemset/problem/1/A').map(item => item.id),
    ['excluded-bound-script'],
  )
  assert.deepStrictEqual(service.getMatchingScripts('https://codeforces.com/private/settings'), [])
  assert.deepStrictEqual(
    service.getMatchingScripts('https://codeforces.com/contest/private/1?tab=standings#top'),
    [],
  )
})

test('empty site bindings use persisted @match and @include metadata', () => {
  const matchScript = createScript({
    id: 'match-script',
    matches: ['https://example.com/Problems/*'],
  })
  const includeScript = createScript({
    id: 'include-script',
    siteIds: null,
    includes: ['/^https:\\/\\/mirror\\.example\\.com\\/problem\\//i'],
  })
  const service = createService({ scripts: [matchScript, includeScript] })
  assert.deepStrictEqual(
    service.getMatchingScripts('https://example.com/Problems/1?tab=editor#code').map(item => item.id),
    ['match-script'],
  )
  assert.deepStrictEqual(
    service.getMatchingScripts('https://mirror.example.com/Problem/1').map(item => item.id),
    ['include-script'],
  )
})

test('unknown, disabled, and malformed explicit site bindings fail closed', () => {
  const scripts = [
    createScript({ id: 'unknown-site', siteIds: '["missing"]', matches: ['https://target.example/*'] }),
    createScript({ id: 'disabled-site', siteIds: '["disabled"]', matches: ['https://target.example/*'] }),
    createScript({ id: 'invalid-json', siteIds: '{broken', matches: ['https://target.example/*'] }),
  ]
  const service = createService({
    scripts,
    sites: [createSite('disabled', ['target.example'], false)],
  })
  assert.deepStrictEqual(service.getMatchingScripts('https://target.example/problem/1'), [])
})

test('file-backed and database-backed scripts return equivalent parsed dependency metadata', () => {
  const filePath = 'C:\\userscripts\\file-backed.user.js'
  const fileCode = userscript(
    'file-backed',
    '// @require https://cdn.example.com/file-lib.js\n// @resource file-style https://cdn.example.com/file.css\n',
  )
  const databaseCode = userscript(
    'database-backed',
    '// @require https://cdn.example.com/db-lib.js\n// @resource db-style https://cdn.example.com/db.css\n',
  )
  const service = createService({
    scripts: [
      createScript({
        id: 'file-backed',
        filePath,
        code: 'stale database source',
        matches: ['https://example.com/*'],
      }),
      createScript({
        id: 'database-backed',
        code: databaseCode,
        matches: ['https://example.com/*'],
      }),
    ],
    files: { [filePath]: fileCode },
  })
  const entries = service.getMatchingScriptsWithMeta('https://example.com/problem/1')
  assert.deepStrictEqual(entries.map(entry => entry.script.id), ['file-backed', 'database-backed'])
  assert.strictEqual(entries[0].script.code, fileCode)
  assert.deepStrictEqual(entries[0].requires, ['https://cdn.example.com/file-lib.js'])
  assert.deepStrictEqual(entries[0].resources, [{
    name: 'file-style',
    url: 'https://cdn.example.com/file.css',
  }])
  assert.strictEqual(entries[1].script.code, databaseCode)
  assert.deepStrictEqual(entries[1].requires, ['https://cdn.example.com/db-lib.js'])
  assert.deepStrictEqual(entries[1].resources, [{
    name: 'db-style',
    url: 'https://cdn.example.com/db.css',
  }])
})

test('refresh failure discards the previous script and site cache', () => {
  const enabledScript = createScript({
    id: 'cached-script',
    siteIds: '["example"]',
  })
  let refreshShouldFail = false
  const service = new UserScriptService({
    getEnabledScripts: () => {
      if (refreshShouldFail) throw new Error('database unavailable')
      return [enabledScript]
    },
    getEnabledSites: () => [createSite('example', ['example.com'])],
  })

  assert.deepStrictEqual(
    service.getMatchingScripts('https://example.com/problem/1').map(item => item.id),
    ['cached-script'],
  )
  refreshShouldFail = true
  assert.throws(() => service.refresh(), /database unavailable/)
  assert.deepStrictEqual(service.getEnabledScriptsSnapshot(), [])
  assert.deepStrictEqual(service.getMatchingScripts('https://example.com/problem/1'), [])
})
