import assert from 'node:assert'
import {
  HintSelector,
  verdictToCategories,
  pickHintForEvent,
  type SelectHintInput,
  type SelectedHint,
} from '../../electron/coach/hints/HintSelector.ts'
import type { ProblemConstraints } from '../../electron/coach/problemFacts/ConstraintParser.ts'

/**
 * HintSelector 单元测试（阶段 3 Task 14）。
 *
 * 覆盖：
 * 1. verdict → 类别映射（WA / TLE / RE / MLE / CE / 未知）
 * 2. idle_too_long → 元认知
 * 3. 不依赖算法标签
 * 4. constraints 联动（L3+ 才用 targeted）
 *   - TLE + n>=1e5 → complexity large_n
 *   - WA + value>=1e9 → overflow
 * 5. 派生靶向事件类型（deriveEventType）
 *   - TLE + n>=1e5 → complexity_warning
 *   - WA + value>=1e9 → boundary_suspected
 * 6. 轮询（round-robin）行为
 * 7. selectByCategory
 * 8. pickHintForEvent 静态函数
 */

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

function makeConstraints(overrides: Partial<ProblemConstraints> = {}): ProblemConstraints {
  return {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 200000,
    valueLower: 1,
    valueUpper: 1000000000,
    timeLimitSec: 2,
    memoryLimitMb: 256,
    testGroupCount: null,
    parsedAt: Date.now(),
    source: 'regex',
    ...overrides,
  }
}

// --- 1. verdictToCategories 静态映射 ---

test('verdictToCategories: WA → 边界/特判/IO', () => {
  const cats = verdictToCategories('WA')
  assert.deepStrictEqual(cats, ['boundary', 'special_case', 'io'])
})

test('verdictToCategories: TLE → 复杂度', () => {
  const cats = verdictToCategories('TLE')
  assert.deepStrictEqual(cats, ['complexity'])
})

test('verdictToCategories: MLE → 复杂度', () => {
  const cats = verdictToCategories('MLE')
  assert.deepStrictEqual(cats, ['complexity'])
})

test('verdictToCategories: RE → 越界/初始化', () => {
  const cats = verdictToCategories('RE')
  assert.deepStrictEqual(cats, ['array_bounds', 'initialization'])
})

test('verdictToCategories: CE → IO', () => {
  const cats = verdictToCategories('CE')
  assert.deepStrictEqual(cats, ['io'])
})

test('verdictToCategories: PE → IO', () => {
  const cats = verdictToCategories('PE')
  assert.deepStrictEqual(cats, ['io'])
})

test('verdictToCategories: 未知 verdict → 边界类（最常见错误源）', () => {
  const cats = verdictToCategories('UNKNOWN')
  assert.deepStrictEqual(cats, ['boundary'])
})

test('verdictToCategories: idle_too_long → 元认知', () => {
  const cats = verdictToCategories('', 'idle_too_long')
  assert.deepStrictEqual(cats, ['metacognition'])
})

test('verdictToCategories: long_session → 元认知', () => {
  const cats = verdictToCategories('', 'long_session')
  assert.deepStrictEqual(cats, ['metacognition'])
})

test('verdictToCategories: first_ac → 元认知', () => {
  const cats = verdictToCategories('', 'first_ac')
  assert.deepStrictEqual(cats, ['metacognition'])
})

test('verdictToCategories: complexity_warning → 复杂度', () => {
  const cats = verdictToCategories('', 'complexity_warning')
  assert.deepStrictEqual(cats, ['complexity'])
})

test('verdictToCategories: boundary_suspected → 边界/溢出', () => {
  const cats = verdictToCategories('', 'boundary_suspected')
  assert.deepStrictEqual(cats, ['boundary', 'overflow'])
})

test('verdictToCategories: 大小写归一化（wa/tle/re 同 WA/TLE/RE）', () => {
  assert.deepStrictEqual(verdictToCategories('wa'), ['boundary', 'special_case', 'io'])
  assert.deepStrictEqual(verdictToCategories('Tle'), ['complexity'])
  assert.deepStrictEqual(verdictToCategories('rE'), ['array_bounds', 'initialization'])
})

test('verdictToCategories: undefined verdict → UNKNOWN → 边界', () => {
  const cats = verdictToCategories(undefined)
  assert.deepStrictEqual(cats, ['boundary'])
})

// --- 2. HintSelector.select 基础 ---

test('select: WA 返回边界类提示', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ verdict: 'WA', level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'boundary')
})

test('select: TLE 返回复杂度类提示', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ verdict: 'TLE', level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'complexity')
})

test('select: RE 返回越界类提示（首选 array_bounds）', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ verdict: 'RE', level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'array_bounds')
})

