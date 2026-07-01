import assert from 'node:assert'
import {
  hasSubmissionLikeTable,
  scanGenericSubmissionTable,
  selectBestSubmissionTable,
  type GenericTableData,
} from '../../electron/submissions/scrapers/GenericTableScanner.ts'

const fixedNow = () => '2026-06-29 20:00:00'

const nowcoderTable: GenericTableData = {
  headers: ['运行ID', '题号', '运行结果', '使用语言', '运行时间', '使用内存'],
  rows: [
    {
      texts: ['123456', 'A', '答案正确', 'C++', '4ms', '9.5MB'],
      links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123456'],
    },
    {
      texts: ['123457', 'B', '答案错误', 'Java', '12 ms', '128 KB'],
      links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123457'],
    },
  ],
}

assert.strictEqual(hasSubmissionLikeTable(nowcoderTable), true, 'Nowcoder-like table should be recognized as submission table')
assert.strictEqual(
  selectBestSubmissionTable([
    { headers: ['Name', 'Rank'], rows: [{ texts: ['Alice', '1'] }] },
    nowcoderTable,
  ]),
  nowcoderTable,
  'Scanner should select the best submission table from multiple tables',
)
const nowcoderSubmissions = scanGenericSubmissionTable(nowcoderTable, {
  platform: 'nowcoder',
  submissionPrefix: 'nc',
  now: fixedNow,
})

assert.strictEqual(nowcoderSubmissions.length, 2, 'Scanner should parse Nowcoder-like rows')
assert.strictEqual(nowcoderSubmissions[0].platformSubmissionId, 'nc-123456')
assert.strictEqual(nowcoderSubmissions[0].verdict, 'AC')
assert.strictEqual(nowcoderSubmissions[0].language, 'C++')
assert.strictEqual(nowcoderSubmissions[0].runtimeMs, 4)
assert.strictEqual(nowcoderSubmissions[0].memoryKb, 9728)
assert.strictEqual(nowcoderSubmissions[0].submittedAt, fixedNow())
assert.strictEqual(nowcoderSubmissions[1].verdict, 'WA')
assert.strictEqual(nowcoderSubmissions[1].memoryKb, 128)

const vjudgeTable: GenericTableData = {
  headers: ['ID', 'When', 'Who', 'Problem', 'Result', 'Language', 'Time', 'Memory'],
  rows: [
    {
      texts: ['998877', '1 min ago', 'xuper', 'Gym 105173E', 'Accepted', 'GNU C++17', '46 ms', '1024 KB'],
      links: ['https://vjudge.net/solution/998877'],
    },
    {
      texts: ['998877', '1 min ago', 'xuper', 'Gym 105173E', 'Accepted', 'GNU C++17', '46 ms', '1024 KB'],
      links: ['https://vjudge.net/solution/998877'],
    },
  ],
}

const vjudgeSubmissions = scanGenericSubmissionTable(vjudgeTable, {
  platform: 'vjudge',
  submissionPrefix: 'vj',
  now: fixedNow,
})

assert.strictEqual(vjudgeSubmissions.length, 1, 'Scanner should dedupe repeated VJudge-like rows')
assert.strictEqual(vjudgeSubmissions[0].platformSubmissionId, 'vj-998877')
assert.strictEqual(vjudgeSubmissions[0].verdict, 'AC')
assert.strictEqual(vjudgeSubmissions[0].runtimeMs, 46)
assert.strictEqual(vjudgeSubmissions[0].memoryKb, 1024)
assert.strictEqual(vjudgeSubmissions[0].sourceUrl, 'https://vjudge.net/solution/998877')

const inferredVerdictTable: GenericTableData = {
  headers: ['Run', 'Problem', 'Lang', 'Cost'],
  rows: [
    {
      texts: ['5555', 'P1000', 'C++', 'Wrong Answer'],
      links: ['https://example.test/submission/5555'],
    },
  ],
}

const inferred = scanGenericSubmissionTable(inferredVerdictTable, {
  platform: 'example',
  submissionPrefix: 'ex',
  now: fixedNow,
})
assert.strictEqual(inferred.length, 1, 'Scanner should infer verdict column when headers are weak')
assert.strictEqual(inferred[0].platformSubmissionId, 'ex-5555')
assert.strictEqual(inferred[0].verdict, 'WA')

const noSubmissionIdTable: GenericTableData = {
  headers: ['Result', 'Language'],
  rows: [
    {
      texts: ['Accepted', 'GNU C++17'],
      links: ['', ''],
    },
  ],
}
assert.deepStrictEqual(
  scanGenericSubmissionTable(noSubmissionIdTable, { platform: 'codeforces', submissionPrefix: 'cf', now: fixedNow }),
  [],
  'Scanner should skip rows without a stable submission id',
)

const unrelatedTable: GenericTableData = {
  headers: ['Name', 'Rank'],
  rows: [
    { texts: ['Alice', '1'] },
    { texts: ['Bob', '2'] },
  ],
}

assert.strictEqual(hasSubmissionLikeTable(unrelatedTable), false, 'Unrelated tables should not be treated as submission tables')
assert.deepStrictEqual(
  scanGenericSubmissionTable(unrelatedTable, { platform: 'unknown', submissionPrefix: 'u', now: fixedNow }),
  [],
)
