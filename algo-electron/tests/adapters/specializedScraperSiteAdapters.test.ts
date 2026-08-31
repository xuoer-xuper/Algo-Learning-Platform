import { test } from 'vitest'
import assert from 'node:assert'
import { luoguAdapter } from '../../electron/adapters/sites/luogu/index.ts'
import { ptaAdapter } from '../../electron/adapters/sites/pta/index.ts'
import { getRealtimeAdapterForUrl } from '../../electron/adapters/registry.ts'

test('adapters/specializedScraperSiteAdapters.test.ts', async () => {

function createHost(url: string, data: unknown) {
  return {
    getUrl: () => url,
    executeScript: async () => data,
  }
}

const ptaSubmissions = await ptaAdapter.scrapeSubmissions!(createHost('https://pintia.cn/problem-sets/994805260223102976/submissions', {
  headers: ['提交编号', '题目', '评测结果', '编译器', '耗时', '内存'],
  rows: [
    {
      texts: ['1234567890', '1001 A+B Format', '答案正确', 'C++', '4 ms', '1024 KB'],
      links: [
        'https://pintia.cn/submissions/1234567890',
        'https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552',
      ],
      allLinks: [
        ['https://pintia.cn/submissions/1234567890'],
        ['https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552'],
        [],
        [],
        [],
        [],
      ],
      htmls: ['', '', '', '', '', ''],
      classNames: ['', '', '', '', '', ''],
    },
  ],
}))

assert.strictEqual(ptaSubmissions.length, 1)
assert.strictEqual(ptaSubmissions[0].platform, 'pta')
assert.strictEqual(ptaSubmissions[0].platformSubmissionId, 'pta-1234567890')
assert.strictEqual(ptaSubmissions[0].verdict, 'AC')
assert.strictEqual(ptaSubmissions[0].language, 'C++')
assert.deepStrictEqual(JSON.parse(ptaSubmissions[0].rawJson || '{}'), {
  _ptaProblemId: '994805260223102976-1478636081501847552',
})

const realtimePtaSubmission = ptaAdapter.parseSubmissionResult!({
  adapterId: 'pta',
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/submissions',
  response: {
    headers: ['提交编号', '题目', '评测结果', '编译器', '耗时', '内存'],
    rows: [
      {
        texts: ['1234567890', '1001 A+B Format', '答案正确', 'C++', '4 ms', '1024 KB'],
        links: [
          'https://pintia.cn/submissions/1234567890',
          'https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552',
        ],
        allLinks: [
          ['https://pintia.cn/submissions/1234567890'],
          ['https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552'],
          [],
          [],
          [],
          [],
        ],
        htmls: ['', '', '', '', '', ''],
        classNames: ['', '', '', '', '', ''],
      },
    ],
  },
})

assert.ok(realtimePtaSubmission)
assert.strictEqual(realtimePtaSubmission.platformSubmissionId, 'pta-1234567890')
assert.strictEqual(realtimePtaSubmission.verdict, 'AC')
assert.ok(ptaAdapter.injectHookScript!().includes('pta'), 'PTA should expose realtime hook script')
assert.ok(ptaAdapter.injectHookScript!().includes('__ALGO_SUBMIT_INTENT_pta'), 'PTA realtime hook should be submit-intent gated')
assert.ok(ptaAdapter.injectHookScript!().includes('__ALGO_BLOCKED_SUBMIT_INTENT_pta'), 'PTA should block view/test controls from creating network submit intents')
assert.ok(ptaAdapter.injectHookScript!().includes('sessionStorage.removeItem(INTENT_KEY)'), 'PTA blocked view controls should clear stale submit intent')
assert.ok(ptaAdapter.injectHookScript!().includes('createSubmitIntentId'), 'PTA submit intent should include a stable id for popup submissions')
assert.ok(ptaAdapter.injectHookScript!().includes('id: reuseExistingId ? intent.id : createSubmitIntentId()'), 'PTA should create a new intent id for each new submit action')
assert.ok(ptaAdapter.injectHookScript!().includes('const shouldScan = () => hasRecentSubmitIntent()'), 'PTA single submission pages should still require submit intent')
assert.ok(ptaAdapter.injectHookScript!().includes('isSubmitIntentControlText'), 'PTA should gate realtime scans on submit-intent controls')
assert.ok(ptaAdapter.injectHookScript!().includes('查看|上次|记录|详情'), 'PTA should reject view-last-submission style controls')
assert.ok(ptaAdapter.injectHookScript!().includes('自测|运行|调试|样例'), 'PTA should reject run/sample-test style controls')
assert.ok(ptaAdapter.injectHookScript!().includes('return /提交|Submit/i.test(value)'), 'PTA should allow broader formal submit labels')
assert.ok(ptaAdapter.injectHookScript!().includes('pointerdown'), 'PTA should catch submit controls handled before click')
assert.ok(ptaAdapter.injectHookScript!().includes('/\\/submissions\\/\\d+(?:[/?#]|$)/.test(url)'), 'PTA should not treat viewing a submission detail as a submit request')
assert.ok(ptaAdapter.injectHookScript!().includes('const isJudgeRequest = /submit|submission|answer|solution|judge|record/.test(url)'), 'PTA should recognize formal submit APIs including submissions endpoints')
assert.ok(ptaAdapter.injectHookScript!().includes('frontend-verdict-observer'), 'PTA should observe modal verdicts after submit intent')
assert.ok(ptaAdapter.injectHookScript!().includes('__ALGO_TOP_PAGE_URL'), 'PTA should preserve outer problem URL for iframe submissions')
assert.ok(ptaAdapter.injectHookScript!().includes('isSubmitRequest'), 'PTA should schedule scans from matched submit requests')
assert.ok(ptaAdapter.injectHookScript!().includes('submit|submission|answer|solution|judge|record'), 'PTA should recognize judge-related submit API URLs')
assert.strictEqual(
  getRealtimeAdapterForUrl('https://pintia.cn/problem-sets/994805260223102976/exam-problems/1478636081501847552')?.id,
  'pta',
  'PTA exam-problems pages should install realtime hook',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://pintia.cn/problem-sets/994805260223102976')?.id,
  'pta',
  'PTA problem-set root pages should still install submit-gated realtime hook',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://pintia.cn/problem-sets/994805260223102976/exam/problems')?.id,
  'pta',
  'PTA SPA problem list pages should still install submit-gated realtime hook',
)
assert.strictEqual(
  ptaAdapter.matchSubmissionResult!('https://pintia.cn/problem-sets/994805260223102976/exam/submissions'),
  true,
  'PTA submissions page should be recognized as a realtime result page',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://pintia.cn/problem-sets/994805260223102976/problems/type/7?problemId=1478636081501847552')?.id,
  'pta',
  'PTA non-exam type problem pages should install realtime hook',
)
assert.strictEqual(
  getRealtimeAdapterForUrl('https://pintia.cn/submissions/1234567890')?.id,
  'pta',
  'PTA single submission pages should install realtime hook',
)

const realtimePtaModalSubmission = ptaAdapter.parseSubmissionResult!({
  adapterId: 'pta',
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/exam-problems/1478636081501847552',
  requestUrl: 'https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'pta-intent-1',
    verdictText: '答案正确',
    text: '评测结果 答案正确 运行时间 4 ms 使用内存 1024 KB C++',
    links: ['https://pintia.cn/submissions/1234567892'],
  },
})
assert.ok(realtimePtaModalSubmission)
assert.strictEqual(realtimePtaModalSubmission.platformSubmissionId, 'pta-1234567892')
assert.strictEqual(realtimePtaModalSubmission.verdict, 'AC')
assert.strictEqual(realtimePtaModalSubmission.language, 'C++')
assert.strictEqual(realtimePtaModalSubmission.runtimeMs, 4)
assert.strictEqual(realtimePtaModalSubmission.memoryKb, 1024)
assert.deepStrictEqual(JSON.parse(realtimePtaModalSubmission.rawJson || '{}')._ptaProblemId, '994805260223102976-1478636081501847552')

const realtimePtaNonExamTypeSubmission = ptaAdapter.parseSubmissionResult!({
  adapterId: 'pta',
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/problems/type/7?problemId=1478636081501847552',
  requestUrl: 'https://pintia.cn/problem-sets/994805260223102976/problems/type/7?problemId=1478636081501847552',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'pta-intent-2',
    verdictText: '答案正确',
    text: '评测结果 答案正确 运行时间 4 ms 使用内存 1024 KB C++',
    links: ['https://pintia.cn/submissions/1234567893'],
  },
})
assert.ok(realtimePtaNonExamTypeSubmission)
assert.strictEqual(realtimePtaNonExamTypeSubmission.language, 'C++')
assert.deepStrictEqual(JSON.parse(realtimePtaNonExamTypeSubmission.rawJson || '{}')._ptaProblemId, '994805260223102976-1478636081501847552')

