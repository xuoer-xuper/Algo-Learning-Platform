import { test } from 'vitest'
import assert from 'node:assert'
import { setEnabledSitesFetcher } from '../../electron/parsers/registry.ts'
import { SyncService } from '../../electron/submissions/syncService.ts'
import type { SubmissionBatchWriteOptions } from '../../electron/submissions/SubmissionBatchWriter.ts'

/*
 * 记录 write 入参用真实类型，而不是 `any[]` + `write(input: any)`。
 *
 * `any` 让下面 20 多条 `writes[0].xxx` 断言全都不受检查——字段名拼错会安静地拿到 undefined，
 * 再和期望值比较失败，报的却是"undefined !== 'AC'"这种指不到病因的错。
 * 标上之后 `_ncContestId` / `_ncProbLetter` 也是有类型的（它们在 `SubmissionScraperHints` 里，
 * `ScrapedSubmission` 已经并进来了），不需要退回 any 才能读。
 */
const recordWrites = (sink: SubmissionBatchWriteOptions[]) => ({
  write(input: SubmissionBatchWriteOptions) {
    sink.push(input)
    return { platform: input.platform, fetched: input.submissions.length, inserted: input.submissions.length }
  },
})

// URL parsing resolves the page problem from enabled site config. Without this
// the file only passed when an unrelated suite had already installed a fetcher,
// so both assertions on pageProblemId silently depended on file execution order.
setEnabledSitesFetcher(() => [
  { id: 'acwing', domains: ['acwing.com', 'www.acwing.com'], enabled: true },
])

