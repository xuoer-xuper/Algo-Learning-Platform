import assert from 'node:assert'
import { SyncService } from '../../electron/submissions/syncService.ts'

const writes: any[] = []

const service = new SyncService({
  batchWriter: {
    write(input: any) {
      writes.push(input)
      return {
        platform: input.platform,
        fetched: input.submissions.length,
        inserted: input.submissions.length,
      }
    },
  },
} as any)

const currentUrl = 'https://www.acwing.com/problem/content/submission/1/'
let executedScript = ''

service.setBrowserHost({
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
})

const result = await service.syncCurrentPage()

assert.strictEqual(result.platform, 'acwing')
assert.strictEqual(result.fetched, 1)
assert.strictEqual(result.inserted, 1)
assert.strictEqual(writes.length, 1)
assert.strictEqual(writes[0].platform, 'acwing')
assert.strictEqual(writes[0].currentUrl, currentUrl)
assert.strictEqual(writes[0].pageProblemId, '1')
assert.strictEqual(writes[0].pageProblemIdentity.platformProblemId, '1')
assert.strictEqual(writes[0].submissions[0].platformSubmissionId, 'ac-246810')
assert.strictEqual(writes[0].submissions[0].verdict, 'AC')
assert.match(executedScript, /document\.querySelectorAll\('table'\)/)

const vjudgeWrites: any[] = []
const vjudgeService = new SyncService({
  batchWriter: {
    write(input: any) {
      vjudgeWrites.push(input)
      return {
        platform: input.platform,
        fetched: input.submissions.length,
        inserted: input.submissions.length,
      }
    },
  },
} as any)

vjudgeService.setBrowserHost({
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
})

const vjudgeResult = await vjudgeService.syncVjudge()
assert.strictEqual(vjudgeResult.platform, 'vjudge')
assert.strictEqual(vjudgeWrites.length, 1)
assert.strictEqual(vjudgeWrites[0].pageProblemId, 'contest-123456-K')
assert.strictEqual(vjudgeWrites[0].submissions[0].platformSubmissionId, 'vj-998877')

const vjudgeStatusWrites: any[] = []
const vjudgeStatusService = new SyncService({
  batchWriter: {
    write(input: any) {
      vjudgeStatusWrites.push(input)
      return {
        platform: input.platform,
        fetched: input.submissions.length,
        inserted: input.submissions.length,
      }
    },
  },
} as any)

vjudgeStatusService.setBrowserHost({
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
})

const vjudgeStatusResult = await vjudgeStatusService.syncVjudge()
assert.strictEqual(vjudgeStatusResult.platform, 'vjudge')
assert.strictEqual(vjudgeStatusWrites.length, 1)
assert.strictEqual(vjudgeStatusWrites[0].pageProblemId, undefined)
assert.strictEqual(JSON.parse(vjudgeStatusWrites[0].submissions[0].rawJson || '{}')._vjudgeProblemId, 'Gym-105173E')

const nowcoderWrites: any[] = []
const nowcoderService = new SyncService({
  batchWriter: {
    write(input: any) {
      nowcoderWrites.push(input)
      return {
        platform: input.platform,
        fetched: input.submissions.length,
        inserted: input.submissions.length,
      }
    },
  },
} as any)

nowcoderService.setBrowserHost({
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
})

const nowcoderResult = await nowcoderService.syncCurrentPage()
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
