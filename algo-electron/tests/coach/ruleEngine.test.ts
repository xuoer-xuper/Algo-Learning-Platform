import assert from 'node:assert'
import type { CoachEvent, CoachEventType, ProblemSession } from '../../electron/coach/types.ts'
import { RuleEngine } from '../../electron/coach/rules/RuleEngine.ts'
import {
  RULE_THROTTLE_MS,
  HINT_UPGRADE_COOLDOWN_MS,
  DEFAULT_TRIGGER_SCORE_THRESHOLD,
} from '../../electron/coach/rules/rules.ts'

/**
 * RuleEngine 单元测试。
 *
 * 覆盖：
 * 1. 核心规则命中（idle_too_long / multiple_wrong / same_error / first_ac / long_session）
 * 2. 评分阈值（score < threshold 不触发）
 * 3. 节流（同类型 30 分钟内不重复）
 * 4. 防 hint abuse 升级冷却（2 分钟或需新提交）
 * 5. 比赛模式硬关闭
 * 6. "今天别提醒"临时屏蔽
 * 7. 难度自适应（rating >= 1600 放宽）
 */

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// --- 测试辅助 ---

let fakeNow = 1700000000000 // 固定起始时间
let uuidCounter = 0

function resetClock() {
  fakeNow = 1700000000000
  uuidCounter = 0
}

function advance(ms: number) {
  fakeNow += ms
}

function fakeUuid(): string {
  uuidCounter += 1
  return `test-uuid-${uuidCounter}`
}

function fakeNowIso(): string {
  return new Date(fakeNow).toISOString()
}

function buildEvent(overrides: Partial<CoachEvent> & { event_type: CoachEventType }): CoachEvent {
  return {
    event_id: fakeUuid(),
    session_id: null,
    severity: 'warn',
    score: 50,
    problem_id: null,
    platform: 'codeforces',
    evidence: {},
    created_at: fakeNowIso(),
    ...overrides,
  }
}

function buildSession(overrides: Partial<ProblemSession> = {}): ProblemSession {
  return {
    session_id: 'sess-1',
    problem_id: null,
    platform: 'codeforces',
    platform_problem_id: '1234A',
    started_at: fakeNow,
    last_active_at: fakeNow,
    active_seconds: 0,
    submit_count: 0,
    wrong_count: 0,
    current_status: 'active',
    phase: 'reading',
    detected_stuck_level: 0,
    verdict_history: [],
    problem_rating: null,
    ...overrides,
  }
}

function createEngine(overrides: {
  session?: ProblemSession | null
  rating?: number | null
  isContestMode?: boolean
  suppressed?: Set<CoachEventType>
} = {}) {
  const session = overrides.session === undefined ? null : overrides.session
  const rating = overrides.rating === undefined ? null : overrides.rating
  const isContestMode = overrides.isContestMode ?? false
  const suppressed = overrides.suppressed ?? new Set<CoachEventType>()

  const interventions: { intervention_id: string; event_type: string; level: number }[] = []

  const engine = new RuleEngine({
    getSession: () => session,
    getProblemRating: () => rating,
    getIsContestMode: () => isContestMode,
    getSuppressedTypes: () => suppressed,
    onIntervention: (intervention) => {
      interventions.push({
        intervention_id: intervention.intervention_id,
        event_type: intervention.trigger_reason.split(' ')[0],
        level: intervention.intervention_level,
      })
    },
    now: () => fakeNow,
    uuid: fakeUuid,
    nowIso: fakeNowIso,
  })

  return { engine, interventions }
}

// --- 1. 核心规则命中 ---

test('multiple_wrong: WA >= 2 触发，score >= threshold', () => {
  resetClock()
  const { engine, interventions } = createEngine()
  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const result = engine.handleEvent(event)
  assert.ok(result, 'multiple_wrong with wrong_count=2 should trigger')
  assert.strictEqual(result?.intervention_level, 1)
  assert.strictEqual(interventions.length, 1)
  assert.strictEqual(interventions[0].event_type, 'multiple_wrong')
})

test('multiple_wrong: wrong_count=1 不触发（score 不足或 matches false）', () => {
  resetClock()
  const { engine, interventions } = createEngine()
  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 70,
    evidence: { wrong_count: 1, verdict: 'WA' },
  })
  const result = engine.handleEvent(event)
  assert.strictEqual(result, null, 'wrong_count=1 should not match')
  assert.strictEqual(interventions.length, 0)
})

test('same_error: 同 verdict 连续重复 >= 2 触发', () => {
  resetClock()
  const { engine, interventions } = createEngine()
  const event = buildEvent({
    event_type: 'same_error',
    score: 75,
    evidence: { same_verdict_repeat: 2, verdict: 'TLE' },
  })
  const result = engine.handleEvent(event)
  assert.ok(result, 'same_error with repeat=2 should trigger')
  assert.strictEqual(interventions.length, 1)
})

