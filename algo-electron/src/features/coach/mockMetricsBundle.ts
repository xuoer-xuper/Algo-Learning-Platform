/**
 * 模拟 Coach 指标数据 bundle（答辩预演用）。
 *
 * 设计目标：数值可手工核对，评委现场可逐项验证 computeCoachMetrics 的计算正确性。
 *
 * 预期计算结果（注释即断言，便于答辩时口述）：
 * - 提示展示数 total_shown = 10（10 条非审计干预）
 * - "再给一点"点击数 = 3 → 点击率 = 3/10 = 30.0%
 * - 反馈总数 = 8，helpful = 4 → "有帮助"反馈率 = 4/8 = 50.0%
 * - 有干预记录的题目 = 3（P1/P2/P3）
 *   - P1：AC 发生在最早干预之后 → 计入转化
 *   - P2：无 AC → 不计入
 *   - P3：AC 发生在最早干预之前 → 不计入（干预前已 AC）
 *   → 干预后同题 AC 转化率 = 1/3 ≈ 33.3%
 * - dismissed 干预 = 2，never_today 反馈 = 2 → 桌宠关闭率 = (2+2)/10 = 40.0%
 */
import type { CoachEvent } from '../../../electron/coach/types'

/** 模拟时间基准：2026-07-01 10:00:00 */
const T0 = '2026-07-01T10:00:00.000'
const T_PLUS = (mins: number) => {
  const d = new Date(T0)
  d.setMinutes(d.getMinutes() + mins)
  return d.toISOString().replace(/\.\d{3}Z$/, '.000')
}

const MOCK_PROBLEM_1 = 'mock-prob-1'
const MOCK_PROBLEM_2 = 'mock-prob-2'
const MOCK_PROBLEM_3 = 'mock-prob-3'

const mockEvents: CoachEvent[] = [
  {
    event_id: 'mock-evt-1',
    session_id: 'mock-sess-1',
    event_type: 'multiple_wrong',
    severity: 'warn',
    score: 60,
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    evidence: { verdict: 'WA', wrong_count: 2 },
    created_at: T_PLUS(5),
  },
  {
    event_id: 'mock-evt-2',
    session_id: 'mock-sess-1',
    event_type: 'idle_too_long',
    severity: 'warn',
    score: 45,
    problem_id: MOCK_PROBLEM_2,
    platform: 'codeforces',
    evidence: { active_seconds: 900 },
    created_at: T_PLUS(20),
  },
  {
    event_id: 'mock-evt-3',
    session_id: 'mock-sess-2',
    event_type: 'complexity_warning',
    severity: 'critical',
    score: 80,
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    evidence: { verdict: 'TLE' },
    created_at: T_PLUS(40),
  },
  {
    event_id: 'mock-evt-4',
    session_id: 'mock-sess-3',
    event_type: 'first_ac',
    severity: 'info',
    score: 100,
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    evidence: { verdict: 'AC' },
    created_at: T_PLUS(70),
  },
]

