import crypto from 'node:crypto'
import type {
  CoachEvent,
  CoachEventType,
  CoachIntervention,
  CoachInterventionLevel,
  CoachInterventionSourceType,
  CoachInterventionUserAction,
  ProblemSession,
} from '../types'
import {
  type RuleContext,
  type RuleResult,
  RULES,
  RULE_THROTTLE_MS,
  HINT_UPGRADE_COOLDOWN_MS,
  DEFAULT_TRIGGER_SCORE_THRESHOLD,
} from './rules'
import {
  type LadderHintContent,
  type GetMessageForLevelContext,
} from '../hints/HintLadder'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'

/**
 * RuleEngine：本地规则引擎。
 *
 * 输入：CoachEvent + 当前 ProblemSession（来自 CoachEventBridge / ProblemSessionTracker）
 * 输出：CoachIntervention（如触发），通过 onIntervention 回调派发给上游
 *
 * 核心机制：
 * 1. 比赛模式硬关闭：ContestGuard.isContestMode() = true 时所有规则不触发
 * 2. 节流：同类型事件 RULE_THROTTLE_MS（30 分钟）内不重复触发
 * 3. 难度自适应：rating ≥ 1600 时 score 函数扣分（宁可漏报不误报）
 * 4. 防 hint abuse：每级升级冷却 HINT_UPGRADE_COOLDOWN_MS（2 分钟），或需一次新提交解锁
 * 5. "今天别提醒"临时屏蔽：用户标记后当天同类事件不再触发
 * 6. 评分高于 DEFAULT_TRIGGER_SCORE_THRESHOLD 才推送气泡
 *
 * 阶段 3 预留：
 * - onIntervention 是事件输出出口，HintSelector 可订阅并基于 related_tags 选模板
 * - RuleResult.intervention_level 与 HintLadder 对齐（L0-L5）
 */

export interface RuleEngineOptions {
  /** 当前会话提供者（ProblemSessionTracker.getCurrentSession） */
  getSession?: () => ProblemSession | null
  /** 当前 problem rating 提供者（用于难度自适应） */
  getProblemRating?: () => number | null
  /** 当前是否处于比赛模式（ContestGuard.isContestMode） */
  getIsContestMode?: () => boolean
  /** "今天别提醒"屏蔽类型提供者（CoachFeedbackStore.getNeverTodayEventTypes） */
  getSuppressedTypes?: () => Set<CoachEventType>
  /** 干预输出回调（CoachOrchestrator 订阅，驱动桌宠 + 持久化） */
  onIntervention?: (intervention: CoachIntervention, event: CoachEvent) => void
  /**
   * 阶段 3：提示升级时的消息生成器（来自 HintLadder.getMessageForLevel）。
   * 不提供时退化到内置 upgradeMessageForLevel。
   */
  getHintForUpgrade?: (
    eventType: CoachEventType,
    targetLevel: CoachInterventionLevel,
    context: GetMessageForLevelContext,
  ) => LadderHintContent
  /** 当前题目的 constraints 提供者（来自 ConstraintParser 缓存） */
  getConstraints?: () => ProblemConstraints | null
  /** 当前题目标签提供者（用于 L5；Demo 默认 null） */
  getProblemTags?: () => string[]
  /** 节流窗口（毫秒）。默认 RULE_THROTTLE_MS */
  throttleMs?: number
  /** 升级冷却（毫秒）。默认 HINT_UPGRADE_COOLDOWN_MS */
  upgradeCooldownMs?: number
  /** 触发评分阈值。默认 DEFAULT_TRIGGER_SCORE_THRESHOLD */
  triggerScoreThreshold?: number
  /** 注入式 Date.now（便于测试） */
  now?: () => number
  /** 注入式 uuid 生成（便于测试） */
  uuid?: () => string
  /** 注入式 nowIso（便于测试） */
  nowIso?: () => string
}

interface LastTriggerRecord {
  /** 上次触发时间戳 */
  at: number
  /** 上次触发的 event_id */
  eventId: string
  /** 上次提交后的解锁标志（用于防 abuse：一次新提交后可解锁下一级） */
  unlockedBySubmission: boolean
}