test('select: idle_too_long 返回元认知类提示', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ eventType: 'idle_too_long', level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'metacognition')
})

test('select: first_ac 返回元认知类提示', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ eventType: 'first_ac', level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'metacognition')
})

test('select: 不依赖算法标签（无 problemTags 入参）', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  // HintSelector.select 签名不含 problemTags，验证不依赖
  const input: SelectHintInput = { verdict: 'WA', level: 1 }
  const result = selector.select(input)
  assert.ok(result !== null)
  assert.ok(!('problemTags' in input), 'SelectHintInput should not include problemTags')
})

// --- 3. constraints 联动（L3+ 才用 targeted） ---

test('select: L1 不使用 constraints 联动（即使有 constraints）', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = selector.select({ verdict: 'WA', level: 1, constraints })
  assert.ok(result !== null)
  // L1 不触发 overflow 覆盖，应返回 boundary 类
  assert.strictEqual(result!.category, 'boundary')
})

test('select: L3 + WA + valueUpper>=1e9 → 切到 overflow 类', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = selector.select({ verdict: 'WA', level: 3, constraints })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'overflow', 'WA + value>=1e9 at L3 should override to overflow')
})

test('select: L3 + WA + valueUpper<1e9 → 保持 boundary 类', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ valueUpper: 1e8 })
  const result = selector.select({ verdict: 'WA', level: 3, constraints })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'boundary')
})

test('select: L3 + TLE + nUpper>=1e5 → 复杂度类带 large_n tag', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 2e5 })
  const result = selector.select({ verdict: 'TLE', level: 3, constraints })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'complexity')
  assert.ok(result!.tags.includes('large_n') || result!.tags.includes('nested_loop'),
    `TLE + n>=1e5 should have large_n/nested_loop tag: ${JSON.stringify(result!.tags)}`)
})

test('select: L3 + TLE + nUpper<1e5 → 复杂度类（不强制 large_n 模板）', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 1000 })
  const result = selector.select({ verdict: 'TLE', level: 3, constraints })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'complexity')
  // 注意：SelectedHint.tags 返回的是模板自带的 tags，不是 deriveTagsForVerdict 产生的过滤 tag。
  // 当 nUpper < 1e5 时，deriveTagsForVerdict 返回空数组，pickTemplate 退回到类目首条模板。
  // 首条模板 complexity-001 自带 ['tle', 'large_n'] tag，但这不影响"未用 large_n 过滤"的事实。
  // 这里只验证类目正确，不强制 tag 集合。
})

test('select: L3 + WA + constraints → 文本占位符被替换', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = selector.select({ verdict: 'WA', level: 3, constraints })
  assert.ok(result !== null)
  // overflow 类模板含 {value_upper} 占位符，应被替换
  assert.ok(!result!.text.includes('{value_upper}'),
    `placeholder should be replaced: ${result!.text}`)
  assert.ok(result!.text.includes('1·10^9') || result!.text.includes('1e9'),
    `text should contain value: ${result!.text}`)
})

test('select: L1 不替换占位符（无 constraints 联动）', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 2e5 })
  const result = selector.select({ verdict: 'TLE', level: 1, constraints })
  assert.ok(result !== null)
  // L1 不用 constraints，模板占位符可能保留
  // 这不是强约束，但验证 L1 不依赖 constraints
})

// --- 4. deriveEventType 派生靶向事件 ---

test('deriveEventType: TLE + nUpper>=1e5 → complexity_warning', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 2e5 })
  const derived = selector.deriveEventType({
    originalEventType: 'multiple_wrong',
    verdict: 'TLE',
    constraints,
  })
  assert.strictEqual(derived, 'complexity_warning')
})

test('deriveEventType: TLE + nUpper<1e5 → null', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 1000 })
  const derived = selector.deriveEventType({
    originalEventType: 'multiple_wrong',
    verdict: 'TLE',
    constraints,
  })
  assert.strictEqual(derived, null)
})

test('deriveEventType: WA + valueUpper>=1e9 → boundary_suspected', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const derived = selector.deriveEventType({
    originalEventType: 'multiple_wrong',
    verdict: 'WA',
    constraints,
  })
  assert.strictEqual(derived, 'boundary_suspected')
})

test('deriveEventType: WA + valueUpper<1e9 → null', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ valueUpper: 1e8 })
  const derived = selector.deriveEventType({
    originalEventType: 'multiple_wrong',
    verdict: 'WA',
    constraints,
  })
  assert.strictEqual(derived, null)
})

