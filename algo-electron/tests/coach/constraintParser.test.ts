import assert from 'node:assert'
import {
  ConstraintParser,
  parseConstraintsStatic,
  extractConstraintText,
  getInjectionScriptForPlatform,
  analyzeVerdictVsConstraints,
  parseLooseInt,
  type ProblemConstraints,
} from '../../electron/coach/problemFacts/ConstraintParser.ts'

/**
 * ConstraintParser 单元测试（阶段 3 Task 17）。
 *
 * 覆盖：
 * 1. parseLooseInt: 各种数字格式解析
 * 2. parseConstraintsStatic: 时间限制 / 内存限制 / 数据范围 / 值域
 * 3. extractConstraintText: HTML 抽取
 * 4. getInjectionScriptForPlatform: 注入脚本生成
 * 5. analyzeVerdictVsConstraints: verdict 联动
 * 6. ConstraintParser 类: 缓存 / fetchAndParse
 * 7. 20 道样例题面抽取准确率（目标 >= 80%）
 * 8. 解析失败静默退化
 */

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

const NOW = 1700000000000

// --- 1. parseLooseInt ---

test('parseLooseInt: 纯整数 "200000"', () => {
  assert.strictEqual(parseLooseInt('200000'), 200000)
})

test('parseLooseInt: 纯整数 "100"', () => {
  assert.strictEqual(parseLooseInt('100'), 100)
})

test('parseLooseInt: e 形式 "2e5"', () => {
  assert.strictEqual(parseLooseInt('2e5'), 200000)
})

test('parseLooseInt: e 形式 "1e9"', () => {
  assert.strictEqual(parseLooseInt('1e9'), 1000000000)
})

test('parseLooseInt: e 形式 "1.5e6"', () => {
  assert.strictEqual(parseLooseInt('1.5e6'), 1500000)
})

test('parseLooseInt: ·10^p 形式 "2·10^5"', () => {
  assert.strictEqual(parseLooseInt('2·10^5'), 200000)
})

test('parseLooseInt: *10^p 形式 "2*10^5"', () => {
  assert.strictEqual(parseLooseInt('2*10^5'), 200000)
})

test('parseLooseInt: 10^p 形式 "10^9"', () => {
  assert.strictEqual(parseLooseInt('10^9'), 1000000000)
})

test('parseLooseInt: 上标 Unicode "10⁹"', () => {
  assert.strictEqual(parseLooseInt('10⁹'), 1000000000)
})

test('parseLooseInt: 上标 Unicode "10⁵"', () => {
  assert.strictEqual(parseLooseInt('10⁵'), 100000)
})

test('parseLooseInt: 空字符串返回 null', () => {
  assert.strictEqual(parseLooseInt(''), null)
})

test('parseLooseInt: 非数字字符串返回 null 或 NaN 容错', () => {
  // 非数字应返回 null（不抛错）
  const result = parseLooseInt('abc')
  assert.ok(result === null || Number.isNaN(result), `abc should return null, got ${result}`)
})

test('parseLooseInt: 非字符串输入返回 null', () => {
  // @ts-expect-error: 测试非字符串输入
  assert.strictEqual(parseLooseInt(123), null)
  // @ts-expect-error: 测试 null 输入
  assert.strictEqual(parseLooseInt(null), null)
})

// --- 2. parseConstraintsStatic: 时间限制 ---

test('parse: 中文时间限制 "时间限制 1.00s"', () => {
  const result = parseConstraintsStatic('时间限制 1.00s', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 1)
})

test('parse: 中文时间限制 "时间限制: 2 秒"', () => {
  const result = parseConstraintsStatic('时间限制: 2 秒', 'luogu', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 2)
})

test('parse: 英文时间限制 "Time limit: 1 second"', () => {
  const result = parseConstraintsStatic('Time limit: 1 second', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 1)
})

test('parse: 英文时间限制 "time limit per test: 2 seconds"', () => {
  const result = parseConstraintsStatic('time limit per test: 2 seconds', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 2)
})

test('parse: 洛谷 "1.00s" 单独一行', () => {
  const result = parseConstraintsStatic('\n1.00s\n', 'luogu', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 1)
})

