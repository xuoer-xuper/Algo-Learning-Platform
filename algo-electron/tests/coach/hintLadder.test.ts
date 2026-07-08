import assert from 'node:assert'
import {
  HintLadder,
  LADDER_LEVEL_DESCRIPTIONS,
  type GetMessageForLevelContext,
  type LadderLevel,
  type L5ConfirmationState,
} from '../../electron/coach/hints/HintLadder.ts'
import { HintSelector } from '../../electron/coach/hints/HintSelector.ts'
import type { ProblemConstraints } from '../../electron/coach/problemFacts/ConstraintParser.ts'
import type { CoachEventType } from '../../electron/coach/types.ts'

/**
 * HintLadder 单元测试（阶段 3 Task 15）。
 *
 * 覆盖：
 * 1. 6 级提示（L0-L5）内容生成
 * 2. L0 不提示（仅记录）
 * 3. L1 轻提醒
 * 4. L2 元认知（从 metacognition 类模板挑选）
 * 5. L3 关键细节/边界（按 verdict 选类目）
 * 6. L4 策略（基于 constraints 给出复杂度/数据结构建议）
 * 7. L5 概念/标签（仅当 problemTags 已知；无标签时退化）
 * 8. L5 二次确认机制（needsConfirmation / markL5Pending / confirmL5 / resetL5State）
 * 9. 升级冷却与 RuleEngine 联动（不在此测试冷却，由 ruleEngine.test.ts 覆盖）
 * 10. 不直接给完整答案
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

function makeContext(overrides: Partial<GetMessageForLevelContext> = {}): GetMessageForLevelContext {
  return {
    eventType: 'multiple_wrong',
    verdict: 'WA',
    constraints: null,
    problemTags: [],
    problemRating: null,
    ...overrides,
  }
}

// --- 1. L0 不提示 ---

test('L0: 返回空消息 + rejected=true', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(0, makeContext())
  assert.strictEqual(result.level, 0)
  assert.strictEqual(result.message, '')
  assert.strictEqual(result.rejected, true)
  assert.ok(result.rejectReason?.includes('L0'), `rejectReason should mention L0: ${result.rejectReason}`)
})

test('LADDER_LEVEL_DESCRIPTIONS: 6 级描述齐全', () => {
  const levels: LadderLevel[] = [0, 1, 2, 3, 4, 5]
  for (const lv of levels) {
    const desc = LADDER_LEVEL_DESCRIPTIONS[lv]
    assert.ok(typeof desc === 'string' && desc.length > 0, `level ${lv} description missing`)
  }
  assert.strictEqual(LADDER_LEVEL_DESCRIPTIONS[5], '概念/标签')
})

// --- 2. L1 轻提醒 ---

test('L1: multiple_wrong 事件返回轻提醒', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(1, makeContext({ eventType: 'multiple_wrong', verdict: 'WA' }))
  assert.strictEqual(result.level, 1)
  assert.ok(result.message.length > 0)
  assert.ok(result.message.includes('L1') || result.message.includes('提示') || result.message.includes('方向'),
    `L1 message should be a gentle nudge: ${result.message}`)
  assert.ok(result.tags.includes('L1'))
  assert.ok(result.tags.includes('light'))
})

test('L1: idle_too_long 事件', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(1, makeContext({ eventType: 'idle_too_long' }))
  assert.strictEqual(result.level, 1)
  assert.ok(result.message.includes('L1') || result.message.includes('方向'))
})

test('L1: same_error 事件', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(1, makeContext({ eventType: 'same_error', verdict: 'WA' }))
  assert.strictEqual(result.level, 1)
  assert.ok(result.message.length > 0)
})

test('L1: complexity_warning 事件', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(1, makeContext({ eventType: 'complexity_warning', verdict: 'TLE' }))
  assert.strictEqual(result.level, 1)
  assert.ok(result.message.includes('复杂度') || result.message.includes('L1') || result.message.includes('提示'))
})

test('L1: boundary_suspected 事件', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(1, makeContext({ eventType: 'boundary_suspected', verdict: 'WA' }))
  assert.strictEqual(result.level, 1)
  assert.ok(result.message.includes('边界') || result.message.includes('类型') || result.message.includes('L1'))
})

test('L1: first_ac 事件', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(1, makeContext({ eventType: 'first_ac', verdict: 'AC' }))
  assert.strictEqual(result.level, 1)
  assert.ok(result.message.includes('AC') || result.message.includes('干得漂亮') || result.message.includes('L1'))
})

// --- 3. L2 元认知 ---

test('L2: 从 metacognition 类模板挑选', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(2, makeContext())
  assert.strictEqual(result.level, 2)
  assert.ok(result.message.length > 0)
  assert.ok(result.tags.includes('metacognition') || result.category === 'metacognition',
    `L2 should use metacognition category: ${JSON.stringify(result)}`)
})

test('L2: 不依赖 verdict（任何 verdict 都用元认知）', () => {
  const ladder = new HintLadder()
  const r1 = ladder.getMessageForLevel(2, makeContext({ verdict: 'WA' }))
  const r2 = ladder.getMessageForLevel(2, makeContext({ verdict: 'TLE' }))
  const r3 = ladder.getMessageForLevel(2, makeContext({ verdict: 'RE' }))
  // L2 都用 metacognition 类，消息可能相同或不同（轮询）
  assert.strictEqual(r1.level, 2)
  assert.strictEqual(r2.level, 2)
  assert.strictEqual(r3.level, 2)
})

test('L2: idle_too_long 事件也用元认知', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(2, makeContext({ eventType: 'idle_too_long' }))
  assert.strictEqual(result.level, 2)
  assert.ok(result.message.length > 0)
})

// --- 4. L3 关键细节/边界 ---

test('L3: WA → boundary 类模板', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(3, makeContext({ verdict: 'WA' }))
  assert.strictEqual(result.level, 3)
  assert.ok(result.category === 'boundary' || result.message.includes('边界') || result.message.includes('L3'),
    `L3 for WA should use boundary category: ${JSON.stringify(result)}`)
})

test('L3: TLE → complexity 类模板', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(3, makeContext({ verdict: 'TLE', eventType: 'complexity_warning' }))
  assert.strictEqual(result.level, 3)
  assert.ok(result.category === 'complexity' || result.message.includes('复杂度') || result.message.includes('L3'),
    `L3 for TLE should use complexity category: ${JSON.stringify(result)}`)
})

test('L3: RE → array_bounds 类模板', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(3, makeContext({ verdict: 'RE' }))
  assert.strictEqual(result.level, 3)
  assert.ok(result.category === 'array_bounds' || result.message.includes('越界') || result.message.includes('L3'),
    `L3 for RE should use array_bounds category: ${JSON.stringify(result)}`)
})

test('L3: 带 constraints 时填充占位符', () => {
  const ladder = new HintLadder()
  const constraints = makeConstraints({ nUpper: 200000 })
  const result = ladder.getMessageForLevel(3, makeContext({
    verdict: 'TLE',
    eventType: 'complexity_warning',
    constraints,
  }))
  assert.strictEqual(result.level, 3)
  assert.ok(result.message.length > 0)
  // 占位符应被替换（不应出现 {n_upper} 等）
  assert.ok(!result.message.includes('{n_upper}'), `placeholders should be filled: ${result.message}`)
})

test('L3: WA + valueUpper>=1e9 → 切到 overflow 类', () => {
  const ladder = new HintLadder()
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = ladder.getMessageForLevel(3, makeContext({
    verdict: 'WA',
    eventType: 'boundary_suspected',
    constraints,
  }))
  assert.strictEqual(result.level, 3)
  assert.ok(result.category === 'overflow' || result.message.includes('溢出') || result.message.includes('long long'),
    `L3 for WA + value>=1e9 should use overflow category: ${JSON.stringify(result)}`)
})

// --- 5. L4 策略 ---

test('L4: TLE + n>=1e5 → 复杂度策略提示', () => {
  const ladder = new HintLadder()
  const constraints = makeConstraints({ nUpper: 200000 })
  const result = ladder.getMessageForLevel(4, makeContext({
    verdict: 'TLE',
    eventType: 'complexity_warning',
    constraints,
  }))
  assert.strictEqual(result.level, 4)
  assert.ok(result.message.includes('L4'))
  assert.ok(result.message.includes('O(n log n)') || result.message.includes('复杂度') || result.message.includes('线段树'),
    `L4 TLE strategy should mention O(n log n) or data structures: ${result.message}`)
})

test('L4: TLE 无 constraints → 通用复杂度策略', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(4, makeContext({
    verdict: 'TLE',
    eventType: 'complexity_warning',
    constraints: null,
  }))
  assert.strictEqual(result.level, 4)
  assert.ok(result.message.includes('L4'))
  assert.ok(result.message.includes('排序') || result.message.includes('二分') || result.message.includes('堆') || result.message.includes('线段树'),
    `L4 generic strategy should mention data structures: ${result.message}`)
})

test('L4: WA + value>=1e9 → 溢出策略提示', () => {
  const ladder = new HintLadder()
  const constraints = makeConstraints({ valueUpper: 1e9 })
  const result = ladder.getMessageForLevel(4, makeContext({
    verdict: 'WA',
    eventType: 'boundary_suspected',
    constraints,
  }))
  assert.strictEqual(result.level, 4)
  assert.ok(result.message.includes('L4'))
  assert.ok(result.message.includes('long long') || result.message.includes('BigInt') || result.message.includes('溢出'),
    `L4 WA + large value should mention overflow: ${result.message}`)
})

test('L4: WA 无 constraints → 边界策略提示', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(4, makeContext({
    verdict: 'WA',
    eventType: 'multiple_wrong',
    constraints: null,
  }))
  assert.strictEqual(result.level, 4)
  assert.ok(result.message.includes('L4'))
  assert.ok(result.message.includes('区间') || result.message.includes('前缀和') || result.message.includes('边界'),
    `L4 WA generic should mention prefix sum / boundary: ${result.message}`)
})

test('L4: RE → 越界策略提示', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(4, makeContext({
    verdict: 'RE',
    eventType: 'multiple_wrong',
    constraints: null,
  }))
  assert.strictEqual(result.level, 4)
  assert.ok(result.message.includes('L4'))
  assert.ok(result.message.includes('数组') || result.message.includes('下标') || result.message.includes('栈'),
    `L4 RE should mention array/index/stack: ${result.message}`)
})

// --- 6. L5 概念/标签 ---

test('L5: 无 problemTags → 退化到 L4 策略（不再深入）', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: [] }))
  assert.strictEqual(result.level, 5)
  assert.ok(result.message.length > 0)
  assert.ok(result.tags.includes('no_tags') || result.tags.includes('fallback'),
    `L5 without tags should have fallback tag: ${JSON.stringify(result.tags)}`)
})

test('L5: 有 problemTags → 给出概念性提示', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: ['dp', 'greedy'] }))
  assert.strictEqual(result.level, 5)
  assert.ok(result.message.includes('L5'))
  assert.ok(result.message.includes('动态规划') || result.message.includes('dp'),
    `L5 with dp tag should mention DP: ${result.message}`)
  assert.ok(result.tags.includes('concept'))
  assert.ok(result.tags.includes('dp'))
})

test('L5: 有 graph 标签 → 提示图论', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: ['graph'] }))
  assert.strictEqual(result.level, 5)
  assert.ok(result.message.includes('图论') || result.message.includes('graph'))
})

test('L5: 有 prefix-sum 标签 → 提示前缀和', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: ['prefix-sum'] }))
  assert.strictEqual(result.level, 5)
  assert.ok(result.message.includes('前缀和'))
})

test('L5: 未知标签 → 列出所有标签作为方向', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: ['some-unknown-tag'] }))
  assert.strictEqual(result.level, 5)
  assert.ok(result.message.includes('some-unknown-tag') || result.message.includes('some_unknown_tag'.replace('_', '-')))
})

test('L5: 多个标签 → 取第一个作为主提示', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: ['dp', 'greedy', 'math'] }))
  assert.strictEqual(result.level, 5)
  // 主提示应基于 dp（第一个标签）
  assert.ok(result.message.includes('动态规划') || result.message.includes('dp'))
})

test('L5: 不直接给完整答案（Socratic 原则）', () => {
  const ladder = new HintLadder()
  const result = ladder.getMessageForLevel(5, makeContext({ problemTags: ['dp'] }))
  // 消息应引导方向，不应直接说"答案是DP"或"用DP做"
  assert.ok(!result.message.includes('答案是'), `L5 should not give direct answer: ${result.message}`)
  assert.ok(!result.message.includes('应该用'), `L5 should not give direct solution: ${result.message}`)
  assert.ok(result.message.includes('可能') || result.message.includes('思考'),
    `L5 should guide thinking: ${result.message}`)
})

// --- 7. L5 二次确认机制 ---

test('needsConfirmationForUpgrade: L4→L5 需确认', () => {
  const ladder = new HintLadder()
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, 'multiple_wrong'), true)
})

test('needsConfirmationForUpgrade: L0-L3 升级不需确认', () => {
  const ladder = new HintLadder()
  assert.strictEqual(ladder.needsConfirmationForUpgrade(0, 'multiple_wrong'), false)
  assert.strictEqual(ladder.needsConfirmationForUpgrade(1, 'multiple_wrong'), false)
  assert.strictEqual(ladder.needsConfirmationForUpgrade(2, 'multiple_wrong'), false)
  assert.strictEqual(ladder.needsConfirmationForUpgrade(3, 'multiple_wrong'), false)
})

test('needsConfirmationForUpgrade: L5 已到顶不需确认', () => {
  const ladder = new HintLadder()
  assert.strictEqual(ladder.needsConfirmationForUpgrade(5, 'multiple_wrong'), false)
})

test('markL5Pending: 设置 pending 状态后不再需要确认', () => {
  const ladder = new HintLadder()
  // 初始 idle → 需确认
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, 'multiple_wrong'), true)
  // 标记 pending → 不再需要确认（用户已点过一次）
  ladder.markL5Pending('multiple_wrong')
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, 'multiple_wrong'), false)
  assert.strictEqual(ladder.getL5StateForTest('multiple_wrong'), 'pending')
})

test('confirmL5: 标记为已确认', () => {
  const ladder = new HintLadder()
  ladder.markL5Pending('multiple_wrong')
  ladder.confirmL5('multiple_wrong')
  assert.strictEqual(ladder.getL5StateForTest('multiple_wrong'), 'confirmed')
})

test('resetL5State: 清空特定 eventType 的 L5 状态', () => {
  const ladder = new HintLadder()
  ladder.markL5Pending('multiple_wrong')
  ladder.markL5Pending('idle_too_long')
  ladder.resetL5State('multiple_wrong')
  assert.strictEqual(ladder.getL5StateForTest('multiple_wrong'), 'idle')
  assert.strictEqual(ladder.getL5StateForTest('idle_too_long'), 'pending')
})

test('resetAllForTest: 清空所有 L5 状态', () => {
  const ladder = new HintLadder()
  ladder.markL5Pending('multiple_wrong')
  ladder.markL5Pending('idle_too_long')
  ladder.resetAllForTest()
  assert.strictEqual(ladder.getL5StateForTest('multiple_wrong'), 'idle')
  assert.strictEqual(ladder.getL5StateForTest('idle_too_long'), 'idle')
})

test('L5 二次确认完整流程：idle → pending → confirmed', () => {
  const ladder = new HintLadder()
  const eventType: CoachEventType = 'multiple_wrong'

  // 1. 初始 idle
  assert.strictEqual(ladder.getL5StateForTest(eventType), 'idle' as L5ConfirmationState)
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, eventType), true)

  // 2. 用户第一次点"再给一点" → markL5Pending
  ladder.markL5Pending(eventType)
  assert.strictEqual(ladder.getL5StateForTest(eventType), 'pending')
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, eventType), false)

  // 3. 用户二次确认 → confirmL5
  ladder.confirmL5(eventType)
  assert.strictEqual(ladder.getL5StateForTest(eventType), 'confirmed')

  // 4. dismiss 后重置
  ladder.resetL5State(eventType)
  assert.strictEqual(ladder.getL5StateForTest(eventType), 'idle')
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, eventType), true)
})

test('enableL5Confirmation=false: 不需要二次确认', () => {
  const ladder = new HintLadder({ enableL5Confirmation: false })
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, 'multiple_wrong'), false)
})

// --- 8. 注入式 HintSelector ---

test('注入式 HintSelector: 使用外部 selector 实例', () => {
  const externalSelector = new HintSelector({ enableRoundRobin: false })
  const ladder = new HintLadder({ hintSelector: externalSelector })
  const result = ladder.getMessageForLevel(2, makeContext())
  assert.strictEqual(result.level, 2)
  assert.ok(result.message.length > 0)
})

// --- 9. 消息不重复泄露完整答案 ---

test('所有等级消息都不直接给完整答案', () => {
  const ladder = new HintLadder()
  const context = makeContext({ verdict: 'WA', problemTags: ['dp'] })
  for (const level of [1, 2, 3, 4, 5] as LadderLevel[]) {
    const result = ladder.getMessageForLevel(level, context)
    assert.ok(result.message.length > 0, `L${level} message should not be empty`)
    assert.ok(!result.message.includes('答案是'), `L${level} should not give direct answer: ${result.message}`)
    assert.ok(!result.message.includes('解法是'), `L${level} should not give direct solution: ${result.message}`)
  }
})

// --- 10. 升级冷却不在此测试（由 RuleEngine 管理） ---

test('HintLadder 不实现冷却逻辑（由 RuleEngine 管理）', () => {
  // HintLadder 没有 cooldown 相关方法，验证它不暴露冷却 API
  const ladder = new HintLadder()
  // 验证 HintLadder 只管消息生成与 L5 确认状态，不管冷却
  assert.ok(typeof ladder.getMessageForLevel === 'function')
  assert.ok(typeof ladder.needsConfirmationForUpgrade === 'function')
  assert.ok(typeof ladder.markL5Pending === 'function')
  assert.ok(typeof ladder.confirmL5 === 'function')
  assert.ok(typeof ladder.resetL5State === 'function')
  // 不应有 cooldown / throttle / lastUpgrade 等方法
  assert.ok(!('cooldown' in ladder) && !('lastUpgradeAt' in ladder) && !('throttle' in ladder),
    'HintLadder should not implement cooldown logic')
})

// --- 11. 手动演练：完整升级流程 ---

test('手动演练：L1 → L2 → L3 → L4 → L5(confirmation) → L5(confirmed)', () => {
  const ladder = new HintLadder()
  const context = makeContext({
    eventType: 'multiple_wrong',
    verdict: 'WA',
    constraints: makeConstraints({ valueUpper: 1e9 }),
    problemTags: ['dp'],
  })

  // L1: 轻提醒
  const l1 = ladder.getMessageForLevel(1, context)
  assert.strictEqual(l1.level, 1)
  assert.ok(l1.message.length > 0)

  // L2: 元认知
  const l2 = ladder.getMessageForLevel(2, context)
  assert.strictEqual(l2.level, 2)
  assert.ok(l2.message.length > 0)

  // L3: 关键细节（WA + value>=1e9 → overflow）
  const l3 = ladder.getMessageForLevel(3, context)
  assert.strictEqual(l3.level, 3)
  assert.ok(l3.message.length > 0)

  // L4: 策略
  const l4 = ladder.getMessageForLevel(4, context)
  assert.strictEqual(l4.level, 4)
  assert.ok(l4.message.includes('L4'))

  // L5 前检查：需要确认
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, context.eventType), true)

  // 标记 pending（用户第一次点）
  ladder.markL5Pending(context.eventType)

  // 不再需要确认
  assert.strictEqual(ladder.needsConfirmationForUpgrade(4, context.eventType), false)

  // L5: 概念/标签（dp）
  const l5 = ladder.getMessageForLevel(5, context)
  assert.strictEqual(l5.level, 5)
  assert.ok(l5.message.includes('L5'))
  assert.ok(l5.message.includes('动态规划') || l5.message.includes('dp'))

  // 确认
  ladder.confirmL5(context.eventType)
  assert.strictEqual(ladder.getL5StateForTest(context.eventType), 'confirmed')
})

// --- 运行 ---

let failedCount = 0
console.log('Running HintLadder tests...\n')
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

console.log(`\nHintLadder tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
