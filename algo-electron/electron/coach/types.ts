/**
 * Coach 模块共享类型定义。
 *
 * 阶段 1（桌宠视觉壳）只包含 PetState 与 BubblePayload；
 * 阶段 2 会在此文件扩展 CoachEvent / ProblemSession / CoachIntervention 等。
 */

/**
 * 桌宠 6 种状态枚举。
 * - idle: 默认待机
 * - thinking: 思考中（如正在等待 LLM 或规则评估）
 * - alert: 触发提示（需要用户注意）
 * - celebrate: 庆祝（如刚 AC）
 * - sleep: 睡眠（长时间无活动）
 * - focus: 专注模式（如检测到做题中）
 *
 * 阶段 2 的 ContestGuard 还会引入 'contest' 隐含状态，
 * 届时可扩展为联合类型，或通过独立 channel 通知。
 */
export type CoachPetState = 'idle' | 'thinking' | 'alert' | 'celebrate' | 'sleep' | 'focus'

/**
 * 提示来源标记。
 * - local: 本地规则引擎生成（默认）
 * - llm: LLM 生成（Demo 默认不接 LLM，预留通道）
 */
export type CoachHintSource = 'local' | 'llm'

/**
 * 气泡负载数据。主进程通过 IPC 推送给桌宠渲染层。
 */
export interface CoachBubblePayload {
  /** 气泡内部 id，用于 ack/feedback 关联 */
  id: string
  /** 标题（如"卡壳提醒"） */
  title: string
  /** 消息正文 */
  message: string
  /** 来源标记 */
  source: CoachHintSource
  /** 可选的关联问题 id（阶段 2 靶向提示用） */
  problemId?: string
  /** 可选的关联事件 id（阶段 2 审计日志用） */
  eventId?: string
  /** 可选的提示等级（阶段 3 Socratic Ladder 用，阶段 1 默认 1） */
  level?: number
  /** 气泡类型：hint=提示气泡，disclaimer=免责声明气泡 */
  bubble_type?: 'hint' | 'disclaimer'
}

/**
 * 用户反馈类型（阶段 3 持久化到 coach_feedback 表）。
 */
export type CoachFeedbackType = 'helpful' | 'not_helpful' | 'dismiss' | 'never_today'

// ===========================================================================
// 阶段 2：事件触发 + 比赛模式
// ===========================================================================

/**
 * Coach 事件类型枚举。
 *
 * - idle_too_long: 题目会话中长时间无提交/无操作（卡壳）
 * - multiple_wrong: 同题累计 WA/TLE/RE ≥ 2 次
 * - same_error: 同题相同 verdict 重复出现（连续同种错误）
 * - review_due: 题目进入复习窗口（阶段 3 复习计划触发）
 * - long_session: 单次做题会话过长（超过阈值）
 * - first_ac: 同题首次 AC（庆祝用）
 * - boundary_suspected: 怀疑边界问题（WA + 数据范围大，阶段 3 与 ConstraintParser 联动）
 * - complexity_warning: 复杂度警告（TLE + 阶段 3 ConstraintParser 解析出 n 上限）
 *
 * 阶段 2 只落地核心枚举；阶段 3 的 boundary_suspected / complexity_warning 在
 * ConstraintParser 接入后由 HintSelector 触发，事件结构已预留。
 */
export type CoachEventType =
  | 'idle_too_long'
  | 'multiple_wrong'
  | 'same_error'
  | 'review_due'
  | 'long_session'
  | 'first_ac'
  | 'boundary_suspected'
  | 'complexity_warning'

/**
 * 事件严重程度。
 * - info: 信息（如 first_ac 庆祝）
 * - warn: 提醒（如 idle_too_long）
 * - critical: 关键（如 multiple_wrong ≥ 3）
 */
export type CoachEventSeverity = 'info' | 'warn' | 'critical'

/**
 * 规则引擎内部评分（0-100），决定是否触发干预。
 * 高于阈值才推送气泡；低于阈值仅记录事件、不打扰用户。
 */
export type CoachScore = number

/**
 * 干预等级（与阶段 3 Socratic Ladder 对齐）。
 *
 * - L0: 不提示（仅记录事件）
 * - L1: 轻提醒
 * - L2: 元认知（"你在卡什么？"）
 * - L3: 关键细节（边界/复杂度提示，阶段 3 与 ConstraintParser 联动）
 * - L4: 策略
 * - L5: 概念/标签（最高层，需二次确认）
 *
 * 阶段 2 RuleEngine 默认只产 L0/L1/L2；L3+ 由阶段 3 HintLadder 升级触发。
 */
export type CoachInterventionLevel = 0 | 1 | 2 | 3 | 4 | 5

