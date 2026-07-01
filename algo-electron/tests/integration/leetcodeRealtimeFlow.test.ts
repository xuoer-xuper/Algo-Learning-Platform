import assert from 'node:assert'
import type { ProblemIdentity, SubmissionData } from '../../electron/shared/types.ts'
import type { SiteConfigData } from '../../electron/db/repositories/siteRepository.ts'
import { leetcodeAdapter } from '../../electron/adapters/leetcode.ts'
import { createOjSubmissionBridge, installOjSubmissionMessageForwarder, OJ_SUBMISSION_BRIDGE_CHANNEL } from '../../electron/browser/ojBridge.ts'
import { RealtimeHookInjector, type RealtimeHookHost } from '../../electron/submissions/RealtimeHookInjector.ts'
import { RealtimeSubmissionDiagnostics, type RealtimeSubmissionStatus } from '../../electron/submissions/RealtimeSubmissionDiagnostics.ts'
import { SubmissionWatcherCore } from '../../electron/submissions/SubmissionWatcherCore.ts'

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

const pageUrl = 'https://leetcode.cn/problems/two-sum/'
const submissionCheckUrl = 'https://leetcode.cn/submissions/detail/7654321/check/'
const savedSubmissions: SubmissionData[] = []
const upsertedProblems: ProblemIdentity[] = []
const notifications: unknown[] = []
const detectionResults: Array<{ inserted: boolean; error?: string }> = []

const watcher = new SubmissionWatcherCore({
  getAdapter: (id) => id === leetcodeAdapter.id ? leetcodeAdapter : undefined,
  getAdapterForUrl: (url) => {
    try {
      const hostname = new URL(url).hostname
      return hostname === 'leetcode.cn' || hostname.endsWith('.leetcode.cn') ? leetcodeAdapter : null
    } catch {
      return null
    }
  },
  isSiteEnabled: (id) => id === leetcodeAdapter.id,
  writeSubmission: (submission, identity) => {
    if (identity) {
      upsertedProblems.push(identity)
      submission.problemId = `${identity.platform}:${identity.platformProblemId}`
    }
    savedSubmissions.push(submission)
    return true
  },
  notifyUpdated: (notification) => {
    notifications.push(notification)
  },
  logError: (_message, error) => {
    throw error instanceof Error ? error : new Error(String(error))
  },
})

const messageHandlers: Array<(event: MessageEvent) => void> = []
const fakeWindow: any = {
  fetch: async (input: string) => {
    const url = String(input)
    return {
      clone: () => ({
        json: async () => url.includes('/submit/')
          ? ({ submission_id: '7654321' })
          : ({
            state: 'SUCCESS',
            status_msg: 'Accepted',
            lang: 'cpp',
            runtime: '4 ms',
            memory: '9.4 MB',
            title_slug: 'two-sum',
            frontend_question_id: '1',
          }),
      }),
    }
  },
  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    if (type === 'message') messageHandlers.push(handler)
  },
  postMessage(data: unknown) {
    for (const handler of messageHandlers) {
      handler({ source: fakeWindow, data } as MessageEvent)
    }
  },
}

const diagnostics = new RealtimeSubmissionDiagnostics()
installOjSubmissionMessageForwarder(fakeWindow, (payload) => {
  const result = watcher.handleDetected(payload, { senderUrl: pageUrl })
  detectionResults.push(result)
  diagnostics.recordDetection(pageUrl, result)
})

assert.strictEqual(
  fakeWindow[OJ_SUBMISSION_BRIDGE_CHANNEL],
  undefined,
  'Flow should exercise postMessage fallback when direct bridge is not present',
)

const host: RealtimeHookHost = {
  async executeScriptOnUrl(url, code) {
    assert.strictEqual(url, pageUrl, 'Hook injector should target the active LeetCode page URL')
    new Function('window', 'location', code)(fakeWindow, { href: pageUrl })
  },
}

new RealtimeHookInjector({
  getRealtimeAdapterForUrl: (url) => url === pageUrl ? leetcodeAdapter : null,
  getSiteById: () => createSite(true),
  diagnostics,
  logWarn: () => {},
}).inject(host, pageUrl)
await flushMicrotasks()

assert.strictEqual(diagnostics.getStatus().lastHook?.status, 'success', 'Flow should inject LeetCode realtime hook')

const submitResponse = await fakeWindow.fetch('https://leetcode.cn/problems/two-sum/submit/')
assert(submitResponse, 'Hooked fetch should still return the submit response')
await flushMicrotasks()
assert.strictEqual(detectionResults.length, 0, 'Flow should not insert records from LeetCode submit acknowledgement')

const originalResponse = await fakeWindow.fetch(submissionCheckUrl)
assert(originalResponse, 'Hooked fetch should still return the page response')
await flushMicrotasks()

assert.strictEqual(detectionResults.length, 1, 'Flow should deliver one realtime detection to watcher')
assert.strictEqual(detectionResults[0].inserted, true, 'Flow should insert the detected submission')
assert.strictEqual(upsertedProblems.length, 1, 'Flow should upsert resolved LeetCode problem')
assert.strictEqual(upsertedProblems[0].platformProblemId, 'two-sum', 'Flow should resolve LeetCode problem slug')
assert.strictEqual(savedSubmissions.length, 1, 'Flow should persist one submission')
assert.strictEqual(savedSubmissions[0].platform, 'leetcode-cn')
assert.strictEqual(savedSubmissions[0].platformSubmissionId, '7654321')
assert.strictEqual(savedSubmissions[0].problemId, 'leetcode-cn:two-sum')
assert.strictEqual(savedSubmissions[0].verdict, 'AC')
assert.deepStrictEqual(notifications[0], {
  platform: 'leetcode-cn',
  verdict: 'AC',
  problemId: 'leetcode-cn:two-sum',
})

const status: RealtimeSubmissionStatus = diagnostics.getStatus()
assert.strictEqual(status.lastDetection?.senderUrl, pageUrl, 'Flow should record detection sender URL for diagnostics')
assert.strictEqual(status.lastDetection?.inserted, true, 'Flow should record successful detection diagnostics')
assert.strictEqual(status.lastDetection?.platform, 'leetcode-cn', 'Flow should record detected submission platform')
assert.strictEqual(status.lastDetection?.verdict, 'AC', 'Flow should record detected submission verdict')
assert.strictEqual(status.lastDetection?.problemId, 'leetcode-cn:two-sum', 'Flow should record detected submission problem id')

fakeWindow[OJ_SUBMISSION_BRIDGE_CHANNEL] = createOjSubmissionBridge((payload: unknown) => {
  const result = watcher.handleDetected(payload, { senderUrl: pageUrl })
  detectionResults.push(result)
})
await fakeWindow.fetch(submissionCheckUrl)
await flushMicrotasks()
assert.strictEqual(detectionResults.length, 2, 'Flow should also support direct preload bridge reporting')
assert.strictEqual(detectionResults[1].inserted, false, 'Watcher should dedupe repeated direct bridge reports')
