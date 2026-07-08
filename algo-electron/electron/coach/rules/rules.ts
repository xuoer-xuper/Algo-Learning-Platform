import type {
  CoachEvent,
  CoachEventType,
  CoachInterventionLevel,
  ProblemSession,
} from '../types'

/**
 * 规则定义：条件 + 评分 + 干预等级 + 触发原因模板。
 *
 * 规则引擎在收到 CoachEvent + 当前 ProblemSession 时按规则表评估：
 * - 命中条件 → 计算 score → 与该事件类型最近一次触发的节流窗口比较
 * - 满足触发条件 → 产出 CoachIntervention（level/message/related_tags）
 *
 * 难度自适应阈值（rating ≥ 1600）通过 thresholdMultiplier 放宽 idle_too_long 阈值。
 * 节流：每个 event_type 30 分钟内不重复触发（RULE_THROTTLE_MS）。
 * 防 hint abuse：每级升级冷却 2 分钟或需一次新提交（HINT_UPGRADE_COOLDOWN_MS）。
 * 比赛模式硬关闭：ContestGuard.isContestMode() = true 时所有规则强制不触发。
 */

export interface RuleContext {
  event: CoachEvent
  session: ProblemSession | null
  /** 当前 rating（用于难度自适应） */
  problemRating: number | null
  /** 当前是否处于比赛模式 */
  isContestMode: boolean
  /** 当前题号（来自 evidence 或 session） */
  problemId: string | null
  /** 当前平台 */
  platform: string | null
  /** 当前会话 id */
  sessionId: string | null
}

export interface RuleResult {
  /** 是否触发干预 */
  triggered: boolean
  /** 触发原因（人类可读） */
  trigger_reason: string
  /** 干预等级 */
  intervention_level: CoachInterventionLevel
  /** 提示消息正文 */
  message: string
  /** 关联标签（阶段 3 HintSelector 消费） */
  related_tags: string[]
  /** 规则评分（0-100） */
  score: number
}

export interface Rule {
  event_type: CoachEventType
  /** 条件谓词：返回 true 表示命中 */
  matches(ctx: RuleContext): boolean
  /** 评分函数：返回 0-100 */
  score(ctx: RuleContext): number
  /** 生成触发结果（消息/标签等） */
  build(ctx: RuleContext): Omit<RuleResult, 'triggered' | 'score'>
}

/** 节流窗口：同类型事件 30 分钟内不重复触发 */
export const RULE_THROTTLE_MS = 30 * 60 * 1000

/** 防 hint abuse 升级冷却：每级 ≥ 2 分钟 */
export const HINT_UPGRADE_COOLDOWN_MS = 2 * 60 * 1000

/** 难度自适应阈值：rating ≥ 1600 时 idle 阈值放宽 */
export const HARD_PROBLEM_RATING_THRESHOLD = 1600

/** 高难度题的 idle 阈值倍数（20-30 分钟 ≈ 2-3x 默认 10 分钟） */
export const HARD_PROBLEM_IDLE_MULTIPLIER = 2.5

/** 卡壳等级 → idle_too_long 触发阈值（秒） */
export const IDLE_THRESHOLDS_BY_STUCK_LEVEL: Record<number, number> = {
  0: 600,   // 10 分钟
  1: 600,   // 10 分钟（轻度卡壳即触发）
  2: 720,   // 12 分钟
  3: 900,   // 15 分钟
}

/** 默认提示阈值：评分高于此值才推送气泡 */
export const DEFAULT_TRIGGER_SCORE_THRESHOLD = 50

// --- 规则实现 ---