const mockInterventions: CoachIntervention[] = [
  // --- P1：4 条干预（最早 10:05），AC 在 10:70（之后）→ 计入转化 ---
  {
    intervention_id: 'mock-int-1',
    event_id: 'mock-evt-1',
    trigger_reason: '同题连续 2 次 WA',
    intervention_level: 1,
    source_type: 'local_rule',
    message: '连续两次 WA，检查边界条件？',
    related_tags: [],
    user_action: 'hint_requested',
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    session_id: 'mock-sess-1',
    created_at: T_PLUS(5),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-2',
    event_id: 'mock-evt-3',
    trigger_reason: 'TLE 复杂度警告',
    intervention_level: 3,
    source_type: 'local_hint',
    message: 'n ≤ 2·10^5 通常需要 O(n log n) 以内，检查嵌套循环',
    related_tags: ['complexity'],
    user_action: 'hint_requested',
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    session_id: 'mock-sess-1',
    created_at: T_PLUS(40),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-3',
    event_id: 'mock-evt-1',
    trigger_reason: '同题连续 2 次 WA',
    intervention_level: 2,
    source_type: 'local_rule',
    message: '你在卡什么？想想特殊样例。',
    related_tags: [],
    user_action: 'shown',
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    session_id: 'mock-sess-1',
    created_at: T_PLUS(12),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-4',
    event_id: 'mock-evt-4',
    trigger_reason: '首次 AC 庆祝',
    intervention_level: 1,
    source_type: 'local_rule',
    message: 'AC 了！',
    related_tags: [],
    user_action: 'no_action',
    problem_id: MOCK_PROBLEM_1,
    platform: 'codeforces',
    session_id: 'mock-sess-1',
    created_at: T_PLUS(70),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  // --- P2：4 条干预（最早 10:20），无 AC → 不计入转化 ---
  {
    intervention_id: 'mock-int-5',
    event_id: 'mock-evt-2',
    trigger_reason: '卡壳 15 分钟无提交',
    intervention_level: 1,
    source_type: 'local_rule',
    message: '已经 15 分钟没动，需要提示吗？',
    related_tags: [],
    user_action: 'dismissed',
    problem_id: MOCK_PROBLEM_2,
    platform: 'codeforces',
    session_id: 'mock-sess-2',
    created_at: T_PLUS(20),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-6',
    event_id: 'mock-evt-2',
    trigger_reason: '卡壳 15 分钟无提交',
    intervention_level: 2,
    source_type: 'local_rule',
    message: '再想想：有没有退化到暴力的边界？',
    related_tags: [],
    user_action: 'shown',
    problem_id: MOCK_PROBLEM_2,
    platform: 'codeforces',
    session_id: 'mock-sess-2',
    created_at: T_PLUS(35),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-7',
    event_id: null,
    trigger_reason: '长时间未 AC',
    intervention_level: 1,
    source_type: 'local_rule',
    message: '这题有点难，要不要看思路？',
    related_tags: [],
    user_action: 'shown',
    problem_id: MOCK_PROBLEM_2,
    platform: 'codeforces',
    session_id: 'mock-sess-2',
    created_at: T_PLUS(50),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-8',
    event_id: null,
    trigger_reason: '长时间未 AC',
    intervention_level: 2,
    source_type: 'local_hint',
    message: '元认知：你能用一句话描述当前算法吗？',
    related_tags: [],
    user_action: 'hint_requested',
    problem_id: MOCK_PROBLEM_2,
    platform: 'codeforces',
    session_id: 'mock-sess-2',
    created_at: T_PLUS(55),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  // --- P3：2 条干预（最早 10:30），AC 在 10:10（之前）→ 不计入转化 ---
  {
    intervention_id: 'mock-int-9',
    event_id: null,
    trigger_reason: '复习到期',
    intervention_level: 1,
    source_type: 'local_rule',
    message: '这题该复习了。',
    related_tags: [],
    user_action: 'shown',
    problem_id: MOCK_PROBLEM_3,
    platform: 'luogu',
    session_id: 'mock-sess-3',
    created_at: T_PLUS(30),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  {
    intervention_id: 'mock-int-10',
    event_id: null,
    trigger_reason: '复习到期',
    intervention_level: 1,
    source_type: 'local_rule',
    message: '复习提示升级。',
    related_tags: [],
    user_action: 'dismissed',
    problem_id: MOCK_PROBLEM_3,
    platform: 'luogu',
    session_id: 'mock-sess-3',
    created_at: T_PLUS(45),
    is_contest_mode: false,
    contest_url: null,
    contest_start: null,
    contest_end: null,
    zero_intervention: false,
  },
  // --- 比赛模式审计（不计入提示展示数） ---
  {
    intervention_id: 'mock-int-audit-1',
    event_id: null,
    trigger_reason: 'contest_enter (codeforces:1800)',
    intervention_level: 0,
    source_type: 'contest_audit',
    message: '进入比赛页，规则引擎硬关闭',
    related_tags: [],
    user_action: 'shown',
    problem_id: null,
    platform: 'codeforces',
    session_id: null,
    created_at: T_PLUS(100),
    is_contest_mode: true,
    contest_url: 'https://codeforces.com/contest/1800',
    contest_start: T_PLUS(100),
    contest_end: T_PLUS(190),
    zero_intervention: true,
  },
]

const mockFeedback: CoachFeedbackRecord[] = [
  { feedback_id: 'mock-fb-1', intervention_id: 'mock-int-1', bubble_id: null, feedback_type: 'helpful', event_type: 'multiple_wrong', problem_id: MOCK_PROBLEM_1, local_day: '2026-07-01', created_at: T_PLUS(6) },
  { feedback_id: 'mock-fb-2', intervention_id: 'mock-int-2', bubble_id: null, feedback_type: 'helpful', event_type: 'complexity_warning', problem_id: MOCK_PROBLEM_1, local_day: '2026-07-01', created_at: T_PLUS(41) },
  { feedback_id: 'mock-fb-3', intervention_id: 'mock-int-3', bubble_id: null, feedback_type: 'not_helpful', event_type: 'multiple_wrong', problem_id: MOCK_PROBLEM_1, local_day: '2026-07-01', created_at: T_PLUS(13) },
  { feedback_id: 'mock-fb-4', intervention_id: 'mock-int-5', bubble_id: null, feedback_type: 'dismiss', event_type: 'idle_too_long', problem_id: MOCK_PROBLEM_2, local_day: '2026-07-01', created_at: T_PLUS(21) },
  { feedback_id: 'mock-fb-5', intervention_id: 'mock-int-7', bubble_id: null, feedback_type: 'never_today', event_type: 'long_session', problem_id: MOCK_PROBLEM_2, local_day: '2026-07-01', created_at: T_PLUS(51) },
  { feedback_id: 'mock-fb-6', intervention_id: 'mock-int-8', bubble_id: null, feedback_type: 'helpful', event_type: 'long_session', problem_id: MOCK_PROBLEM_2, local_day: '2026-07-01', created_at: T_PLUS(56) },
  { feedback_id: 'mock-fb-7', intervention_id: 'mock-int-10', bubble_id: null, feedback_type: 'never_today', event_type: 'review_due', problem_id: MOCK_PROBLEM_3, local_day: '2026-07-01', created_at: T_PLUS(46) },
  { feedback_id: 'mock-fb-8', intervention_id: 'mock-int-6', bubble_id: null, feedback_type: 'helpful', event_type: 'idle_too_long', problem_id: MOCK_PROBLEM_2, local_day: '2026-07-01', created_at: T_PLUS(36) },
]

const mockProblemAcStatus: ProblemAcStatus[] = [
  // P1：AC 在 10:70（最早干预 10:05 之后）→ 计入
  { problem_id: MOCK_PROBLEM_1, first_ac_at: T_PLUS(70) },
  // P2：无 AC → 不计入
  { problem_id: MOCK_PROBLEM_2, first_ac_at: null },
  // P3：AC 在 10:10（最早干预 10:30 之前）→ 不计入（干预前已 AC）
  { problem_id: MOCK_PROBLEM_3, first_ac_at: T_PLUS(10) },
]

export const MOCK_METRICS_BUNDLE: CoachMetricsBundle = {
  since: T0,
  until: T_PLUS(200),
  events: mockEvents,
  interventions: mockInterventions,
  feedback: mockFeedback,
  problem_ac_status: mockProblemAcStatus,
}

/**
 * 模拟数据的预期计算结果（用于答辩时口述 / 单元核对）。
 */
export const MOCK_EXPECTED = {
  total_shown: 10,
  hint_requested_count: 3,
  hint_click_rate: 0.3,
  helpful_count: 4,
  total_feedback: 8,
  helpful_rate: 0.5,
  intervention_problem_count: 3,
  post_intervention_ac_count: 1,
  post_intervention_ac_rate: 1 / 3,
  dismissed_count: 2,
  never_today_count: 2,
  dismiss_rate: 0.4,
} as const