test('submissions/syncService.test.ts', async () => {

const writes: SubmissionBatchWriteOptions[] = []
let problemUpdateCount = 0

const service = new SyncService({
  notifyProblemsUpdated: () => { problemUpdateCount += 1 },
  batchWriter: recordWrites(writes),
})

const currentUrl = 'https://www.acwing.com/problem/content/submission/1/'
let executedScript = ''

const currentHost = {
  getUrl: () => currentUrl,
  executeScript: async (code: string) => {
    executedScript = code
    return {
      tables: [
        {
          headers: ['状态', '语言', '运行时间'],
          rows: [
            {
              texts: ['Accepted', 'C++', '7 ms'],
              links: ['https://www.acwing.com/solution/content/246810/'],
            },
          ],
        },
      ],
    }
  },
}

const result = await service.syncCurrentPage(currentHost)

assert.strictEqual(result.platform, 'acwing')
assert.strictEqual(result.fetched, 1)
assert.strictEqual(result.inserted, 1)
assert.strictEqual(writes.length, 1)
assert.strictEqual(writes[0].platform, 'acwing')
assert.strictEqual(writes[0].currentUrl, currentUrl)
assert.strictEqual(writes[0].pageProblemId, '1')
// `pageProblemIdentity` 声明是可空的，先断言它在。原先靠 `any` 直接点进去：
// 真的传了 null 时读到的是 undefined，报错会是"undefined !== '1'"，指不到"身份根本没解析出来"。
assert.ok(writes[0].pageProblemIdentity, 'page problem identity should have been resolved')
assert.strictEqual(writes[0].pageProblemIdentity.platformProblemId, '1')
assert.strictEqual(writes[0].submissions[0].platformSubmissionId, 'ac-246810')
assert.strictEqual(writes[0].submissions[0].verdict, 'AC')
assert.match(executedScript, /document\.querySelectorAll\('table'\)/)
assert.strictEqual(problemUpdateCount, 1)

const vjudgeWrites: SubmissionBatchWriteOptions[] = []
const vjudgeService = new SyncService({
  batchWriter: recordWrites(vjudgeWrites),
})

const vjudgeHost = {
  getUrl: () => 'https://vjudge.net/contest/123456#status/xuper/K/0/',
  executeScript: async () => ({
    tables: [
      {
        headers: ['ID', 'When', 'Who', 'Problem', 'Result', 'Language', 'Time', 'Memory'],
        rows: [
          {
            texts: ['998877', '1 min ago', 'xuper', 'Gym 105173K', 'Accepted', 'GNU C++17', '46 ms', '1024 KB'],
            links: ['https://vjudge.net/solution/998877'],
          },
        ],
      },
    ],
  }),
}

const vjudgeResult = await vjudgeService.syncVjudge(vjudgeHost)
assert.strictEqual(vjudgeResult.platform, 'vjudge')
assert.strictEqual(vjudgeWrites.length, 1)
assert.strictEqual(vjudgeWrites[0].pageProblemId, 'contest-123456-K')
assert.strictEqual(vjudgeWrites[0].submissions[0].platformSubmissionId, 'vj-998877')

const vjudgeStatusWrites: SubmissionBatchWriteOptions[] = []
const vjudgeStatusService = new SyncService({
  batchWriter: recordWrites(vjudgeStatusWrites),
})

const vjudgeStatusHost = {
  getUrl: () => 'https://vjudge.net/status',
  executeScript: async () => ({
    tables: [
      {
        headers: ['ID', 'When', 'Who', 'Problem', 'Result', 'Language', 'Time', 'Memory'],
        rows: [
          {
            texts: ['998878', '1 min ago', 'xuper', 'Gym 105173E', 'Accepted', 'GNU C++17', '46 ms', '1024 KB'],
            links: ['https://vjudge.net/solution/998878'],
          },
        ],
      },
    ],
  }),
}

const vjudgeStatusResult = await vjudgeStatusService.syncVjudge(vjudgeStatusHost)
assert.strictEqual(vjudgeStatusResult.platform, 'vjudge')
assert.strictEqual(vjudgeStatusWrites.length, 1)
assert.strictEqual(vjudgeStatusWrites[0].pageProblemId, undefined)
assert.strictEqual(JSON.parse(vjudgeStatusWrites[0].submissions[0].rawJson || '{}')._vjudgeProblemId, 'Gym-105173E')

const nowcoderWrites: SubmissionBatchWriteOptions[] = []
const nowcoderService = new SyncService({
  batchWriter: recordWrites(nowcoderWrites),
})

const nowcoderHost = {
  getUrl: () => 'https://ac.nowcoder.com/acm/contest/789/status',
  executeScript: async () => ({
    tables: [
      {
        headers: ['运行ID', '题号', '运行结果', '使用语言'],
        rows: [
          {
            texts: ['223344', 'A', '答案正确', 'C++'],
            links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223344'],
          },
          {
            texts: ['223345', 'B', '答案错误', 'C++'],
            links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=223345'],
          },
        ],
      },
    ],
  }),
}

const nowcoderResult = await nowcoderService.syncCurrentPage(nowcoderHost)
assert.strictEqual(nowcoderResult.platform, 'nowcoder')
assert.strictEqual(nowcoderWrites.length, 1)
assert.strictEqual(
  nowcoderWrites[0].pageProblemId,
  undefined,
  'Mixed Nowcoder status imports should not bind the whole page to one problem',
)
assert.strictEqual(nowcoderWrites[0].submissions[0]._ncContestId, '789')
assert.strictEqual(nowcoderWrites[0].submissions[0]._ncProbLetter, 'A')
assert.strictEqual(nowcoderWrites[0].submissions[1]._ncContestId, '789')
assert.strictEqual(nowcoderWrites[0].submissions[1]._ncProbLetter, 'B')

})

test('pins the initiating page URL while DOM scraping is pending', async () => {
  const writes: SubmissionBatchWriteOptions[] = []
  let currentUrl = 'https://www.acwing.com/problem/content/submission/1/'
  let resolveScript!: (value: unknown) => void
  const service = new SyncService({
    batchWriter: recordWrites(writes),
  })
  const pending = service.syncCurrentPage({
    getUrl: () => currentUrl,
    executeScript: () => new Promise((resolve) => {
      resolveScript = resolve
    }),
  })

  currentUrl = 'https://ac.nowcoder.com/acm/contest/789/status'
  resolveScript({
    tables: [{
      headers: ['提交编号', '题目', '运行结果', '使用语言'],
      rows: [{
        texts: ['246810', '1', '答案正确', 'C++'],
        links: ['https://www.acwing.com/problem/content/1/'],
      }],
    }],
  })

  await pending
  assert.strictEqual(writes[0].currentUrl, 'https://www.acwing.com/problem/content/submission/1/')
  assert.ok(writes[0].pageProblemIdentity, 'page problem identity should have been resolved')
  assert.strictEqual(writes[0].pageProblemIdentity.platform, 'acwing')
  assert.strictEqual(writes[0].pageProblemIdentity.platformProblemId, '1')
})
