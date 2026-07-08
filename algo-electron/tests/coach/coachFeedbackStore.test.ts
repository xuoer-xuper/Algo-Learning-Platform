import assert from 'node:assert'
import {
  CoachFeedbackStore,
  type FeedbackRepositoryAdapter,
} from '../../electron/coach/CoachFeedbackStore.ts'
import type { CoachEventType } from '../../electron/coach/types.ts'

/**
 * CoachFeedbackStore 单元测试（阶段 3 Task 16）。
 *
 * 覆盖：
 * 1. 4 种反馈类型写入（helpful / not_helpful / dismiss / never_today）
 * 2. 计数器更新（按 eventType + category 维度）
 * 3. shouldSuppressToday: never_today 当天屏蔽
 * 4. shouldSuppress: not_helpful 累计达阈值后 6 小时内节流
 * 5. getFrequencyMultiplier: not_helpful 降频系数 0.5；helpful 提升 1.2
 * 6. markTriggered: 更新 lastTriggerAt
 * 7. loadHistoryForWarmup: 从 DB 重建计数器
 * 8. 缓存失效与跨天重置
 * 9. 重启后历史反馈仍存在（通过 warmup 模拟）
 *
 * 通过 FeedbackRepositoryAdapter 注入 mock 仓库，避免依赖 better-sqlite3。
 */

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// --- Mock 仓库 ---

interface MockFeedbackRow {
  feedback_id: string
  intervention_id: string | null
  bubble_id: string | null
  feedback_type: string
  event_type: string | null
  problem_id: string | null
  local_day: string
  created_at: string
}

function createMockRepository(options: {
  neverTodayTypes?: Set<CoachEventType>
  historyRows?: MockFeedbackRow[]
} = {}): FeedbackRepositoryAdapter & {
  inserted: MockFeedbackRow[]
  listCalls: number
  neverTodayCalls: number
  setNeverTodayTypes: (types: Set<CoachEventType>) => void
} {
  const state = {
    inserted: [] as MockFeedbackRow[],
    listCalls: 0,
    neverTodayCalls: 0,
    neverTodayTypes: options.neverTodayTypes ?? new Set<CoachEventType>(),
    historyRows: options.historyRows ?? [],
  }
  return {
    insert(input) {
      const row: MockFeedbackRow = {
        feedback_id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        intervention_id: input.intervention_id ?? null,
        bubble_id: input.bubble_id ?? null,
        feedback_type: input.feedback_type,
        event_type: input.event_type ?? null,
        problem_id: input.problem_id ?? null,
        local_day: '2024-01-01',
        created_at: new Date().toISOString(),
      }
      state.inserted.push(row)
      return row.feedback_id
    },
    list(limit) {
      state.listCalls++
      return state.historyRows.slice(0, limit)
    },
    getNeverTodayEventTypes(_day) {
      state.neverTodayCalls++
      return new Set(state.neverTodayTypes)
    },
    countByTypeSince(_feedbackType, _since) {
      return 0
    },
    setNeverTodayTypes(types: Set<CoachEventType>) {
      state.neverTodayTypes = new Set(types)
    },
    get inserted() { return state.inserted },
    get listCalls() { return state.listCalls },
    get neverTodayCalls() { return state.neverTodayCalls },
  } as FeedbackRepositoryAdapter & {
    inserted: MockFeedbackRow[]
    listCalls: number
    neverTodayCalls: number
    setNeverTodayTypes: (types: Set<CoachEventType>) => void
  }
}

// --- 1. 4 种反馈类型写入 ---

test('recordFeedback: helpful 写入并更新计数器', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
  })
  const id = store.recordFeedback({
    feedback_type: 'helpful',
    event_type: 'multiple_wrong',
  })
  assert.ok(typeof id === 'string' && id.length > 0)
  assert.strictEqual(repo.inserted.length, 1)
  assert.strictEqual(repo.inserted[0].feedback_type, 'helpful')
  const counter = store.getCounterForTest('multiple_wrong')
  assert.ok(counter)
  assert.strictEqual(counter!.helpfulCount, 1)
  assert.strictEqual(counter!.notHelpfulCount, 0)
})

test('recordFeedback: not_helpful 写入并更新计数器', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
  })
  store.recordFeedback({
    feedback_type: 'not_helpful',
    event_type: 'multiple_wrong',
  })
  const counter = store.getCounterForTest('multiple_wrong')
  assert.strictEqual(counter!.notHelpfulCount, 1)
  assert.strictEqual(counter!.helpfulCount, 0)
})

