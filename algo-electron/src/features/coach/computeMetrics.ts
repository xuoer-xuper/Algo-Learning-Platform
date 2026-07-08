/**
 * Coach 干预效果指标计算（纯函数）。
 *
 * 设计为纯函数：输入 CoachMetricsBundle（原始数据），输出聚合后的指标。
 * 这样 CoachMetricsView 既可以用真实 bundle 计算，也可以用"模拟数据"bundle
 * 走同一份逻辑，从而在答辩前预演并核对计算正确性。
 *
 * 5 项指标（与 spec 对齐）：
 * 1. 提示展示数        = 非审计类干预总数
 * 2. "再给一点"点击率  = hint_requested 次数 / 提示展示数
 * 3. "有帮助"反馈率    = helpful 反馈数 / 反馈总数
 * 4. 干预后同题 AC 转化率 = 干预后该题首次 AC 的题目数 / 有干预记录的题目数
 * 5. 桌宠关闭率        = (dismissed 干预数 + never_today 反馈数) / 提示展示数
 */

const ALL_EVENT_TYPES: CoachEventType[] = [
  'idle_too_long',
  'multiple_wrong',
  'same_error',
  'review_due',
  'long_session',
  'first_ac',
  'boundary_suspected',
  'complexity_warning',
]

const ALL_FEEDBACK_TYPES: CoachFeedbackType[] = [
  'helpful',
  'not_helpful',
  'dismiss',
  'never_today',
]

export interface CoachMetricsComputed {
  /** 统计窗口 */
  since: string
  until: string
  /** 1. 提示展示数（非审计类干预） */
  total_shown: number
  /** "再给一点"点击数 */
  hint_requested_count: number
  /** 2. "再给一点"点击率（0-1） */
  hint_click_rate: number
  /** "有帮助"反馈数 */
  helpful_count: number
  /** 反馈总数 */
  total_feedback: number
  /** 3. "有帮助"反馈率（0-1） */
  helpful_rate: number
  /** 有干预记录的题目数（去重） */
  intervention_problem_count: number
  /** 干预后同题首次 AC 的题目数 */
  post_intervention_ac_count: number
  /** 4. 干预后同题 AC 转化率（0-1） */
  post_intervention_ac_rate: number
  /** dismiss 干预数 */
  dismissed_count: number
  /** never_today 反馈数 */
  never_today_count: number
  /** 5. 桌宠关闭率（0-1） */
  dismiss_rate: number
  /** 事件总数（窗口内） */
  total_events: number
  /** 干预总数（窗口内，含比赛审计） */
  total_interventions: number
  /** 按事件类型分组的计数 */
  events_by_type: Record<CoachEventType, number>
  /** 按反馈类型分组的计数 */
  feedback_by_type: Record<CoachFeedbackType, number>
  /** 是否为模拟数据（用于 UI 标记） */
  is_mock: boolean
}

/**
 * 从原始 bundle 计算 5 项指标。
 *
 * @param bundle 原始数据（真实或模拟）
 * @param isMock 标记是否为模拟数据，仅用于 UI 展示
 */
