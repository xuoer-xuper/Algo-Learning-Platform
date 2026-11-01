import { z } from 'zod'
import { COACH_PIN_MODES } from '../constants/preferences'
import type { IpcOutput } from './common'

/*
 * Coach 域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义是 electron/coach/types.ts（阶段 2/4 的规则引擎类型）与
 * electron/app/config.ts 的 CoachConfig；两者自本文件起改为从这里 import。
 *
 * 标量联合（状态机、等级）用纯 `export type`——它们只出现在编译期；对象形状
 * （事件、干预、会话、指标）是 coach_events / coach_interventions / coach_feedback
 * 等表行的 IPC 投影，用 zod schema 定义并 z.infer 推导。
 */

/** 桌宠置顶模式（B5.5 / D30）。取值来源下沉到 constants/preferences.ts。 */
export type CoachPinMode = (typeof COACH_PIN_MODES)[number]

/** 桌宠 6 态：待机/思考/警示/庆祝/睡眠/专注。 */
export type CoachPetState = 'idle' | 'thinking' | 'alert' | 'celebrate' | 'sleep' | 'focus'

/** 提示来源：local=本地规则引擎；llm=LLM 生成（默认关闭，预留通道）。 */
export type CoachHintSource = 'local' | 'llm'

/** 用户反馈类型（持久化到 coach_feedback 表）。 */
export type CoachFeedbackType = 'helpful' | 'not_helpful' | 'dismiss' | 'never_today'

/**
 * 规则引擎内部评分（0-100）。高于阈值才推送气泡，低于阈值仅记录事件。
 */
export type CoachScore = number

/**
 * 干预等级（与 Socratic Ladder 对齐）：L0 不提示 → L5 概念/标签。
 * 阶段 2 规则引擎只产 L0/L1/L2；L3+ 由 HintLadder 升级触发。
 */
export type CoachInterventionLevel = 0 | 1 | 2 | 3 | 4 | 5

/** 干预来源：本地规则/本地模板/LLM/比赛模式审计记录。 */
export type CoachInterventionSourceType = 'local_rule' | 'local_hint' | 'llm' | 'contest_audit'

/** 用户对一次干预的动作（审计与频率学习用）。 */
export type CoachInterventionUserAction =
  'shown' | 'hint_requested' | 'dismissed' | 'never_today' | 'feedback' | 'no_action'

/** 题目会话三态：读题/写码/卡壳。 */
export type ProblemSessionPhase = 'reading' | 'coding' | 'stuck'

/** 卡壳等级 0-3（0 未卡壳；3 = 20+ 分钟无提交且 ≥2 次 WA）。 */
export type StuckLevel = 0 | 1 | 2 | 3

/** 题目会话状态：活跃/挂起（切 IDE 等）/关闭。 */
export type ProblemSessionStatus = 'active' | 'suspended' | 'closed'

const COACH_EVENT_TYPES = [
  'idle_too_long',
  'multiple_wrong',
  'same_error',
  'review_due',
  'long_session',
  'first_ac',
  'boundary_suspected',
  'complexity_warning',
] as const

/** Coach 事件类型闭集（规则引擎的触发维度）。 */
export type CoachEventType = (typeof COACH_EVENT_TYPES)[number]

const COACH_EVENT_SEVERITIES = ['info', 'warn', 'critical'] as const

/** 事件严重程度：info（庆祝）/ warn（提醒）/ critical（连续错误 ≥3）。 */
export type CoachEventSeverity = (typeof COACH_EVENT_SEVERITIES)[number]

const INTERVENTION_SOURCE_TYPES = ['local_rule', 'local_hint', 'llm', 'contest_audit'] as const

const INTERVENTION_USER_ACTIONS = [
  'shown',
  'hint_requested',
  'dismissed',
  'never_today',
  'feedback',
  'no_action',
] as const

export const coachEventEvidenceSchema = z.looseObject({
  verdict: z.string().optional(),
  wrong_count: z.number().optional(),
  same_verdict_repeat: z.number().optional(),
  active_seconds: z.number().optional(),
  submit_count: z.number().optional(),
  problem_rating: z.number().optional(),
  contest_id: z.string().optional(),
  source_url: z.string().optional(),
})

