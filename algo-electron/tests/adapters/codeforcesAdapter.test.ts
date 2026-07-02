import assert from 'node:assert'
import { codeforcesAdapter } from '../../electron/adapters/codeforces.ts'

const identity = codeforcesAdapter.parseProblem('https://codeforces.com/problemset/problem/1900/A', {
  url: 'https://codeforces.com/problemset/problem/1900/A',
})

assert(identity, 'Codeforces adapter should parse problemset URLs')
assert.strictEqual(identity.platform, 'codeforces')
assert.strictEqual(identity.platformProblemId, '1900A')
assert.strictEqual(identity.canonicalUrl, 'https://codeforces.com/problemset/problem/1900/A')

assert.strictEqual(
  codeforcesAdapter.matchProblem('https://codeforces.com/contest/1900/problem/B'),
  true,
  'Codeforces adapter should match contest problem URLs',
)
assert.strictEqual(
  codeforcesAdapter.matchProblem('https://codeforces.com/contest/1900/standings'),
  false,
  'Codeforces adapter should not match non-problem Codeforces URLs',
)
assert.strictEqual(
  codeforcesAdapter.matchSubmissionResult!('https://codeforces.com/contest/1900/submission/234567'),
  true,
  'Codeforces adapter should match single submission result URLs',
)
assert.strictEqual(
  codeforcesAdapter.matchSubmissionResult!('https://codeforces.com/contest/1900/my'),
  true,
  'Codeforces adapter should match contest my-submissions pages',
)
assert.strictEqual(
  codeforcesAdapter.matchSubmissionResult!('https://codeforces.com/contest/1900/status/A'),
  true,
  'Codeforces adapter should match contest problem status pages after submission redirects',
)
assert.strictEqual(
  codeforcesAdapter.matchSubmissionResult!('https://codeforces.com/submissions/tourist'),
  true,
  'Codeforces adapter should match user submissions pages',
)

const realtimeSubmission = codeforcesAdapter.parseSubmissionResult!({
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/submissions/tourist',
  response: {
    tables: [
      {
        headers: ['#', 'When', 'Who', 'Problem', 'Lang', 'Verdict', 'Time', 'Memory'],
        rows: [
          {
            texts: ['234567', 'now', 'tourist', '1900A - Cover in Water', 'GNU C++17', 'Accepted', '46 ms', '1024 KB'],
            links: [
              'https://codeforces.com/contest/1900/submission/234567',
              '',
              '',
              'https://codeforces.com/contest/1900/problem/A',
            ],
          },
        ],
      },
    ],
  },
})

assert.ok(realtimeSubmission)
assert.strictEqual(realtimeSubmission.platform, 'codeforces')
assert.strictEqual(realtimeSubmission.platformSubmissionId, 'cf-234567')
assert.strictEqual(realtimeSubmission.verdict, 'AC')
assert.strictEqual(realtimeSubmission.language, 'GNU C++17')
assert.strictEqual(realtimeSubmission.runtimeMs, 46)
assert.ok(codeforcesAdapter.injectHookScript!().includes('codeforces'), 'Codeforces should use generic realtime hook')
assert.ok(codeforcesAdapter.injectHookScript!().includes('__ALGO_SUBMIT_INTENT_codeforces'), 'Codeforces hook should be submit-intent gated')
assert.ok(codeforcesAdapter.injectHookScript!().includes('scheduleReloadForPending'), 'Codeforces hook should refresh old pending result pages')
assert.ok(codeforcesAdapter.injectHookScript!().includes('filterTablesForIntent'), 'Codeforces hook should prefer current-user rows on contest status pages')

const judgingLatestSubmission = codeforcesAdapter.parseSubmissionResult!({
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/contest/1900/my',
  response: {
    tables: [
      {
        headers: ['#', 'When', 'Who', 'Problem', 'Lang', 'Verdict', 'Time', 'Memory'],
        rows: [
          {
            texts: ['234568', 'now', 'tourist', '1900A - Cover in Water', 'C++20 (GCC 13-64)', 'TESTING', '0 ms', '0 KB'],
            links: [
              'https://codeforces.com/contest/1900/submission/234568',
              '',
              '',
              'https://codeforces.com/contest/1900/problem/A',
            ],
          },
          {
            texts: ['234567', '1 minute ago', 'tourist', '1900A - Cover in Water', 'GNU C++17', 'Wrong Answer', '46 ms', '1024 KB'],
            links: [
              'https://codeforces.com/contest/1900/submission/234567',
              '',
              '',
              'https://codeforces.com/contest/1900/problem/A',
            ],
          },
        ],
      },
    ],
  },
})
assert.strictEqual(judgingLatestSubmission, null, 'Codeforces realtime should not fall back to older final rows while latest is judging')