test('recordFeedback: dismiss 写入并更新计数器', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
  })
  store.recordFeedback({
    feedback_type: 'dismiss',
    event_type: 'idle_too_long',
  })
  const counter = store.getCounterForTest('idle_too_long')
  assert.strictEqual(counter!.dismissCount, 1)
})

test('recordFeedback: never_today 写入并更新计数器 + 失效缓存', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
  })
  // 先查询一次（填充缓存）
  store.shouldSuppressToday('multiple_wrong')
  assert.ok((repo as any).neverTodayCalls >= 1)

  // 写入 never_today
  store.recordFeedback({
    feedback_type: 'never_today',
    event_type: 'multiple_wrong',
  })
  const counter = store.getCounterForTest('multiple_wrong')
  assert.strictEqual(counter!.neverTodayCount, 1)
  // never_today 应失效缓存（下次查询会重新读 DB）
  const callsBefore = (repo as any).neverTodayCalls
  store.shouldSuppressToday('multiple_wrong')
  assert.ok((repo as any).neverTodayCalls > callsBefore, 'cache should be invalidated after never_today')
})

test('recordFeedback: 带 intervention_id 与 bubble_id', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  store.recordFeedback({
    feedback_type: 'helpful',
    event_type: 'multiple_wrong',
    intervention_id: 'int-123',
    bubble_id: 'bubble-456',
  })
  assert.strictEqual(repo.inserted[0].intervention_id, 'int-123')
  assert.strictEqual(repo.inserted[0].bubble_id, 'bubble-456')
})

test('recordFeedback: 带 category 维度节流', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' }, 'boundary')
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' }, 'overflow')
  // 不同 category 应有独立计数器
  const boundary = store.getCounterForTest('multiple_wrong', 'boundary')
  const overflow = store.getCounterForTest('multiple_wrong', 'overflow')
  assert.strictEqual(boundary!.notHelpfulCount, 1)
  assert.strictEqual(overflow!.notHelpfulCount, 1)
})

// --- 2. shouldSuppressToday: never_today 当天屏蔽 ---

test('shouldSuppressToday: never_today 集合包含 eventType → true', () => {
  const repo = createMockRepository({
    neverTodayTypes: new Set<CoachEventType>(['multiple_wrong']),
  })
  const store = new CoachFeedbackStore({ repository: repo, today: () => '2024-01-01' })
  assert.strictEqual(store.shouldSuppressToday('multiple_wrong'), true)
  assert.strictEqual(store.shouldSuppressToday('idle_too_long'), false)
})

test('shouldSuppressToday: never_today 集合为空 → false', () => {
  const repo = createMockRepository({ neverTodayTypes: new Set() })
  const store = new CoachFeedbackStore({ repository: repo, today: () => '2024-01-01' })
  assert.strictEqual(store.shouldSuppressToday('multiple_wrong'), false)
})

test('shouldSuppressToday: 缓存命中（同一天只查 DB 一次）', () => {
  const repo = createMockRepository({ neverTodayTypes: new Set() })
  const store = new CoachFeedbackStore({ repository: repo, today: () => '2024-01-01' })
  store.shouldSuppressToday('multiple_wrong')
  store.shouldSuppressToday('multiple_wrong')
  store.shouldSuppressToday('idle_too_long')
  // 同一天只查一次 DB
  assert.strictEqual((repo as any).neverTodayCalls, 1)
})

test('shouldSuppressToday: 跨天后缓存失效重新查询', () => {
  let today = '2024-01-01'
  const repo = createMockRepository({ neverTodayTypes: new Set() })
  const store = new CoachFeedbackStore({
    repository: repo,
    today: () => today,
  })
  store.shouldSuppressToday('multiple_wrong')
  assert.strictEqual((repo as any).neverTodayCalls, 1)
  // 同天再查
  store.shouldSuppressToday('multiple_wrong')
  assert.strictEqual((repo as any).neverTodayCalls, 1)
  // 跨天
  today = '2024-01-02'
  store.shouldSuppressToday('multiple_wrong')
  assert.strictEqual((repo as any).neverTodayCalls, 2, 'cross-day should re-query DB')
})

// --- 3. shouldSuppress: not_helpful 累计达阈值后节流 ---

test('shouldSuppress: never_today → 直接屏蔽', () => {
  const repo = createMockRepository({
    neverTodayTypes: new Set<CoachEventType>(['multiple_wrong']),
  })
  const store = new CoachFeedbackStore({ repository: repo, today: () => '2024-01-01' })
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), true)
})