export class RuleEngine {
  private readonly options: Required<Omit<RuleEngineOptions, 'getSession' | 'getProblemRating' | 'getIsContestMode' | 'getSuppressedTypes' | 'onIntervention' | 'getHintForUpgrade' | 'getConstraints' | 'getProblemTags'>> & {
    getSession?: () => ProblemSession | null
    getProblemRating?: () => number | null
    getIsContestMode?: () => boolean
    getSuppressedTypes?: () => Set<CoachEventType>
    onIntervention?: (intervention: CoachIntervention, event: CoachEvent) => void
    getHintForUpgrade?: (
      eventType: CoachEventType,
      targetLevel: CoachInterventionLevel,
      context: GetMessageForLevelContext,
    ) => LadderHintContent
    getConstraints?: () => ProblemConstraints | null
    getProblemTags?: () => string[]
  }

  /** 每个事件类型的上次触发时间 */
  private lastTrigger = new Map<CoachEventType, LastTriggerRecord>()
  /** 每个事件类型的"已展示到第几级"（防 abuse 升级） */
  private currentLevel = new Map<CoachEventType, CoachInterventionLevel>()
  /** 上次升级时间（用于冷却） */
  private lastUpgradeAt = new Map<CoachEventType, number>()

  constructor(options: RuleEngineOptions = {}) {
    this.options = {
      throttleMs: options.throttleMs ?? RULE_THROTTLE_MS,
      upgradeCooldownMs: options.upgradeCooldownMs ?? HINT_UPGRADE_COOLDOWN_MS,
      triggerScoreThreshold: options.triggerScoreThreshold ?? DEFAULT_TRIGGER_SCORE_THRESHOLD,
      now: options.now ?? Date.now,
      uuid: options.uuid ?? defaultUuid,
      nowIso: options.nowIso ?? defaultNowIso,
      getSession: options.getSession,
      getProblemRating: options.getProblemRating,
      getIsContestMode: options.getIsContestMode,
      getSuppressedTypes: options.getSuppressedTypes,
      onIntervention: options.onIntervention,
      getHintForUpgrade: options.getHintForUpgrade,
      getConstraints: options.getConstraints,
      getProblemTags: options.getProblemTags,
    }
  }

  /**
   * 评估一个事件：是否触发干预。
   * 不持久化（由 onIntervention 回调决定持久化与否）。
   */
  evaluate(event: CoachEvent): RuleResult | null {
    // 0. 比赛模式硬关闭
    if (this.isContestMode()) {
      return null
    }

    // 1. 找规则
    const rule = RULES[event.event_type]
    if (!rule) return null

    const session = this.options.getSession?.() ?? null
    const problemRating = this.options.getProblemRating?.() ?? null
    const ctx: RuleContext = {
      event,
      session,
      problemRating,
      isContestMode: false, // 已在 0 步硬关闭
      problemId: event.problem_id,
      platform: event.platform,
      sessionId: event.session_id,
    }

    // 2. matches 判定
    if (!rule.matches(ctx)) return null

    // 3. 评分
    const score = rule.score(ctx)
    if (score < this.options.triggerScoreThreshold) {
      // 评分不足，仅记录但不触发
      return null
    }

    // 4. 节流：同类型 30 分钟内不重复
    const now = this.options.now()
    const last = this.lastTrigger.get(event.event_type)
    if (last && now - last.at < this.options.throttleMs) {
      return null
    }

    // 5. "今天别提醒"临时屏蔽
    const suppressed = this.options.getSuppressedTypes?.()
    if (suppressed && suppressed.has(event.event_type)) {
      return null
    }

    // 6. 产出 RuleResult
    const built = rule.build(ctx)
    const result: RuleResult = {
      triggered: true,
      trigger_reason: built.trigger_reason,
      intervention_level: built.intervention_level,
      message: built.message,
      related_tags: built.related_tags,
      score,
    }
    return result
  }