// --- 3. parseConstraintsStatic: 内存限制 ---

test('parse: 中文内存限制 "内存限制 256MB"', () => {
  const result = parseConstraintsStatic('内存限制 256MB', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.memoryLimitMb, 256)
})

test('parse: 中文内存限制 "内存限制: 512 MB"', () => {
  const result = parseConstraintsStatic('内存限制: 512 MB', 'luogu', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.memoryLimitMb, 512)
})

test('parse: 英文内存限制 "Memory limit: 256 megabytes"', () => {
  const result = parseConstraintsStatic('Memory limit: 256 megabytes', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.memoryLimitMb, 256)
})

// --- 4. parseConstraintsStatic: 数据范围 ---

test('parse: 标准数据范围 "1 ≤ n ≤ 2·10^5"', () => {
  const result = parseConstraintsStatic('1 ≤ n ≤ 2·10^5', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.primaryVarName, 'n')
  assert.strictEqual(result!.nLower, 1)
  assert.strictEqual(result!.nUpper, 200000)
})

test('parse: e 形式数据范围 "1 ≤ n ≤ 2e5"', () => {
  const result = parseConstraintsStatic('1 ≤ n ≤ 2e5', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.nLower, 1)
  assert.strictEqual(result!.nUpper, 200000)
})

test('parse: 纯数字数据范围 "1 <= n <= 200000"', () => {
  const result = parseConstraintsStatic('1 <= n <= 200000', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.nLower, 1)
  assert.strictEqual(result!.nUpper, 200000)
})

test('parse: *10^ 形式 "1 <= n <= 2*10^5"', () => {
  const result = parseConstraintsStatic('1 <= n <= 2*10^5', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.nUpper, 200000)
})

test('parse: 多变量 "1 ≤ n, m ≤ 1e5"（取第一个变量 n）', () => {
  const result = parseConstraintsStatic('1 ≤ n, m ≤ 1e5', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.primaryVarName, 'n')
  assert.strictEqual(result!.nUpper, 100000)
})

test('parse: CF 英文 "(1 ≤ n ≤ 2·10^5)"', () => {
  const text = 'The first line contains a single integer n (1 ≤ n ≤ 2·10^5).'
  const result = parseConstraintsStatic(text, 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.nLower, 1)
  assert.strictEqual(result!.nUpper, 200000)
})

// --- 5. parseConstraintsStatic: 值域 ---

test('parse: 值域 "1 ≤ a_i ≤ 1e9"', () => {
  const result = parseConstraintsStatic('1 ≤ a_i ≤ 1e9', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.valueLower, 1)
  assert.strictEqual(result!.valueUpper, 1000000000)
})

test('parse: 值域 "1 ≤ a_i ≤ 10^9"', () => {
  const result = parseConstraintsStatic('1 ≤ a_i ≤ 10^9', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.valueUpper, 1000000000)
})

test('parse: 值域带下标 "1 <= a_i <= 1e9"', () => {
  const result = parseConstraintsStatic('1 <= a_i <= 1e9', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.valueUpper, 1000000000)
})

// --- 6. parseConstraintsStatic: 综合 ---

test('parse: 完整题面约束（时间+内存+数据范围+值域）', () => {
  const text = `
    时间限制 1.00s
    内存限制 256MB
    输入:
    第一行包含一个整数 n (1 ≤ n ≤ 2·10^5)。
    第二行包含 n 个整数 a_i (1 ≤ a_i ≤ 1e9)。
  `
  const result = parseConstraintsStatic(text, 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 1)
  assert.strictEqual(result!.memoryLimitMb, 256)
  assert.strictEqual(result!.nUpper, 200000)
  assert.strictEqual(result!.valueUpper, 1000000000)
})

test('parse: 空文本返回 null', () => {
  assert.strictEqual(parseConstraintsStatic('', 'codeforces', NOW), null)
})

test('parse: 无任何约束的文本返回 null', () => {
  assert.strictEqual(parseConstraintsStatic('hello world', 'codeforces', NOW), null)
})

test('parse: 仅时间限制也算成功', () => {
  const result = parseConstraintsStatic('Time limit: 1 second', 'codeforces', NOW)
  assert.ok(result !== null)
  assert.strictEqual(result!.timeLimitSec, 1)
  assert.strictEqual(result!.nUpper, null)
  assert.strictEqual(result!.valueUpper, null)
})