/**
 * 干预来源类型。
 * - local_rule: 本地规则引擎
 * - local_hint: 本地模板提示（阶段 3 HintSelector）
 * - llm: LLM 生成（Demo 默认关闭）
 * - contest_audit: 比赛模式审计记录（不展示给用户）
 */
export type CoachInterventionSourceType =
  | 'local_rule'
  | 'local_hint'
  | 'llm'
  | 'contest_audit'

/**
 * Coach 事件（ coach_events 表的内存表示）。
 *
 * 由 CoachEventBridge / ProblemSessionTracker / 规则引擎产生，
 * 是阶段 2/3/4 数据流的"原子单位"。
 */
export interface CoachEvent {
  /** 事件唯一 id（uuid） */
  event_id: string
  /** 关联题目会话 id（无会话时可为 null） */
  session_id: string | null
  /** 事件类型 */
  event_type: CoachEventType
  /** 严重程度 */
  severity: CoachEventSeverity
  /** 规则评分 0-100 */
  score: CoachScore
  /** 关联问题内部 id（problems.id） */
  problem_id: string | null
  /** 关联平台（codeforces / luogu / ...） */
  platform: string | null
  /** 证据负载（自由结构：verdict / active_seconds / rating / contestId 等） */
  evidence: CoachEventEvidence
  /** 创建时间（系统本地时间，与 nowBeijing 一致） */
  created_at: string
}

/**
 * 事件证据负载。
 *
 * 字段全部可选，不同事件类型携带不同字段，便于阶段 3 HintSelector /
 * ConstraintParser 扩展。仓库层以 JSON 序列化存储。
 */
export interface CoachEventEvidence {
  /** 触发事件的提交 verdict（WA/TLE/...） */
  verdict?: string
  /** 同题累计 WA/TLE/RE 次数 */
  wrong_count?: number
  /** 同题连续相同 verdict 次数 */
  same_verdict_repeat?: number
  /** 当前 session 累计活跃秒数 */
  active_seconds?: number
  /** 当前 session 累计提交次数 */
  submit_count?: number
  /** 题目预估 rating（用于难度自适应阈值） */
  problem_rating?: number
  /** 比赛id（CF contest / Luogu contest） */
  contest_id?: string
  /** 触发来源 URL */
  source_url?: string
  /** 自由扩展字段 */
  [key: string]: unknown
}

/**
 * 题目会话三态。
 * - reading: 读题（无提交且 active < 5 分钟）
 * - coding: 写码（已提交或 active ≥ 5 分钟）
 * - stuck: 卡壳（长时间无提交，规则引擎进一步分级）
 */
export type ProblemSessionPhase = 'reading' | 'coding' | 'stuck'

/**
 * 卡壳等级（0-3）。
 * - 0: 未卡壳
 * - 1: 轻度卡壳（10+ 分钟无提交）
 * - 2: 中度卡壳（15+ 分钟无提交且有 ≥1 次 WA）
 * - 3: 重度卡壳（20+ 分钟无提交且 ≥2 次 WA）
 */
export type StuckLevel = 0 | 1 | 2 | 3

/**
 * 题目会话状态。
 * - active: 正在活跃计时
 * - suspended: 挂起（切到本地 IDE / 主窗口失焦超阈值）
 * - closed: 已关闭（切题或退出应用）
 */
export type ProblemSessionStatus = 'active' | 'suspended' | 'closed'

/**
 * ProblemSession：当前一次做题会话的内存表示。
 *
 * 生命周期：进入题目页开 → 切到本地 IDE 挂起 → 回站或提交继续 → 切题/退出关闭。
 * 不直接入库（CoachEvent.session_id 关联），但历史会话保留在内存环形缓冲。
 *
 * active_seconds 只累计有效活跃（主窗口 focus + 系统空闲 < 阈值），
 * 每 30s 聚合一次，避免 keystroke 级噪声。
 */
export interface ProblemSession {
  /** 会话唯一 id（uuid） */
  session_id: string
  /** 关联问题内部 id（problems.id），可能为 null（题目尚未落库时） */
  problem_id: string | null
  /** 平台标识 */
  platform: string
  /** 平台题目 id（CF: 1234A / Luogu: P1001） */
  platform_problem_id: string
  /** 进入题目页时间戳（ms） */
  started_at: number
  /** 最近活跃时间戳（ms） */
  last_active_at: number
  /** 累计有效活跃秒数 */
  active_seconds: number
  /** 累计提交次数 */
  submit_count: number
  /** 累计错误次数（WA/TLE/RE/CE） */
  wrong_count: number
  /** 当前会话状态 */
  current_status: ProblemSessionStatus
  /** 当前阶段（reading/coding/stuck） */
  phase: ProblemSessionPhase
  /** 卡壳等级（0-3） */
  detected_stuck_level: StuckLevel
  /** 已收到 verdict 序列（用于 same_error 判定） */
  verdict_history: string[]
  /** 当前题目预估 rating（用于难度自适应，可空） */
  problem_rating: number | null
}