  /**
   * 接收事件 + 评估 + 派发干预。
   * 由 CoachOrchestrator 调用；同时记录节流/级位状态。
   */
  handleEvent(event: CoachEvent): CoachIntervention | null {
    const result = this.evaluate(event)
    if (!result) return null

    // 记录节流
    this.lastTrigger.set(event.event_type, {
      at: this.options.now(),
      eventId: event.event_id,
      unlockedBySubmission: false,
    })

    // 更新级位（首次触发定为 result.intervention_level，后续由 upgradeHint 推进）
    if (!this.currentLevel.has(event.event_type)) {
      this.currentLevel.set(event.event_type, result.intervention_level)
    }

    // 构造 CoachIntervention
    const intervention = this.buildIntervention(event, result)
    this.options.onIntervention?.(intervention, event)
    return intervention
  }

  /**
   * 用户点"再给一点"：尝试升级到下一级。
   * 受防 abuse 冷却限制：HINT_UPGRADE_COOLDOWN_MS 内或需一次新提交。
   * 返回升级后的 intervention，或 null（拒绝升级）。
   *
   * 阶段 3 扩展：
   * - 当从 L4 升级到 L5 时，需二次确认（spec "L5 升级需二次确认"）
   * - 第一次请求 L5：返回 L4 级 confirmation 干预（needsConfirmation=true），
   *   由 CoachOrchestrator 标记 pending 状态
   * - 第二次请求（pending → confirmed）：真正升级到 L5
   * - 升级消息优先使用 HintLadder（getHintForUpgrade 注入），无则退化到内置文案
   *
   * @param isConfirmation 当 L5 处于 pending 状态时，传 true 表示用户已确认
   */
  requestHintUpgrade(
    eventType: CoachEventType,
    currentInterventionId: string,
    event: CoachEvent,
    isConfirmation = false,
  ): CoachIntervention | null {
    if (this.isContestMode()) return null

    const currentLevel = this.currentLevel.get(eventType) ?? 0
    if (currentLevel >= 5) return null // 已到 L5 顶

    const now = this.options.now()
    const lastUpgrade = this.lastUpgradeAt.get(eventType)
    const last = this.lastTrigger.get(eventType)
    // hasNewSubmission: 上次触发后是否收到过新提交（由 notifyNewSubmission 设置 unlockedBySubmission）
    const hasNewSubmission = last?.unlockedBySubmission ?? false

    // 冷却判定：2 分钟内且无新提交 → 拒绝
    // 冷却起点：上次升级时间（如有），否则首次触发时间
    // 注意：L5 二次确认（isConfirmation=true）跳过冷却（用户已主动确认）
    if (!isConfirmation) {
      const cooldownStart = lastUpgrade ?? last?.at
      if (cooldownStart != null && now - cooldownStart < this.options.upgradeCooldownMs && !hasNewSubmission) {
        return null
      }
    }

    const newLevel = Math.min(5, currentLevel + 1) as CoachInterventionLevel

    // L5 二次确认机制（仅当 targetLevel=5 且未确认时）
    const targetIsL5 = newLevel === 5
    if (targetIsL5 && !isConfirmation) {
      // 返回 L4 等级的 confirmation 干预（不升级，仅展示确认气泡）
      const confirmationResult: RuleResult = {
        triggered: true,
        trigger_reason: `hint_l5_confirmation_pending`,
        intervention_level: 4, // 保持在 L4
        message: '该提示接近题解方向，可能涉及算法标签。确认查看？再次点击"再给一点"将升级到 L5。',
        related_tags: ['l5_confirmation', 'pending'],
        score: 80,
      }
      const intervention = this.buildIntervention(event, confirmationResult, {
        user_action: 'hint_requested',
        override_id: currentInterventionId,
      })
      // 注意：不更新 currentLevel 与 lastUpgradeAt（等真正确认后再升级）
      this.options.onIntervention?.(intervention, event)
      return intervention
    }

    // 正常升级
    this.currentLevel.set(eventType, newLevel)
    this.lastUpgradeAt.set(eventType, now)
    // 消费解锁标志：升级后需再次等待或再次提交
    if (last) {
      this.lastTrigger.set(eventType, { ...last, unlockedBySubmission: false })
    }

    // 优先使用 HintLadder 消息（阶段 3 接入）
    let message: string
    let relatedTags: string[]
    const hintFn = this.options.getHintForUpgrade
    if (hintFn) {
      const context = this.buildLadderContext(event, eventType)
      const hint = hintFn(eventType, newLevel, context)
      message = hint.message
      relatedTags = hint.tags.length > 0 ? hint.tags : ['upgrade', `L${newLevel}`]
    } else {
      message = upgradeMessageForLevel(newLevel)
      relatedTags = ['upgrade', `L${newLevel}`]
    }

    const result: RuleResult = {
      triggered: true,
      trigger_reason: `hint_upgrade to L${newLevel}`,
      intervention_level: newLevel,
      message,
      related_tags: relatedTags,
      score: 80,
    }

    const intervention = this.buildIntervention(event, result, {
      user_action: 'hint_requested',
      override_id: currentInterventionId,
    })
    this.options.onIntervention?.(intervention, event)
    return intervention
  }

