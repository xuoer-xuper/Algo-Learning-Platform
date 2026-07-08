import type { CoachEventType, CoachFeedbackType } from './types'
// 仅导入类型（type-only import），避免在单元测试中拉入 better-sqlite3。
// 默认 FeedbackRepositoryAdapter 实现已移至 ./defaultFeedbackRepository.ts，
// 由 CoachOrchestrator 在生产环境显式注入。
import type { InsertCoachFeedbackInput } from '../db/repositories/coach/feedbackRepository'
import { todayBeijing } from '../shared/time'

/**
 * CoachFeedbackStore：用户反馈持久化与节流策略（阶段 3 Task 16）。
 *
 * 职责：
 * 1. 写入 coach_feedback 表（委托 feedbackRepository）
 * 2. 维护内存计数器：not_helpful 累计次数 → 降低后续同类提示频率
 * 3. "今天别提醒"（never_today）：当天同类提示屏蔽
 * 4. 频率调整：not_helpful 反馈累计达到阈值后，同类提示 24 小时内只展示一次
 *
 * 设计要点：
 * - 重启后历史反馈仍存在（全部数据落库，内存计数器在启动时从 DB 重建）
 * - 反馈影响后续同类（按 event_type + category）提示频率，不跨类影响
 * - helpful 反馈不节流（鼓励用户继续）
 * - dismiss 不计入节流（用户可能只是当时不需要）
 *
 * 与 CoachOrchestrator 集成：
 * - recordFeedback: 由 CoachOrchestrator.recordFeedback 委托调用
 * - shouldSuppress: CoachOrchestrator.handleCoachEvent 时检查
 * - getFrequencyMultiplier: CoachOrchestrator 计算提示时调整评分
 *
 * 测试支持：通过 FeedbackRepositoryAdapter 注入 mock 仓库，避免依赖 better-sqlite3。
 */

/**
 * 仓库适配器接口（用于解耦 DB 依赖，便于单元测试注入 mock）。
 * 默认实现委托给 feedbackRepository 模块。
 */
export interface FeedbackRepositoryAdapter {
  insert(input: InsertCoachFeedbackInput): string
  list(limit: number): Array<{
    feedback_id: string
    intervention_id: string | null
    bubble_id: string | null
    feedback_type: string
    event_type: string | null
    problem_id: string | null
    local_day: string
    created_at: string
  }>
  getNeverTodayEventTypes(day: string): Set<CoachEventType>
  countByTypeSince(feedbackType: CoachFeedbackType, since: string): number
}

/**
 * 默认仓库适配器工厂。
 * 已移至 ./defaultFeedbackRepository.ts，避免在单元测试中拉入 better-sqlite3。
 * 生产环境（CoachOrchestrator）应 import createDefaultRepository 并显式传入。
 * 若构造时未提供 repository，抛出错误（强制依赖注入）。
 */

/** not_helpful 累计次数到达阈值后启用降频 */
const NOT_HELPFUL_THRESHOLD = 3
/** 降频后同类型提示的最小间隔（毫秒，默认 6 小时） */
const THROTTLE_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface CoachFeedbackStoreOptions {
  /** 注入式 Date.now（测试用） */
  now?: () => number
  /** 注入式 todayBeijing（测试用） */
  today?: () => string
  /** not_helpful 降频阈值 */
  notHelpfulThreshold?: number
  /** 降频后同类型提示最小间隔（毫秒） */
  throttleIntervalMs?: number
  /** 仓库适配器（测试可注入 mock；默认委托 feedbackRepository） */
  repository?: FeedbackRepositoryAdapter
}

interface CategoryCounter {
  /** not_helpful 累计次数 */
  notHelpfulCount: number
  /** helpful 累计次数 */
  helpfulCount: number
  /** dismiss 累计次数 */
  dismissCount: number
  /** never_today 累计次数 */
  neverTodayCount: number
  /** 最近一次触发（任何类型）时间戳 */
  lastTriggerAt: number | null
}