test('shouldSuppress: not_helpful 累计 < 阈值 → 不屏蔽', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
    notHelpfulThreshold: 3,
  })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  // 2 < 3 阈值
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)
})

test('shouldSuppress: not_helpful 累计 >= 阈值 + 节流窗口内 → 屏蔽', () => {
  const repo = createMockRepository()
  let fakeNow = 1000
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => fakeNow,
    today: () => '2024-01-01',
    notHelpfulThreshold: 3,
    throttleIntervalMs: 6 * 60 * 60 * 1000, // 6 小时
  })
  // 累计 3 次 not_helpful
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  // markTriggered 更新 lastTriggerAt
  store.markTriggered('multiple_wrong')
  // 立即查询 → 在节流窗口内
  fakeNow = 1000 + 1000 // 1 秒后
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), true)
})

test('shouldSuppress: not_helpful 累计 >= 阈值 + 超过节流窗口 → 不屏蔽', () => {
  const repo = createMockRepository()
  let fakeNow = 1000
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => fakeNow,
    today: () => '2024-01-01',
    notHelpfulThreshold: 3,
    throttleIntervalMs: 6 * 60 * 60 * 1000, // 6 小时
  })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.markTriggered('multiple_wrong')
  // 7 小时后 → 超过节流窗口
  fakeNow = 1000 + 7 * 60 * 60 * 1000
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)
})

test('shouldSuppress: helpful 反馈不节流', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
  })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)
})

test('shouldSuppress: dismiss 反馈不节流', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
  })
  store.recordFeedback({ feedback_type: 'dismiss', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'dismiss', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'dismiss', event_type: 'multiple_wrong' })
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)
})

test('shouldSuppress: 不同 eventType 独立节流', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => '2024-01-01',
    notHelpfulThreshold: 3,
  })
  // multiple_wrong 累计 3 次 not_helpful
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.markTriggered('multiple_wrong')
  // idle_too_long 没有 not_helpful
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), true)
  assert.strictEqual(store.shouldSuppress('idle_too_long'), false)
})

// --- 4. getFrequencyMultiplier ---

test('getFrequencyMultiplier: 无计数器 → 1.0', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 1.0)
})

test('getFrequencyMultiplier: not_helpful >= 阈值 → 0.5', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({
    repository: repo,
    notHelpfulThreshold: 3,
  })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 0.5)
})

test('getFrequencyMultiplier: helpful >= 3 → 1.2', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 1.2)
})

test('getFrequencyMultiplier: not_helpful 未达阈值 → 1.0', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo, notHelpfulThreshold: 3 })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 1.0)
})

test('getFrequencyMultiplier: null eventType → 1.0', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  assert.strictEqual(store.getFrequencyMultiplier(null), 1.0)
})

// --- 5. markTriggered ---

test('markTriggered: 更新 lastTriggerAt', () => {
  const repo = createMockRepository()
  let fakeNow = 1000
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => fakeNow,
  })
  // 初始无计数器
  assert.strictEqual(store.getCounterForTest('multiple_wrong'), undefined)
  store.markTriggered('multiple_wrong')
  const counter = store.getCounterForTest('multiple_wrong')
  assert.ok(counter)
  assert.strictEqual(counter!.lastTriggerAt, 1000)
  // 更新时间
  fakeNow = 2000
  store.markTriggered('multiple_wrong')
  assert.strictEqual(store.getCounterForTest('multiple_wrong')!.lastTriggerAt, 2000)
})

test('markTriggered: 不影响其他 eventType', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo, now: () => 1000 })
  store.markTriggered('multiple_wrong')
  assert.ok(store.getCounterForTest('multiple_wrong'))
  assert.strictEqual(store.getCounterForTest('idle_too_long'), undefined)
})

// --- 6. loadHistoryForWarmup ---