// --- 7. extractConstraintText ---

test('extractConstraintText: 从 HTML 抽取文本', () => {
  const html = '<div class="problem-statement"><p>1 ≤ n ≤ 2·10^5</p><p>时间限制 1.00s</p></div>'
  const text = extractConstraintText(html, 'codeforces')
  assert.ok(text !== null)
  assert.ok(text!.includes('1 ≤ n ≤ 2·10^5'))
  assert.ok(text!.includes('时间限制'))
})

test('extractConstraintText: 移除 script/style', () => {
  const html = '<script>var x = 1;</script><style>.a {color: red}</style><p>1 ≤ n ≤ 100</p>'
  const text = extractConstraintText(html, 'codeforces')
  assert.ok(text !== null)
  assert.ok(!text!.includes('var x'))
  assert.ok(!text!.includes('color: red'))
  assert.ok(text!.includes('1 ≤ n ≤ 100'))
})

test('extractConstraintText: 解码 HTML 实体', () => {
  const html = '<p>1 &le; n &le; 100</p>'
  const text = extractConstraintText(html, 'codeforces')
  assert.ok(text !== null)
  assert.ok(text!.includes('1 ≤ n ≤ 100'))
})

test('extractConstraintText: 空 HTML 返回 null', () => {
  assert.strictEqual(extractConstraintText('', 'codeforces'), null)
})

// --- 8. getInjectionScriptForPlatform ---

test('getInjectionScript: codeforces 选择器', () => {
  const script = getInjectionScriptForPlatform('codeforces')
  assert.ok(typeof script === 'string')
  assert.ok(script.includes('problem-statement'))
  assert.ok(script.includes('time-limit'))
})

test('getInjectionScript: luogu 选择器', () => {
  const script = getInjectionScriptForPlatform('luogu')
  assert.ok(script.includes('problem-content'))
})

test('getInjectionScript: leetcode-cn 选择器', () => {
  const script = getInjectionScriptForPlatform('leetcode-cn')
  assert.ok(script.includes('question-content'))
})

test('getInjectionScript: 未知平台使用默认选择器', () => {
  const script = getInjectionScriptForPlatform('unknown-platform')
  assert.ok(script.includes('problem-statement'))
})

test('getInjectionScript: 脚本可执行（IIFE 包装）', () => {
  const script = getInjectionScriptForPlatform('codeforces')
  // 验证脚本能被 eval（语法正确）
  assert.doesNotThrow(() => {
    // 包装成函数避免污染全局
    new Function(script)
  })
})

test('getInjectionScript: 脚本包含 try/catch（失败返回 null）', () => {
  const script = getInjectionScriptForPlatform('codeforces')
  assert.ok(script.includes('try'))
  assert.ok(script.includes('catch'))
  assert.ok(script.includes('null'))
})

// --- 9. analyzeVerdictVsConstraints ---

test('analyze: TLE + n>=1e5 → complexity_warning', () => {
  const constraints: ProblemConstraints = {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 200000,
    valueLower: null,
    valueUpper: null,
    timeLimitSec: 1,
    memoryLimitMb: null,
    testGroupCount: null,
    parsedAt: NOW,
    source: 'regex',
  }
  const analysis = analyzeVerdictVsConstraints('TLE', constraints)
  assert.strictEqual(analysis.derivedEventType, 'complexity_warning')
  assert.strictEqual(analysis.suggestComplexity, true)
  assert.ok(analysis.reason.includes('O(n log n)'))
})

test('analyze: WA + value>=1e9 → boundary_suspected', () => {
  const constraints: ProblemConstraints = {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 100,
    valueLower: 1,
    valueUpper: 1000000000,
    timeLimitSec: 1,
    memoryLimitMb: null,
    testGroupCount: null,
    parsedAt: NOW,
    source: 'regex',
  }
  const analysis = analyzeVerdictVsConstraints('WA', constraints)
  assert.strictEqual(analysis.derivedEventType, 'boundary_suspected')
  assert.strictEqual(analysis.suggestOverflow, true)
  assert.ok(analysis.reason.includes('溢出') || analysis.reason.includes('int'))
})