const realtimePtaCpp20Submission = ptaAdapter.parseSubmissionResult!({
  adapterId: 'pta',
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/problems/type/7?problemId=1478636081501847552',
  requestUrl: 'https://pintia.cn/problem-sets/994805260223102976/problems/type/7?problemId=1478636081501847552',
  response: {
    _source: 'frontend-verdict-observer',
    submitId: 'pta-intent-3',
    verdictText: '答案正确',
    text: '答案正确 C++20 (GCC 13-64) 运行时间 4 ms 使用内存 1024 KB',
    links: ['https://pintia.cn/submissions/1234567894'],
  },
})
assert.ok(realtimePtaCpp20Submission)
assert.strictEqual(realtimePtaCpp20Submission.language, 'C++20 (GCC 13-64)')

const realtimePtaTestingSubmission = ptaAdapter.parseSubmissionResult!({
  adapterId: 'pta',
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/submissions',
  response: {
    headers: ['提交编号', '题目', '评测结果', '编译器'],
    rows: [
      {
        texts: ['1234567891', '1001 A+B Format', '正在评测', 'C++'],
        links: ['https://pintia.cn/submissions/1234567891', ''],
        allLinks: [['https://pintia.cn/submissions/1234567891'], []],
        htmls: ['', ''],
        classNames: ['', ''],
      },
    ],
  },
})
assert.strictEqual(realtimePtaTestingSubmission, null, 'PTA realtime should wait for final verdict')