test('loadHistoryForWarmup: 从 DB 重建计数器', () => {
  const baseTime = Date.now()
  const historyRows: MockFeedbackRow[] = [
    {
      feedback_id: 'fb-1', intervention_id: null, bubble_id: null,
      feedback_type: 'helpful', event_type: 'multiple_wrong', problem_id: null,
      local_day: '2024-01-01', created_at: new Date(baseTime - 1000).toISOString(),
    },
    {
      feedback_id: 'fb-2', intervention_id: null, bubble_id: null,
      feedback_type: 'not_helpful', event_type: 'multiple_wrong', problem_id: null,
      local_day: '2024-01-01', created_at: new Date(baseTime - 500).toISOString(),
    },
    {
      feedback_id: 'fb-3', intervention_id: null, bubble_id: null,
      feedback_type: 'not_helpful', event_type: 'multiple_wrong', problem_id: null,
      local_day: '2024-01-01', created_at: new Date(baseTime - 200).toISOString(),
    },
    {
      feedback_id: 'fb-4', intervention_id: null, bubble_id: null,
      feedback_type: 'dismiss', event_type: 'idle_too_long', problem_id: null,
      local_day: '2024-01-01', created_at: new Date(baseTime - 100).toISOString(),
    },
  ]
  const repo = createMockRepository({ historyRows })
  const store = new CoachFeedbackStore({ repository: repo })
  store.loadHistoryForWarmup(30)

  const mwCounter = store.getCounterForTest('multiple_wrong')
  assert.strictEqual(mwCounter!.helpfulCount, 1)
  assert.strictEqual(mwCounter!.notHelpfulCount, 2)
  assert.strictEqual(mwCounter!.dismissCount, 0)

  const idleCounter = store.getCounterForTest('idle_too_long')
  assert.strictEqual(idleCounter!.dismissCount, 1)

  // lastTriggerAt 应为最近一条记录的时间
  assert.ok(mwCounter!.lastTriggerAt !== null)
})

test('loadHistoryForWarmup: 跳过超出 lookback 的旧记录', () => {
  const baseTime = Date.now()
  const veryOld = new Date(baseTime - 100 * 24 * 60 * 60 * 1000).toISOString() // 100 天前
  const recent = new Date(baseTime - 1000).toISOString()
  const historyRows: MockFeedbackRow[] = [
    {
      feedback_id: 'old', intervention_id: null, bubble_id: null,
      feedback_type: 'helpful', event_type: 'multiple_wrong', problem_id: null,
      local_day: '2024-01-01', created_at: veryOld,
    },
    {
      feedback_id: 'new', intervention_id: null, bubble_id: null,
      feedback_type: 'not_helpful', event_type: 'multiple_wrong', problem_id: null,
      local_day: '2024-01-01', created_at: recent,
    },
  ]
  const repo = createMockRepository({ historyRows })
  const store = new CoachFeedbackStore({ repository: repo })
  store.loadHistoryForWarmup(30) // 只看 30 天内
  const counter = store.getCounterForTest('multiple_wrong')
  // 旧记录应被跳过
  assert.strictEqual(counter!.helpfulCount, 0)
  assert.strictEqual(counter!.notHelpfulCount, 1)
})

test('loadHistoryForWarmup: 空历史不报错', () => {
  const repo = createMockRepository({ historyRows: [] })
  const store = new CoachFeedbackStore({ repository: repo })
  assert.doesNotThrow(() => {
    store.loadHistoryForWarmup(30)
  })
  assert.strictEqual(store.getCounterForTest('multiple_wrong'), undefined)
})

test('loadHistoryForWarmup: never_today 计数', () => {
  const historyRows: MockFeedbackRow[] = [
    {
      feedback_id: 'fb-1', intervention_id: null, bubble_id: null,
      feedback_type: 'never_today', event_type: 'idle_too_long', problem_id: null,
      local_day: '2024-01-01', created_at: new Date().toISOString(),
    },
    {
      feedback_id: 'fb-2', intervention_id: null, bubble_id: null,
      feedback_type: 'never_today', event_type: 'idle_too_long', problem_id: null,
      local_day: '2024-01-01', created_at: new Date().toISOString(),
    },
  ]
  const repo = createMockRepository({ historyRows })
  const store = new CoachFeedbackStore({ repository: repo })
  store.loadHistoryForWarmup(30)
  const counter = store.getCounterForTest('idle_too_long')
  assert.strictEqual(counter!.neverTodayCount, 2)
})

// --- 7. 重启后历史反馈仍存在（模拟） ---