const apiEnrichedRealtimeSubmission = codeforcesAdapter.parseSubmissionResult!({
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/contest/1900/status/A',
  response: {
    tables: [
      {
        headers: ['#', 'When', 'Who', 'Problem', 'Lang', 'Verdict', 'Time', 'Memory'],
        rows: [
          {
            texts: ['234569', 'now', 'tourist', '1900A - Cover in Water', 'GNU C++17', 'Accepted', '46 ms', '1024 KB'],
            links: ['https://codeforces.com/contest/1900/submission/234569', '', '', 'https://codeforces.com/contest/1900/problem/A'],
          },
        ],
      },
    ],
    apiSubmission: {
      id: 234569,
      contestId: 1900,
      problem: {
        contestId: 1900,
        index: 'A',
        name: 'Cover in Water',
      },
      verdict: 'WRONG_ANSWER',
      programmingLanguage: 'GNU C++20 (64)',
      timeConsumedMillis: 31,
      memoryConsumedBytes: 262144,
      creationTimeSeconds: 1760000200,
    },
  },
})
assert.ok(apiEnrichedRealtimeSubmission)
assert.strictEqual(apiEnrichedRealtimeSubmission.platformSubmissionId, 'cf-234569')
assert.strictEqual(apiEnrichedRealtimeSubmission.verdict, 'WA')
assert.strictEqual(apiEnrichedRealtimeSubmission.language, 'GNU C++20 (64)')
assert.strictEqual(apiEnrichedRealtimeSubmission.memoryKb, 256)

const apiEnrichedIdentity = codeforcesAdapter.resolveProblemIdentity!(apiEnrichedRealtimeSubmission, {
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/contest/1900/status/A',
  response: {},
})
assert.ok(apiEnrichedIdentity)
assert.strictEqual(apiEnrichedIdentity.platformProblemId, '1900A')
assert.strictEqual(apiEnrichedIdentity.title, 'Cover in Water')

const contestMySubmission = codeforcesAdapter.parseSubmissionResult!({
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/contest/2224/my',
  response: {
    tables: [
      {
        headers: ['#', '提交时间', '提交者', '问题', '语言', '判题状态', '时间', '内存'],
        rows: [
          {
            texts: [
              '380860544',
              'Jul/01/2026 11:17',
              'xuper',
              'E - Zhily and Signpost',
              'C++20 (GCC 13-64)',
              'Wrong answer on test 1',
              '15 ms',
              '0 KB',
            ],
            links: [
              'https://codeforces.com/contest/2224/submission/380860544',
              '',
              '',
              'https://codeforces.com/contest/2224/problem/E',
            ],
          },
        ],
      },
    ],
  },
})
assert.ok(contestMySubmission)
assert.strictEqual(contestMySubmission.platformSubmissionId, 'cf-380860544')
assert.strictEqual(contestMySubmission.verdict, 'WA')

const contestMyProblemIdentity = codeforcesAdapter.resolveProblemIdentity!(contestMySubmission, {
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/contest/2224/my',
  response: {},
  meta: {
    pageTitle: 'Problem - E - Codeforces',
  },
})
assert.ok(contestMyProblemIdentity)
assert.strictEqual(contestMyProblemIdentity.platformProblemId, '2224E')
assert.strictEqual(contestMyProblemIdentity.title, 'Zhily and Signpost')