export class CoachFeedbackStore {
  private readonly now: () => number
  private readonly today: () => string
  private readonly notHelpfulThreshold: number
  private readonly throttleIntervalMs: number
  private readonly repository: FeedbackRepositoryAdapter
  /** 反馈计数器，key = `${eventType}:${category}` */
  private readonly counters = new Map<string, CategoryCounter>()
  /** 内存缓存：never_today 当日已屏蔽的 eventType 集合 */
  private neverTodayCache: Set<CoachEventType> | null = null
  private neverTodayCacheDay: string | null = null

  constructor(options: CoachFeedbackStoreOptions = {}) {
    this.now = options.now ?? Date.now
    this.today = options.today ?? todayBeijing
    this.notHelpfulThreshold = options.notHelpfulThreshold ?? NOT_HELPFUL_THRESHOLD
    this.throttleIntervalMs = options.throttleIntervalMs ?? THROTTLE_INTERVAL_MS
    // repository 必须由调用方注入（依赖反转）。
    // 生产环境由 CoachOrchestrator 调用 createDefaultRepository() 注入；
    // 测试环境注入 mock FeedbackRepositoryAdapter。
    if (!options.repository) {
      throw new Error(
        'CoachFeedbackStore: repository is required. ' +
        'Import createDefaultRepository from ./defaultFeedbackRepository for production, ' +
        'or inject a mock FeedbackRepositoryAdapter for tests.',
      )
    }
    this.repository = options.repository
  }

  /**
   * 写入一条反馈。
   * @param input 反馈数据
   * @param category 可选类目（用于精细节流；不传则只按 eventType）
   */
  recordFeedback(input: InsertCoachFeedbackInput, category?: string): string {
    const id = this.repository.insert(input)
    // 更新内存计数器（input.event_type 允许 undefined，统一转 null）
    const key = this.counterKey(input.event_type ?? null, category)
    const counter = this.counters.get(key) ?? this.emptyCounter()
    switch (input.feedback_type) {
      case 'helpful':
        counter.helpfulCount += 1
        break
      case 'not_helpful':
        counter.notHelpfulCount += 1
        break
      case 'dismiss':
        counter.dismissCount += 1
        break
      case 'never_today':
        counter.neverTodayCount += 1
        // never_today 还要写入 Set 缓存
        if (input.event_type) {
          this.invalidateNeverTodayCache()
        }
        break
    }
    counter.lastTriggerAt = this.now()
    this.counters.set(key, counter)
    return id
  }

  /**
   * 判断某 eventType 是否被"今天别提醒"屏蔽。
   * 优先用内存缓存（避免每次查询 DB）。
   */
  shouldSuppressToday(eventType: CoachEventType): boolean {
    const today = this.today()
    if (this.neverTodayCacheDay !== today) {
      this.neverTodayCache = null
      this.neverTodayCacheDay = null
    }
    if (this.neverTodayCache === null) {
      this.neverTodayCache = this.repository.getNeverTodayEventTypes(today)
      this.neverTodayCacheDay = today
    }
    return this.neverTodayCache.has(eventType)
  }

  /**
   * 判断某 eventType + category 是否应该被节流（不展示）。
   * 综合判定：
   * 1. never_today → 屏蔽
   * 2. not_helpful 累计 >= 阈值 → 6 小时内只展示一次
   *
   * @returns true 表示应屏蔽
   */
  shouldSuppress(eventType: CoachEventType, category?: string): boolean {
    if (this.shouldSuppressToday(eventType)) return true

    const key = this.counterKey(eventType ?? null, category)
    const counter = this.counters.get(key)
    if (!counter) return false

    // not_helpful 降频判定
    if (counter.notHelpfulCount >= this.notHelpfulThreshold) {
      const lastTrigger = counter.lastTriggerAt
      if (lastTrigger !== null) {
        const elapsed = this.now() - lastTrigger
        if (elapsed < this.throttleIntervalMs) {
          return true
        }
      }
    }
    return false
  }