test('重启后历史反馈仍存在：loadHistoryForWarmup 重建节流策略', () => {
  // 模拟：应用上次运行时累积了 3 次 not_helpful
  const baseTime = Date.now()
  const historyRows: MockFeedbackRow[] = Array.from({ length: 3 }, (_, i) => ({
    feedback_id: `fb-${i}`, intervention_id: null, bubble_id: null,
    feedback_type: 'not_helpful', event_type: 'multiple_wrong', problem_id: null,
    local_day: '2024-01-01', created_at: new Date(baseTime - (3 - i) * 1000).toISOString(),
  }))
  const repo = createMockRepository({ historyRows })

  // "重启"后创建新 store（模拟进程重启）
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => baseTime,
    notHelpfulThreshold: 3,
  })
  store.loadHistoryForWarmup(30)

  // 重启后应仍能识别 not_helpful 累计达阈值
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 0.5)
  // markTriggered 后节流应生效
  store.markTriggered('multiple_wrong')
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), true)
})

// --- 8. 缓存失效 ---

test('invalidateNeverTodayCache: 清空缓存强制下次重查', () => {
  const repo = createMockRepository({ neverTodayTypes: new Set() })
  const store = new CoachFeedbackStore({ repository: repo, today: () => '2024-01-01' })
  store.shouldSuppressToday('multiple_wrong')
  const callsAfterFirst = (repo as any).neverTodayCalls
  store.invalidateNeverTodayCache()
  store.shouldSuppressToday('multiple_wrong')
  assert.ok((repo as any).neverTodayCalls > callsAfterFirst, 'cache invalidated should re-query DB')
})

// --- 9. 测试辅助方法 ---

test('resetForTest: 清空所有内存状态', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  store.recordFeedback({ feedback_type: 'helpful', event_type: 'multiple_wrong' })
  store.markTriggered('idle_too_long')
  store.resetForTest()
  assert.strictEqual(store.getCounterForTest('multiple_wrong'), undefined)
  assert.strictEqual(store.getCounterForTest('idle_too_long'), undefined)
})

test('setCounterForTest: 直接设置计数器', () => {
  const repo = createMockRepository()
  const store = new CoachFeedbackStore({ repository: repo })
  store.setCounterForTest('multiple_wrong', undefined, {
    notHelpfulCount: 5,
    helpfulCount: 0,
    dismissCount: 0,
    neverTodayCount: 0,
    lastTriggerAt: 1000,
  })
  const counter = store.getCounterForTest('multiple_wrong')
  assert.strictEqual(counter!.notHelpfulCount, 5)
})

// --- 10. 集成场景：完整反馈→节流→降频流程 ---

test('集成场景：not_helpful 累计 → 降频 → 节流 → 跨窗口恢复', () => {
  const repo = createMockRepository()
  let fakeNow = 1000
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => fakeNow,
    today: () => '2024-01-01',
    notHelpfulThreshold: 3,
    throttleIntervalMs: 6 * 60 * 60 * 1000,
  })

  // 1. 初始：频率正常
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 1.0)
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)

  // 2. 累计 2 次 not_helpful（未达阈值）
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 1.0)

  // 3. 第 3 次 not_helpful（达阈值）→ 频率降为 0.5
  store.recordFeedback({ feedback_type: 'not_helpful', event_type: 'multiple_wrong' })
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 0.5)

  // 4. markTriggered → 节流窗口内应屏蔽
  store.markTriggered('multiple_wrong')
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), true)

  // 5. 跨窗口（7 小时后）→ 不屏蔽
  fakeNow = 1000 + 7 * 60 * 60 * 1000
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)

  // 6. 频率仍为 0.5（not_helpful 累计未清零）
  assert.strictEqual(store.getFrequencyMultiplier('multiple_wrong'), 0.5)
})

test('集成场景：never_today → 当天屏蔽 → 跨天恢复', () => {
  let today = '2024-01-01'
  const repo = createMockRepository({ neverTodayTypes: new Set() })
  const store = new CoachFeedbackStore({
    repository: repo,
    now: () => 1000,
    today: () => today,
  })

  // 1. 初始不屏蔽
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)

  // 2. 写入 never_today + mock 仓库返回屏蔽集合
  store.recordFeedback({ feedback_type: 'never_today', event_type: 'multiple_wrong' })
  repo.setNeverTodayTypes(new Set<CoachEventType>(['multiple_wrong']))
  store.invalidateNeverTodayCache()

  // 3. 当天应屏蔽
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), true)

  // 4. 跨天 → mock 仓库返回空集合（模拟新的一天）
  today = '2024-01-02'
  repo.setNeverTodayTypes(new Set())
  assert.strictEqual(store.shouldSuppress('multiple_wrong'), false)
})

// --- 运行 ---

let failedCount = 0
console.log('Running CoachFeedbackStore tests...\n')
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

console.log(`\nCoachFeedbackStore tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
