import assert from 'node:assert'
import { cleanBrowserProblemTitle, resolveBrowserTitleProblemIdentity } from '../../electron/parsers/browserTitle.ts'
import { parseUrl } from '../../electron/parsers/registry.ts'

assert.strictEqual(
  cleanBrowserProblemTitle('1967. 作为子字符串出现在单词中的字符串数目 - 力扣（LeetCode）', {
    platform: 'leetcode-cn',
    platformProblemId: 'number-of-strings-that-appear-as-substrings-in-word',
  }),
  '作为子字符串出现在单词中的字符串数目',
)

assert.strictEqual(
  cleanBrowserProblemTitle('A. Theatre Square - Codeforces', {
    platform: 'codeforces',
    platformProblemId: '1A',
    problemIndex: 'A',
  }),
  'Theatre Square',
)

assert.strictEqual(
  cleanBrowserProblemTitle('1001. A+B Problem - AcWing题库', {
    platform: 'acwing',
    platformProblemId: '1001',
  }),
  'A+B Problem',
)

assert.strictEqual(
  cleanBrowserProblemTitle('字符串_牛客题霸_牛客网', {
    platform: 'nowcoder',
    platformProblemId: 'abc',
  }),
  '字符串',
)

assert.strictEqual(
  cleanBrowserProblemTitle('A - A+B Problem - Virtual Judge', {
    platform: 'vjudge',
    platformProblemId: 'contest-100-A',
    problemIndex: 'A',
  }),
  'A+B Problem',
)

assert.strictEqual(
  cleanBrowserProblemTitle('7-1 打印沙漏 - PTA', {
    platform: 'pta',
    platformProblemId: '123-456',
    problemIndex: '456',
  }),
  '7-1 打印沙漏',
)

assert.strictEqual(
  cleanBrowserProblemTitle('P1001 A+B Problem - 洛谷', {
    platform: 'luogu',
    platformProblemId: 'P1001',
  }),
  'A+B Problem',
)

assert.strictEqual(cleanBrowserProblemTitle('提交详情 - 力扣（LeetCode）'), null)
assert.strictEqual(cleanBrowserProblemTitle('Loading - Codeforces'), null)
assert.strictEqual(
  cleanBrowserProblemTitle('编程题 - 题目列表 - GPLT 团体程序设计天梯赛 2026 年', {
    platform: 'pta',
  }),
  null,
)

const leetcodeIdentity = resolveBrowserTitleProblemIdentity(
  'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/',
  '1967. 作为子字符串出现在单词中的字符串数目 - 力扣（LeetCode）',
  parseUrl,
)
assert.ok(leetcodeIdentity)
assert.strictEqual(leetcodeIdentity.platform, 'leetcode-cn')
assert.strictEqual(leetcodeIdentity.platformProblemId, 'number-of-strings-that-appear-as-substrings-in-word')
assert.strictEqual(leetcodeIdentity.title, '作为子字符串出现在单词中的字符串数目')

const cfIdentity = resolveBrowserTitleProblemIdentity(
  'https://codeforces.com/contest/1/problem/A',
  'A. Theatre Square - Codeforces',
  parseUrl,
)
assert.ok(cfIdentity)
assert.strictEqual(cfIdentity.platform, 'codeforces')
assert.strictEqual(cfIdentity.platformProblemId, '1A')
assert.strictEqual(cfIdentity.title, 'Theatre Square')

const luoguIdentity = resolveBrowserTitleProblemIdentity(
  'https://www.luogu.com.cn/problem/P1001',
  'P1001 A+B Problem - 洛谷',
  parseUrl,
)
assert.ok(luoguIdentity)
assert.strictEqual(luoguIdentity.platform, 'luogu')
assert.strictEqual(luoguIdentity.platformProblemId, 'P1001')
assert.strictEqual(luoguIdentity.title, 'A+B Problem')
