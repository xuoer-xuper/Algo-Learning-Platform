import assert from 'node:assert'
import { acwingAdapter, nowcoderAdapter, vjudgeAdapter } from '../../electron/adapters/genericTableSites.ts'
import { getRealtimeAdapterForUrl, getRealtimeAdapterIds } from '../../electron/adapters/registry.ts'

const now = () => '2026-06-29 10:00:00'

const acwingSubmissions = acwingAdapter.parseSubmissionTables!([
  { headers: ['标题', '作者'], rows: [{ texts: ['题解', 'xuper'] }] },
  {
    headers: ['状态', '语言', '运行时间'],
    rows: [
      {
        texts: ['Accepted', 'C++', '7 ms'],
        links: ['https://www.acwing.com/solution/content/246810/'],
      },
    ],
  },
], { now })

assert.strictEqual(acwingSubmissions.length, 1)
assert.strictEqual(acwingSubmissions[0].platform, 'acwing')
assert.strictEqual(acwingSubmissions[0].platformSubmissionId, 'ac-246810')
assert.strictEqual(acwingSubmissions[0].verdict, 'AC')
assert.strictEqual(acwingSubmissions[0].runtimeMs, 7)

const nowcoderSubmissions = nowcoderAdapter.parseSubmissionTables!([
  {
    headers: ['运行ID', '题号', '运行结果', '使用语言', '运行时间', '使用内存'],
    rows: [
      {
        texts: ['123456', 'A', '答案正确', 'C++', '4ms', '9.5MB'],
        links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123456'],
      },
    ],
  },
], { now })

assert.strictEqual(nowcoderSubmissions.length, 1)
assert.strictEqual(nowcoderSubmissions[0].platform, 'nowcoder')
assert.strictEqual(nowcoderSubmissions[0].platformSubmissionId, 'nc-123456')
assert.strictEqual(nowcoderSubmissions[0].memoryKb, 9728)
assert.strictEqual((nowcoderSubmissions[0] as any)._ncProbLetter, 'A')

const vjudgeSubmissions = vjudgeAdapter.parseSubmissionTables!([
  {
    headers: ['ID', 'When', 'Who', 'Problem', 'Result', 'Language', 'Time', 'Memory'],
    rows: [
      {
        texts: ['998877', '1 min ago', 'xuper', 'Gym 105173E', 'Accepted', 'GNU C++17', '46 ms', '1024 KB'],
        links: ['https://vjudge.net/solution/998877'],
      },
    ],
  },
], { now })

assert.strictEqual(vjudgeSubmissions.length, 1)
assert.strictEqual(vjudgeSubmissions[0].platform, 'vjudge')
assert.strictEqual(vjudgeSubmissions[0].platformSubmissionId, 'vj-998877')
assert.strictEqual(vjudgeSubmissions[0].language, 'GNU C++17')
assert.strictEqual(vjudgeSubmissions[0].runtimeMs, 46)
assert.strictEqual(JSON.parse(vjudgeSubmissions[0].rawJson || '{}')._vjudgeProblemId, 'Gym-105173E')

assert.strictEqual(acwingAdapter.matchProblem('https://www.acwing.com/problem/content/123/'), true)
assert.strictEqual(nowcoderAdapter.matchProblem('https://ac.nowcoder.com/acm/contest/132048/A'), true)
assert.strictEqual(vjudgeAdapter.matchProblem('https://vjudge.net/problem/POJ-1001'), true)
assert.strictEqual(vjudgeAdapter.matchProblem('https://vjudge.net/problem/Gym-105173E'), true)

for (const adapterId of ['codeforces', 'acwing', 'nowcoder', 'vjudge', 'pta', 'luogu', 'leetcode-cn']) {
  assert.ok(getRealtimeAdapterIds().includes(adapterId), `Realtime registry should expose ${adapterId}`)
}

assert.strictEqual(
  getRealtimeAdapterForUrl('https://codeforces.com/contest/1900/problem/A')?.id,
  'codeforces',
  'Codeforces problem pages should install submit-intent hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://codeforces.com/contest/1900/my')?.id,
  'codeforces',
  'Codeforces my-submissions pages should install realtime scan hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://www.acwing.com/problem/content/1001/')?.id,
  'acwing',
  'AcWing problem pages should install frontend verdict observers',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/132048/A')?.id,
  'nowcoder',
  'Nowcoder problem pages should install frontend verdict observers',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/problem/254199')?.id,
  'nowcoder',
  'Nowcoder standalone problem pages should install frontend verdict observers',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://leetcode.cn/problems/two-sum/')?.id,
  'leetcode-cn',
  'LeetCode problem pages should keep realtime XHR hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://vjudge.net/contest/809557#problem/K')?.id,
  'vjudge',
  'VJudge contest problem pages should keep status XHR hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://vjudge.net/contest/809557')?.id,
  'vjudge',
  'VJudge contest root pages should install submit-intent gated hooks for SPA problem views',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://vjudge.net/solution/70691154')?.id,
  'vjudge',
  'VJudge solution detail pages should install solution-detail hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/132048/status'),
  null,
  'Realtime hook should not auto-record generic status pages',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123456')?.id,
  'nowcoder',
  'Nowcoder submission detail pages should install submit-intent gated realtime hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/view-submission?submissionId=82952102&returnHomeType=1&uid=444830173')?.id,
  'nowcoder',
  'Nowcoder viewed submission detail pages still require a submit intent before reporting',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://www.acwing.com/problem/activity/submissions/'),
  null,
  'Realtime hook should not auto-record AcWing submission list pages',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://www.luogu.com.cn/auth/login'),
  null,
  'Realtime hook should not run on Luogu login pages',
)

const realtimeNowcoderSubmission = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  requestUrl: 'https://ac.nowcoder.com/api/service/judge/submit-status?id=judge-1',
  response: {
    _source: 'nowcoder-judge-status',
    submitId: 'intent-judge-status',
    language: 'C++',
    result: {
      id: 'judge-1',
      status: 5,
      submissionId: 223344,
      judgeReplyDesc: '答案正确',
      timeConsumption: 4,
      memoryConsumption: '9.5MB',
    },
  },
})