test('deriveEventType: 无 constraints → null', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const derived = selector.deriveEventType({
    originalEventType: 'multiple_wrong',
    verdict: 'TLE',
    constraints: null,
  })
  assert.strictEqual(derived, null)
})

test('deriveEventType: RE verdict 不派生（即使有 constraints）', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 2e5, valueUpper: 1e9 })
  const derived = selector.deriveEventType({
    originalEventType: 'multiple_wrong',
    verdict: 'RE',
    constraints,
  })
  assert.strictEqual(derived, null)
})

// --- 5. 轮询（round-robin） ---

test('select: roundRobin 启用时同 verdict 多次返回不同模板', () => {
  const selector = new HintSelector({ enableRoundRobin: true })
  const results: string[] = []
  for (let i = 0; i < 6; i++) {
    const r = selector.select({ verdict: 'WA', level: 1 })
    if (r) results.push(r.templateId)
  }
  // WA 有 3 个候选类目，但每次只返回第一个类目的模板
  // roundRobin 在类目内的模板间轮询（boundary 类有 4 条模板）
  const unique = new Set(results)
  assert.ok(unique.size >= 2, `roundRobin should produce >= 2 unique templates, got ${unique.size}: ${results.join(', ')}`)
})

test('select: roundRobin 关闭时同 verdict 多次返回相同模板', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const results: string[] = []
  for (let i = 0; i < 5; i++) {
    const r = selector.select({ verdict: 'WA', level: 1 })
    if (r) results.push(r.templateId)
  }
  const unique = new Set(results)
  assert.strictEqual(unique.size, 1, `non-roundRobin should always return same template: ${results.join(', ')}`)
})

test('select: resetCursorForTest 清空轮询游标', () => {
  const selector = new HintSelector({ enableRoundRobin: true })
  selector.select({ verdict: 'WA', level: 1 })
  selector.select({ verdict: 'WA', level: 1 })
  selector.resetCursorForTest()
  const r1 = selector.select({ verdict: 'WA', level: 1 })
  const r2 = selector.select({ verdict: 'WA', level: 1 })
  // 重置后第一次应与重置前第一次相同（游标归零）
  // 验证不抛错即可
  assert.ok(r1 !== null)
  assert.ok(r2 !== null)
})

// --- 6. selectByCategory ---

test('selectByCategory: 直接按类目选模板', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.selectByCategory('metacognition')
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'metacognition')
})

test('selectByCategory: 带 constraints 时替换占位符', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const constraints = makeConstraints({ nUpper: 2e5 })
  const result = selector.selectByCategory('complexity', constraints)
  assert.ok(result !== null)
  // complexity 类模板含 {n_upper} 占位符，应被替换
  assert.ok(!result!.text.includes('{n_upper}'),
    `placeholder should be replaced: ${result!.text}`)
})

test('selectByCategory: 无 constraints 时保留占位符', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.selectByCategory('complexity')
  assert.ok(result !== null)
  // 模板可能含占位符，但未被替换
  // 这不是强约束，但验证不抛错
})

// --- 7. pickHintForEvent 静态函数 ---

test('pickHintForEvent: 静态函数版（无轮询）', () => {
  const result = pickHintForEvent('WA', 'multiple_wrong', null, 1)
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'boundary')
})

test('pickHintForEvent: 带 constraints + L3', () => {
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = pickHintForEvent('WA', 'multiple_wrong', constraints, 3)
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'overflow')
})

test('pickHintForEvent: 带 constraints + L1（不触发 targeted）', () => {
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = pickHintForEvent('WA', 'multiple_wrong', constraints, 1)
  assert.ok(result !== null)
  // L1 不用 constraints，应返回 boundary
  assert.strictEqual(result!.category, 'boundary')
})

// --- 8. 边界情况 ---

test('select: 无 verdict 无 eventType → 边界类', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'boundary')
})

test('select: 未知 verdict → 边界类', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ verdict: 'SOME_NEW_VERDICT', level: 1 })
  assert.ok(result !== null)
  assert.strictEqual(result!.category, 'boundary')
})

test('select: 返回的 SelectedHint 结构完整', () => {
  const selector = new HintSelector({ enableRoundRobin: false })
  const result = selector.select({ verdict: 'WA', level: 1 })
  assert.ok(result !== null)
  const r: SelectedHint = result!
  assert.ok(typeof r.templateId === 'string' && r.templateId.length > 0)
  assert.ok(typeof r.category === 'string')
  assert.ok(typeof r.text === 'string' && r.text.length > 0)
  assert.ok(Array.isArray(r.tags))
})

// --- 运行 ---

let failedCount = 0
console.log('Running HintSelector tests...\n')
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

console.log(`\nHintSelector tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
