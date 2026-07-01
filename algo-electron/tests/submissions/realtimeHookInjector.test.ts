import assert from 'node:assert'
import type { SiteAdapter } from '../../electron/adapters/types.ts'
import type { SiteConfigData } from '../../electron/db/repositories/siteRepository.ts'
import { RealtimeHookInjector, type RealtimeHookHost } from '../../electron/submissions/RealtimeHookInjector.ts'
import { RealtimeSubmissionDiagnostics } from '../../electron/submissions/RealtimeSubmissionDiagnostics.ts'

function createAdapter(id = 'leetcode-cn'): SiteAdapter {
  return {
    id,
    name: 'LeetCode.cn',
    domains: ['leetcode.cn'],
    homeUrl: 'https://leetcode.cn/problemset/',
    matchProblem: () => true,
    parseProblem: () => null,
    injectHookScript: () => 'window.__hooked = true',
  }
}

function createSite(enabled: boolean): SiteConfigData {
  return {
    id: 'leetcode-cn',
    name: 'LeetCode.cn',
    domains: ['leetcode.cn'],
    homeUrl: 'https://leetcode.cn/problemset/',
    enabled,
    isBuiltin: true,
  }
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const successDiagnostics = new RealtimeSubmissionDiagnostics()
const executed: { url: string; code: string }[] = []
const successHost: RealtimeHookHost = {
  executeScriptOnUrl: async (url, code) => {
    executed.push({ url, code })
  },
}

new RealtimeHookInjector({
  getRealtimeAdapterForUrl: () => createAdapter(),
  getSiteById: () => createSite(true),
  diagnostics: successDiagnostics,
  logWarn: () => {},
}).inject(successHost, 'https://leetcode.cn/problems/two-sum/')
await flushMicrotasks()

assert.deepStrictEqual(executed, [{
  url: 'https://leetcode.cn/problems/two-sum/',
  code: 'window.__hooked = true',
}], 'Hook injector should execute adapter hook script on matching enabled sites')
assert.strictEqual(successDiagnostics.getStatus().lastHook?.status, 'success', 'Hook injector should record successful injection')

const disabledDiagnostics = new RealtimeSubmissionDiagnostics()
let disabledExecuted = false
new RealtimeHookInjector({
  getRealtimeAdapterForUrl: () => createAdapter(),
  getSiteById: () => createSite(false),
  diagnostics: disabledDiagnostics,
  logWarn: () => {},
}).inject({
  executeScriptOnUrl: async () => {
    disabledExecuted = true
  },
}, 'https://leetcode.cn/problems/two-sum/')
await flushMicrotasks()

assert.strictEqual(disabledExecuted, false, 'Hook injector should not inject when site is disabled')
assert.strictEqual(disabledDiagnostics.getStatus().lastHook?.status, 'skipped', 'Hook injector should record disabled site as skipped')
assert.strictEqual(disabledDiagnostics.getStatus().lastHook?.reason, 'Site disabled')

const failureDiagnostics = new RealtimeSubmissionDiagnostics()
const warnings: unknown[][] = []
new RealtimeHookInjector({
  getRealtimeAdapterForUrl: () => createAdapter(),
  getSiteById: () => createSite(true),
  diagnostics: failureDiagnostics,
  logWarn: (...args) => warnings.push(args),
}).inject({
  executeScriptOnUrl: async () => {
    throw new Error('execute failed')
  },
}, 'https://leetcode.cn/problems/two-sum/')
await new Promise((resolve) => setTimeout(resolve, 1300))

assert.strictEqual(failureDiagnostics.getStatus().lastHook?.status, 'failed', 'Hook injector should record failed injection')
assert.strictEqual(failureDiagnostics.getStatus().lastHook?.error, 'execute failed')
assert.strictEqual(warnings.length, 1, 'Hook injector should log injection failures')

const retryDiagnostics = new RealtimeSubmissionDiagnostics()
let attempts = 0
const retryExecuted: { url: string; code: string }[] = []
new RealtimeHookInjector({
  getRealtimeAdapterForUrl: () => createAdapter(),
  getSiteById: () => createSite(true),
  diagnostics: retryDiagnostics,
  logWarn: () => {},
}).inject({
  executeScriptOnUrl: async (url, code) => {
    attempts += 1
    if (attempts === 1) throw new Error('tab not ready')
    retryExecuted.push({ url, code })
  },
}, 'https://leetcode.cn/problems/two-sum/?envType=daily-question')
await new Promise((resolve) => setTimeout(resolve, 300))

assert.strictEqual(attempts, 2, 'Hook injector should retry transient injection failures')
assert.deepStrictEqual(retryExecuted, [{
  url: 'https://leetcode.cn/problems/two-sum/?envType=daily-question',
  code: 'window.__hooked = true',
}], 'Hook injector should execute hook after retry succeeds')
assert.strictEqual(retryDiagnostics.getStatus().lastHook?.status, 'success', 'Hook injector should record retry success')

const ignoredDiagnostics = new RealtimeSubmissionDiagnostics()
let ignoredExecuted = false
new RealtimeHookInjector({
  getRealtimeAdapterForUrl: () => null,
  getSiteById: () => createSite(true),
  diagnostics: ignoredDiagnostics,
  logWarn: () => {},
}).inject({
  executeScriptOnUrl: async () => {
    ignoredExecuted = true
  },
}, 'https://example.com/problems/two-sum/')
await flushMicrotasks()

assert.strictEqual(ignoredExecuted, false, 'Hook injector should ignore URLs without a realtime adapter')
assert.strictEqual(ignoredDiagnostics.getStatus().lastHook, undefined, 'Hook injector should not record ignored URLs as hook attempts')
assert.strictEqual(ignoredDiagnostics.getStatus().lastPage?.url, 'https://example.com/problems/two-sum/', 'Hook injector should still record ignored pages for diagnostics')
assert.strictEqual(ignoredDiagnostics.getStatus().lastPage?.realtimeSupported, false, 'Hook injector should mark ignored pages as unsupported')
