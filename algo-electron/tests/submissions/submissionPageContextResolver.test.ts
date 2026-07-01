import assert from 'node:assert'
import type { ProblemIdentity, SubmissionData } from '../../electron/shared/types.ts'
import { resolveSubmissionPageContext } from '../../electron/submissions/SubmissionPageContextResolver.ts'

function createSubmission(platform: string, rawJson?: string): SubmissionData {
  return {
    platform,
    platformSubmissionId: `${platform}-1`,
    verdict: 'AC',
    submittedAt: '2026-06-29 10:00:00',
    rawJson,
  }
}

const parsedIdentity: ProblemIdentity = {
  platform: 'nowcoder',
  platformProblemId: 'contest-1-A',
  canonicalUrl: 'https://ac.nowcoder.com/acm/contest/1/A',
  confidence: 'url',
}

const parsed = resolveSubmissionPageContext('https://ac.nowcoder.com/acm/contest/1/A', [], {
  parseUrl: () => parsedIdentity,
  findNowcoderProblemBySearch: () => undefined,
})

assert.strictEqual(parsed.pageProblemId, 'contest-1-A')
assert.strictEqual(parsed.pageProblemIdentity, parsedIdentity)

const vjudgeContest = resolveSubmissionPageContext(
  'https://vjudge.net/contest/123456#status/xuper/K/0/',
  [createSubmission('vjudge')],
  {
    parseUrl: () => null,
    findNowcoderProblemBySearch: () => undefined,
  },
)
assert.strictEqual(vjudgeContest.pageProblemId, 'contest-123456-K')

const vjudgeStatus = resolveSubmissionPageContext(
  'https://vjudge.net/status#un=xuper&OJId=Gym&probNum=105173E',
  [createSubmission('vjudge')],
  {
    parseUrl: () => null,
    findNowcoderProblemBySearch: () => undefined,
  },
)
assert.strictEqual(vjudgeStatus.pageProblemId, 'Gym-105173E')

const nowcoderContestSubmission = createSubmission('nowcoder')
;(nowcoderContestSubmission as any)._ncProbLetter = 'B'
const nowcoderContest = resolveSubmissionPageContext(
  'https://ac.nowcoder.com/acm/contest/789/status',
  [nowcoderContestSubmission],
  {
    parseUrl: () => null,
    findNowcoderProblemBySearch: () => undefined,
  },
)
assert.strictEqual(nowcoderContest.pageProblemId, 'contest-789-B')
assert.strictEqual((nowcoderContestSubmission as any)._ncContestId, '789')

const nowcoderContestSubmissionA = createSubmission('nowcoder')
;(nowcoderContestSubmissionA as any)._ncProbLetter = 'A'
const nowcoderContestSubmissionB = createSubmission('nowcoder')
;(nowcoderContestSubmissionB as any)._ncProbLetter = 'B'
const nowcoderContestMixed = resolveSubmissionPageContext(
  'https://ac.nowcoder.com/acm/contest/789/status',
  [nowcoderContestSubmissionA, nowcoderContestSubmissionB],
  {
    parseUrl: () => null,
    findNowcoderProblemBySearch: () => undefined,
  },
)
assert.strictEqual(
  nowcoderContestMixed.pageProblemId,
  undefined,
  'Mixed Nowcoder status pages should not bind every submission to the first problem',
)
assert.strictEqual((nowcoderContestSubmissionA as any)._ncContestId, '789')
assert.strictEqual((nowcoderContestSubmissionB as any)._ncContestId, '789')

const nowcoderLookup = resolveSubmissionPageContext(
  'https://www.nowcoder.com/profile/123/codeBookDetail?search=456',
  [createSubmission('nowcoder')],
  {
    parseUrl: () => null,
    findNowcoderProblemBySearch: (search) => search === '456' ? 'contest-999-C' : undefined,
  },
)
assert.strictEqual(nowcoderLookup.pageProblemId, 'contest-999-C')

const nowcoderFallback = resolveSubmissionPageContext(
  'https://www.nowcoder.com/profile/123/codeBookDetail?search=777',
  [createSubmission('nowcoder')],
  {
    parseUrl: () => null,
    findNowcoderProblemBySearch: () => undefined,
  },
)
assert.strictEqual(nowcoderFallback.pageProblemId, 'nc-777')

const ptaSubmission = createSubmission('pta', JSON.stringify({ _ptaProblemId: 'set-1' }))
resolveSubmissionPageContext('https://pintia.cn/problem-sets/1/submissions', [ptaSubmission], {
  parseUrl: () => null,
  findNowcoderProblemBySearch: () => undefined,
})
assert.strictEqual((ptaSubmission as any)._ptaProblemId, 'set-1')

const luoguSubmission = createSubmission('luogu', JSON.stringify({ _luoguProblemId: 'P1001' }))
resolveSubmissionPageContext('https://www.luogu.com.cn/record/list', [luoguSubmission], {
  parseUrl: () => null,
  findNowcoderProblemBySearch: () => undefined,
})
assert.strictEqual((luoguSubmission as any)._luoguProblemId, 'P1001')