  /**
   * 获取频率系数（影响 RuleEngine 评分）。
   * - 0.5：not_helpful 累计达到阈值（评分减半）
   * - 1.0：正常
   * - 1.5：helpful 累计较多（轻微提升）
   */
  getFrequencyMultiplier(eventType: CoachEventType | null, category?: string): number {
    const key = this.counterKey(eventType, category)
    const counter = this.counters.get(key)
    if (!counter) return 1.0
    if (counter.notHelpfulCount >= this.notHelpfulThreshold) return 0.5
    if (counter.helpfulCount >= 3) return 1.2
    return 1.0
  }

  /**
   * 标记某 eventType 在最近触发过（用于 lastTriggerAt 维护）。
   * RuleEngine 触发干预后调用。
   */
  markTriggered(eventType: CoachEventType, category?: string): void {
    const key = this.counterKey(eventType, category)
    const counter = this.counters.get(key) ?? this.emptyCounter()
    counter.lastTriggerAt = this.now()
    this.counters.set(key, counter)
  }

  /**
   * 加载历史反馈以重建内存计数器。
   * 应用启动时调用，确保重启后节流策略仍生效。
   *
   * @param lookbackDays 加载多少天内的反馈（默认 30 天）
   */
  loadHistoryForWarmup(lookbackDays = 30): void {
    // 计算起始时间
    const since = this.computeSince(lookbackDays)
    const rows = this.repository.list(500) // 取最近 500 条
    for (const row of rows) {
      if (row.created_at < since) continue
      const eventType = row.event_type as CoachEventType | null
      const key = this.counterKey(eventType, undefined)
      const counter = this.counters.get(key) ?? this.emptyCounter()
      switch (row.feedback_type as CoachFeedbackType) {
        case 'helpful':
          counter.helpfulCount += 1
          break
        case 'not_helpful':
          counter.notHelpfulCount += 1
          break
        case 'dismiss':
          counter.dismissCount += 1
          break
        case 'never_today':
          counter.neverTodayCount += 1
          break
      }
      const ts = Date.parse(row.created_at)
      if (!Number.isNaN(ts)) {
        if (counter.lastTriggerAt === null || ts > counter.lastTriggerAt) {
          counter.lastTriggerAt = ts
        }
      }
      this.counters.set(key, counter)
    }
  }

  /** 失效 never_today 缓存（写入新反馈后调用） */
  invalidateNeverTodayCache(): void {
    this.neverTodayCache = null
    this.neverTodayCacheDay = null
  }

  /** 仅测试用：读取计数器 */
  getCounterForTest(eventType: CoachEventType | null, category?: string): CategoryCounter | undefined {
    return this.counters.get(this.counterKey(eventType, category))
  }

  /** 仅测试用：重置所有内存状态 */
  resetForTest(): void {
    this.counters.clear()
    this.neverTodayCache = null
    this.neverTodayCacheDay = null
  }

  /** 仅测试用：直接设置计数器 */
  setCounterForTest(eventType: CoachEventType | null, category: string | undefined, counter: CategoryCounter): void {
    this.counters.set(this.counterKey(eventType, category), counter)
  }

  // --- 内部 ---

  private counterKey(eventType: CoachEventType | null, category?: string): string {
    return `${eventType ?? '_'}:${category ?? '_'}`
  }

  private emptyCounter(): CategoryCounter {
    return {
      notHelpfulCount: 0,
      helpfulCount: 0,
      dismissCount: 0,
      neverTodayCount: 0,
      lastTriggerAt: null,
    }
  }

  private computeSince(days: number): string {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 19).replace('T', 'T') // YYYY-MM-DDTHH:MM:SS
  }
}

// 静态工具函数 countFeedbackSince / currentTimestamp 已移至 ./defaultFeedbackRepository.ts，
// 以隔离 better-sqlite3 依赖（便于单元测试）。