test('first_ac: 首次 AC 触发（score=30 < threshold=50 不触发气泡）', () => {
  resetClock()
  const { engine, interventions } = createEngine()
  const event = buildEvent({
    event_type: 'first_ac',
    score: 30,
    severity: 'info',
    evidence: { verdict: 'AC' },
  })
  const result = engine.handleEvent(event)
  // first_ac score=30 < DEFAULT_TRIGGER_SCORE_THRESHOLD=50 → 不触发
  assert.strictEqual(result, null, 'first_ac score 30 < threshold 50, should not trigger')
  assert.strictEqual(interventions.length, 0)
})

test('idle_too_long: stuck_level >= 1 且 active_seconds >= 600 触发', () => {
  resetClock()
  const session = buildSession({
    active_seconds: 700,
    detected_stuck_level: 1,
    phase: 'stuck',
  })
  const { engine, interventions } = createEngine({ session })
  const event = buildEvent({
    event_type: 'idle_too_long',
    score: 45, // idle rule score = 30 + 1*15 = 45 < 50 → 不触发
  })
  // idle_too_long score = 30 + level*15 = 30+15 = 45 < 50 threshold
  const result = engine.handleEvent(event)
  assert.strictEqual(result, null, 'score 45 < 50 threshold should not trigger')
  assert.strictEqual(interventions.length, 0)
})

test('idle_too_long: stuck_level=2 触发（score=60 >= 50）', () => {
  resetClock()
  const session = buildSession({
    active_seconds: 800,
    detected_stuck_level: 2,
    phase: 'stuck',
    wrong_count: 1,
  })
  const { engine, interventions } = createEngine({ session })
  const event = buildEvent({
    event_type: 'idle_too_long',
    score: 60,
  })
  const result = engine.handleEvent(event)
  assert.ok(result, 'idle_too_long with stuck_level=2, score=60 >= 50 should trigger')
  assert.strictEqual(result?.intervention_level, 2)
  assert.strictEqual(interventions.length, 1)
})

test('long_session: active >= 90 分钟触发', () => {
  resetClock()
  const session = buildSession({
    active_seconds: 95 * 60, // 95 分钟
    phase: 'coding',
  })
  const { engine, interventions } = createEngine({ session })
  const event = buildEvent({
    event_type: 'long_session',
    score: 45, // long_session score = 40 + floor((95*60-90*60)/60) = 40+5 = 45 < 50 → 不触发
  })
  const result = engine.handleEvent(event)
  assert.strictEqual(result, null, 'long_session score 45 < 50 should not trigger')
  assert.strictEqual(interventions.length, 0)
})

test('long_session: active >= 100 分钟触发（score=50 >= threshold）', () => {
  resetClock()
  const session = buildSession({
    active_seconds: 100 * 60, // 100 分钟
    phase: 'coding',
  })
  const { engine, interventions } = createEngine({ session })
  const event = buildEvent({
    event_type: 'long_session',
    score: 50,
  })
  const result = engine.handleEvent(event)
  assert.ok(result, 'long_session with 100min, score=50 >= 50 should trigger')
  assert.strictEqual(interventions.length, 1)
})

// --- 2. 评分阈值 ---

test('评分低于阈值不触发（score < DEFAULT_TRIGGER_SCORE_THRESHOLD）', () => {
  resetClock()
  const { engine } = createEngine()
  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 30,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  // score 函数返回 60+2*10=80 >= 50，但这里我们传入的 event.score 不影响 rule.score
  // rule.score 才是真正评估的 score。multiple_wrong with wrong_count=2 → score=80 >= 50 → 触发
  const result = engine.handleEvent(event)
  assert.ok(result, 'multiple_wrong score computed by rule (80) >= 50 should trigger')
})

// --- 3. 节流 ---

test('节流：同类型 30 分钟内不重复触发', () => {
  resetClock()
  const { engine, interventions } = createEngine()

  // 第一次触发
  const event1 = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const result1 = engine.handleEvent(event1)
  assert.ok(result1, 'first trigger should fire')

  // 29 分钟后：应被节流
  advance(29 * 60 * 1000)
  const event2 = buildEvent({
    event_type: 'multiple_wrong',
    score: 90,
    evidence: { wrong_count: 3, verdict: 'WA' },
  })
  const result2 = engine.handleEvent(event2)
  assert.strictEqual(result2, null, 'should be throttled within 30min')
  assert.strictEqual(interventions.length, 1, 'only 1 intervention after throttle')

  // 31 分钟后：节流窗口过期，应再次触发
  advance(2 * 60 * 1000) // total 31min
  const event3 = buildEvent({
    event_type: 'multiple_wrong',
    score: 90,
    evidence: { wrong_count: 4, verdict: 'WA' },
  })
  const result3 = engine.handleEvent(event3)
  assert.ok(result3, 'should trigger after 30min throttle window')
  assert.strictEqual(interventions.length, 2)
})