/**
 * 事件证据负载。字段全部可选，不同事件类型携带不同字段；仓库层以 JSON 序列化
 * 存储，looseObject 保留自由扩展键（对应原来的 `[key: string]: unknown`）。
 */
export type CoachEventEvidence = z.infer<typeof coachEventEvidenceSchema>

export const coachEventSchema = z.object({
  event_id: z.string(),
  session_id: z.string().nullable(),
  event_type: z.enum(COACH_EVENT_TYPES),
  severity: z.enum(COACH_EVENT_SEVERITIES),
  score: z.number(),
  problem_id: z.string().nullable(),
  platform: z.string().nullable(),
  evidence: coachEventEvidenceSchema,
  created_at: z.string(),
})

/** coach_events 表行的内存表示（阶段 2/3/4 数据流的原子单位）。 */
export type CoachEvent = z.infer<typeof coachEventSchema>

export const problemSessionSchema = z.object({
  session_id: z.string(),
  problem_id: z.string().nullable(),
  platform: z.string(),
  platform_problem_id: z.string(),
  /** 进入题目页时间戳（ms；本类型是 Coach 域里唯一已是毫秒的时间字段）。 */
  started_at: z.number(),
  last_active_at: z.number(),
  /** 只累计有效活跃（壳聚焦 + 系统空闲 < 阈值），每 30s 聚合一次。 */
  active_seconds: z.number(),
  submit_count: z.number(),
  wrong_count: z.number(),
  current_status: z.enum(['active', 'suspended', 'closed']),
  phase: z.enum(['reading', 'coding', 'stuck']),
  detected_stuck_level: z.number().int().min(0).max(3),
  verdict_history: z.array(z.string()),
  problem_rating: z.number().nullable(),
})

/**
 * 一次做题会话的内存表示。不入库（CoachEvent.session_id 关联），历史会话保留在
 * 内存环形缓冲。
 */
export type ProblemSession = z.infer<typeof problemSessionSchema>

export const coachInterventionSchema = z.object({
  intervention_id: z.string(),
  event_id: z.string().nullable(),
  trigger_reason: z.string(),
  intervention_level: z.number().int().min(0).max(5),
  source_type: z.enum(INTERVENTION_SOURCE_TYPES),
  message: z.string(),
  related_tags: z.array(z.string()),
  user_action: z.enum(INTERVENTION_USER_ACTIONS),
  problem_id: z.string().nullable(),
  platform: z.string().nullable(),
  session_id: z.string().nullable(),
  created_at: z.string(),
  is_contest_mode: z.boolean(),
  contest_url: z.string().nullable(),
  contest_start: z.string().nullable(),
  contest_end: z.string().nullable(),
  zero_intervention: z.boolean(),
})

/**
 * coach_interventions 表行的内存表示。同一张表承载普通干预
 * （source_type = local_rule / local_hint / llm）与比赛模式审计日志
 * （source_type = contest_audit，记录"零介入"事实）。
 */
export type CoachIntervention = z.infer<typeof coachInterventionSchema>

export const contestAuditRecordSchema = z.object({
  audit_id: z.string(),
  contest_url: z.string(),
  platform: z.string(),
  contest_id: z.string(),
  contest_start: z.string(),
  contest_end: z.string(),
  duration_seconds: z.number(),
  zero_intervention: z.boolean(),
  had_any_intervention: z.boolean(),
  exported_at: z.string(),
})

/** 比赛审计日志的简化视图（coach:exportAuditLog 导出，作为诚信证明）。 */
export type ContestAuditRecord = z.infer<typeof contestAuditRecordSchema>

export const coachStateSnapshotSchema = z.object({
  current_session: problemSessionSchema.nullable(),
  is_contest_mode: z.boolean(),
  contest: z
    .object({
      url: z.string(),
      platform: z.string(),
      contest_id: z.string(),
      entered_at: z.string(),
    })
    .nullable(),
  pet_state: z.enum(['idle', 'thinking', 'alert', 'celebrate', 'sleep', 'focus']),
  llm_enabled: z.boolean(),
  suppressed_types: z.array(z.enum(COACH_EVENT_TYPES)),
  last_event_at: z.string().nullable(),
})