test('analyze: 无 constraints 返回空结果', () => {
  const analysis = analyzeVerdictVsConstraints('TLE', null)
  assert.strictEqual(analysis.derivedEventType, null)
  assert.strictEqual(analysis.suggestComplexity, false)
  assert.strictEqual(analysis.suggestOverflow, false)
})

test('analyze: TLE + n<1e5 → 不派生', () => {
  const constraints: ProblemConstraints = {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 1000,
    valueLower: null,
    valueUpper: null,
    timeLimitSec: 1,
    memoryLimitMb: null,
    testGroupCount: null,
    parsedAt: NOW,
    source: 'regex',
  }
  const analysis = analyzeVerdictVsConstraints('TLE', constraints)
  assert.strictEqual(analysis.derivedEventType, null)
})

// --- 10. ConstraintParser 类: 缓存 ---

test('ConstraintParser: 缓存命中返回 cache source', async () => {
  const parser = new ConstraintParser({ enableCache: true, now: () => NOW })
  let callCount = 0
  const fakeExecute = async (): Promise<unknown> => {
    callCount++
    return '时间限制 1.00s\n1 ≤ n ≤ 2·10^5'
  }
  // 第一次：注入并解析
  const r1 = await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: fakeExecute,
  })
  assert.ok(r1 !== null)
  assert.strictEqual(r1!.source, 'regex')
  assert.strictEqual(callCount, 1)

  // 第二次：应命中缓存，不调用 executeScript
  const r2 = await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: fakeExecute,
  })
  assert.ok(r2 !== null)
  assert.strictEqual(r2!.source, 'cache')
  assert.strictEqual(callCount, 1, 'second call should hit cache, not execute script')
})

test('ConstraintParser: 缓存禁用时不缓存', async () => {
  const parser = new ConstraintParser({ enableCache: false, now: () => NOW })
  let callCount = 0
  const fakeExecute = async (): Promise<unknown> => {
    callCount++
    return '时间限制 1.00s'
  }
  await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: fakeExecute,
  })
  await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: fakeExecute,
  })
  assert.strictEqual(callCount, 2, 'cache disabled should call executeScript each time')
})

test('ConstraintParser: executeScript 抛错时静默返回 null', async () => {
  const parser = new ConstraintParser({ enableCache: true, now: () => NOW })
  const throwingExecute = async (): Promise<unknown> => {
    throw new Error('injection failed')
  }
  const result = await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: throwingExecute,
  })
  assert.strictEqual(result, null, 'should silently return null on injection failure')
})

test('ConstraintParser: executeScript 返回 null 时静默返回 null', async () => {
  const parser = new ConstraintParser({ enableCache: true, now: () => NOW })
  const nullExecute = async (): Promise<unknown> => null
  const result = await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: nullExecute,
  })
  assert.strictEqual(result, null)
})

test('ConstraintParser: 解析失败返回 null（无约束文本）', async () => {
  const parser = new ConstraintParser({ enableCache: true, now: () => NOW })
  const emptyExecute = async (): Promise<unknown> => 'no constraints here'
  const result = await parser.fetchAndParse({
    platform: 'codeforces',
    problemKey: 'cf:1234A',
    url: 'https://codeforces.com/contest/1234/problem/A',
    executeScript: emptyExecute,
  })
  assert.strictEqual(result, null)
})

test('ConstraintParser: parseFromInjectionResult 处理非字符串', () => {
  const parser = new ConstraintParser({ now: () => NOW })
  assert.strictEqual(parser.parseFromInjectionResult(null, 'codeforces'), null)
  assert.strictEqual(parser.parseFromInjectionResult(undefined, 'codeforces'), null)
  assert.strictEqual(parser.parseFromInjectionResult(123, 'codeforces'), null)
  assert.strictEqual(parser.parseFromInjectionResult({ foo: 'bar' }, 'codeforces'), null)
})