assert.ok(realtimeNowcoderSubmission)
assert.strictEqual(realtimeNowcoderSubmission.platform, 'nowcoder')
assert.strictEqual(realtimeNowcoderSubmission.platformSubmissionId, 'nc-223344')
assert.strictEqual(realtimeNowcoderSubmission.verdict, 'AC')

const realtimeNowcoderTableSubmission = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    tables: [
      {
        headers: ['运行ID', '题号', '运行结果', '使用语言'],
        rows: [
          {
            texts: ['223344', 'A', '答案正确', 'C++'],
            links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223344'],
          },
        ],
      },
    ],
  },
})
assert.strictEqual(
  realtimeNowcoderTableSubmission,
  null,
  'Nowcoder realtime parser should not write from table payloads',
)

assert.ok(nowcoderAdapter.injectHookScript!().includes('nowcoder'), 'Nowcoder realtime hook should include adapter id')
assert.ok(nowcoderAdapter.injectHookScript!().includes('__ALGO_NOWCODER_NETWORK_HOOK_INSTALLED__'), 'Nowcoder should use its site-specific network hook')
assert.ok(nowcoderAdapter.injectHookScript!().includes('findFinalJudgeData'), 'Nowcoder hook should find nested network judge payloads')
assert.ok(nowcoderAdapter.injectHookScript!().includes('selfTestPattern'), 'Nowcoder hook should explicitly block self-test requests')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isOfficialSubmitText'), 'Nowcoder should only mark official submit intent')
assert.ok(nowcoderAdapter.injectHookScript!().includes("String(method || 'GET')"), 'Generic frontend hooks should treat missing methods as GET')
assert.ok(nowcoderAdapter.injectHookScript!().includes('view-submission|submissionid'), 'Nowcoder hooks should ignore viewed submission detail requests')
assert.ok(nowcoderAdapter.injectHookScript!().includes('查看|上次|记录|详情'), 'Generic frontend hooks should ignore view-submission controls')
assert.ok(nowcoderAdapter.injectHookScript!().includes('Save\\s+and\\s+Submit'), 'Nowcoder hooks should recognize save-and-submit controls')
assert.ok(nowcoderAdapter.injectHookScript!().includes('pointerdown'), 'Nowcoder hooks should catch submit controls handled before click')
assert.ok(nowcoderAdapter.injectHookScript!().includes('keydown'), 'Nowcoder hooks should catch Ctrl+Enter editor submissions')
assert.ok(nowcoderAdapter.injectHookScript!().includes('nowcoder-judge-status'), 'Nowcoder hooks should report final judge status payloads')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isOfficialSubmitRequest'), 'Nowcoder should mark official submit-like network requests')
assert.ok(nowcoderAdapter.injectHookScript!().includes('if (isSelfTestRequest'), 'Nowcoder self-test requests should clear submit intent before network status can report')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isBlockedSubmitText'), 'View-history controls should clear realtime submit intent')
assert.ok(nowcoderAdapter.injectHookScript!().includes('__ALGO_TOP_PAGE_URL'), 'Nowcoder hooks should keep the outer problem URL for subframes')
assert.ok(!nowcoderAdapter.injectHookScript!().includes('frontend-verdict-observer'), 'Nowcoder hook should not emit DOM verdict payloads')

const nowcoderHookReports: any[] = []
const nowcoderListeners = new Map<string, Array<(event: any) => void>>()
const previousSessionStorage = (globalThis as any).sessionStorage
const storage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem(key: string) {
    return storage.get(key) ?? null
  },
  setItem(key: string, value: string) {
    storage.set(key, value)
  },
  removeItem(key: string) {
    storage.delete(key)
  },
}
const resultElement: any = {
  nodeType: 1,
  id: 'judge-result',
  className: 'el-message el-message--success',
  parentElement: null,
  textContent: '恭喜你通过了本题',
  value: '',
  getAttribute(name: string) {
    return name === 'role' ? 'dialog' : ''
  },
  cloneNode() {
    return {
      textContent: this.textContent,
      querySelectorAll: () => [],
    }
  },
  querySelectorAll: () => [],
}
const nowcoderDocument: any = {
  body: resultElement,
  title: '小苯的数组构造 - 牛客竞赛',
  addEventListener(type: string, handler: (event: any) => void) {
    nowcoderListeners.set(type, [...(nowcoderListeners.get(type) ?? []), handler])
  },
  querySelectorAll(selector: string) {
    return selector.includes('[role="dialog"]') ? [resultElement] : []
  },
}
const nowcoderWindow: any = {
  __ALGO_TOP_PAGE_URL: 'https://ac.nowcoder.com/acm/problem/247584',
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      nowcoderHookReports.push(payload)
    },
  },
  addEventListener() {},
  fetch: async (input: string) => ({
    clone() {
      return {
        async json() {
          if (input.includes('submit-answer')) {
            return {
              code: 0,
              data: {
                judgeResult: {
                  id: 'judge-submit-wa',
                  status: 8,
                  submissionId: 94836251,
                  judgeReplyDesc: '答案错误',
                  timeConsumption: 3,
                  memoryConsumption: 396,
                },
              },
            }
          }
          return {
            code: 0,
            data: {
              judgeResult: {
                id: 'judge-status-ac',
                status: 5,
                submissionId: 94836250,
                judgeReplyDesc: '答案正确',
                timeConsumption: 12,
                memoryConsumption: 9728,
              },
            },
          }
        },
      }
    },
  }),
}