export function computeCoachMetrics(
  bundle: CoachMetricsBundle,
  isMock = false,
): CoachMetricsComputed {
  // 1. 提示展示数：排除比赛模式审计记录（contest_audit 不展示给用户）
  const shownInterventions = bundle.interventions.filter(
    (i) => i.source_type !== 'contest_audit',
  )
  const totalShown = shownInterventions.length

  // 2. "再给一点"点击率
  const hintRequestedCount = shownInterventions.filter(
    (i) => i.user_action === 'hint_requested',
  ).length
  const hintClickRate = totalShown > 0 ? hintRequestedCount / totalShown : 0

  // 3. "有帮助"反馈率
  const totalFeedback = bundle.feedback.length
  const helpfulCount = bundle.feedback.filter(
    (f) => f.feedback_type === 'helpful',
  ).length
  const helpfulRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0

  // 4. 干预后同题 AC 转化率
  //    有干预记录的题目中，存在 AC 且 AC 时间 >= 该题最早干预时间的题数
  const acMap = new Map<string, string | null>()
  for (const p of bundle.problem_ac_status) acMap.set(p.problem_id, p.first_ac_at)
  // 每题最早干预时间
  const earliestInterventionByProblem = new Map<string, number>()
  for (const i of shownInterventions) {
    if (!i.problem_id) continue
    const t = Date.parse(i.created_at)
    if (Number.isNaN(t)) continue
    const prev = earliestInterventionByProblem.get(i.problem_id)
    if (prev === undefined || t < prev) earliestInterventionByProblem.set(i.problem_id, t)
  }
  const interventionProblemIds = Array.from(earliestInterventionByProblem.keys())
  let postInterventionAcCount = 0
  for (const pid of interventionProblemIds) {
    const firstAcAt = acMap.get(pid) ?? null
    if (!firstAcAt) continue
    const acTs = Date.parse(firstAcAt)
    if (Number.isNaN(acTs)) continue
    const earliest = earliestInterventionByProblem.get(pid)!
    if (acTs >= earliest) postInterventionAcCount++
  }
  const interventionProblemCount = interventionProblemIds.length
  const postInterventionAcRate =
    interventionProblemCount > 0 ? postInterventionAcCount / interventionProblemCount : 0

  // 5. 桌宠关闭率 = (dismissed 干预数 + never_today 反馈数) / 提示展示数
  //    注：dismiss 在 interventions.user_action 与 coach_feedback.feedback_type 都可能记录，
  //    为避免双重计数，dismiss 取自 interventions（user_action='dismissed'），
  //    never_today 取自 feedback（feedback_type='never_today'，仅反馈表记录）。
  const dismissedCount = shownInterventions.filter(
    (i) => i.user_action === 'dismissed',
  ).length
  const neverTodayCount = bundle.feedback.filter(
    (f) => f.feedback_type === 'never_today',
  ).length
  const dismissRate = totalShown > 0 ? (dismissedCount + neverTodayCount) / totalShown : 0

  // 事件按类型分组
  const eventsByType = {} as Record<CoachEventType, number>
  for (const t of ALL_EVENT_TYPES) eventsByType[t] = 0
  for (const e of bundle.events) {
    if (eventsByType[e.event_type] !== undefined) {
      eventsByType[e.event_type]++
    } else {
      // 未知类型兜底（理论上不会出现，防御性）
      eventsByType[e.event_type] = (eventsByType[e.event_type] ?? 0) + 1
    }
  }

  // 反馈按类型分组
  const feedbackByType = {} as Record<CoachFeedbackType, number>
  for (const t of ALL_FEEDBACK_TYPES) feedbackByType[t] = 0
  for (const f of bundle.feedback) {
    if (feedbackByType[f.feedback_type] !== undefined) {
      feedbackByType[f.feedback_type]++
    } else {
      feedbackByType[f.feedback_type] = (feedbackByType[f.feedback_type] ?? 0) + 1
    }
  }

  return {
    since: bundle.since,
    until: bundle.until,
    total_shown: totalShown,
    hint_requested_count: hintRequestedCount,
    hint_click_rate: hintClickRate,
    helpful_count: helpfulCount,
    total_feedback: totalFeedback,
    helpful_rate: helpfulRate,
    intervention_problem_count: interventionProblemCount,
    post_intervention_ac_count: postInterventionAcCount,
    post_intervention_ac_rate: postInterventionAcRate,
    dismissed_count: dismissedCount,
    never_today_count: neverTodayCount,
    dismiss_rate: dismissRate,
    total_events: bundle.events.length,
    total_interventions: bundle.interventions.length,
    events_by_type: eventsByType,
    feedback_by_type: feedbackByType,
    is_mock: isMock,
  }
}

/** 格式化百分比（0-1 → "12.3%"） */
export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return '-'
  return `${(rate * 100).toFixed(1)}%`
}