test('ConstraintParser: cacheSet / cacheGet 手动操作', () => {
  const parser = new ConstraintParser({ enableCache: true, now: () => NOW })
  const constraints: ProblemConstraints = {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 100,
    valueLower: null,
    valueUpper: null,
    timeLimitSec: 1,
    memoryLimitMb: null,
    testGroupCount: null,
    parsedAt: NOW,
    source: 'regex',
  }
  parser.cacheSet('cf:1234A', constraints)
  const cached = parser.cacheGet('codeforces', 'cf:1234A')
  assert.ok(cached !== null)
  assert.strictEqual(cached!.nUpper, 100)
})

test('ConstraintParser: cacheClear 清空缓存', () => {
  const parser = new ConstraintParser({ enableCache: true, now: () => NOW })
  const constraints: ProblemConstraints = {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 100,
    valueLower: null,
    valueUpper: null,
    timeLimitSec: 1,
    memoryLimitMb: null,
    testGroupCount: null,
    parsedAt: NOW,
    source: 'regex',
  }
  parser.cacheSet('cf:1234A', constraints)
  parser.cacheClear()
  assert.strictEqual(parser.cacheGet('codeforces', 'cf:1234A'), null)
})

// --- 11. 20 道样例题面抽取准确率（目标 >= 80%） ---

interface SampleProblem {
  name: string
  platform: string
  text: string
  expected: {
    timeLimitSec?: number | null
    memoryLimitMb?: number | null
    nUpper?: number | null
    valueUpper?: number | null
  }
}