new Function('window', 'location', 'document', nowcoderAdapter.injectHookScript!())(nowcoderWindow, {
  href: 'https://ac.nowcoder.com/acm/problem/247584',
  pathname: '/acm/problem/247584',
}, nowcoderDocument)
const submitButton = {
  textContent: '保存并提交',
  value: '',
  getAttribute: () => '',
  closest() {
    return this
  },
}
for (const listener of nowcoderListeners.get('pointerdown') ?? []) {
  listener({ target: submitButton })
}
await new Promise((resolve) => setTimeout(resolve, 1400))
assert.strictEqual(nowcoderHookReports.length, 0, 'Nowcoder hook should not report DOM modal results')
const pointerIntent = JSON.parse(storage.get('__ALGO_SUBMIT_INTENT_nowcoder') ?? '{}')
assert.strictEqual(pointerIntent.source, 'pointerdown', 'Nowcoder official submit click should still create formal submit intent')
await nowcoderWindow.fetch('/api/service/judge/submit-status?id=judge-status-ac', { method: 'GET' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(nowcoderHookReports.length, 1, 'Nowcoder hook should report nested final network judge results after formal submit intent')
assert.strictEqual(nowcoderHookReports[0].response._source, 'nowcoder-judge-status')
assert.strictEqual(nowcoderHookReports[0].response.result.submissionId, 94836250)
nowcoderHookReports.length = 0
storage.clear()
await nowcoderWindow.fetch('/api/coding/submit-answer', { method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(nowcoderHookReports.length, 1, 'Nowcoder official submit responses with final judge data should be reported')
assert.strictEqual(nowcoderHookReports[0].response.result.submissionId, 94836251)
nowcoderHookReports.length = 0
storage.clear()
for (const listener of nowcoderListeners.get('pointerdown') ?? []) {
  listener({ target: submitButton })
}
await nowcoderWindow.fetch('/api/coding/debug-run', { method: 'POST', body: 'customTestInput=1' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(
  storage.get('__ALGO_SUBMIT_INTENT_nowcoder'),
  undefined,
  'Nowcoder self-test/debug requests should clear stale formal submit intent',
)
assert.strictEqual(nowcoderHookReports.length, 0, 'Nowcoder self-test/debug network results should not be reported')
for (const listener of nowcoderListeners.get('keydown') ?? []) {
  listener({ key: 'Enter', code: 'Enter', keyCode: 13, ctrlKey: true, metaKey: false })
}
const keyboardIntent = JSON.parse(storage.get('__ALGO_SUBMIT_INTENT_nowcoder') ?? '{}')
;(globalThis as any).sessionStorage = previousSessionStorage
assert.strictEqual(keyboardIntent.source, 'keyboard', 'Nowcoder Ctrl+Enter should create formal submit intent')

const selfTestReports: any[] = []
const selfTestListeners = new Map<string, Array<(event: any) => void>>()
const selfTestStorage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem(key: string) {
    return selfTestStorage.get(key) ?? null
  },
  setItem(key: string, value: string) {
    selfTestStorage.set(key, value)
  },
  removeItem(key: string) {
    selfTestStorage.delete(key)
  },
}
const selfTestInput: any = {
  nodeType: 1,
  tagName: 'TEXTAREA',
  id: 'custom-test-input',
  className: 'self-test-input',
  parentElement: null,
  textContent: '',
  type: '',
  getAttribute(name: string) {
    if (name === 'placeholder') return '自测输入'
    if (name === 'name') return 'customTestInput'
    return ''
  },
  querySelectorAll: () => [],
  cloneNode() {
    return { textContent: '', querySelectorAll: () => [] }
  },
}
const selfTestPanel: any = {
  nodeType: 1,
  tagName: 'DIV',
  id: 'self-test-result',
  className: 'self-test-panel result',
  parentElement: null,
  textContent: '输入数据 输出数据 运行结果 答案错误',
  getAttribute(name: string) {
    return name === 'role' ? 'dialog' : ''
  },
  cloneNode() {
    return {
      textContent: this.textContent,
      querySelectorAll: () => [{ remove() {} }],
    }
  },
  querySelectorAll(selector: string) {
    return /textarea|input|textbox/.test(selector) ? [selfTestInput] : []
  },
}
selfTestInput.parentElement = selfTestPanel
const selfTestDocument: any = {
  body: selfTestPanel,
  title: '小苯的数组构造 - 牛客竞赛',
  addEventListener(type: string, handler: (event: any) => void) {
    selfTestListeners.set(type, [...(selfTestListeners.get(type) ?? []), handler])
  },
  querySelectorAll(selector: string) {
    return selector.includes('[role="dialog"]') || selector.includes('[class*="result"]') ? [selfTestPanel] : []
  },
}
const selfTestWindow: any = {
  __ALGO_TOP_PAGE_URL: 'https://ac.nowcoder.com/acm/problem/247584',
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      selfTestReports.push(payload)
    },
  },
  addEventListener() {},
}

new Function('window', 'location', 'document', nowcoderAdapter.injectHookScript!())(selfTestWindow, {
  href: 'https://ac.nowcoder.com/acm/problem/247584',
  pathname: '/acm/problem/247584',
}, selfTestDocument)
for (const listener of selfTestListeners.get('pointerdown') ?? []) {
  listener({ target: submitButton })
}
await new Promise((resolve) => setTimeout(resolve, 1400))
;(globalThis as any).sessionStorage = previousSessionStorage
assert.strictEqual(selfTestReports.length, 0, 'Nowcoder hook should ignore result panels that contain self-test input boxes')

const nowcoderStandalonePassPopupPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'standalone-popup',
    verdictText: '答案正确',
    text: '恭喜你通过了本题',
  },
})
assert.strictEqual(
  nowcoderStandalonePassPopupPayload,
  null,
  'Nowcoder frontend verdict payloads should not be realtime write sources',
)

const nowcoderStandaloneTestcasePassPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'standalone-testcase-popup',
    verdictText: '通过',
    text: '恭喜你通过了所有测试用例',
  },
})
assert.strictEqual(
  nowcoderStandaloneTestcasePassPayload,
  null,
  'Nowcoder official-looking testcase DOM text should still be ignored',
)

const nowcoderStandaloneReverseTestcasePassPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'standalone-testcase-reverse-popup',
    verdictText: '通过',
    text: '全部测试用例通过',
  },
})
assert.strictEqual(nowcoderStandaloneReverseTestcasePassPayload, null)

const nowcoderToolbarMixedOfficialPassPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'toolbar-mixed-official-pass',
    verdictText: '通过',
    text: '自测 调试 保存并提交 恭喜你通过了所有测试用例',
  },
})
assert.strictEqual(nowcoderToolbarMixedOfficialPassPayload, null)

const nowcoderFailedTestcasePayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'failed-testcase-popup',
    verdictText: '通过',
    text: '很遗憾，未通过所有测试用例',
  },
})
assert.strictEqual(nowcoderFailedTestcasePayload, null)

const nowcoderPartialTestcasePayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'partial-testcase-popup',
    verdictText: '通过',
    text: '通过了 1/10 个测试用例',
  },
})
assert.strictEqual(nowcoderPartialTestcasePayload, null)

const nowcoderFullFractionTestcasePayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'full-fraction-testcase-popup',
    verdictText: '通过',
    text: '通过了 10/10 个测试用例',
  },
})
assert.strictEqual(nowcoderFullFractionTestcasePayload, null)

const nowcoderJudgeStatusPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  requestUrl: 'https://ac.nowcoder.com/api/service/judge/submit-status?id=judge-1',
  response: {
    _source: 'nowcoder-judge-status',
    submitId: 'intent-judge-status',
    language: 'C++',
    result: {
      id: 'judge-1',
      status: 5,
      submissionId: 84736251,
      judgeReplyDesc: '答案正确',
      timeConsumption: 12,
      memoryConsumption: 9728,
    },
  },
})
assert.ok(nowcoderJudgeStatusPayload)
assert.strictEqual(nowcoderJudgeStatusPayload.platformSubmissionId, 'nc-84736251')
assert.strictEqual(nowcoderJudgeStatusPayload.verdict, 'AC')
assert.strictEqual(nowcoderJudgeStatusPayload.language, 'C++')
assert.strictEqual(nowcoderJudgeStatusPayload.runtimeMs, 12)
assert.strictEqual(nowcoderJudgeStatusPayload.memoryKb, 9728)

const nowcoderJudgeStatusFailedPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  requestUrl: 'https://ac.nowcoder.com/api/service/judge/submit-status?id=judge-wa',
  response: {
    _source: 'nowcoder-judge-status',
    submitId: 'intent-judge-status-wa',
    result: {
      id: 'judge-wa',
      status: 8,
      submissionId: 84736253,
      judgeReplyDesc: '未通过所有测试用例',
    },
  },
})
assert.ok(nowcoderJudgeStatusFailedPayload)
assert.strictEqual(nowcoderJudgeStatusFailedPayload.verdict, 'WA')

const nowcoderJudgeStatusFailureTextWinsPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  requestUrl: 'https://ac.nowcoder.com/api/service/judge/submit-status?id=judge-wa-text',
  response: {
    _source: 'nowcoder-judge-status',
    submitId: 'intent-judge-status-wa-text',
    result: {
      id: 'judge-wa-text',
      status: 5,
      submissionId: 84736254,
      judgeReplyDesc: '答案错误: 未通过所有测试用例',
    },
  },
})
assert.ok(nowcoderJudgeStatusFailureTextWinsPayload)
assert.strictEqual(
  nowcoderJudgeStatusFailureTextWinsPayload.verdict,
  'WA',
  'Nowcoder network failure text should win over AC-like status/text',
)

const nowcoderSelfTestJudgeStatusPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  requestUrl: 'https://ac.nowcoder.com/api/service/judge/submit-status?id=self-test',
  response: {
    _source: 'nowcoder-judge-status',
    submitId: 'intent-self-test',
    result: {
      id: 'self-test',
      status: 5,
      submissionId: 84736255,
      judgeReplyDesc: '答案正确',
      isSelfTest: true,
    },
  },
})
assert.strictEqual(
  nowcoderSelfTestJudgeStatusPayload,
  null,
  'Nowcoder self-test judge-status payloads should not be persisted',
)

const nowcoderPendingJudgeStatusPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  requestUrl: 'https://ac.nowcoder.com/api/service/judge/submit-status?id=judge-2',
  response: {
    _source: 'nowcoder-judge-status',
    submitId: 'intent-judge-status-pending',
    result: {
      id: 'judge-2',
      status: 2,
      submissionId: 84736252,
      judgeReplyDesc: '运行中',
    },
  },
})
assert.strictEqual(
  nowcoderPendingJudgeStatusPayload,
  null,
  'Nowcoder judge-status payloads should wait for final status',
)

const nowcoderIntentGatedDetailPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  requestUrl: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223344',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'intent-1',
    verdictText: '答案正确',
    text: '运行结果 答案正确 运行时间 4ms 使用内存 9.5MB',
  },
})
assert.strictEqual(
  nowcoderIntentGatedDetailPayload,
  null,
  'Nowcoder submission detail DOM payloads should not be realtime write sources',
)

const nowcoderSubmissionDetailPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223344',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'other-user',
    verdictText: '答案正确',
    text: '运行结果 答案正确 运行时间 4ms 使用内存 9.5MB',
  },
})
assert.strictEqual(
  nowcoderSubmissionDetailPayload,
  null,
  'Nowcoder realtime parser should reject payloads from submission detail pages',
)

const nowcoderSelfTestPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'self-test',
    verdictText: '答案正确',
    text: '自测结果 答案正确 运行时间 4ms 使用内存 9.5MB',
  },
})
assert.strictEqual(
  nowcoderSelfTestPayload,
  null,
  'Nowcoder self-test results should not be treated as official submissions',
)

const nowcoderSampleTestPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'sample-test',
    verdictText: '通过',
    text: '样例测试通过',
  },
})
assert.strictEqual(
  nowcoderSampleTestPayload,
  null,
  'Nowcoder sample-test results should not be treated as official submissions',
)

const nowcoderSelfTestcasePassPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'self-testcase-pass',
    verdictText: '通过',
    text: '自测结果 全部测试用例通过',
  },
})
assert.strictEqual(
  nowcoderSelfTestcasePassPayload,
  null,
  'Nowcoder self-test testcase-pass results should not be treated as official submissions',
)

const nowcoderDebugTestcasePassPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'debug-testcase-pass',
    verdictText: '通过',
    text: '调试结果 通过了所有测试用例',
  },
})
assert.strictEqual(
  nowcoderDebugTestcasePassPayload,
  null,
  'Nowcoder debug testcase-pass results should not be treated as official submissions',
)

const nowcoderSelfTestInputPayload = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/problem/247584',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'self-test-input',
    verdictText: '答案错误',
    text: '自测输入 输入数据 输出数据 运行结果 答案错误',
  },
})
assert.strictEqual(
  nowcoderSelfTestInputPayload,
  null,
  'Nowcoder self-test input result text should not be treated as an official submission',
)

const realtimeTestingSubmission = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    tables: [
      {
        headers: ['运行ID', '题号', '运行结果', '使用语言'],
        rows: [
          {
            texts: ['223345', 'A', '正在评测', 'C++'],
            links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223345'],
          },
        ],
      },
    ],
  },
})
assert.strictEqual(realtimeTestingSubmission, null, 'Realtime table scan should not persist in-progress judging rows')

const realtimeTestingWithOlderAccepted = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    tables: [
      {
        headers: ['运行ID', '题号', '运行结果', '使用语言'],
        rows: [
          {
            texts: ['223346', 'A', '正在评测', 'C++'],
            links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223346'],
          },
          {
            texts: ['223345', 'A', '答案正确', 'C++'],
            links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223345'],
          },
        ],
      },
    ],
  },
})
assert.strictEqual(
  realtimeTestingWithOlderAccepted,
  null,
  'Realtime table scan should not fall back to an older final row while the latest row is judging',
)

const realtimeAcwingFrontendSubmission = acwingAdapter.parseSubmissionResult!({
  adapterId: 'acwing',
  pageUrl: 'https://www.acwing.com/problem/content/1001/',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'abc123',
    verdictText: '答案正确',
    text: '评测结果 答案正确 运行时间 7 ms 内存 1024 KB',
  },
})
assert.ok(realtimeAcwingFrontendSubmission)
assert.strictEqual(realtimeAcwingFrontendSubmission.platform, 'acwing')
assert.strictEqual(realtimeAcwingFrontendSubmission.platformSubmissionId, 'ac-rt-abc123')
assert.strictEqual(realtimeAcwingFrontendSubmission.verdict, 'AC')
assert.strictEqual(realtimeAcwingFrontendSubmission.runtimeMs, 7)
assert.strictEqual(realtimeAcwingFrontendSubmission.memoryKb, 1024)
assert.ok(acwingAdapter.injectHookScript!().includes('frontend-verdict-observer'), 'AcWing should observe frontend result elements')

const realtimeAcwingFrontendSubmissionWithLanguage = acwingAdapter.parseSubmissionResult!({
  adapterId: 'acwing',
  pageUrl: 'https://www.acwing.com/problem/content/1001/',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'abc124',
    verdictText: '答案正确',
    text: '评测结果 答案正确 运行时间 7 ms 内存 1024 KB',
    language: 'C++20 (GCC 13-64)',
  },
})
assert.ok(realtimeAcwingFrontendSubmissionWithLanguage)
assert.strictEqual(realtimeAcwingFrontendSubmissionWithLanguage.language, 'C++20 (GCC 13-64)')

const realtimeAcwingFalsePositive = acwingAdapter.parseSubmissionResult!({
  adapterId: 'acwing',
  pageUrl: 'https://www.acwing.com/problem/content/667/',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'false-positive',
    verdictText: '答案正确',
    text: '有一个AC梦 发错了',
  },
})
assert.strictEqual(
  realtimeAcwingFalsePositive,
  null,
  'Frontend verdict parser should not trust AC-like words from problem content',
)

const realtimeNowcoderFrontendSubmission = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'def456',
    verdictText: '答案错误',
    text: '运行结果 答案错误 运行时间 4ms 使用内存 9.5MB',
  },
})
assert.strictEqual(
  realtimeNowcoderFrontendSubmission,
  null,
  'Nowcoder frontend verdict payloads should be ignored even when they contain final WA text',
)

const realtimeFrontendWithoutIntent = nowcoderAdapter.parseSubmissionResult!({
  adapterId: 'nowcoder',
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {
    _source: 'frontend-verdict-observer',
    verdictText: '答案正确',
    text: '答案正确',
  },
})
assert.strictEqual(realtimeFrontendWithoutIntent, null, 'Frontend verdicts without a submit id should be ignored')

const realtimeIdentity = nowcoderAdapter.resolveProblemIdentity!(realtimeNowcoderSubmission, {
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
  response: {},
  meta: {
    pageTitle: 'A 小红的数组 - 牛客竞赛',
  },
})
assert.ok(realtimeIdentity)
assert.strictEqual(realtimeIdentity.platformProblemId, 'contest-132048-A')
assert.strictEqual(realtimeIdentity.title, '小红的数组')

const acwingProblemIdentity = acwingAdapter.resolveProblemIdentity!(acwingSubmissions[0], {
  pageUrl: 'https://www.acwing.com/problem/content/1001/',
  response: {},
  meta: {
    pageTitle: '1001. A+B Problem - AcWing题库',
  },
})
assert.ok(acwingProblemIdentity)
assert.strictEqual(acwingProblemIdentity.platformProblemId, '1001')
assert.strictEqual(acwingProblemIdentity.title, 'A+B Problem')

const nowcoderStatusIdentity = nowcoderAdapter.resolveProblemIdentity!(nowcoderSubmissions[0], {
  pageUrl: 'https://ac.nowcoder.com/acm/contest/132048/status',
  response: {},
  meta: {
    pageTitle: '状态 - 牛客竞赛',
  },
})
assert.ok(nowcoderStatusIdentity)
assert.strictEqual(nowcoderStatusIdentity.platformProblemId, 'contest-132048-A')
assert.strictEqual(nowcoderStatusIdentity.title, undefined)