/** Coach 服务运行时状态快照（coach:getState，渲染层调试面板用）。 */
export type CoachStateSnapshot = z.infer<typeof coachStateSnapshotSchema>

export const coachMetricsSnapshotSchema = z.object({
  total_events: z.number(),
  /** z.record + 枚举键 = 全键 Record：聚合器对每个事件类型都会落一个计数。 */
  events_by_type: z.record(z.enum(COACH_EVENT_TYPES), z.number()),
  total_interventions: z.number(),
  hint_requested_count: z.number(),
  never_today_count: z.number(),
  contest_audit_count: z.number(),
  contest_total_seconds: z.number(),
  since: z.string(),
  until: z.string(),
})

/** Coach 指标聚合（coach:getMetrics）。 */
export type CoachMetricsSnapshot = z.infer<typeof coachMetricsSnapshotSchema>

export const problemVisitPointSchema = z.object({
  visit_id: z.string(),
  entered_at: z.string(),
  left_at: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  active_seconds: z.number().nullable(),
  leave_reason: z.string().nullable(),
  url: z.string(),
})

/** 时间轴访问点（problem_visits 表，只读）。 */
export type ProblemVisitPoint = z.infer<typeof problemVisitPointSchema>

export const timelineSubmissionPointSchema = z.object({
  submission_id: z.string(),
  submitted_at: z.string(),
  verdict: z.string(),
  language: z.string().nullable(),
  runtime_ms: z.number().nullable(),
})

/** 时间轴提交点（submissions 表）。 */
export type TimelineSubmissionPoint = z.infer<typeof timelineSubmissionPointSchema>

export const timelineEventPointSchema = z.object({
  event_id: z.string(),
  event_type: z.enum(COACH_EVENT_TYPES),
  severity: z.enum(COACH_EVENT_SEVERITIES),
  created_at: z.string(),
  evidence: coachEventEvidenceSchema,
})

/** 时间轴 Coach 事件点（coach_events 表）。 */
export type TimelineEventPoint = z.infer<typeof timelineEventPointSchema>

export const timelineInterventionPointSchema = z.object({
  intervention_id: z.string(),
  created_at: z.string(),
  intervention_level: z.number().int().min(0).max(5),
  source_type: z.enum(INTERVENTION_SOURCE_TYPES),
  trigger_reason: z.string(),
  message: z.string(),
  user_action: z.enum(INTERVENTION_USER_ACTIONS),
  is_contest_mode: z.boolean(),
})

/** 时间轴干预点（coach_interventions 表，含比赛审计）。 */
export type TimelineInterventionPoint = z.infer<typeof timelineInterventionPointSchema>

export const problemTimelineDataSchema = z.object({
  problem_id: z.string(),
  platform: z.string(),
  platform_problem_id: z.string(),
  title: z.string().nullable(),
  canonical_url: z.string(),
  status: z.string(),
  first_seen_at: z.string().nullable(),
  last_visited_at: z.string().nullable(),
  visits: z.array(problemVisitPointSchema),
  submissions: z.array(timelineSubmissionPointSchema),
  events: z.array(timelineEventPointSchema),
  interventions: z.array(timelineInterventionPointSchema),
  first_ac_at: z.string().nullable(),
  last_activity_at: z.string().nullable(),
})

/** 单题时间轴复盘（coach:getProblemTimeline；四表同题数据按时间归并）。 */
export type ProblemTimelineData = z.infer<typeof problemTimelineDataSchema>

export const coachFeedbackRecordSchema = z.object({
  feedback_id: z.string(),
  intervention_id: z.string().nullable(),
  bubble_id: z.string().nullable(),
  feedback_type: z.enum(['helpful', 'not_helpful', 'dismiss', 'never_today']),
  event_type: z.enum(COACH_EVENT_TYPES).nullable(),
  problem_id: z.string().nullable(),
  local_day: z.string(),
  created_at: z.string(),
})

/** coach_feedback 表行的内存表示（阶段 4 指标页聚合用）。 */
export type CoachFeedbackRecord = z.infer<typeof coachFeedbackRecordSchema>