  /** 构建 HintLadder 上下文 */
  private buildLadderContext(event: CoachEvent, eventType: CoachEventType): GetMessageForLevelContext {
    return {
      eventType,
      verdict: event.evidence.verdict,
      constraints: this.options.getConstraints?.() ?? null,
      problemTags: this.options.getProblemTags?.() ?? [],
      problemRating: this.options.getProblemRating?.() ?? null,
    }
  }

  /**
   * 标记用户已提交新结果（防 abuse 解锁）。
   * 由 CoachOrchestrator 在收到新提交时调用。
   * eventId 保留在签名中以供阶段 3 审计追溯使用。
   */
  notifyNewSubmission(_eventId: string): void {
    // 所有事件类型的"上次触发"解锁标志置为 true
    for (const [key, value] of this.lastTrigger) {
      this.lastTrigger.set(key, { ...value, unlockedBySubmission: true })
    }
  }

  /**
   * 标记"今天别提醒"某事件类型。
   */
  markNeverToday(eventType: CoachEventType): void {
    // 委托给 CoachFeedbackStore 持久化，这里只清当前节流，避免同日再次触发
    this.lastTrigger.set(eventType, {
      at: this.options.now(),
      eventId: 'never_today',
      unlockedBySubmission: false,
    })
  }

  /**
   * 标记用户已 dismiss 当前提示。
   * 简化：清掉当前级位，下次再触发时回到默认 L1。
   */
  markDismissed(eventType: CoachEventType): void {
    this.currentLevel.delete(eventType)
  }

  // --- 仅供测试的状态读取 ---

  getLastTriggerAtForTest(eventType: CoachEventType): number | null {
    return this.lastTrigger.get(eventType)?.at ?? null
  }

  getCurrentLevelForTest(eventType: CoachEventType): CoachInterventionLevel {
    return this.currentLevel.get(eventType) ?? 0
  }

  // --- 内部 ---

  private isContestMode(): boolean {
    return this.options.getIsContestMode?.() ?? false
  }

  private buildIntervention(
    event: CoachEvent,
    result: RuleResult,
    overrides?: {
      user_action?: CoachInterventionUserAction
      override_id?: string
    },
  ): CoachIntervention {
    return {
      intervention_id: overrides?.override_id ?? this.options.uuid(),
      event_id: event.event_id,
      trigger_reason: result.trigger_reason,
      intervention_level: result.intervention_level,
      source_type: 'local_rule' as CoachInterventionSourceType,
      message: result.message,
      related_tags: result.related_tags,
      user_action: overrides?.user_action ?? 'shown',
      problem_id: event.problem_id,
      platform: event.platform,
      session_id: event.session_id,
      created_at: this.options.nowIso(),
      is_contest_mode: false,
      contest_url: null,
      contest_start: null,
      contest_end: null,
      zero_intervention: false,
    }
  }
}

function upgradeMessageForLevel(level: CoachInterventionLevel): string {
  switch (level) {
    case 1:
      return 'L1：再想想你正在解决的核心问题是什么？'
    case 2:
      return 'L2：把思路写下来，能不能说清楚这道题的目标？'
    case 3:
      return 'L3：注意边界条件与数据范围，是否漏了？'
    case 4:
      return 'L4：考虑用什么样的算法策略？分治/贪心/DP？'
    case 5:
      return 'L5：这道题考察的概念/标签可能是什么？（接近题解方向）'
    default:
      return ''
  }
}

function defaultUuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

function defaultNowIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${y}-${m}-${day}T${h}:${min}:${s}.${ms}`
}
