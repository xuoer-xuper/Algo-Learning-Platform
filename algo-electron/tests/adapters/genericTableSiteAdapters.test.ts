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
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/132048/status'),
  null,
  'Realtime hook should not auto-record generic status pages',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123456'),
  null,
  'Nowcoder submission detail pages should not install realtime hooks',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://ac.nowcoder.com/acm/contest/view-submission?submissionId=82952102&returnHomeType=1&uid=444830173'),
  null,
  'Nowcoder viewed submission detail pages with query params should not trigger realtime hooks',
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

assert.ok(realtimeNowcoderSubmission)
assert.strictEqual(realtimeNowcoderSubmission.platform, 'nowcoder')
assert.strictEqual(realtimeNowcoderSubmission.platformSubmissionId, 'nc-223344')
assert.strictEqual(realtimeNowcoderSubmission.verdict, 'AC')
assert.ok(nowcoderAdapter.injectHookScript!().includes('nowcoder'), 'Nowcoder realtime hook should include adapter id')
assert.ok(nowcoderAdapter.injectHookScript!().includes('frontend-verdict-observer'), 'Nowcoder should observe frontend result elements')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isProblemPage'), 'Nowcoder should gate frontend observing to problem pages')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isNowcoderSelfTestText'), 'Nowcoder should clear self-test run intent')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isOfficialSubmitText'), 'Nowcoder should only mark official submit intent')
assert.ok(nowcoderAdapter.injectHookScript!().includes("String(method || 'GET')"), 'Generic frontend hooks should treat missing methods as GET')
assert.ok(nowcoderAdapter.injectHookScript!().includes('view-submission|submissionid'), 'Generic frontend hooks should ignore viewed submission detail requests')
assert.ok(nowcoderAdapter.injectHookScript!().includes('查看|上次|记录|详情'), 'Generic frontend hooks should ignore view-submission controls')
assert.ok(nowcoderAdapter.injectHookScript!().includes('Submit\\s+Solution'), 'Generic frontend hooks should use strict official submit button text')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isNowcoderOfficialSubmitUrl'), 'Nowcoder official submit URLs should win over broad run/test words')
assert.ok(nowcoderAdapter.injectHookScript!().includes('if (isNowcoderOfficialSubmitUrl) return true'), 'Nowcoder official submit requests should not be cleared as self-tests')
assert.ok(nowcoderAdapter.injectHookScript!().includes('isNowcoderSelfTestUrl'), 'Nowcoder self-test URL detection should avoid broad "contest" matches')
assert.ok(!nowcoderAdapter.injectHookScript!().includes('isNowcoderSubmissionResultPage'), 'Nowcoder detail pages should never be scanned by realtime hooks')
assert.ok(nowcoderAdapter.injectHookScript!().includes('__ALGO_TOP_PAGE_URL'), 'Nowcoder hooks should keep the outer problem URL for subframes')
assert.ok(nowcoderAdapter.injectHookScript!().includes('setTimeout(installObserver'), 'Generic frontend hooks should retry observer installation after delayed body creation')

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
assert.ok(nowcoderIntentGatedDetailPayload)
assert.strictEqual(nowcoderIntentGatedDetailPayload.platformSubmissionId, 'nc-223344')
assert.strictEqual(
  nowcoderIntentGatedDetailPayload.sourceUrl,
  'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223344',
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
assert.ok(realtimeNowcoderFrontendSubmission)
assert.strictEqual(realtimeNowcoderFrontendSubmission.platformSubmissionId, 'nc-rt-def456')
assert.strictEqual(realtimeNowcoderFrontendSubmission.verdict, 'WA')
assert.strictEqual(realtimeNowcoderFrontendSubmission.runtimeMs, 4)
assert.strictEqual(realtimeNowcoderFrontendSubmission.memoryKb, 9728)

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

const nowcoderStatusIdentity = nowcoderAdapter.resolveProblemIdentity!(realtimeNowcoderSubmission, {
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
assert.ok(vjudgeAdapter.injectHookScript!().includes('frontend-verdict-observer'), 'VJudge should observe modal verdicts on problem pages')
assert.ok(vjudgeAdapter.injectHookScript!().includes('status'), 'VJudge should keep status/data realtime hook')
assert.ok(vjudgeAdapter.injectHookScript!().includes("String(method || 'GET')"), 'VJudge submit/status hooks should not treat GETs as submit intent')
assert.ok(vjudgeAdapter.injectHookScript!().includes('isOfficialSubmitText'), 'VJudge submit/status hooks should use strict submit text detection')

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
assert.ok(vjudgeModalSubmission)
assert.strictEqual(vjudgeModalSubmission.platformSubmissionId, 'vj-998881')
assert.strictEqual(vjudgeModalSubmission.verdict, 'AC')
assert.strictEqual(vjudgeModalSubmission.runtimeMs, 46)
assert.strictEqual(vjudgeModalSubmission.memoryKb, 1024)

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
