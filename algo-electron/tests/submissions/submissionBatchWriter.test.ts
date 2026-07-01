import assert from 'node:assert'
import type { ProblemIdentity, SubmissionData } from '../../electron/shared/types.ts'
import { SubmissionBatchWriter } from '../../electron/submissions/SubmissionBatchWriter.ts'

const problems = new Map<string, string>()
const upsertedProblems: ProblemIdentity[] = []
const savedSubmissions: SubmissionData[] = []
const firstAcProblemIds: string[] = []
let statsRecomputeCount = 0

const writer = new SubmissionBatchWriter({
  upsertProblem: (identity) => {
    upsertedProblems.push(identity)
    problems.set(`${identity.platform}:${identity.platformProblemId}`, `db:${identity.platform}:${identity.platformProblemId}`)
  },
  findProblemId: (platform, platformProblemId) => problems.get(`${platform}:${platformProblemId}`),
  upsertSubmission: (submission) => {
    if (savedSubmissions.some(saved => saved.platform === submission.platform && saved.platformSubmissionId === submission.platformSubmissionId)) {
      return false
    }
    savedSubmissions.push({ ...submission })
    return true
  },
  updateFirstAc: (problemId) => {
    firstAcProblemIds.push(problemId)
  },
  recomputeStats: () => {
    statsRecomputeCount += 1
  },
  parseUrl: (url) => {
    if (url.includes('fallback-pta')) {
      return {
          platform: 'pta',
          platformProblemId: 'set-999',
          canonicalUrl: url,
          confidence: 'url',
        }
    }
    if (url === 'https://codeforces.com/contest/1900/problem/B') {
      return {
        platform: 'codeforces',
        platformProblemId: '1900B',
        canonicalUrl: 'https://codeforces.com/contest/1900/problem/B',
        contestId: '1900',
        problemIndex: 'B',
        confidence: 'url',
      }
    }
    if (url === 'https://vjudge.net/problem/POJ-1001') {
      return {
        platform: 'vjudge',
        platformProblemId: 'POJ-1001',
        canonicalUrl: 'https://vjudge.net/problem/POJ-1001',
        sourcePlatform: 'POJ',
        sourceProblemId: '1001',
        confidence: 'url',
      }
    }
    return null
  },
  buildCodeforcesProblemUrl: (contestId, index) => `https://codeforces.com/problemset/problem/${contestId}/${index}`,
})

const codeforcesSubmission: SubmissionData = {
  platform: 'codeforces',
  platformSubmissionId: 'cf-1',
  verdict: 'AC',
  submittedAt: '2026-06-29 10:00:00',
  rawJson: JSON.stringify({ problem: { contestId: 1900, index: 'A' } }),
}

const codeforcesResult = writer.write({
  platform: 'codeforces',
  submissions: [codeforcesSubmission],
})

assert.deepStrictEqual(codeforcesResult, { platform: 'codeforces', fetched: 1, inserted: 1 })
assert.strictEqual(savedSubmissions[0].problemId, 'db:codeforces:1900A')
assert.strictEqual(firstAcProblemIds[0], 'db:codeforces:1900A')
assert.strictEqual(upsertedProblems[0].canonicalUrl, 'https://codeforces.com/problemset/problem/1900/A')

const codeforcesTableSubmission: SubmissionData = {
  platform: 'codeforces',
  platformSubmissionId: 'cf-2',
  verdict: 'WA',
  submittedAt: '2026-06-29 10:00:30',
  rawJson: JSON.stringify({
    row: {
      links: [
        'https://codeforces.com/contest/1900/submission/234568',
        'https://codeforces.com/contest/1900/problem/B',
      ],
    },
  }),
}

writer.write({
  platform: 'codeforces',
  submissions: [codeforcesTableSubmission],
})

assert.strictEqual(savedSubmissions[1].problemId, 'db:codeforces:1900B')

const codeforcesRealtimeSubmission: SubmissionData = {
  platform: 'codeforces',
  platformSubmissionId: 'cf-3',
  verdict: 'WA',
  submittedAt: '2026-06-29 10:00:45',
  sourceUrl: 'https://codeforces.com/contest/2224/submission/380860544',
}

writer.write({
  platform: 'codeforces',
  submissions: [codeforcesRealtimeSubmission],
  pageProblemId: '2224E',
  pageProblemIdentity: {
    platform: 'codeforces',
    platformProblemId: '2224E',
    canonicalUrl: 'https://codeforces.com/contest/2224/problem/E',
    title: 'Zhily and Signpost',
    contestId: '2224',
    problemIndex: 'E',
    confidence: 'content',
  },
})

assert.strictEqual(savedSubmissions[2].problemId, 'db:codeforces:2224E')
assert.strictEqual(upsertedProblems[2].title, 'Zhily and Signpost')

const pageSubmission: SubmissionData = {
  platform: 'nowcoder',
  platformSubmissionId: 'nc-1',
  verdict: 'WA',
  submittedAt: '2026-06-29 10:01:00',
}