const sampleProblems: SampleProblem[] = [
  // 1. CF 标准题（中文翻译）
  {
    name: 'CF 1234A - 简单数据范围',
    platform: 'codeforces',
    text: '时间限制 1.00s\n内存限制 256MB\n输入\n第一行一个整数 n (1 ≤ n ≤ 2·10^5)。\n第二行 n 个整数 a_i (1 ≤ a_i ≤ 1e9)。',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 200000, valueUpper: 1000000000 },
  },
  // 2. CF 英文题面
  {
    name: 'CF 1343C - Alternating Subsequence (English)',
    platform: 'codeforces',
    text: 'Time limit: 1 second\nMemory limit: 256 megabytes\nThe first line contains an integer t (1 ≤ t ≤ 1000).\nThe first line of each test case contains a single integer n (1 ≤ n ≤ 2·10^5).',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 200000 },
  },
  // 3. CF 大数据范围
  {
    name: 'CF 1366C - 大 n',
    platform: 'codeforces',
    text: 'time limit per test: 2 seconds\nmemory limit per test: 256 megabytes\nThe first line contains one integer n (1 ≤ n ≤ 5·10^5).',
    expected: { timeLimitSec: 2, memoryLimitMb: 256, nUpper: 500000 },
  },
  // 4. CF 小数据范围
  {
    name: 'CF 4A - Watermelon (小 n)',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nmemory limit per test: 64 megabytes\nThe input consists of one integer w (1 ≤ w ≤ 100).',
    expected: { timeLimitSec: 1, memoryLimitMb: 64, nUpper: 100 },
  },
  // 5. CF e 形式数据范围
  {
    name: 'CF 1133C - e 形式',
    platform: 'codeforces',
    text: 'Time limit: 1 second\nMemory limit: 256 megabytes\nThe first line contains an integer n (1 ≤ n ≤ 2e5).\nThe second line contains n integers a_i (1 ≤ a_i ≤ 1e9).',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 200000, valueUpper: 1000000000 },
  },
  // 6. 洛谷 P1001
  {
    name: '洛谷 P1001 - A+B Problem',
    platform: 'luogu',
    text: '时间限制 1.00s\n内存限制 128MB\n输入两个整数 a, b (1 <= a, b <= 1e9)。',
    expected: { timeLimitSec: 1, memoryLimitMb: 128, valueUpper: 1000000000 },
  },
  // 7. 洛谷 P1003
  {
    name: '洛谷 P1003 - 铺地毯',
    platform: 'luogu',
    text: '时间限制 1.00s\n内存限制 125MB\n输入第一行一个整数 n (1 <= n <= 10000)。',
    expected: { timeLimitSec: 1, memoryLimitMb: 125, nUpper: 10000 },
  },
  // 8. CF 多变量
  {
    name: 'CF 1139B - 多变量',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nThe first line contains an integer n (1 ≤ n ≤ 2·10^5).\nThe second line contains n integers a_i (1 ≤ a_i ≤ 1e9).',
    expected: { timeLimitSec: 1, nUpper: 200000, valueUpper: 1000000000 },
  },
  // 9. CF 大值域（1e18）
  {
    name: 'CF 1345B - 大值域',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nThe first line contains an integer n (1 ≤ n ≤ 1e6).',
    expected: { timeLimitSec: 1, nUpper: 1000000 },
  },
  // 10. CF 1e5 数据范围
  {
    name: 'CF 1185D - 1e5 范围',
    platform: 'codeforces',
    text: 'Time limit: 1 second\nMemory limit: 256 megabytes\nThe first line contains an integer n (1 ≤ n ≤ 1e5).',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 100000 },
  },
  // 11. CF 1e7 大范围
  {
    name: 'CF 1343B - 2e6 大范围',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nThe first line contains an integer t (1 ≤ t ≤ 1e4).\nFor each test case, an integer n (1 ≤ n ≤ 2·10^6).',
    expected: { timeLimitSec: 1, nUpper: 2000000 },
  },
  // 12. CF 1e9 值域
  {
    name: 'CF 1343A - 1e9 值域',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nThe only line contains an integer n (3 ≤ n ≤ 1e9).',
    expected: { timeLimitSec: 1, nUpper: 1000000000 },
  },
  // 13. CF 1e18 大值域
  {
    name: 'CF 1326B - 1e18',
    platform: 'codeforces',
    text: 'Time limit: 1 second\nThe first line contains an integer n (1 ≤ n ≤ 2·10^5).\nThe second line contains n integers b_i (0 ≤ b_i ≤ 1e18).',
    expected: { timeLimitSec: 1, nUpper: 200000, valueUpper: 1e18 },
  },
  // 14. 洛谷多组数据
  {
    name: '洛谷 多组数据',
    platform: 'luogu',
    text: '时间限制 1.00s\n内存限制 256MB\n本题包含多组数据。\n第一行一个整数 t (1 ≤ t ≤ 1e4)，表示数据组数。\n每组数据第一行 n (1 ≤ n ≤ 2·10^5)。',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 200000, testGroupCount: 0 },
  },
  // 15. CF 全角符号
  {
    name: 'CF 全角符号混合',
    platform: 'codeforces',
    text: '时间限制：1.00s\n内存限制：256MB\n第一行 n（1 ≤ n ≤ 1e5）。',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 100000 },
  },
  // 16. CF 简单题（无值域）
  {
    name: 'CF 71A - Way Too Long Words',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nmemory limit per test: 256 megabytes\nThe first line contains an integer n (1 ≤ n ≤ 100).\nNext n lines contain words.',
    expected: { timeLimitSec: 1, memoryLimitMb: 256, nUpper: 100 },
  },
  // 17. CF 2 秒时限
  {
    name: 'CF 2 秒时限',
    platform: 'codeforces',
    text: 'time limit per test: 2 seconds\nmemory limit per test: 256 megabytes\n1 ≤ n ≤ 1e6',
    expected: { timeLimitSec: 2, memoryLimitMb: 256, nUpper: 1000000 },
  },
  // 18. CF 3 秒时限
  {
    name: 'CF 3 秒时限',
    platform: 'codeforces',
    text: 'Time limit: 3 seconds\n1 ≤ n ≤ 1e5',
    expected: { timeLimitSec: 3, nUpper: 100000 },
  },
  // 19. 洛谷 512MB
  {
    name: '洛谷 512MB',
    platform: 'luogu',
    text: '时间限制 2.00s\n内存限制 512MB\n1 <= n <= 1e6',
    expected: { timeLimitSec: 2, memoryLimitMb: 512, nUpper: 1000000 },
  },
  // 20. CF 复杂值域（负数）
  {
    name: 'CF 含负数范围',
    platform: 'codeforces',
    text: 'time limit per test: 1 second\nThe first line contains an integer n (1 ≤ n ≤ 2·10^5).\nThe second line contains n integers a_i (-1e9 ≤ a_i ≤ 1e9).',
    expected: { timeLimitSec: 1, nUpper: 200000, valueUpper: 1000000000 },
  },
]