const idleTooLongRule: Rule = {
  event_type: 'idle_too_long',
  matches(ctx) {
    if (ctx.isContestMode) return false
    const session = ctx.session
    if (!session) return false
    // 仅在 active 状态的 session 触发
    if (session.current_status !== 'active') return false
    // 评分由 score() 决定，matches 只判定"是否值得评分"
    return session.detected_stuck_level > 0 || session.active_seconds >= 600
  },
  score(ctx) {
    const session = ctx.session!
    const level = session.detected_stuck_level
    let base = 30
    base += level * 15
    // 高难度题放宽（宁可漏报不误报）
    if (ctx.problemRating && ctx.problemRating >= HARD_PROBLEM_RATING_THRESHOLD) {
      base -= 15
    }
    return clamp(base, 0, 100)
  },
  build(ctx) {
    const session = ctx.session!
    const level = session.detected_stuck_level
    const messages = {
      1: '已经 10 分钟没提交了。要不要先把思路写下来？',
      2: '卡了 15 分钟，且已有 WA。试试换思路或检查边界？',
      3: '卡了 20 分钟且 ≥ 2 次 WA。建议先复盘或换题。',
    } as Record<number, string>
    return {
      trigger_reason: `idle_too_long (stuck_level=${level}, active=${session.active_seconds}s)`,
      intervention_level: level >= 2 ? 2 : 1,
      message: messages[level] ?? messages[1],
      related_tags: ['metacognition', 'stuck'],
    }
  },
}

const multipleWrongRule: Rule = {
  event_type: 'multiple_wrong',
  matches(ctx) {
    if (ctx.isContestMode) return false
    const wrongCount = ctx.event.evidence.wrong_count
    if (!wrongCount || wrongCount < 2) return false
    return true
  },
  score(ctx) {
    const wrongCount = ctx.event.evidence.wrong_count ?? 0
    let base = 60 + wrongCount * 10
    if (ctx.problemRating && ctx.problemRating >= HARD_PROBLEM_RATING_THRESHOLD) {
      base -= 10
    }
    return clamp(base, 0, 100)
  },
  build(ctx) {
    const wrongCount = ctx.event.evidence.wrong_count ?? 2
    const verdict = ctx.event.evidence.verdict ?? 'WA'
    return {
      trigger_reason: `multiple_wrong (${wrongCount}x ${verdict})`,
      intervention_level: wrongCount >= 3 ? 2 : 1,
      message: wrongCount >= 3
        ? `已经 ${wrongCount} 次 ${verdict} 了。建议停下来重新读题，检查边界与数据范围。`
        : `连续 ${wrongCount} 次 ${verdict}。要不要看看是哪类错误？`,
      related_tags: ['verdict', verdict.toLowerCase(), 'multiple_wrong'],
    }
  },
}

const sameErrorRule: Rule = {
  event_type: 'same_error',
  matches(ctx) {
    if (ctx.isContestMode) return false
    const repeat = ctx.event.evidence.same_verdict_repeat
    if (!repeat || repeat < 2) return false
    return true
  },
  score(ctx) {
    const repeat = ctx.event.evidence.same_verdict_repeat ?? 0
    return clamp(55 + repeat * 10, 0, 100)
  },
  build(ctx) {
    const repeat = ctx.event.evidence.same_verdict_repeat ?? 2
    const verdict = ctx.event.evidence.verdict ?? 'WA'
    return {
      trigger_reason: `same_error (${repeat}x same ${verdict})`,
      intervention_level: repeat >= 3 ? 2 : 1,
      message: `连续 ${repeat} 次相同 ${verdict}。可能是在重复同一个错误，换个角度看看？`,
      related_tags: ['verdict', verdict.toLowerCase(), 'same_error'],
    }
  },
}

const firstAcRule: Rule = {
  event_type: 'first_ac',
  matches(ctx) {
    // 比赛模式也允许 first_ac 庆祝（不打扰用户，只是状态切换）
    // 但 spec 要求"比赛模式零提示"——所以仍硬关闭
    if (ctx.isContestMode) return false
    return true
  },
  score() {
    return 30
  },
  build() {
    return {
      trigger_reason: 'first_ac',
      intervention_level: 1,
      message: 'AC 了！干得漂亮。',
      related_tags: ['celebrate', 'first_ac'],
    }
  },
}