/**
 * 用户对某次干预的动作记录（用于审计与频率学习）。
 */
export type CoachInterventionUserAction =
  | 'shown'        // 已展示
  | 'hint_requested' // 用户点"再给一点"
  | 'dismissed'    // 用户点"先不用"
  | 'never_today'  // 用户点"今天别提醒"
  | 'feedback'     // 用户反馈 helpful/not_helpful
  | 'no_action'    // 用户未操作（自动消失）

/**
 * CoachIntervention：规则引擎触发的干预记录（coach_interventions 表的内存表示）。
 *
 * 同一张表同时承载：
 * - 普通干预（source_type = local_rule / local_hint / llm）
 * - 比赛模式审计日志（source_type = contest_audit，记录"零介入"事实）
 */
export interface CoachIntervention {
  /** 干预唯一 id（uuid） */
  intervention_id: string
  /** 关联事件 id（可为 null，如比赛审计独立记录） */
  event_id: string | null
  /** 触发原因（人类可读，如"同题连续 2 次 WA"） */
  trigger_reason: string
  /** 干预等级 L0-L5 */
  intervention_level: CoachInterventionLevel
  /** 来源类型 */
  source_type: CoachInterventionSourceType
  /** 提示消息正文（用户可见） */
  message: string
  /** 关联标签（自由字符串数组，阶段 3 HintSelector 消费） */
  related_tags: string[]
  /** 用户动作记录 */
  user_action: CoachInterventionUserAction
  /** 关联问题内部 id（可为 null） */
  problem_id: string | null
  /** 关联平台 */
  platform: string | null
  /** 关联会话 id */
  session_id: string | null
  /** 创建时间 */
  created_at: string

  // --- 比赛模式审计字段（source_type = contest_audit 时填充） ---
  /** 是否处于比赛模式 */
  is_contest_mode: boolean
  /** 比赛 URL（如 https://codeforces.com/contest/1234） */
  contest_url: string | null
  /** 比赛开始时间（系统本地时间字符串） */
  contest_start: string | null
  /** 比赛结束时间（系统本地时间字符串） */
  contest_end: string | null
  /** 是否"零介入"事实记录 */
  zero_intervention: boolean
}

/**
 * ContestAuditRecord：比赛模式审计日志的简化视图。
 *
 * 用于 coach:exportAuditLog 导出，作为诚信证明。
 * 数据来自 coach_interventions 表中 source_type = 'contest_audit' 的行。
 */
export interface ContestAuditRecord {
  /** 审计记录 id（同 intervention_id） */
  audit_id: string
  /** 比赛 URL */
  contest_url: string
  /** 比赛平台（codeforces / luogu / ...） */
  platform: string
  /** 比赛 id（从 URL 解析） */
  contest_id: string
  /** 比赛进入时间 */
  contest_start: string
  /** 比赛离开时间 */
  contest_end: string
  /** 比赛时长（秒） */
  duration_seconds: number
  /** 是否零介入 */
  zero_intervention: boolean
  /** 是否在比赛期间有过任何提示（应始终为 false） */
  had_any_intervention: boolean
  /** 导出时间 */
  exported_at: string
}

/**
 * Coach 服务运行时状态快照（coach:getState 返回）。
 *
 * 一次性聚合当前会话、规则引擎状态、比赛模式状态，便于 renderer 调试面板展示。
 */
export interface CoachStateSnapshot {
  /** 当前题目会话（可能为 null） */
  current_session: ProblemSession | null
  /** 当前是否处于比赛模式 */
  is_contest_mode: boolean
  /** 当前比赛信息（不在比赛模式时为 null） */
  contest: {
    url: string
    platform: string
    contest_id: string
    entered_at: string
  } | null
  /** 当前桌宠状态 */
  pet_state: CoachPetState
  /** 当前 LLM 通道是否启用（Demo 默认 false） */
  llm_enabled: boolean
  /** "今天别提醒"临时屏蔽的提示类型列表 */
  suppressed_types: CoachEventType[]
  /** 最近一次事件时间（用于面板展示"上次活动"） */
  last_event_at: string | null
}

/**
 * Coach 指标聚合（coach:getMetrics 返回）。
 *
 * 数据来自 coach_events / coach_interventions / coach_feedback 聚合。
 * 阶段 2 只暴露核心计数；阶段 4 CoachMetricsView 会扩展更多指标。
 */