const contestMySpaceSeparatedSubmission = {
  ...contestMySubmission,
  rawJson: JSON.stringify({
    headers: ['#', '提交时间', '提交者', '问题', '语言', '判题状态', '时间', '内存'],
    row: {
      texts: [
        '380860544',
        'Jul/01/2026 11:17',
        'xuper',
        'E Zhily and Signpost',
        'C++20 (GCC 13-64)',
        'Wrong answer on test 1',
        '15 ms',
        '0 KB',
      ],
      links: [
        'https://codeforces.com/contest/2224/submission/380860544',
        '',
        '',
        'https://codeforces.com/contest/2224/problem/E',
      ],
    },
  }),
}
assert.strictEqual(
  codeforcesAdapter.resolveProblemIdentity!(contestMySpaceSeparatedSubmission, {
    adapterId: 'codeforces',
    pageUrl: 'https://codeforces.com/contest/2224/my',
    response: {},
  })?.title,
  'Zhily and Signpost',
)

const contestMyNewlineSubmission = {
  ...contestMySubmission,
  rawJson: JSON.stringify({
    headers: ['#', '提交时间', '提交者', '问题', '语言', '判题状态', '时间', '内存'],
    row: {
      texts: [
        '380860544',
        'Jul/01/2026 11:17',
        'xuper',
        'E.\nZhily and Signpost',
        'C++20 (GCC 13-64)',
        'Wrong answer on test 1',
        '15 ms',
        '0 KB',
      ],
      links: [
        'https://codeforces.com/contest/2224/submission/380860544',
        '',
        '',
        'https://codeforces.com/contest/2224/problem/E',
      ],
    },
  }),
}
assert.strictEqual(
  codeforcesAdapter.resolveProblemIdentity!(contestMyNewlineSubmission, {
    adapterId: 'codeforces',
    pageUrl: 'https://codeforces.com/contest/2224/my',
    response: {},
  })?.title,
  'Zhily and Signpost',
)

const realtimeProblemIdentity = codeforcesAdapter.resolveProblemIdentity!(realtimeSubmission, {
  adapterId: 'codeforces',
  pageUrl: 'https://codeforces.com/contest/1900/problem/A',
  response: {},
  meta: {
    pageTitle: 'A. Cover in Water - Codeforces',
  },
})

assert.ok(realtimeProblemIdentity)
assert.strictEqual(realtimeProblemIdentity.platformProblemId, '1900A')
assert.strictEqual(realtimeProblemIdentity.title, 'Cover in Water')

const originalFetch = globalThis.fetch
const requestedUrls: string[] = []

globalThis.fetch = (async (url: string) => {
  requestedUrls.push(url)
  return {
    ok: true,
    json: async () => ({
      status: 'OK',
      result: [
        {
          id: 123456,
          contestId: 1900,
          problem: {
            contestId: 1900,
            index: 'A',
            name: 'Cover in Water',
          },
          verdict: 'OK',
          programmingLanguage: 'GNU C++17',
          timeConsumedMillis: 46,
          memoryConsumedBytes: 1048576,
          creationTimeSeconds: 1760000000,
        },
        {
          id: 123457,
          contestId: 1900,
          problem: {
            contestId: 1900,
            index: 'B',
            name: 'Laura and Operations',
          },
          verdict: 'WRONG_ANSWER',
          programmingLanguage: 'Python 3',
          timeConsumedMillis: 62,
          memoryConsumedBytes: 2097152,
          creationTimeSeconds: 1760000100,
        },
      ],
    }),
  } as any
}) as any

try {
  const submissions = await codeforcesAdapter.syncSubmissions!({ handle: 'tourist' })

  assert.strictEqual(requestedUrls.length, 1)
  assert.strictEqual(
    requestedUrls[0],
    'https://codeforces.com/api/user.status?handle=tourist&from=1&count=100',
  )
  assert.strictEqual(submissions.length, 2)
  assert.strictEqual(submissions[0].platform, 'codeforces')
  assert.strictEqual(submissions[0].platformSubmissionId, 'cf-123456')
  assert.strictEqual(submissions[0].verdict, 'AC')
  assert.strictEqual(submissions[0].language, 'GNU C++17')
  assert.strictEqual(submissions[0].runtimeMs, 46)
  assert.strictEqual(submissions[0].memoryKb, 1024)
  assert.strictEqual(submissions[0].sourceUrl, 'https://codeforces.com/contest/1900/submission/123456')
  assert.strictEqual(submissions[1].verdict, 'WA')
} finally {
  globalThis.fetch = originalFetch
}

await assert.rejects(
  () => codeforcesAdapter.syncSubmissions!({ handle: '' }),
  /Codeforces handle is required/,
)