writer.write({
  platform: 'nowcoder',
  submissions: [pageSubmission],
  pageProblemId: 'contest-123-A',
  pageProblemIdentity: {
    platform: 'nowcoder',
    platformProblemId: 'contest-123-A',
    canonicalUrl: 'https://ac.nowcoder.com/acm/contest/123/A',
    title: '作为子字符串出现在单词中的字符串数目',
    contestId: '123',
    problemIndex: 'A',
    confidence: 'url',
  },
})

assert.strictEqual(savedSubmissions[3].problemId, 'db:nowcoder:contest-123-A')
assert.strictEqual(upsertedProblems[3].title, '作为子字符串出现在单词中的字符串数目')

const vjudgeRawLinkSubmission: SubmissionData = {
  platform: 'vjudge',
  platformSubmissionId: 'vj-1',
  verdict: 'AC',
  submittedAt: '2026-06-29 10:01:30',
  rawJson: JSON.stringify({
    row: {
      links: [
        'https://vjudge.net/solution/998877',
        'https://vjudge.net/problem/POJ-1001',
      ],
    },
  }),
}

writer.write({
  platform: 'vjudge',
  submissions: [vjudgeRawLinkSubmission],
})

assert.strictEqual(savedSubmissions[4].problemId, 'db:vjudge:POJ-1001')

const vjudgeRawProblemSubmission: SubmissionData = {
  platform: 'vjudge',
  platformSubmissionId: 'vj-2',
  verdict: 'WA',
  submittedAt: '2026-06-29 10:01:45',
  rawJson: JSON.stringify({
    _vjudgeProblemId: 'Gym-105173E',
    _vjudgeSourcePlatform: 'Gym',
    _vjudgeSourceProblemId: '105173E',
  }),
}

writer.write({
  platform: 'vjudge',
  submissions: [vjudgeRawProblemSubmission],
})

assert.strictEqual(savedSubmissions[5].problemId, 'db:vjudge:Gym-105173E')

const ptaSubmission: SubmissionData = {
  platform: 'pta',
  platformSubmissionId: 'pta-1',
  verdict: 'AC',
  submittedAt: '2026-06-29 10:02:00',
}
;(ptaSubmission as any)._ptaProblemId = '994805260223102976-1478636081501847552'

writer.write({
  platform: 'pta',
  submissions: [ptaSubmission],
})

assert.strictEqual(savedSubmissions[6].problemId, 'db:pta:994805260223102976-1478636081501847552')

const fallbackPtaSubmission: SubmissionData = {
  platform: 'pta',
  platformSubmissionId: 'pta-2',
  verdict: 'WA',
  submittedAt: '2026-06-29 10:03:00',
  sourceUrl: 'https://pintia.cn/fallback-pta',
}

writer.write({
  platform: 'pta',
  submissions: [fallbackPtaSubmission],
})

assert.strictEqual(savedSubmissions[7].problemId, 'db:pta:set-999')

const luoguSubmission: SubmissionData = {
  platform: 'luogu',
  platformSubmissionId: 'lg-1',
  verdict: 'AC',
  submittedAt: '2026-06-29 10:04:00',
  rawJson: JSON.stringify({
    _luoguProblemId: 'P1001',
    _luoguProblemTitle: 'A+B Problem',
  }),
}

writer.write({
  platform: 'luogu',
  submissions: [luoguSubmission],
})

assert.strictEqual(savedSubmissions[8].problemId, 'db:luogu:P1001')
assert.strictEqual(
  upsertedProblems.find(problem => problem.platform === 'luogu' && problem.platformProblemId === 'P1001')?.title,
  'A+B Problem',
)

const nowcoderStatusSubmissionA: SubmissionData = {
  platform: 'nowcoder',
  platformSubmissionId: 'nc-2',
  verdict: 'AC',
  submittedAt: '2026-06-29 10:05:00',
}
;(nowcoderStatusSubmissionA as any)._ncContestId = '789'
;(nowcoderStatusSubmissionA as any)._ncProbLetter = 'A'

const nowcoderStatusSubmissionB: SubmissionData = {
  platform: 'nowcoder',
  platformSubmissionId: 'nc-3',
  verdict: 'WA',
  submittedAt: '2026-06-29 10:05:30',
}
;(nowcoderStatusSubmissionB as any)._ncContestId = '789'
;(nowcoderStatusSubmissionB as any)._ncProbLetter = 'B'

writer.write({
  platform: 'nowcoder',
  submissions: [nowcoderStatusSubmissionA, nowcoderStatusSubmissionB],
})

assert.strictEqual(savedSubmissions[9].problemId, 'db:nowcoder:contest-789-A')
assert.strictEqual(savedSubmissions[10].problemId, 'db:nowcoder:contest-789-B')
assert.strictEqual(statsRecomputeCount, 10, 'Stats should be recomputed once per write call with inserts')

const duplicateResult = writer.write({
  platform: 'pta',
  submissions: [fallbackPtaSubmission],
})

assert.deepStrictEqual(duplicateResult, { platform: 'pta', fetched: 1, inserted: 0 })
assert.strictEqual(statsRecomputeCount, 10, 'Stats should not be recomputed when no row is inserted')
