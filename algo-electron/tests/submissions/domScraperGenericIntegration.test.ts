import assert from 'node:assert'
import { scrapeCurrentPage } from '../../electron/submissions/scrapers/domScraper.ts'

function createHost(url: string, data: unknown) {
  return {
    getUrl: () => url,
    executeScript: async () => data,
  } as any
}

const acwingRows = {
  headers: ['状态', '语言', '运行时间'],
  rows: [
    {
      texts: ['Accepted', 'C++', '7 ms'],
      links: ['https://www.acwing.com/solution/content/246810/'],
    },
  ],
}

const acwingSubmissions = await scrapeCurrentPage(createHost('https://www.acwing.com/activity/content/code/content/1/', {
  tables: [
    { headers: ['标题', '作者'], rows: [{ texts: ['题解', 'xuper'] }] },
    acwingRows,
  ],
}))
assert(acwingSubmissions, 'AcWing scrape should return submissions')
assert.strictEqual(acwingSubmissions.length, 1)
assert.strictEqual(acwingSubmissions[0].platform, 'acwing')
assert.strictEqual(acwingSubmissions[0].platformSubmissionId, 'ac-246810')
assert.strictEqual(acwingSubmissions[0].verdict, 'AC')
assert.strictEqual(acwingSubmissions[0].language, 'C++')
assert.strictEqual(acwingSubmissions[0].runtimeMs, 7)

const nowcoderRows = {
  headers: ['运行ID', '题号', '运行结果', '使用语言', '运行时间', '使用内存'],
  rows: [
    {
      texts: ['123456', 'A', '答案正确', 'C++', '4ms', '9.5MB'],
      links: ['https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123456'],
    },
  ],
}

const nowcoderSubmissions = await scrapeCurrentPage(createHost('https://ac.nowcoder.com/acm/contest/123/status', {
  tables: [
    { headers: ['Name', 'Rank'], rows: [{ texts: ['Alice', '1'] }] },
    nowcoderRows,
  ],
}))
assert(nowcoderSubmissions, 'Nowcoder scrape should return submissions')
assert.strictEqual(nowcoderSubmissions.length, 1)
assert.strictEqual(nowcoderSubmissions[0].platform, 'nowcoder')
assert.strictEqual(nowcoderSubmissions[0].platformSubmissionId, 'nc-123456')
assert.strictEqual(nowcoderSubmissions[0].verdict, 'AC')
assert.strictEqual(nowcoderSubmissions[0].runtimeMs, 4)
assert.strictEqual(nowcoderSubmissions[0].memoryKb, 9728)
assert.strictEqual((nowcoderSubmissions[0] as any)._ncProbLetter, 'A')

const vjudgeRows = {
  headers: ['ID', 'When', 'Who', 'Problem', 'Result', 'Language', 'Time', 'Memory'],
  rows: [
    {
      texts: ['998877', '1 min ago', 'xuper', 'Gym 105173E', 'Accepted', 'GNU C++17', '46 ms', '1024 KB'],
      links: ['https://vjudge.net/solution/998877'],
    },
  ],
}

const vjudgeSubmissions = await scrapeCurrentPage(createHost('https://vjudge.net/status', {
  tables: [
    { headers: ['Contest', 'Solved'], rows: [{ texts: ['abc', '3'] }] },
    vjudgeRows,
  ],
}))
assert(vjudgeSubmissions, 'VJudge scrape should return submissions')
assert.strictEqual(vjudgeSubmissions.length, 1)
assert.strictEqual(vjudgeSubmissions[0].platform, 'vjudge')
assert.strictEqual(vjudgeSubmissions[0].platformSubmissionId, 'vj-998877')
assert.strictEqual(vjudgeSubmissions[0].verdict, 'AC')
assert.strictEqual(vjudgeSubmissions[0].runtimeMs, 46)
assert.strictEqual(vjudgeSubmissions[0].memoryKb, 1024)
assert.strictEqual(JSON.parse(vjudgeSubmissions[0].rawJson || '{}')._vjudgeProblemId, 'Gym-105173E')

const ptaSubmissions = await scrapeCurrentPage(createHost('https://pintia.cn/problem-sets/994805260223102976/submissions', {
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
assert(ptaSubmissions, 'PTA scrape should return submissions through adapter dispatch')
assert.strictEqual(ptaSubmissions.length, 1)
assert.strictEqual(ptaSubmissions[0].platform, 'pta')
assert.strictEqual(ptaSubmissions[0].platformSubmissionId, 'pta-1234567890')
assert.strictEqual(ptaSubmissions[0].verdict, 'AC')

const luoguSubmissions = await scrapeCurrentPage(createHost('https://www.luogu.com.cn/record/list', {
  fromInjection: true,
  records: [
    {
      id: 246810,
      status: 12,
      language: 11,
      time: 52,
      memory: 2048,
      submitTime: 1760000000,
      problem: { pid: 'P1001' },
    },
  ],
}))
assert(luoguSubmissions, 'Luogu scrape should return submissions through adapter dispatch')
assert.strictEqual(luoguSubmissions.length, 1)
assert.strictEqual(luoguSubmissions[0].platform, 'luogu')
assert.strictEqual(luoguSubmissions[0].platformSubmissionId, '246810')
assert.strictEqual(luoguSubmissions[0].verdict, 'AC')

const unknownSubmissions = await scrapeCurrentPage(createHost('https://example.com/status', {}))
assert.strictEqual(unknownSubmissions, null, 'Unknown sites should still be ignored by scraper fallback')