export interface CoachMetricsSnapshot {
  /** 统计窗口内事件总数 */
  total_events: number
  /** 按类型分组的事件数 */
  events_by_type: Record<CoachEventType, number>
  /** 干预总数 */
  total_interventions: number
  /** "再给一点"点击数 */
  hint_requested_count: number
  /** "今天别提醒"点击数 */
  never_today_count: number
  /** 比赛模式审计记录数 */
  contest_audit_count: number
  /** 比赛模式总时长（秒） */
  contest_total_seconds: number
  /** 统计起始时间 */
  since: string
  /** 统计截止时间 */
  until: string
}

// ===========================================================================
// 阶段 4：过程复盘 + 答辩数据
// ===========================================================================

/**
 * 单次题目访问记录（时间轴数据点）。
 * 来自 problem_visits 表，只读，不新增采集。
 */
export interface ProblemVisitPoint {
  visit_id: string
  /** 进入题目页时间（ISO 字符串） */
  entered_at: string
  /** 离开题目页时间（可能为 null，如应用退出） */
  left_at: string | null
  /** 停留秒数 */
  duration_seconds: number | null
  /** 有效活跃秒数（排除挂机） */
  active_seconds: number | null
  /** 离开原因 */
  leave_reason: string | null
  /** 题目 URL */
  url: string
}

/** 时间轴上的提交点。来自 submissions 表。 */
export interface TimelineSubmissionPoint {
  submission_id: string
  submitted_at: string
  verdict: string
  language: string | null
  runtime_ms: number | null
}

/** 时间轴上的 Coach 事件点。来自 coach_events 表。 */
export interface TimelineEventPoint {
  event_id: string
  event_type: CoachEventType
  severity: CoachEventSeverity
  created_at: string
  evidence: CoachEventEvidence
}

/** 时间轴上的 Coach 干预点。来自 coach_interventions 表（含比赛审计）。 */
export interface TimelineInterventionPoint {
  intervention_id: string
  created_at: string
  intervention_level: CoachInterventionLevel
  source_type: CoachInterventionSourceType
  trigger_reason: string
  message: string
  user_action: CoachInterventionUserAction
  is_contest_mode: boolean
}

/**
 * 单题时间轴复盘数据。
 *
 * 合并 problem_visits / submissions / coach_events / coach_interventions 四张表
 * 的同题数据，按时间顺序供 SessionTimelineView 渲染。
 * 数据全部来自现有表，不新增采集。
 */
export interface ProblemTimelineData {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  status: string
  first_seen_at: string | null
  last_visited_at: string | null
  /** 全部访问记录（升序） */
  visits: ProblemVisitPoint[]
  /** 全部提交（升序） */
  submissions: TimelineSubmissionPoint[]
  /** 全部 Coach 事件（升序） */
  events: TimelineEventPoint[]
  /** 全部干预记录（升序，含比赛审计） */
  interventions: TimelineInterventionPoint[]
  /** 首次 AC 时间（无 AC 则 null） */
  first_ac_at: string | null
  /** 最近一次活动时间（visits/submissions 取最晚） */
  last_activity_at: string | null
}

/**
 * 用户反馈记录（coach_feedback 表的内存表示）。
 * 阶段 4 指标页聚合用。
 */
export interface CoachFeedbackRecord {
  feedback_id: string
  intervention_id: string | null
  bubble_id: string | null
  feedback_type: CoachFeedbackType
  event_type: CoachEventType | null
  problem_id: string | null
  local_day: string
  created_at: string
}

/** 题目 AC 状态（用于干预后同题 AC 转化率计算）。 */
export interface ProblemAcStatus {
  problem_id: string
  /** 首次 AC 时间，无 AC 则 null */
  first_ac_at: string | null
}

/**
 * Coach 指标原始数据 bundle。
 *
 * 一次性聚合统计窗口内的 events / interventions / feedback / problem_ac_status，
 * 供 CoachMetricsView 在 renderer 侧用纯函数 computeCoachMetrics 计算指标。
 *
 * 设计为"原始数据 bundle"而非聚合好的数字，是为了支持答辩预演：
 * "加载模拟数据"按钮可替换整个 bundle，复用同一份计算逻辑验证正确性。
 */
export interface CoachMetricsBundle {
  /** 统计起始时间 */
  since: string
  /** 统计截止时间 */
  until: string
  /** 窗口内全部 Coach 事件 */
  events: CoachEvent[]
  /** 窗口内全部干预记录（含 contest_audit） */
  interventions: CoachIntervention[]
  /** 窗口内全部反馈 */
  feedback: CoachFeedbackRecord[]
  /** 有干预记录的题目的 AC 状态（用于转化率） */
  problem_ac_status: ProblemAcStatus[]
}