export const problemAcStatusSchema = z.object({
  problem_id: z.string(),
  first_ac_at: z.string().nullable(),
})

/** 题目 AC 状态（干预后同题 AC 转化率计算用）。 */
export type ProblemAcStatus = z.infer<typeof problemAcStatusSchema>

export const coachMetricsBundleSchema = z.object({
  since: z.string(),
  until: z.string(),
  events: z.array(coachEventSchema),
  interventions: z.array(coachInterventionSchema),
  feedback: z.array(coachFeedbackRecordSchema),
  problem_ac_status: z.array(problemAcStatusSchema),
})

/**
 * Coach 指标原始数据 bundle（coach:getMetricsBundle）。刻意是"原始数据"而非
 * 聚合好的数字：CoachMetricsView 在渲染层用纯函数 computeCoachMetrics 计算，
 * 答辩预演的"加载模拟数据"按钮可整体替换 bundle 复用同一份计算逻辑。
 */
export type CoachMetricsBundle = z.infer<typeof coachMetricsBundleSchema>

export const coachBubblePayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  source: z.enum(['local', 'llm']),
  problemId: z.string().optional(),
  eventId: z.string().optional(),
  level: z.number().optional(),
  bubble_type: z.enum(['hint', 'disclaimer', 'loading']).optional(),
})

/** 主进程推给桌宠渲染层的气泡负载。 */
export type CoachBubblePayload = z.infer<typeof coachBubblePayloadSchema>

export const coachLlmConfigSchema = z.object({
  /** safeStorage 加密后的 API Key（base64）；渲染层不可写（domain-rules §7）。 */
  encrypted_api_key: z.string().optional(),
  base_url: z.string().optional(),
  model: z.string().optional(),
  enabled: z.boolean().optional(),
})

/** config.json 里 coach.llm 字段的形状（主进程内部名 CoachLlmConfig）。 */
export type CoachLlmConfig = z.infer<typeof coachLlmConfigSchema>

export const coachConfigSchema = z.object({
  enabled: z.boolean(),
  sound: z.boolean(),
  bubbleFrequency: z.enum(['low', 'medium', 'high']),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  scale: z.number(),
  opacity: z.number(),
  pinMode: z.enum(COACH_PIN_MODES),
  llm: coachLlmConfigSchema.optional(),
  /** 是否永久关闭"仅供参考"免责声明（收口前 env.d.ts 镜像漏了这个字段）。 */
  disclaimer_dismissed: z.boolean().optional(),
})

/**
 * Coach 桌宠配置（coach:getConfig / saveConfig 载荷）。以 electron/app/config.ts
 * 的存储形状为准（含 disclaimer_dismissed）；API Key 只有加密形态过 IPC。
 */
export type CoachConfig = z.infer<typeof coachConfigSchema>

export const llmConfigStatusSchema = z.object({
  enabled: z.boolean(),
  has_key: z.boolean(),
  key_masked: z.string(),
  model: z.string(),
  base_url: z.string(),
})

/** LLM 配置状态（coach:getLlmConfig；脱敏，用于 UI 展示）。 */
export type LlmConfigStatus = z.infer<typeof llmConfigStatusSchema>

/**
 * LLM 连接测试（coach:testLlmConnection）的 IPC 输出联合。载荷形状与
 * `LlmConnectionTestData`（src/shared/types/ipc/coach.ts）同口径；服务级内部
 * 形状叫 `LlmConnectionTestResult`（electron/coach/llm/LlmHintTypes.ts），刻意不同名。
 */
export type LlmConnectionTestOutput = IpcOutput<{
  message: string
  latency_ms?: number
  model?: string
}>

export const coachContestModePayloadSchema = z.object({
  isContestMode: z.boolean(),
  contest: z
    .object({
      url: z.string(),
      platform: z.string(),
      contest_id: z.string(),
      entered_at: z.string(),
    })
    .nullable(),
})

/** 比赛模式进出时推给渲染层的事件负载（coach:contestModeChanged）。 */
export type CoachContestModePayload = z.infer<typeof coachContestModePayloadSchema>