const realtimePtaIdentity = ptaAdapter.resolveProblemIdentity!(realtimePtaSubmission, {
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/submissions',
  response: {},
})
assert.ok(realtimePtaIdentity)
assert.strictEqual(realtimePtaIdentity.platformProblemId, '994805260223102976-1478636081501847552')

const realtimePtaProblemPageIdentity = ptaAdapter.resolveProblemIdentity!(realtimePtaSubmission, {
  pageUrl: 'https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552',
  response: {},
  meta: {
    pageTitle: '7-1 打印沙漏 - PTA',
  },
})
assert.ok(realtimePtaProblemPageIdentity)
assert.strictEqual(realtimePtaProblemPageIdentity.platformProblemId, '994805260223102976-1478636081501847552')
assert.strictEqual(realtimePtaProblemPageIdentity.title, '7-1 打印沙漏')

const luoguSubmissions = await luoguAdapter.scrapeSubmissions!(createHost('https://www.luogu.com.cn/record/list', {
  fromInjection: true,
  records: [
    {
      id: 246810,
      status: 12,
      language: 11,
      time: 52,
      memory: 2048,
      submitTime: 1760000000,
      problem: { pid: 'P1001', title: 'A+B Problem' },
    },
  ],
}))

assert.strictEqual(luoguSubmissions.length, 1)
assert.strictEqual(luoguSubmissions[0].platform, 'luogu')
assert.strictEqual(luoguSubmissions[0].platformSubmissionId, '246810')
assert.strictEqual(luoguSubmissions[0].verdict, 'AC')
assert.strictEqual(luoguSubmissions[0].language, 'C++14')
assert.strictEqual(luoguSubmissions[0].runtimeMs, 52)
assert.strictEqual(luoguSubmissions[0].memoryKb, 2048)
assert.strictEqual(typeof luoguSubmissions[0].submittedAt, 'string')
assert.match(luoguSubmissions[0].submittedAt, /^\d{4}-\d{2}-\d{2}T/)
assert.deepStrictEqual(JSON.parse(luoguSubmissions[0].rawJson || '{}'), {
  _luoguProblemId: 'P1001',
  _luoguProblemTitle: 'A+B Problem',
})

const realtimeLuoguSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/list',
  response: {
    fromInjection: true,
    records: [
      {
        id: 246810,
        status: 12,
        language: 11,
        time: 52,
        memory: 2048,
        submitTime: 1760000000,
        problem: { pid: 'P1001', title: 'A+B Problem' },
        detail: {
          testCases: [
            { status: 12 },
            { status: 12 },
          ],
        },
      },
    ],
  },
})

assert.ok(realtimeLuoguSubmission)
assert.strictEqual(realtimeLuoguSubmission.platformSubmissionId, '246810')
assert.strictEqual(realtimeLuoguSubmission.verdict, 'AC')
assert.strictEqual(realtimeLuoguSubmission.language, 'C++14')
assert.ok(luoguAdapter.injectHookScript!().includes('luogu'), 'Luogu should expose realtime hook script')
assert.ok(luoguAdapter.injectHookScript!().includes('shouldReportExtracted'), 'Luogu realtime hook should gate reports until extracted data is final')

const realtimeLuoguUrlProblemSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246814',
  response: {
    fromInjection: true,
    record: {
      id: 246814,
      status: 12,
      language: 28,
      time: 46,
      memory: 1024,
      submitTime: 1760000040,
      problem: {
        id: 998244353,
        title: 'P1001 A+B Problem',
        url: '/problem/P1001',
      },
      detail: {
        testCases: [{ status: 12 }],
      },
    },
  },
})
assert.ok(realtimeLuoguUrlProblemSubmission)
assert.strictEqual(realtimeLuoguUrlProblemSubmission.language, 'C++14 (GCC 9)')
assert.deepStrictEqual(JSON.parse(realtimeLuoguUrlProblemSubmission.rawJson || '{}'), {
  _luoguProblemId: 'P1001',
  _luoguProblemTitle: 'A+B Problem',
})

const realtimeLuoguCpp23Submission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246815',
  response: {
    fromInjection: true,
    languageMap: {
      34: { name: 'C++23' },
    },
    record: {
      id: 246815,
      status: 12,
      language: 34,
      time: 31,
      memory: 1024,
      submitTime: 1760000050,
      problem: { pid: 'P1001', title: 'A+B Problem' },
      detail: {
        testCases: [{ status: 12 }],
      },
    },
  },
})
assert.ok(realtimeLuoguCpp23Submission)
assert.strictEqual(realtimeLuoguCpp23Submission.language, 'C++23')

const realtimeLuoguUnknownLanguageSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246816',
  response: {
    fromInjection: true,
    record: {
      id: 246816,
      status: 12,
      language: 9999,
      time: 31,
      memory: 1024,
      submitTime: 1760000060,
      problem: { pid: 'P1001', title: 'A+B Problem' },
      detail: {
        testCases: [{ status: 12 }],
      },
    },
  },
})
assert.ok(realtimeLuoguUnknownLanguageSubmission)
assert.strictEqual(realtimeLuoguUnknownLanguageSubmission.language, '', 'Unknown Luogu numeric language ids should not be shown as raw numbers')

const realtimeLuoguUrlProblemIdentity = luoguAdapter.resolveProblemIdentity!(realtimeLuoguUrlProblemSubmission, {
  pageUrl: 'https://www.luogu.com.cn/record/246814',
  response: {},
})
assert.ok(realtimeLuoguUrlProblemIdentity)
assert.strictEqual(realtimeLuoguUrlProblemIdentity.platformProblemId, 'P1001')
assert.strictEqual(realtimeLuoguUrlProblemIdentity.title, 'A+B Problem')

const realtimeLuoguAggregateOnlySubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246812',
  response: {
    fromInjection: true,
    record: {
      id: 246812,
      status: 12,
      language: 11,
      time: 52,
      memory: 2048,
      submitTime: 1760000020,
      problem: { pid: 'P1001' },
    },
  },
})
assert.strictEqual(
  realtimeLuoguAggregateOnlySubmission,
  null,
  'Luogu realtime should wait for testcase details instead of trusting aggregate status only',
)

const realtimeLuoguTestingSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/list',
  response: {
    fromInjection: true,
    records: [
      {
        id: 246811,
        status: 1,
        language: 11,
        time: 0,
        memory: 0,
        submitTime: 1760000010,
        problem: { pid: 'P1001' },
      },
    ],
  },
})
assert.strictEqual(realtimeLuoguTestingSubmission, null, 'Luogu realtime should wait for final verdict')

const realtimeLuoguPendingCaseSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246813',
  response: {
    fromInjection: true,
    record: {
      id: 246813,
      status: 12,
      language: 11,
      time: 52,
      memory: 2048,
      submitTime: 1760000030,
      problem: { pid: 'P1001' },
      detail: {
        testCases: [
          { status: 12 },
          { status: 1 },
        ],
      },
    },
  },
})
assert.strictEqual(
  realtimeLuoguPendingCaseSubmission,
  null,
  'Luogu realtime should wait while any testcase is still judging',
)

const realtimeLuoguIdentity = luoguAdapter.resolveProblemIdentity!(realtimeLuoguSubmission, {
  pageUrl: 'https://www.luogu.com.cn/record/list',
  response: {},
})
assert.ok(realtimeLuoguIdentity)
assert.strictEqual(realtimeLuoguIdentity.platformProblemId, 'P1001')
assert.strictEqual(realtimeLuoguIdentity.title, 'A+B Problem')

const realtimeLuoguProblemPageIdentity = luoguAdapter.resolveProblemIdentity!(realtimeLuoguSubmission, {
  pageUrl: 'https://www.luogu.com.cn/problem/P1001',
  response: {},
  meta: {
    pageTitle: 'P1001 A+B Problem - 洛谷',
  },
})
assert.ok(realtimeLuoguProblemPageIdentity)
assert.strictEqual(realtimeLuoguProblemPageIdentity.platformProblemId, 'P1001')
assert.strictEqual(realtimeLuoguProblemPageIdentity.title, 'A+B Problem')

const luoguSingleRecordSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/123456',
  response: {
    fromInjection: true,
    record: {
      id: 123456,
      status: 12,
      language: 28,
      time: 46,
      memory: 1024,
      submitTime: 1780000000,
      problem: { pid: 'P1001' },
      detail: {
        testCases: [
          { status: 12 },
        ],
      },
    },
  },
})
assert.ok(luoguSingleRecordSubmission)
assert.strictEqual(luoguSingleRecordSubmission.platformSubmissionId, '123456')
assert.strictEqual(luoguSingleRecordSubmission.verdict, 'AC')

const luoguFirstFailedCaseSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/123457',
  response: {
    fromInjection: true,
    record: {
      id: 123457,
      status: 14,
      language: 28,
      time: 46,
      memory: 1024,
      submitTime: 1780000000,
      problem: { pid: 'P1001' },
      detail: {
        testCases: [
          { status: 12 },
          { status: 5 },
          { status: 6 },
        ],
      },
    },
  },
})
assert.ok(luoguFirstFailedCaseSubmission)
assert.strictEqual(luoguFirstFailedCaseSubmission.verdict, 'TLE')
assert.strictEqual(luoguFirstFailedCaseSubmission.rawVerdict, '5')

