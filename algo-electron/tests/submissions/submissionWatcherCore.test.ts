import { test } from 'vitest'
import assert from 'node:assert'
import type { ProblemIdentity, SubmissionData } from '../../electron/shared/types.ts'
import { leetcodeAdapter } from '../../electron/adapters/leetcode.ts'
import { SubmissionWatcherCore, type SubmissionNotification } from '../../electron/submissions/SubmissionWatcherCore.ts'

test('submissions/submissionWatcherCore.test.ts', async () => {

const notifications: SubmissionNotification[] = []
const savedSubmissions: SubmissionData[] = []
/*
 * 收进数组而不是 `let upsertedProblem: ProblemIdentity | null = null`。
 *
 * 赋值发生在 `writeSubmission` 的闭包里，TS 的控制流分析看不见，于是在断言处仍认定它是
 * `null`，`upsertedProblem?.platformProblemId` 收窄成 `never` 后报"Property 'platformProblemId'
 * does not exist on type 'never'"——和"可能为 null"完全不像。
 *
 * 数组顺带把"到底写了几次"也纳入断言：原先每次 writeSubmission 都覆盖同一个变量，
 * 多写一次和少写一次都看不出来。
 */
const upsertedProblems: Array<ProblemIdentity | null> = []

const core = new SubmissionWatcherCore({
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
    upsertedProblems.push(identity)
    if (identity) submission.problemId = `${identity.platform}:${identity.platformProblemId}`
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

const payload = {
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/123456/check/',
  response: {
    state: 'SUCCESS',
    status_msg: 'Accepted',
    lang: 'cpp',
    runtime: '4 ms',
    memory: '9.4 MB',
    title_slug: 'two-sum',
    frontend_question_id: '1',
  },
}

const result = core.handleDetected(payload, {
  senderUrl: 'https://leetcode.cn/problems/two-sum/',
})

assert.strictEqual(result.inserted, true, 'Watcher should insert a valid LeetCode realtime submission')
assert.deepStrictEqual(result.notification, {
  platform: 'leetcode-cn',
  verdict: 'AC',
  problemId: 'leetcode-cn:two-sum',
}, 'Watcher should return the saved submission notification details')
assert.strictEqual(upsertedProblems.length, 1, 'Watcher should write the submission exactly once')
const [upsertedProblem] = upsertedProblems
assert.strictEqual(upsertedProblem?.platformProblemId, 'two-sum', 'Watcher should upsert the resolved problem identity')
assert.strictEqual(savedSubmissions.length, 1, 'Watcher should save one submission')
assert.strictEqual(savedSubmissions[0].problemId, 'leetcode-cn:two-sum', 'Watcher should attach the resolved problem id')
assert.strictEqual(savedSubmissions[0].verdict, 'AC', 'Watcher should save normalized verdict')
assert.deepStrictEqual(notifications[0], {
  platform: 'leetcode-cn',
  verdict: 'AC',
  problemId: 'leetcode-cn:two-sum',
}, 'Watcher should emit the submission notification payload')

const duplicate = core.handleDetected(payload, {
  senderUrl: 'https://leetcode.cn/problems/two-sum/',
})
assert.strictEqual(duplicate.inserted, false, 'Watcher should dedupe repeated realtime payloads in memory')
assert.strictEqual(savedSubmissions.length, 1, 'Watcher should not call persistence for a duplicate payload')

const pending = core.handleDetected({
  ...payload,
  requestUrl: 'https://leetcode.cn/submissions/detail/222222/check/',
  response: {
    ...payload.response,
    state: 'PENDING',
    status_msg: 'Pending',
  },
}, {
  senderUrl: 'https://leetcode.cn/problems/two-sum/',
})
assert.strictEqual(pending.inserted, false, 'Watcher should not insert payloads without a final parsed submission')
assert.strictEqual(pending.error, 'No final submission parsed', 'Watcher should expose parse-empty diagnostics')
assert.strictEqual(savedSubmissions.length, 1, 'Watcher should not persist pending payloads')

const spoofed = core.handleDetected({
  ...payload,
  requestUrl: 'https://leetcode.cn/submissions/detail/999999/check/',
}, {
  senderUrl: 'https://example.com/problems/two-sum/',
})
assert.strictEqual(spoofed.inserted, false, 'Watcher should reject payloads from a mismatched sender URL')
assert.strictEqual(spoofed.error, 'Payload sender does not match adapter')

let transientWriteAttempts = 0
const retriedSubmissions: SubmissionData[] = []
const retryCore = new SubmissionWatcherCore({
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
  writeSubmission: (submission) => {
    transientWriteAttempts += 1
    if (transientWriteAttempts === 1) {
      throw new Error('temporary db failure')
    }
    retriedSubmissions.push(submission)
    return true
  },
  notifyUpdated: () => {},
  logError: () => {},
})

const transientFailure = retryCore.handleDetected({
  ...payload,
  requestUrl: 'https://leetcode.cn/submissions/detail/654321/check/',
  response: {
    ...payload.response,
    submission_id: '654321',
  },
}, {
  senderUrl: 'https://leetcode.cn/problems/two-sum/',
})
assert.strictEqual(transientFailure.inserted, false, 'Watcher should report transient persistence failures')
assert.strictEqual(transientFailure.error, 'temporary db failure')

const transientRetry = retryCore.handleDetected({
  ...payload,
  requestUrl: 'https://leetcode.cn/submissions/detail/654321/check/',
  response: {
    ...payload.response,
    submission_id: '654321',
  },
}, {
  senderUrl: 'https://leetcode.cn/problems/two-sum/',
})
assert.strictEqual(transientRetry.inserted, true, 'Watcher should retry the same submission after a failed write')
assert.strictEqual(transientWriteAttempts, 2, 'Watcher should not mark failed writes as seen')
assert.strictEqual(retriedSubmissions.length, 1, 'Watcher should persist the retried submission once')

})