const vjudgeStatusIdentity = vjudgeAdapter.resolveProblemIdentity!(vjudgeSubmissions[0], {
  pageUrl: 'https://vjudge.net/contest/809557#status/xuper/K/0/',
  response: {},
})
assert.ok(vjudgeStatusIdentity)
assert.strictEqual(vjudgeStatusIdentity.platformProblemId, 'contest-809557-K')

const vjudgeStatusSubmission = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/K',
  requestUrl: 'https://vjudge.net/status/data/',
  response: {
    data: [
      ['998879', 'Gym-105173K', '<span>Accepted</span>', '46 ms', '1024 KB', 'GNU C++17'],
    ],
  },
})
assert.ok(vjudgeStatusSubmission)
assert.strictEqual(vjudgeStatusSubmission.platformSubmissionId, 'vj-998879')
assert.strictEqual(vjudgeStatusSubmission.verdict, 'AC')
assert.strictEqual(JSON.parse(vjudgeStatusSubmission.rawJson || '{}')._vjudgeProblemId, 'Gym-105173K')
assert.ok(!vjudgeAdapter.injectHookScript!().includes('frontend-verdict-observer'), 'VJudge should not use the generic frontend verdict observer')
assert.ok(vjudgeAdapter.injectHookScript!().includes('status'), 'VJudge should keep status/data realtime hook')
assert.ok(vjudgeAdapter.injectHookScript!().includes('vjudge-solution-detail-dom'), 'VJudge should read labeled solution detail boxes')
assert.ok(vjudgeAdapter.injectHookScript!().includes("String(method || 'GET')"), 'VJudge submit/status hooks should not treat GETs as submit intent')
assert.ok(vjudgeAdapter.injectHookScript!().includes('isOfficialSubmitText'), 'VJudge submit/status hooks should use strict submit text detection')
assert.ok(vjudgeAdapter.injectHookScript!().includes('isFinalLatestStatusRow'), 'VJudge status hook should wait for final latest-row verdicts')
assert.ok(vjudgeAdapter.injectHookScript!().includes('rowMatchesCurrentProblem'), 'VJudge status hook should filter public status rows by current problem')

const vjudgeSolutionDetailSubmission = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/solution/70691154',
  requestUrl: 'https://vjudge.net/solution/70691154',
  response: {
    _source: 'vjudge-solution-detail-dom',
    solutionId: '70691154',
    result: {
      id: '70691154',
      verdict: 'Wrong answer on test 1',
      runtime: '15ms',
      memory: '800kB',
      language: 'GNU G++23 14.2 (64 bit, msys2)',
      submittedAt: '2026-07-02 13:50:39',
      problem: 'Gym-105924G',
      _domText: '#70691154 xuper solution for Gym-105924G 评测结果 Wrong answer on test 1 耗时 15ms 内存消耗 800kB 代码长度 578 语言 GNU G++23 14.2 (64 bit, msys2) 提交时间 2026-07-02 13:50:39 远程提交ID 380981138',
    },
  },
})
assert.ok(vjudgeSolutionDetailSubmission)
assert.strictEqual(vjudgeSolutionDetailSubmission.platformSubmissionId, 'vj-70691154')
assert.strictEqual(vjudgeSolutionDetailSubmission.verdict, 'WA')
assert.strictEqual(vjudgeSolutionDetailSubmission.rawVerdict, 'Wrong answer on test 1')
assert.strictEqual(vjudgeSolutionDetailSubmission.runtimeMs, 15)
assert.strictEqual(vjudgeSolutionDetailSubmission.memoryKb, 800)
assert.strictEqual(vjudgeSolutionDetailSubmission.language, 'GNU G++23 14.2 (64 bit, msys2)')
assert.strictEqual(vjudgeSolutionDetailSubmission.submittedAt, '2026-07-02 13:50:39')
assert.strictEqual(JSON.parse(vjudgeSolutionDetailSubmission.rawJson || '{}')._vjudgeProblemId, 'Gym-105924G')

const vjudgeStatusRowLikeDetailPayload = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/K',
  requestUrl: 'https://vjudge.net/contest/809557#problem/K',
  response: {
    _source: 'vjudge-solution-detail-dom',
    solutionId: '998883',
    result: {
      id: '998883',
      verdict: 'WA',
      language: 'Pascal',
      _domText: 'WA Pascal 2026-07-02 12:32:16',
    },
  },
})
assert.strictEqual(
  vjudgeStatusRowLikeDetailPayload,
  null,
  'VJudge solution-detail parser should reject status-row-like text without detail labels',
)

const vjudgeWholePageNoisePayload = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/G',
  requestUrl: 'https://vjudge.net/contest/809557#problem/G',
  response: {
    _source: 'vjudge-solution-detail-dom',
    solutionId: '70691154',
    result: {
      id: '70691154',
      verdict: 'AC',
      language: 'xuper 登出 提交 状态 排行榜 题解 比赛 重新爬取 翻译 时间限制 1000 ms 内存限制 262144 kB',
      _domText: '评测结果 AC 语言 xuper 登出 提交 状态 排行榜 题解 比赛 重新爬取 翻译 时间限制 1000 ms 内存限制 262144 kB',
    },
  },
})
assert.strictEqual(
  vjudgeWholePageNoisePayload,
  null,
  'VJudge solution-detail parser should require a visible solution id, not whole-page problem text',
)

