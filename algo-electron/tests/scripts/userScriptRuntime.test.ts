import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { UserScriptRuntime } from '../../electron/scripts/UserScriptRuntime'
import type { UserScript } from '../../electron/db/repositories/userScript/types'

function script(overrides: Partial<UserScript> = {}): UserScript {
  return {
    id: 'script-1',
    name: 'Helper',
    namespace: 'https://example.com',
    identity_name: 'Helper',
    description: 'Runtime helper',
    version: '1.0.0',
    match_urls_json: '["https://example.com/*"]',
    include_rules_json: '[]',
    exclude_rules_json: '[]',
    exclude_match_rules_json: '[]',
    grant_json: '["GM_getValue","GM_setValue","GM_deleteValue"]',
    connect_json: '[]',
    noframes: false,
    run_at: 'document-start',
    update_url: null,
    download_url: null,
    last_install_url: null,
    antifeature_json: '[]',
    icon_url: null,
    code: 'window.runtimeMarker = GM_getValue("count", 0)',
    file_path: null,
    site_ids_json: '[]',
    enabled: true,
    auto_update_enabled: true,
    created_at: '2026-08-19 12:00:00',
    updated_at: '2026-08-19 12:00:00',
    deleted_at: null,
    ...overrides,
  }
}

test('hydrates values before navigation and isolates snapshots by script id', () => {
  const scripts = [script(), script({ id: 'script-2', name: 'Second' })]
  const service = {
    refresh: vi.fn(),
    getEnabledScriptsSnapshot: vi.fn(() => scripts),
    getMatchingScriptsWithMeta: vi.fn(() => scripts.map(item => ({
      script: item,
      requires: [],
      resources: [],
    }))),
  }
  const runtime = new UserScriptRuntime({
    userScriptService: service,
    listValues: (scriptId) => [{
      id: `value-${scriptId}`,
      script_id: scriptId,
      value_key: 'count',
      value: scriptId === 'script-1' ? 1 : 2,
      created_at: '',
      updated_at: '',
    }],
    setValue: vi.fn(),
    deleteValue: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })

  runtime.refresh()
  const snapshot = runtime.getNavigationSnapshot('https://example.com/problem/1', true)
  assert.strictEqual(snapshot.generation, 1)
  assert.deepStrictEqual(snapshot.scripts.map(item => [item.id, item.values]), [
    ['script-1', [['count', 1]]],
    ['script-2', [['count', 2]]],
  ])
  assert.deepStrictEqual(snapshot.scripts.map(item => item.connects), [[], []])
  assert.strictEqual(service.refresh.mock.calls.length, 1)
})

test('filters noframes scripts and updates the in-memory value snapshot after persistence', () => {
  const mainOnly = script({ noframes: true })
  const setValue = vi.fn()
  const deleteValue = vi.fn()
  const service = {
    refresh: vi.fn(),
    getEnabledScriptsSnapshot: vi.fn(() => [mainOnly]),
    getMatchingScriptsWithMeta: vi.fn(() => [{ script: mainOnly, requires: [], resources: [] }]),
  }
  const runtime = new UserScriptRuntime({
    userScriptService: service,
    listValues: () => [],
    setValue,
    deleteValue,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })

  runtime.refresh()
  assert.deepStrictEqual(runtime.getNavigationSnapshot('https://example.com/frame', false).scripts, [])
  runtime.setValue(mainOnly.id, 'settings', { enabled: true })
  assert.deepStrictEqual(
    runtime.getNavigationSnapshot('https://example.com/', true).scripts[0].values,
    [['settings', { enabled: true }]],
  )
  runtime.deleteValue(mainOnly.id, 'settings')
  assert.deepStrictEqual(runtime.getNavigationSnapshot('https://example.com/', true).scripts[0].values, [])
  assert.strictEqual(setValue.mock.calls.length, 1)
  assert.strictEqual(deleteValue.mock.calls.length, 1)
})

test('invalid persisted grant JSON fails closed for that script', () => {
  const invalid = script({ grant_json: '{broken' })
  const warn = vi.fn()
  const runtime = new UserScriptRuntime({
    userScriptService: {
      refresh: vi.fn(),
      getEnabledScriptsSnapshot: () => [invalid],
      getMatchingScriptsWithMeta: () => [{ script: invalid, requires: [], resources: [] }],
    },
    listValues: () => [],
    setValue: vi.fn(),
    deleteValue: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
  })

  runtime.refresh()
  assert.deepStrictEqual(runtime.getNavigationSnapshot('https://example.com/', true).scripts, [])
  assert.strictEqual(warn.mock.calls.length, 1)
})

test('invalid persisted connect JSON fails closed for that script', () => {
  const invalid = script({ connect_json: '{broken' })
  const warn = vi.fn()
  const runtime = new UserScriptRuntime({
    userScriptService: {
      refresh: vi.fn(),
      getEnabledScriptsSnapshot: () => [invalid],
      getMatchingScriptsWithMeta: () => [{ script: invalid, requires: [], resources: [] }],
    },
    listValues: () => [],
    setValue: vi.fn(),
    deleteValue: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
  })

  runtime.refresh()
  assert.deepStrictEqual(runtime.getNavigationSnapshot('https://example.com/', true).scripts, [])
  assert.strictEqual(warn.mock.calls.length, 1)
})

test('refresh failure advances the generation and clears value mutation authority', () => {
  const enabledScript = script()
  let refreshShouldFail = false
  const service = {
    refresh: vi.fn(() => {
      if (refreshShouldFail) throw new Error('database unavailable')
    }),
    getEnabledScriptsSnapshot: vi.fn(() => [enabledScript]),
    getMatchingScriptsWithMeta: vi.fn(() => [{ script: enabledScript, requires: [], resources: [] }]),
  }
  const runtime = new UserScriptRuntime({
    userScriptService: service,
    listValues: () => [{
      id: 'value-1',
      script_id: enabledScript.id,
      value_key: 'count',
      value: 1,
      created_at: '',
      updated_at: '',
    }],
    setValue: vi.fn(),
    deleteValue: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })
  const generations: number[] = []
  runtime.addGenerationChangeListener(generation => generations.push(generation))

  runtime.refresh()
  assert.strictEqual(runtime.generation, 1)
  refreshShouldFail = true
  assert.throws(() => runtime.refresh(), /database unavailable/)
  assert.strictEqual(runtime.generation, 2)
  assert.deepStrictEqual(generations, [1, 2])
  assert.throws(
    () => runtime.setValue(enabledScript.id, 'count', 2),
    /not enabled in the runtime cache/,
  )
})