const longSessionRule: Rule = {
  event_type: 'long_session',
  matches(ctx) {
    if (ctx.isContestMode) return false
    const session = ctx.session
    if (!session) return false
    // 单次会话 active 超过 90 分钟视为 long_session
    return session.active_seconds >= 90 * 60
  },
  score(ctx) {
    const session = ctx.session!
    const overMin = Math.floor((session.active_seconds - 90 * 60) / 60)
    return clamp(40 + overMin, 0, 100)
  },
  build(ctx) {
    const session = ctx.session!
    const minutes = Math.floor(session.active_seconds / 60)
    return {
      trigger_reason: `long_session (${minutes}min active)`,
      intervention_level: 1,
      message: `已经做了 ${minutes} 分钟了。要不要休息一下？长时间高强度反而容易出 bug。`,
      related_tags: ['metacognition', 'fatigue'],
    }
  },
}

// --- 阶段 3 实现的靶向规则 ---
// review_due / boundary_suspected / complexity_warning 在阶段 3 由 HintSelector /
// ConstraintParser 联动触发。事件由 CoachOrchestrator.handleCoachEvent 调用
// HintSelector.deriveEventType 派生，规则自身只负责评分与消息生成。
//
// matches 判定逻辑：
// - complexity_warning: verdict=TLE 且 evidence.constraints 已挂载（nUpper>=1e5）
// - boundary_suspected: verdict=WA 且 evidence.value_upper>=1e9
// - review_due: 阶段 3 demo 简化版——基于 evidence.days_since_last_visit（≥3 天且未 AC）
//   （完整复习计划留 M3 后续，此处仅给规则出口）

const complexityWarningRule: Rule = {
  event_type: 'complexity_warning',
  matches(ctx) {
    if (ctx.isContestMode) return false
    const verdict = ctx.event.evidence.verdict
    if (!verdict || verdict.toUpperCase() !== 'TLE') return false
    // 已挂载 constraints 或 nUpper 字段
    const nUpper = ctx.event.evidence.n_upper
    if (typeof nUpper === 'number' && nUpper >= 1e5) return true
    const constraints = ctx.event.evidence.constraints as { nUpper?: number | null } | undefined
    if (constraints && typeof constraints.nUpper === 'number' && constraints.nUpper >= 1e5) return true
    return false
  },
  score(ctx) {
    const nUpper = (ctx.event.evidence.n_upper as number) ??
      (ctx.event.evidence.constraints as { nUpper?: number } | undefined)?.nUpper ?? 0
    // n 越大评分越高
    let base = 60
    if (nUpper >= 1e5) base += 15
    if (nUpper >= 1e6) base += 10
    if (ctx.problemRating && ctx.problemRating >= HARD_PROBLEM_RATING_THRESHOLD) {
      base -= 5
    }
    return clamp(base, 0, 100)
  },
  build(ctx) {
    const nUpper = (ctx.event.evidence.n_upper as number) ??
      (ctx.event.evidence.constraints as { nUpper?: number } | undefined)?.nUpper ?? null
    const nUpperStr = nUpper !== null ? formatN(nUpper) : ''
    const message = nUpper !== null
      ? `n ≤ ${nUpperStr} 通常需要 O(n log n) 以内，检查嵌套循环。`
      : 'TLE 了。检查嵌套循环与算法复杂度，考虑优化到 O(n log n) 以内。'
    return {
      trigger_reason: `complexity_warning (TLE, n_upper=${nUpper ?? '?'})`,
      // L3：关键细节（与 HintLadder 一致；用户升级后由 HintLadder 接管消息）
      intervention_level: 3,
      message,
      related_tags: ['verdict', 'tle', 'complexity', 'large_n'],
    }
  },
}