const vjudgeHookReports: any[] = []
const previousVjudgeSessionStorage = (globalThis as any).sessionStorage
const vjudgeStorage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem(key: string) {
    return vjudgeStorage.get(key) ?? null
  },
  setItem(key: string, value: string) {
    vjudgeStorage.set(key, value)
  },
  removeItem(key: string) {
    vjudgeStorage.delete(key)
  },
}
const vjudgeUserElement = {
  textContent: 'xuper',
  getAttribute() {
    return ''
  },
}
const vjudgeDocument: any = {
  title: 'VJudge',
  addEventListener() {},
  querySelectorAll() {
    return [vjudgeUserElement]
  },
}
const makeVjudgeResponse = (body: unknown) => ({
  clone() {
    return {
      async json() {
        return body
      },
    }
  },
})
const vjudgeFetchBodies = new Map<string, unknown>([
  ['/solution/run', { solutionId: '998878' }],
  ['/solution/submit', { solutionId: '998879' }],
  ['/solution/data/998879', {
    data: {
      id: '998879',
      status: 'Wrong Answer',
      language: 'GNU C++17',
      runtime: '46 ms',
      memory: '1024 KB',
      oj: 'Gym',
      probNum: '105173K',
    },
  }],
  ['/status/data/', {
    data: [
      ['998882', 'Gym-105173K', '<span>Accepted</span>', '0 ms', '0 KB', 'Pascal'],
      ['998879', 'Gym-105173K', '<span>Wrong Answer</span>', '46 ms', '1024 KB', 'GNU C++17'],
    ],
  }],
  ['/status/data/pending', {
    data: [
      ['998879', 'Gym-105173K', '<span>Judging</span>', '0 ms', '0 KB', 'GNU C++17'],
      ['998879', 'Gym-105173K', '<span>Accepted</span>', '46 ms', '1024 KB', 'GNU C++17'],
    ],
  }],
])
const vjudgeWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      vjudgeHookReports.push(payload)
    },
  },
  fetch: async (input: string) => makeVjudgeResponse(vjudgeFetchBodies.get(input)),
  XMLHttpRequest: undefined,
  postMessage() {},
}
new Function('window', 'location', 'document', vjudgeAdapter.injectHookScript!())(vjudgeWindow, {
  href: 'https://vjudge.net/contest/809557#problem/K',
  pathname: '/contest/809557',
  hash: '#problem/K',
}, vjudgeDocument)
await vjudgeWindow.fetch('/solution/run', { method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(
  vjudgeStorage.get('__ALGO_SUBMIT_INTENT_vjudge'),
  undefined,
  'VJudge run/debug requests should not create formal submit intent',
)
await vjudgeWindow.fetch('/solution/submit', { method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 0))
const vjudgeIntent = JSON.parse(vjudgeStorage.get('__ALGO_SUBMIT_INTENT_vjudge') ?? '{}')
assert.strictEqual(vjudgeIntent.solutionId, '998879', 'VJudge submit response should bind the realtime intent to solution id')
await vjudgeWindow.fetch('/solution/data/998879', { method: 'GET' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(vjudgeHookReports.length, 1, 'VJudge hook should report matched final modal solution data')
assert.strictEqual(vjudgeHookReports[0].response._source, 'vjudge-solution-data')
const vjudgeModalNetworkSubmission = vjudgeAdapter.parseSubmissionResult!(vjudgeHookReports[0])
assert.ok(vjudgeModalNetworkSubmission)
assert.strictEqual(vjudgeModalNetworkSubmission.platformSubmissionId, 'vj-998879')
assert.strictEqual(vjudgeModalNetworkSubmission.verdict, 'WA')
assert.strictEqual(vjudgeModalNetworkSubmission.runtimeMs, 46)
assert.strictEqual(vjudgeModalNetworkSubmission.memoryKb, 1024)
assert.strictEqual(JSON.parse(vjudgeModalNetworkSubmission.rawJson || '{}')._vjudgeProblemId, 'Gym-105173K')
vjudgeHookReports.length = 0
await vjudgeWindow.fetch('/status/data/', { method: 'GET' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(vjudgeHookReports.length, 1, 'VJudge hook should report only the matched final status row')
assert.strictEqual(vjudgeHookReports[0].response.data[0][0], '998879')
vjudgeHookReports.length = 0
await vjudgeWindow.fetch('/status/data/pending', { method: 'GET' })
await new Promise((resolve) => setTimeout(resolve, 0))
;(globalThis as any).sessionStorage = previousVjudgeSessionStorage
assert.strictEqual(
  vjudgeHookReports.length,
  0,
  'VJudge hook should not fall back to an older final row while the matched latest row is judging',
)

const vjudgeBodyNoiseReports: any[] = []
const vjudgeBodyNoiseStorage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem(key: string) {
    return vjudgeBodyNoiseStorage.get(key) ?? null
  },
  setItem(key: string, value: string) {
    vjudgeBodyNoiseStorage.set(key, value)
  },
  removeItem(key: string) {
    vjudgeBodyNoiseStorage.delete(key)
  },
}
const vjudgeBodyNoiseText = '评测结果 AC 语言 xuper 登出 提交 状态 排行榜 题解 比赛 重新爬取 翻译 时间限制 1000 ms 内存限制 262144 kB'
const vjudgeBodyNoiseElement: any = {
  nodeType: 1,
  id: 'page-root',
  className: 'result',
  innerText: vjudgeBodyNoiseText,
  textContent: vjudgeBodyNoiseText,
  getAttribute() {
    return ''
  },
  querySelectorAll() {
    return []
  },
}
const vjudgeBodyNoiseDocument: any = {
  body: vjudgeBodyNoiseElement,
  documentElement: {},
  title: 'VJudge Problem',
  addEventListener() {},
  querySelectorAll() {
    return [vjudgeBodyNoiseElement]
  },
}
const vjudgeBodyNoiseWindow: any = {
  __ALGO_TOP_PAGE_URL: 'https://vjudge.net/contest/809557#problem/G',
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      vjudgeBodyNoiseReports.push(payload)
    },
  },
  fetch: async () => makeVjudgeResponse({ solutionId: '70691154' }),
  XMLHttpRequest: undefined,
  postMessage() {},
}
new Function('window', 'location', 'document', vjudgeAdapter.injectHookScript!())(vjudgeBodyNoiseWindow, {
  href: 'https://vjudge.net/contest/809557#problem/G',
  pathname: '/contest/809557',
  hash: '#problem/G',
}, vjudgeBodyNoiseDocument)
await vjudgeBodyNoiseWindow.fetch('/solution/submit', { method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 20))
;(globalThis as any).sessionStorage = previousVjudgeSessionStorage
assert.strictEqual(
  vjudgeBodyNoiseReports.length,
  0,
  'VJudge hook should not report whole-page problem text before the solution detail appears',
)

const vjudgeDomReports: any[] = []
const vjudgeDomStorage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem(key: string) {
    return vjudgeDomStorage.get(key) ?? null
  },
  setItem(key: string, value: string) {
    vjudgeDomStorage.set(key, value)
  },
  removeItem(key: string) {
    vjudgeDomStorage.delete(key)
  },
}
const vjudgeDetailText = '#70691154 xuper solution for Gym-105924G 评测结果 Wrong answer on test 1 耗时 15ms 内存消耗 800kB 代码长度 578 语言 GNU G++23 14.2 (64 bit, msys2) 提交时间 2026-07-02 13:50:39 远程提交ID 380981138'
const vjudgeSolutionHref = 'https://vjudge.net/solution/70691154'
const vjudgeProblemHref = 'https://vjudge.net/problem/Gym-105924G'
const vjudgeDetailLinks = [
  {
    href: vjudgeSolutionHref,
    textContent: '#70691154',
    getAttribute() {
      return vjudgeSolutionHref
    },
  },
  {
    href: vjudgeProblemHref,
    textContent: 'Gym-105924G',
    getAttribute() {
      return vjudgeProblemHref
    },
  },
]
const vjudgeDetailElement: any = {
  nodeType: 1,
  id: 'solution-detail',
  className: 'modal solution-detail',
  innerText: vjudgeDetailText,
  textContent: vjudgeDetailText,
  getAttribute(name: string) {
    return name === 'role' ? 'dialog' : ''
  },
  querySelectorAll(selector: string) {
    return selector === 'a' ? vjudgeDetailLinks : []
  },
}
const vjudgeDomBody: any = {
  nodeType: 1,
  id: 'page',
  className: '',
  innerText: vjudgeDetailText,
  textContent: vjudgeDetailText,
  getAttribute() {
    return ''
  },
  querySelectorAll() {
    return [vjudgeDetailElement]
  },
}
const vjudgeDomDocument: any = {
  body: vjudgeDomBody,
  title: 'VJudge Solution',
  addEventListener() {},
  querySelectorAll(selector: string) {
    if (selector.includes('/user/') || selector.includes('userName')) return []
    return [vjudgeDetailElement]
  },
}
const vjudgeDomWindow: any = {
  __ALGO_TOP_PAGE_URL: 'https://vjudge.net/contest/809557#problem/G',
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      vjudgeDomReports.push(payload)
    },
  },
  fetch: async () => makeVjudgeResponse({ solutionId: '70691154' }),
  XMLHttpRequest: undefined,
  postMessage() {},
}
new Function('window', 'location', 'document', vjudgeAdapter.injectHookScript!())(vjudgeDomWindow, {
  href: 'https://vjudge.net/contest/809557#problem/G',
  pathname: '/contest/809557',
  hash: '#problem/G',
}, vjudgeDomDocument)
await vjudgeDomWindow.fetch('/solution/submit', { method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 20))
;(globalThis as any).sessionStorage = previousVjudgeSessionStorage
assert.strictEqual(vjudgeDomReports.length, 1, 'VJudge hook should report labeled solution detail boxes after formal submit intent')
assert.strictEqual(vjudgeDomReports[0].response._source, 'vjudge-solution-detail-dom')
const vjudgeDomSubmission = vjudgeAdapter.parseSubmissionResult!(vjudgeDomReports[0])
assert.ok(vjudgeDomSubmission)
assert.strictEqual(vjudgeDomSubmission.platformSubmissionId, 'vj-70691154')
assert.strictEqual(vjudgeDomSubmission.verdict, 'WA')
assert.strictEqual(vjudgeDomSubmission.language, 'GNU G++23 14.2 (64 bit, msys2)')