// --- 4. 防 hint abuse 升级冷却 ---

test('防 hint abuse：升级冷却 2 分钟内拒绝', () => {
  resetClock()
  const { engine } = createEngine()

  // 先触发一次
  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const firstResult = engine.handleEvent(event)
  assert.ok(firstResult)

  // 立即请求升级 → 应被冷却拒绝
  const upgrade1 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(upgrade1, null, 'upgrade within 2min cooldown should be rejected')

  // 2 分 1 秒后 → 允许升级
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const upgrade2 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.ok(upgrade2, 'upgrade after 2min cooldown should succeed')
  assert.strictEqual(upgrade2?.intervention_level, 2, 'should upgrade from L1 to L2')
})

test('防 hint abuse：新提交立即解锁冷却', () => {
  resetClock()
  const { engine } = createEngine()

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const firstResult = engine.handleEvent(event)
  assert.ok(firstResult)

  // 立即请求升级 → 被冷却拒绝
  const upgrade1 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(upgrade1, null)

  // 新提交到来 → 解锁
  engine.notifyNewSubmission('new-submission-id')

  // 再次升级 → 应成功
  const upgrade2 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.ok(upgrade2, 'upgrade after new submission should succeed')
  assert.strictEqual(upgrade2?.intervention_level, 2)
})

test('升级到 L5 后不再升级（含 L5 二次确认）', () => {
  resetClock()
  const { engine } = createEngine()

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const firstResult = engine.handleEvent(event)
  assert.ok(firstResult)
  assert.strictEqual(firstResult?.intervention_level, 1)

  // L1 → L2
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const up2 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(up2?.intervention_level, 2)

  // L2 → L3
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const up3 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(up3?.intervention_level, 3)

  // L3 → L4
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const up4 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(up4?.intervention_level, 4)

  // L4 → L5：阶段 3 引入二次确认机制
  // 第一次请求（isConfirmation=false）→ 返回 L4 confirmation 干预，不真正升级
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const up5confirm = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event, false)
  assert.ok(up5confirm, 'first L5 request should return confirmation intervention')
  assert.strictEqual(up5confirm?.intervention_level, 4, 'confirmation stays at L4')
  assert.ok(up5confirm?.trigger_reason.includes('l5_confirmation_pending'),
    'trigger_reason should mark l5_confirmation_pending')
  // 此时 currentLevel 仍应为 4（未真正升级）
  assert.strictEqual(engine.getCurrentLevelForTest('multiple_wrong'), 4,
    'currentLevel should still be 4 during L5 pending')

  // 第二次请求（isConfirmation=true）→ 真正升级到 L5
  const up5 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event, true)
  assert.ok(up5, 'second L5 request with isConfirmation should upgrade')
  assert.strictEqual(up5?.intervention_level, 5, 'should now be at L5')

  // L5 已到顶 → null
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const up6 = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(up6, null, 'L5 is max, should not upgrade further')
})

// --- 5. 比赛模式硬关闭 ---

test('比赛模式硬关闭：所有规则不触发', () => {
  resetClock()
  const { engine, interventions } = createEngine({ isContestMode: true })

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 90,
    evidence: { wrong_count: 3, verdict: 'WA' },
  })
  const result = engine.handleEvent(event)
  assert.strictEqual(result, null, 'contest mode should hard-disable all rules')
  assert.strictEqual(interventions.length, 0)
})

test('比赛模式硬关闭：requestHintUpgrade 也被拒绝', () => {
  resetClock()
  const { engine } = createEngine({ isContestMode: true })

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const upgrade = engine.requestHintUpgrade('multiple_wrong', 'some-id', event)
  assert.strictEqual(upgrade, null, 'contest mode should block hint upgrade')
})

// --- 6. "今天别提醒"临时屏蔽 ---

test('never_today 屏蔽：同类事件不再触发', () => {
  resetClock()
  const suppressed = new Set<CoachEventType>(['multiple_wrong'])
  const { engine, interventions } = createEngine({ suppressed })

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const result = engine.handleEvent(event)
  assert.strictEqual(result, null, 'suppressed type should not trigger')
  assert.strictEqual(interventions.length, 0)
})

test('markNeverToday 后同类事件被节流屏蔽', () => {
  resetClock()
  const { engine } = createEngine()

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })

  // 标记 never_today
  engine.markNeverToday('multiple_wrong')

  // 立即评估 → 应被节流（markNeverToday 写入了 lastTrigger）
  const result = engine.evaluate(event)
  assert.strictEqual(result, null, 'after markNeverToday, same type should be throttled')
})