const boundarySuspectedRule: Rule = {
  event_type: 'boundary_suspected',
  matches(ctx) {
    if (ctx.isContestMode) return false
    const verdict = ctx.event.evidence.verdict
    if (!verdict || verdict.toUpperCase() !== 'WA') return false
    // 值域上限 >= 1e9（溢出嫌疑）或显式 boundary 提示标记
    const valueUpper = ctx.event.evidence.value_upper
    if (typeof valueUpper === 'number' && valueUpper >= 1e9) return true
    const constraints = ctx.event.evidence.constraints as { valueUpper?: number | null } | undefined
    if (constraints && typeof constraints.valueUpper === 'number' && constraints.valueUpper >= 1e9) return true
    return false
  },
  score(ctx) {
    const valueUpper = (ctx.event.evidence.value_upper as number) ??
      (ctx.event.evidence.constraints as { valueUpper?: number } | undefined)?.valueUpper ?? 0
    let base = 60
    if (valueUpper >= 1e9) base += 15
    if (valueUpper >= 1e18) base += 10
    return clamp(base, 0, 100)
  },
  build(ctx) {
    const valueUpper = (ctx.event.evidence.value_upper as number) ??
      (ctx.event.evidence.constraints as { valueUpper?: number } | undefined)?.valueUpper ?? null
    const message = valueUpper !== null
      ? `值域上限 ${formatN(valueUpper)} 已超 int 范围，可能溢出。注意中间运算。`
      : 'WA 可能是边界或溢出问题。检查变量类型与边界条件。'
    return {
      trigger_reason: `boundary_suspected (WA, value_upper=${valueUpper ?? '?'})`,
      intervention_level: 3,
      message,
      related_tags: ['verdict', 'wa', 'boundary', 'overflow'],
    }
  },
}

const reviewDueRule: Rule = {
  event_type: 'review_due',
  matches(ctx) {
    if (ctx.isContestMode) return false
    // 阶段 3 demo 简化版：基于 evidence.days_since_last_visit
    // 完整复习计划留 M3 后续（结合 SM-2 等间隔重复算法）
    const days = ctx.event.evidence.days_since_last_visit
    if (typeof days !== 'number' || days < 3) return false
    // 仅对未 AC 题目触发（evidence.is_solved = false 或 undefined）
    const isSolved = ctx.event.evidence.is_solved
    if (isSolved === true) return false
    return true
  },
  score(ctx) {
    const days = (ctx.event.evidence.days_since_last_visit as number) ?? 0
    // 距离越久评分越高
    return clamp(50 + days * 2, 0, 90)
  },
  build(ctx) {
    const days = (ctx.event.evidence.days_since_last_visit as number) ?? 0
    return {
      trigger_reason: `review_due (days=${days})`,
      intervention_level: 1,
      message: `这道题已经 ${days} 天没动了。要不要复习一下，或重新组织思路？`,
      related_tags: ['review', 'spaced_repetition'],
    }
  },
}

/** 数字格式化：100000 → "1e5"，200000 → "2·10^5" */
function formatN(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const exp = Math.floor(Math.log10(abs))
    const mantissa = value / Math.pow(10, exp)
    const mantissaStr = Number.isInteger(mantissa) ? String(mantissa) : mantissa.toFixed(1)
    return `${mantissaStr}·10^${exp}`
  }
  return String(value)
}

/**
 * 规则表（按 event_type 索引）。
 * 阶段 3 已添加 boundary_suspected / complexity_warning / review_due 的具体实现。
 */
export const RULES: Record<CoachEventType, Rule> = {
  idle_too_long: idleTooLongRule,
  multiple_wrong: multipleWrongRule,
  same_error: sameErrorRule,
  first_ac: firstAcRule,
  long_session: longSessionRule,
  review_due: reviewDueRule,
  boundary_suspected: boundarySuspectedRule,
  complexity_warning: complexityWarningRule,
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}