const vjudgeUnrelatedStatusSubmission = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/K',
  requestUrl: 'https://vjudge.net/status/data/',
  response: {
    data: [
      ['998882', 'POJ-1001', '<span>Accepted</span>', '0 ms', '0 KB', 'Pascal', '2026-07-02 09:51:31'],
    ],
  },
})
assert.strictEqual(
  vjudgeUnrelatedStatusSubmission,
  null,
  'VJudge realtime status should ignore final rows for other problems',
)

const vjudgeModalSubmission = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/K',
  requestUrl: 'https://vjudge.net/contest/809557#problem/K',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'vj-intent-1',
    verdictText: 'Accepted',
    text: 'Submit Result Accepted Time 46 ms Memory 1024 KB GNU C++17',
    links: ['https://vjudge.net/solution/998881'],
  },
})
assert.strictEqual(
  vjudgeModalSubmission,
  null,
  'VJudge frontend modal payloads should not be realtime write sources',
)

const vjudgeStatusRowLikeFrontendPayload = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/K',
  requestUrl: 'https://vjudge.net/contest/809557#problem/K',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'vj-intent-noise',
    verdictText: 'Accepted',
    text: 'AC Pascal 2026-07-02 09:51:31',
    links: ['https://vjudge.net/solution/998883'],
  },
})
assert.strictEqual(
  vjudgeStatusRowLikeFrontendPayload,
  null,
  'VJudge frontend observer should reject status-row-like AC/language/timestamp text',
)

const vjudgePendingWithOlderAccepted = vjudgeAdapter.parseSubmissionResult!({
  adapterId: 'vjudge',
  pageUrl: 'https://vjudge.net/contest/809557#problem/K',
  requestUrl: 'https://vjudge.net/status/data/',
  response: {
    data: [
      ['998880', 'Gym-105173K', '<span>Judging</span>', '0 ms', '0 KB', 'GNU C++17'],
      ['998879', 'Gym-105173K', '<span>Accepted</span>', '46 ms', '1024 KB', 'GNU C++17'],
    ],
  },
})
assert.strictEqual(
  vjudgePendingWithOlderAccepted,
  null,
  'VJudge realtime status should wait for the latest row to finish judging',
)