test('20 道样例题面抽取准确率 >= 80%', () => {
  let correctCount = 0
  const failures: string[] = []
  const totalChecks: string[] = []

  for (const problem of sampleProblems) {
    const result = parseConstraintsStatic(problem.text, problem.platform, NOW)
    if (result === null) {
      failures.push(`${problem.name}: 解析返回 null`)
      for (const key of Object.keys(problem.expected)) {
        totalChecks.push(`${problem.name}.${key}`)
      }
      continue
    }

    // 检查每个 expected 字段
    for (const [key, expectedValue] of Object.entries(problem.expected)) {
      const totalKey = `${problem.name}.${key}`
      totalChecks.push(totalKey)
      const actual = (result as any)[key]
      if (actual === expectedValue) {
        correctCount++
      } else {
        failures.push(`${totalKey}: expected ${expectedValue}, got ${actual}`)
      }
    }
  }

  const accuracy = correctCount / totalChecks.length
  const accuracyPct = (accuracy * 100).toFixed(1)
  console.log(`\n  样例准确率: ${correctCount}/${totalChecks.length} = ${accuracyPct}%`)
  if (failures.length > 0) {
    console.log(`  失败项:`)
    for (const f of failures) {
      console.log(`    - ${f}`)
    }
  }
  assert.ok(
    accuracy >= 0.8,
    `accuracy should be >= 80%, got ${accuracyPct}% (${correctCount}/${totalChecks.length})`,
  )
})

test('20 道样例：每道题至少解析出一个字段', () => {
  let parsedCount = 0
  for (const problem of sampleProblems) {
    const result = parseConstraintsStatic(problem.text, problem.platform, NOW)
    if (result !== null) {
      parsedCount++
    }
  }
  // 所有 20 道题都应至少解析出一个字段
  assert.strictEqual(parsedCount, sampleProblems.length,
    `all ${sampleProblems.length} samples should parse at least one field, got ${parsedCount}`)
})

test('样例统计：时间限制抽取数 >= 18', () => {
  let timeLimitCount = 0
  for (const problem of sampleProblems) {
    const result = parseConstraintsStatic(problem.text, problem.platform, NOW)
    if (result?.timeLimitSec !== null) timeLimitCount++
  }
  assert.ok(timeLimitCount >= 18, `time limit should be parsed in >= 18 samples, got ${timeLimitCount}`)
})

test('样例统计：nUpper 抽取数 >= 17', () => {
  let nUpperCount = 0
  for (const problem of sampleProblems) {
    const result = parseConstraintsStatic(problem.text, problem.platform, NOW)
    if (result?.nUpper !== null) nUpperCount++
  }
  assert.ok(nUpperCount >= 17, `nUpper should be parsed in >= 17 samples, got ${nUpperCount}`)
})

// --- 12. 解析失败静默退化 ---

test('静默退化: 无效文本不抛错', () => {
  assert.doesNotThrow(() => {
    parseConstraintsStatic('', 'codeforces', NOW)
    parseConstraintsStatic('   ', 'codeforces', NOW)
    parseConstraintsStatic('hello world no constraints', 'codeforces', NOW)
    parseConstraintsStatic('时间限制 abc', 'codeforces', NOW)
    parseConstraintsStatic('1 ≤ n ≤ abc', 'codeforces', NOW)
  })
})

test('静默退化: HTML 无约束内容返回 null 或空约束', () => {
  const html = '<html><body><h1>Problem Title</h1><p>This is a problem with no constraints.</p></body></html>'
  const text = extractConstraintText(html, 'codeforces')
  // 不抛错即可（text 可能为非 null 的纯文本，但 parseConstraintsStatic 应返回 null）
  if (text) {
    const result = parseConstraintsStatic(text, 'codeforces', NOW)
    assert.ok(result === null || result!.source === 'regex')
  }
})

// --- 运行 ---

let failedCount = 0
console.log('Running ConstraintParser tests...\n')
for (const t of tests) {
  try {
    t.fn()
    console.log(`[PASS] ${t.name}`)
  } catch (err: any) {
    console.error(`[FAIL] ${t.name}`)
    console.error(err.stack || err)
    failedCount++
  }
}

console.log(`\nConstraintParser tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