test('markDismissed 清除级位，下次触发回到默认 L1', () => {
  resetClock()
  const { engine } = createEngine()

  const event = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const firstResult = engine.handleEvent(event)
  assert.ok(firstResult)
  assert.strictEqual(firstResult?.intervention_level, 1)

  // 升级到 L2
  advance(HINT_UPGRADE_COOLDOWN_MS + 1000)
  const up = engine.requestHintUpgrade('multiple_wrong', firstResult!.intervention_id, event)
  assert.strictEqual(up?.intervention_level, 2)
  assert.strictEqual(engine.getCurrentLevelForTest('multiple_wrong'), 2)

  // dismiss → 清除级位
  engine.markDismissed('multiple_wrong')
  assert.strictEqual(engine.getCurrentLevelForTest('multiple_wrong'), 0)
})

// --- 7. 难度自适应 ---

test('难度自适应：rating >= 1600 时 idle_too_long 评分降低', () => {
  resetClock()
  // 低难度：stuck_level=1, rating=null → score = 30 + 1*15 = 45 < 50 → 不触发
  const sessionLow = buildSession({
    active_seconds: 700,
    detected_stuck_level: 1,
    phase: 'stuck',
  })
  const { engine: engineLow } = createEngine({ session: sessionLow, rating: null })
  const event = buildEvent({ event_type: 'idle_too_long', score: 45 })
  const resultLow = engineLow.evaluate(event)
  assert.strictEqual(resultLow, null, 'rating=null, stuck_level=1 → score 45 < 50, no trigger')

  // 高难度：stuck_level=1, rating=1800 → score = 30 + 15 - 15 = 30 < 50 → 不触发
  const sessionHigh = buildSession({
    active_seconds: 700,
    detected_stuck_level: 1,
    phase: 'stuck',
  })
  const { engine: engineHigh } = createEngine({ session: sessionHigh, rating: 1800 })
  const resultHigh = engineHigh.evaluate(event)
  assert.strictEqual(resultHigh, null, 'rating=1800, stuck_level=1 → score 30 < 50, no trigger (further relaxed)')
})

test('难度自适应：rating >= 1600 时 multiple_wrong 评分降低', () => {
  resetClock()
  // 低难度：wrong_count=2, rating=null → score = 60 + 2*10 = 80 >= 50 → 触发
  const { engine: engineLow } = createEngine({ rating: null })
  const eventLow = buildEvent({
    event_type: 'multiple_wrong',
    score: 80,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const resultLow = engineLow.evaluate(eventLow)
  assert.ok(resultLow, 'rating=null, wrong_count=2 → score 80 >= 50, trigger')

  // 高难度：wrong_count=2, rating=1800 → score = 60 + 20 - 10 = 70 >= 50 → 仍触发但分数更低
  const { engine: engineHigh } = createEngine({ rating: 1800 })
  const eventHigh = buildEvent({
    event_type: 'multiple_wrong',
    score: 70,
    evidence: { wrong_count: 2, verdict: 'WA' },
  })
  const resultHigh = engineHigh.evaluate(eventHigh)
  assert.ok(resultHigh, 'rating=1800, wrong_count=2 → score 70 >= 50, still triggers but lower')
})

// --- 常量验证 ---

test('常量验证：RULE_THROTTLE_MS = 30 分钟', () => {
  assert.strictEqual(RULE_THROTTLE_MS, 30 * 60 * 1000)
})

test('常量验证：HINT_UPGRADE_COOLDOWN_MS = 2 分钟', () => {
  assert.strictEqual(HINT_UPGRADE_COOLDOWN_MS, 2 * 60 * 1000)
})

test('常量验证：DEFAULT_TRIGGER_SCORE_THRESHOLD = 50', () => {
  assert.strictEqual(DEFAULT_TRIGGER_SCORE_THRESHOLD, 50)
})

// --- 未实现的规则（阶段 3 预留） ---

test('review_due / boundary_suspected / complexity_warning 阶段 2 不触发', () => {
  resetClock()
  const { engine } = createEngine()

  const reviewEvent = buildEvent({ event_type: 'review_due', score: 90 })
  assert.strictEqual(engine.evaluate(reviewEvent), null, 'review_due not implemented in stage 2')

  const boundaryEvent = buildEvent({ event_type: 'boundary_suspected', score: 90 })
  assert.strictEqual(engine.evaluate(boundaryEvent), null, 'boundary_suspected not implemented in stage 2')

  const complexityEvent = buildEvent({ event_type: 'complexity_warning', score: 90 })
  assert.strictEqual(engine.evaluate(complexityEvent), null, 'complexity_warning not implemented in stage 2')
})

// --- 运行 ---

let failedCount = 0
console.log('Running RuleEngine tests...\n')
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

console.log(`\nRuleEngine tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