// 缺列的行：表头有 5 列且"题目"在第 4 列，这一行只给了 3 个单元格（合并单元格、加载中的
// 占位行都会这样）。于是 `cells[problemIdx]` 是 `undefined`——抓取器必须解析出能解析的部分，
// 而不是在它上面调 `.match()` 抛异常，把整批结果一起丢掉。
const ptaRaggedRowSubmissions = await ptaAdapter.scrapeSubmissions!(createHost('https://pintia.cn/problem-sets/994805260223102976/submissions', {
  headers: ['提交编号', '评测结果', '编译器', '题目', '耗时'],
  rows: [
    {
      texts: ['1234567891', '答案正确', ''],
      links: ['https://pintia.cn/submissions/1234567891'],
      allLinks: [['https://pintia.cn/submissions/1234567891']],
      htmls: [''],
      classNames: [''],
    },
  ],
}))
assert.strictEqual(ptaRaggedRowSubmissions.length, 1, 'PTA should still parse a row with fewer cells than headers')
assert.strictEqual(ptaRaggedRowSubmissions[0].platformSubmissionId, 'pta-1234567891')
assert.strictEqual(ptaRaggedRowSubmissions[0].verdict, 'AC')
assert.strictEqual(ptaRaggedRowSubmissions[0].language, '')
assert.strictEqual(ptaRaggedRowSubmissions[0].rawJson, undefined, 'PTA should report no problem hint when the problem cell is missing')

// 非字符串单元格：PTA 的实时钩子拦的是页面响应体，形状由对方决定，`texts` 里出现 null
// 或数字都不违反任何契约。收窄时换成空串而不是丢掉，否则后面所有列都会错位。
const ptaNonStringCellSubmissions = await ptaAdapter.scrapeSubmissions!(createHost('https://pintia.cn/problem-sets/994805260223102976/submissions', {
  headers: ['提交编号', '题目', '评测结果', '编译器'],
  rows: [
    {
      texts: [1234567892, null, '答案正确', 'C++'],
      links: ['https://pintia.cn/submissions/1234567892', null],
      allLinks: [null, ['https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847999']],
      htmls: [null, ''],
      classNames: [''],
    },
  ],
}))
assert.strictEqual(ptaNonStringCellSubmissions.length, 1, 'PTA should keep column alignment when a cell is not a string')
assert.strictEqual(ptaNonStringCellSubmissions[0].verdict, 'AC', 'verdict column must not shift when an earlier cell is dropped')
assert.strictEqual(ptaNonStringCellSubmissions[0].language, 'C++')
assert.deepStrictEqual(JSON.parse(ptaNonStringCellSubmissions[0].rawJson || '{}'), {
  _ptaProblemId: '994805260223102976-1478636081501847999',
})

// 洛谷的 time/memory 在不同页面上给过字符串形式，而 SubmissionData 声明的是 number。
// 原先靠 `any` 直接赋值，字符串会原样写进声明为数字的字段。
const luoguStringMetricsSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246820',
  response: {
    fromInjection: true,
    record: {
      id: 246820,
      status: 12,
      language: 11,
      time: '52',
      memory: '2048',
      submitTime: '1760000000',
      problem: { pid: 'P1001' },
      detail: { testCases: [{ status: 12 }] },
    },
  },
})
assert.ok(luoguStringMetricsSubmission)
assert.strictEqual(luoguStringMetricsSubmission.runtimeMs, 52, 'numeric strings should become numbers, not stay strings')
assert.strictEqual(luoguStringMetricsSubmission.memoryKb, 2048)
assert.match(luoguStringMetricsSubmission.submittedAt, /^\d{4}-\d{2}-\d{2}T/)

// 非数字的 time/memory 应该变成"没这项"，而不是 NaN 或原值。
const luoguBadMetricsSubmission = luoguAdapter.parseSubmissionResult!({
  adapterId: 'luogu',
  pageUrl: 'https://www.luogu.com.cn/record/246821',
  response: {
    fromInjection: true,
    record: {
      id: 246821,
      status: 12,
      language: 11,
      time: '--',
      memory: null,
      problem: { pid: 'P1001' },
      detail: { testCases: [{ status: 12 }] },
    },
  },
})
assert.ok(luoguBadMetricsSubmission)
assert.strictEqual(luoguBadMetricsSubmission.runtimeMs, undefined, 'unparseable runtime should be absent, not NaN')
assert.strictEqual(luoguBadMetricsSubmission.memoryKb, undefined)

assert.strictEqual(ptaAdapter.matchProblem('https://pintia.cn/problem-sets/994805260223102976/exam/problems/type/7?problemSetProblemId=1478636081501847552'), true)
assert.strictEqual(luoguAdapter.matchProblem('https://www.luogu.com.cn/problem/P1001'), true)

})
