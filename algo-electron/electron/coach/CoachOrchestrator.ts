import crypto from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { powerMonitor } from 'electron'
import type { TabManager } from '../browser/TabManager'
import type { TrackingService } from '../tracking/TrackingService'
import type { RealtimeSubmissionService } from '../submissions/RealtimeSubmissionService'
import { parseUrl } from '../parsers/registry'
import { nowBeijing, todayBeijing } from '../shared/time'
import {
  insertCoachEvent,
  listCoachEvents,
  listCoachEventsByProblem,
  listCoachEventsSince,
  countCoachEventsByTypeSince,
  getLastEventAt,
} from '../db/repositories/coach/eventsRepository'
import {
  insertCoachIntervention,
  buildCoachIntervention,
  updateInterventionUserAction,
  listCoachInterventions,
  listCoachInterventionsByProblem,
  listCoachInterventionsSince,
  listContestAuditRecords,
  countCoachInterventionsSince,
  countUserActionSince,
  countContestAuditSince,
  sumContestSecondsSince,
  type ContestAuditRow,
} from '../db/repositories/coach/interventionsRepository'
import {
  getNeverTodayEventTypes,
  countNeverTodaySince,
  listCoachFeedbackSince,
  type CoachFeedbackRow,
} from '../db/repositories/coach/feedbackRepository'
import {
  getProblemDetail,
  listProblemVisitsByProblem,
} from '../db/repositories/problemRepository'
import {
  getSubmissionsByProblemAsc,
  getFirstAcByProblemIds,
} from '../db/repositories/submissionRepository'
import type { CoachPetWindow } from './CoachPetWindow'
import type { CoachBubblePayload, CoachFeedbackType } from './types'
import type {
  CoachEvent,
  CoachEventType,
  CoachFeedbackRecord,
  CoachIntervention,
  CoachInterventionLevel,
  CoachMetricsBundle,
  CoachMetricsSnapshot,
  CoachStateSnapshot,
  ProblemAcStatus,
  ProblemTimelineData,
  ProblemVisitPoint,
  TimelineEventPoint,
  TimelineInterventionPoint,
  TimelineSubmissionPoint,
} from './types'
import { CoachEventBridge } from './CoachEventBridge'
import { ProblemSessionTracker } from './ProblemSessionTracker'
import { RuleEngine } from './rules/RuleEngine'
import { ContestGuard } from './ContestGuard'
// 阶段 3 引入
import { HintSelector } from './hints/HintSelector'
import { HintLadder, type GetMessageForLevelContext } from './hints/HintLadder'
import { ConstraintParser, type ProblemConstraints } from './problemFacts/ConstraintParser'
import { CoachFeedbackStore } from './CoachFeedbackStore'
import { createDefaultRepository } from './defaultFeedbackRepository'
import { LlmHintService } from './llm/LlmHintService'
import { loadCoachConfig, saveCoachConfig } from '../app/config'

/**
 * CoachOrchestrator：阶段 2 服务编排。
 *
 * 把 ProblemSessionTracker / CoachEventBridge / RuleEngine / ContestGuard /
 * 仓库 / CoachPetWindow 黏合起来。
 *
 * 数据流：
 *   TabManager.activeTabChange → ProblemSessionTracker / ContestGuard
 *   TrackingService.problem:detected → ProblemSessionTracker / CoachEventBridge
 *   RealtimeSubmissionService.detected → CoachEventBridge → CoachEvent
 *     → RuleEngine.handleEvent → CoachIntervention
 *     → CoachPetWindow.showBubble + insertCoachIntervention + insertCoachEvent
 *   ContestGuard.enter → CoachPetWindow.setPetState + insertCoachIntervention(contest_audit)
 *
 * 由 main.ts 在 app ready 后初始化一次，传入依赖。
 */

export interface CoachOrchestratorOptions {
  getMainWindow: () => BrowserWindow | null
  getTabManager: () => TabManager | null
  getTrackingService: () => TrackingService | null
  getRealtimeSubmissionService: () => RealtimeSubmissionService | null
  getCoachPetWindow: () => CoachPetWindow | null
}

const METRICS_LOOKBACK_DAYS = 30

export class CoachOrchestrator {
  private readonly options: CoachOrchestratorOptions
  private readonly sessionTracker: ProblemSessionTracker
  private readonly eventBridge: CoachEventBridge
  private readonly ruleEngine: RuleEngine
  private readonly contestGuard: ContestGuard
  // 阶段 3 服务
  private readonly hintSelector: HintSelector
  private readonly hintLadder: HintLadder
  private readonly constraintParser: ConstraintParser
  private readonly feedbackStore: CoachFeedbackStore
  /** LLM 提示服务（阶段 5 引入） */
  private readonly llmHintService: LlmHintService
  /** 当前题目的 constraints 缓存（由 ConstraintParser 异步填充） */
  private currentConstraints: ProblemConstraints | null = null
  /** 当前题目标签（Demo 默认空，留 L5 概念提示接口） */
  private currentProblemTags: string[] = []
  /** 当前 problem key（用于 ConstraintParser fetchAndParse） */
  private currentProblemKey: string | null = null
  /** 当前 problem URL（用于 ConstraintParser 注入脚本，避免重复抓取） */
  private currentProblemUrl: string | null = null

  /** 当前展示的 intervention_id（用于关联 feedback） */
  private currentBubbleInterventionId: string | null = null
  /** 当前展示的 bubble 对应的 event_type（用于"今天别提醒"屏蔽） */
  private currentBubbleEventType: CoachEventType | null = null
  /** 当前 bubble id（用于关联 feedback） */
  private currentBubbleId: string | null = null
  /** 当前提示等级（LLM 模式下追踪 Socratic Ladder 等级） */
  private currentHintLevel: 0 | 1 | 2 | 3 | 4 | 5 = 0
  /** L5 二次确认标记 */
  private l5PendingConfirmed = false
  /** 本次会话是否已关闭免责声明 */
  private disclaimerDismissedThisSession = false
  /** unsubscribe 句柄 */
  private detachFns: Array<() => void> = []

  constructor(options: CoachOrchestratorOptions) {
    this.options = options

    // 1. ContestGuard（最先初始化：RuleEngine 依赖它的 isContestMode）
    this.contestGuard = new ContestGuard({
      now: Date.now,
      onContestEnter: (info) => this.handleContestEnter(info),
      onContestEnd: (info, durationSec) => this.handleContestEnd(info, durationSec),
    })

    // 2. ProblemSessionTracker
    this.sessionTracker = new ProblemSessionTracker({
      tabManager: options.getTabManager()!,
      trackingService: options.getTrackingService()!,
      getMainWindow: options.getMainWindow,
      parseProblemUrl: parseUrl,
      powerMonitor,
    })

    // 3. 阶段 3 服务（先初始化，RuleEngine 需要引用）
    this.hintSelector = new HintSelector({ enableRoundRobin: true })
    this.hintLadder = new HintLadder({ hintSelector: this.hintSelector })
    this.constraintParser = new ConstraintParser({ enableCache: true })
    this.feedbackStore = new CoachFeedbackStore({
      repository: createDefaultRepository(),
    })
    // 启动时加载历史反馈，恢复节流策略
    try {
      this.feedbackStore.loadHistoryForWarmup(30)
    } catch (err) {
      console.warn('[coach] loadHistoryForWarmup failed:', err)
    }

    // 6. LLM 提示服务
    this.llmHintService = new LlmHintService()
    try {
      this.llmHintService.init()
    } catch (err) {
      console.warn('[coach] LlmHintService init failed:', err)
    }

    // 4. CoachEventBridge
    this.eventBridge = new CoachEventBridge({
      getSessionId: () => this.sessionTracker.getCurrentSession()?.session_id ?? null,
      getProblemId: () => this.sessionTracker.getCurrentSession()?.problem_id ?? null,
      getProblemRating: () => this.sessionTracker.getCurrentSession()?.problem_rating ?? null,
      onCoachEvent: (event) => this.handleCoachEvent(event),
    })

    // 5. RuleEngine（注入阶段 3 依赖：getHintForUpgrade / getConstraints / getProblemTags）
    this.ruleEngine = new RuleEngine({
      getSession: () => this.sessionTracker.getCurrentSession(),
      getProblemRating: () => this.sessionTracker.getCurrentSession()?.problem_rating ?? null,
      getIsContestMode: () => this.contestGuard.isContestMode(),
      getSuppressedTypes: () => this.loadSuppressedTypes(),
      onIntervention: (intervention, event) =>
        this.handleIntervention(intervention, event),
      getHintForUpgrade: (_eventType, targetLevel, context) =>
        this.hintLadder.getMessageForLevel(targetLevel, context),
      getConstraints: () => this.currentConstraints,
      getProblemTags: () => this.currentProblemTags,
    })
  }

  /**
   * 启动所有子服务。必须在 TabManager / TrackingService / RealtimeSubmissionService
   * 就绪后调用。
   */
  start(): void {
    // 启动 session tracker
    this.sessionTracker.start()

    // 订阅提交检测出口
    const realtime = this.options.getRealtimeSubmissionService()
    if (realtime) {
      const unsubscribe = realtime.onSubmissionDetected((notification) => {
        // 1. 转给 EventBridge（产生 CoachEvent）
        this.eventBridge.handleSubmission(notification)
        // 2. 通知 session tracker 记录提交
        this.sessionTracker.recordSubmission(notification.verdict, notification.problemId ?? undefined)
        // 3. 通知 RuleEngine 解锁防 abuse（一次新提交）
        // 这里没有 event_id，用 notification 推断（无 event_id 时 RuleEngine 会用 null）
        this.ruleEngine.notifyNewSubmission(notification.problemId ?? '')
      })
      this.detachFns.push(unsubscribe)
    }

    // 订阅 active tab 变化（用于 ContestGuard + 阶段 3 ConstraintParser 触发）
    const tabManager = this.options.getTabManager()
    if (tabManager) {
      const unsubscribe = tabManager.addActiveTabChangeListener((url) => {
        this.contestGuard.handleUrlChange(url)
        // 阶段 3：切到题目页时异步触发 ConstraintParser
        this.maybeFetchConstraints(url)
      })
      this.detachFns.push(unsubscribe)
    }

    // 订阅 TrackingService.problem:detected（用于 EventBridge 更新当前 identity）
    // 注意：ProblemSessionTracker 也订阅了它（通过 setProblemDetectedCallback）。
    // TrackingService 当前是单 callback 设计，所以 ProblemSessionTracker 占用了。
    // 为避免冲突，EventBridge 在收到 submission 时会自动从 ProblemSessionTracker 拉取 sessionId，
    // 不需要单独订阅 problem:detected。

    // 启动后延迟展示"仅供参考"免责声明（等桌宠窗口 React 组件就绪）
    setTimeout(() => this.maybeShowDisclaimer(), 2000)
  }

  /** 检查并展示"仅供参考"免责声明 */
  private maybeShowDisclaimer(): void {
    if (this.disclaimerDismissedThisSession) return
    const config = loadCoachConfig()
    if (config.disclaimer_dismissed) return

    const pet = this.options.getCoachPetWindow()
    if (!pet) return

    const payload: CoachBubblePayload = {
      id: `disclaimer-${crypto.randomUUID()}`,
      title: '仅供参考',
      message: '本应用提供的 AI 提示和解答仅供参考，不保证完全正确。请结合自身判断使用。',
      source: 'local',
      bubble_type: 'disclaimer',
    }
    pet.showBubble(payload)
    this.currentBubbleId = payload.id
  }

  /** 关闭免责声明 */
  dismissDisclaimer(permanent: boolean): void {
    this.disclaimerDismissedThisSession = true
    if (permanent) {
      const config = loadCoachConfig()
      saveCoachConfig({ ...config, disclaimer_dismissed: true })
    }
    this.options.getCoachPetWindow()?.dismissBubble()
    this.options.getCoachPetWindow()?.setPetState('idle')
    this.currentBubbleId = null
  }

  /** 自由聊天 */
  async chatWithLlm(
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string | null> {
    return this.llmHintService.chat({
      userMessage: message,
      session: this.sessionTracker.getCurrentSession(),
      constraints: this.currentConstraints,
      history,
      problemUrl: this.currentProblemUrl,
    })
  }

  /** 请求针对当前题目的提示 */
  async requestHintFromLlm(): Promise<string | null> {
    return this.llmHintService.requestHint({
      session: this.sessionTracker.getCurrentSession(),
      constraints: this.currentConstraints,
      problemUrl: this.currentProblemUrl,
    })
  }

  /**
   * 阶段 3：异步触发 ConstraintParser 解析当前题目页。
   * - 解析失败静默退化（不影响主流程）
   * - 解析成功后缓存到 currentConstraints，供 RuleEngine / HintSelector 使用
   * - 切到非题目页时清空缓存
   */
  private maybeFetchConstraints(url: string): void {
    if (!url) {
      this.currentConstraints = null
      this.currentProblemKey = null
      this.currentProblemUrl = null
      return
    }
    // 用 parseUrl 识别题目页
    const identity = parseUrl(url)
    if (!identity) {
      // 非题目页，清空缓存
      this.currentConstraints = null
      this.currentProblemKey = null
      this.currentProblemUrl = null
      return
    }
    // 已缓存且 problem key 一致则跳过
    const problemKey = `${identity.platform}:${identity.platformProblemId}`
    if (this.currentProblemKey === problemKey && this.currentConstraints !== null) {
      return
    }
    this.currentProblemKey = problemKey
    this.currentProblemUrl = url

    // 异步触发：通过 TabManager 注入脚本
    const tabManager = this.options.getTabManager()
    if (!tabManager) return

    const executeScript = async (targetUrl: string, code: string): Promise<unknown> => {
      try {
        return await tabManager.executeScriptOnUrl(targetUrl, code)
      } catch (err) {
        console.warn('[coach] ConstraintParser injection failed:', err)
        return null
      }
    }

    // 异步执行，失败静默（spec 要求"解析失败静默退化到通用提示，不阻塞主流程"）
    void this.constraintParser
      .fetchAndParse({
        platform: identity.platform,
        problemKey,
        url,
        executeScript,
      })
      .then((constraints) => {
        this.currentConstraints = constraints
      })
      .catch((err) => {
        console.warn('[coach] ConstraintParser fetchAndParse failed:', err)
        this.currentConstraints = null
      })
  }

  /** 停止所有子服务 */
  stop(): void {
    this.sessionTracker.stop()
    this.contestGuard.forceEnd()
    for (const fn of this.detachFns) {
      try { fn() } catch { /* ignore */ }
    }
    this.detachFns = []
  }

  // --- 状态查询（IPC 消费） ---

  getState(): CoachStateSnapshot {
    return {
      current_session: this.sessionTracker.getCurrentSession(),
      is_contest_mode: this.contestGuard.isContestMode(),
      contest: this.contestGuard.getCurrentContest()
        ? {
            url: this.contestGuard.getCurrentContest()!.contestUrl,
            platform: this.contestGuard.getCurrentContest()!.platform,
            contest_id: this.contestGuard.getCurrentContest()!.contestId,
            entered_at: new Date(this.contestGuard.getCurrentContest()!.enteredAt).toISOString(),
          }
        : null,
      pet_state: this.options.getCoachPetWindow()?.getPetState() ?? 'idle',
      llm_enabled: this.llmHintService.isReady(),
      suppressed_types: Array.from(this.loadSuppressedTypes()),
      last_event_at: getLastEventAt(),
    }
  }

  getCurrentSession() {
    return this.sessionTracker.getCurrentSession()
  }

  /** 阶段 3：当前已解析 constraints 的题目 URL（调试 / 测试用） */
  getCurrentProblemUrl(): string | null {
    return this.currentProblemUrl
  }

  /** 阶段 3：当前题目的 constraints（调试 / 测试用，可能为 null） */
  getCurrentConstraints(): ProblemConstraints | null {
    return this.currentConstraints
  }

  /** 阶段 5：获取 LLM 提示服务（供 IPC 调用） */
  getLlmHintService(): LlmHintService {
    return this.llmHintService
  }

  /** 阶段 5：重新加载 LLM 配置（用户修改配置后调用） */
  reloadLlmConfig(): void {
    this.llmHintService.reloadConfig()
  }

  getSessionHistory(limit?: number) {
    return this.sessionTracker.getSessionHistory(limit)
  }

  getMetrics(): CoachMetricsSnapshot {
    const since = this.computeMetricsSince()
    const until = nowBeijing()
    const eventsByType = countCoachEventsByTypeSince(since)
    const totalEvents = Object.values(eventsByType).reduce((a, b) => a + b, 0)
    const totalInterventions = countCoachInterventionsSince(since)
    const hintRequested = countUserActionSince('hint_requested', since)
    const neverToday = countNeverTodaySince(since)
    const contestAuditCount = countContestAuditSince(since)
    const contestTotalSeconds = sumContestSecondsSince(since)

    // 补齐 eventsByType 所有 key（避免 undefined）
    const allTypes: CoachEventType[] = [
      'idle_too_long', 'multiple_wrong', 'same_error', 'review_due',
      'long_session', 'first_ac', 'boundary_suspected', 'complexity_warning',
    ]
    for (const t of allTypes) {
      if (eventsByType[t] === undefined) eventsByType[t] = 0
    }

    return {
      total_events: totalEvents,
      events_by_type: eventsByType,
      total_interventions: totalInterventions,
      hint_requested_count: hintRequested,
      never_today_count: neverToday,
      contest_audit_count: contestAuditCount,
      contest_total_seconds: contestTotalSeconds,
      since,
      until,
    }
  }

  exportAuditLog(): ContestAuditRow[] {
    return listContestAuditRecords()
  }

  listRecentEvents(limit = 50) {
    return listCoachEvents(limit)
  }

  listRecentInterventions(limit = 50) {
    return listCoachInterventions(limit)
  }

  // --- 阶段 4：过程复盘 + 答辩数据 ---

  /**
   * 单题时间轴复盘数据。
   *
   * 合并 problem_visits / submissions / coach_events / coach_interventions 四张表
   * 的同题数据，按时间顺序返回。数据全部来自现有表，不新增采集。
   *
   * 用于 Task 18 SessionTimelineView。
   */
  getProblemTimeline(problemId: string): ProblemTimelineData | null {
    const problem = getProblemDetail(problemId)
    if (!problem) return null

    const visits = listProblemVisitsByProblem(problemId).map<ProblemVisitPoint>((v) => ({
      visit_id: v.id,
      entered_at: v.entered_at,
      left_at: v.left_at,
      duration_seconds: v.duration_seconds,
      active_seconds: v.active_seconds,
      leave_reason: v.leave_reason,
      url: v.url,
    }))

    const submissions = getSubmissionsByProblemAsc(problemId).map<TimelineSubmissionPoint>(
      (s) => ({
        submission_id: s.id,
        submitted_at: s.submitted_at,
        verdict: s.verdict,
        language: s.language,
        runtime_ms: s.runtime_ms,
      }),
    )

    const events = listCoachEventsByProblem(problemId).map<TimelineEventPoint>((e) => ({
      event_id: e.event_id,
      event_type: e.event_type,
      severity: e.severity,
      created_at: e.created_at,
      evidence: e.evidence,
    }))

    const interventions = listCoachInterventionsByProblem(problemId).map<TimelineInterventionPoint>(
      (i) => ({
        intervention_id: i.intervention_id,
        created_at: i.created_at,
        intervention_level: i.intervention_level,
        source_type: i.source_type,
        trigger_reason: i.trigger_reason,
        message: i.message,
        user_action: i.user_action,
        is_contest_mode: i.is_contest_mode,
      }),
    )

    const firstAcAt = submissions.find((s) => s.verdict === 'AC')?.submitted_at ?? null

    // 最近一次活动 = visits.last left_at / entered_at 与 submissions.last submitted_at 取最晚
    const candidateTimes: number[] = []
    for (const v of visits) {
      candidateTimes.push(Date.parse(v.entered_at))
      if (v.left_at) candidateTimes.push(Date.parse(v.left_at))
    }
    for (const s of submissions) candidateTimes.push(Date.parse(s.submitted_at))
    const validTimes = candidateTimes.filter((t) => !Number.isNaN(t))
    const lastActivityAt = validTimes.length > 0
      ? new Date(Math.max(...validTimes)).toISOString()
      : null

    return {
      problem_id: problem.id,
      platform: problem.platform,
      platform_problem_id: problem.platform_problem_id,
      title: problem.title,
      canonical_url: problem.canonical_url,
      status: problem.status,
      first_seen_at: problem.first_seen_at ?? null,
      last_visited_at: problem.last_visited_at ?? null,
      visits,
      submissions,
      events,
      interventions,
      first_ac_at: firstAcAt,
      last_activity_at: lastActivityAt,
    }
  }

  /**
   * 指标原始数据 bundle。
   *
   * 聚合统计窗口（最近 30 天）内的 events / interventions / feedback / problem_ac_status，
   * 交由 renderer 侧 CoachMetricsView 用纯函数 computeCoachMetrics 计算 5 项指标。
   *
   * 返回"原始数据"而非聚合数字，是为了支持答辩预演：
   * "加载模拟数据"按钮可替换整个 bundle，复用同一份计算逻辑验证正确性。
   *
   * 用于 Task 19 CoachMetricsView。
   */
  getMetricsBundle(): CoachMetricsBundle {
    const since = this.computeMetricsSince()
    const until = nowBeijing()

    const events = listCoachEventsSince(since, 2000)
    const interventions = listCoachInterventionsSince(since, 2000)
    const feedbackRows = listCoachFeedbackSince(since, 2000)
    const feedback: CoachFeedbackRecord[] = feedbackRows.map((f: CoachFeedbackRow) => ({
      feedback_id: f.feedback_id,
      intervention_id: f.intervention_id,
      bubble_id: f.bubble_id,
      feedback_type: f.feedback_type as CoachFeedbackRecord['feedback_type'],
      event_type: f.event_type as CoachFeedbackRecord['event_type'],
      problem_id: f.problem_id,
      local_day: f.local_day,
      created_at: f.created_at,
    }))

    // 收集有干预记录的 problem_id，批量查 AC 状态（用于转化率）
    const problemIds = Array.from(
      new Set(
        interventions
          .map((i) => i.problem_id)
          .filter((id): id is string => id !== null),
      ),
    )
    const firstAcRows = getFirstAcByProblemIds(problemIds)
    const firstAcMap = new Map<string, string>()
    for (const r of firstAcRows) firstAcMap.set(r.problem_id, r.first_ac_at)
    const problemAcStatus: ProblemAcStatus[] = problemIds.map((id) => ({
      problem_id: id,
      first_ac_at: firstAcMap.get(id) ?? null,
    }))

    return {
      since,
      until,
      events,
      interventions,
      feedback,
      problem_ac_status: problemAcStatus,
    }
  }

  // --- 用户反馈（IPC 消费） ---

  /**
   * 用户反馈：helpful / not_helpful / dismiss / never_today。
   * 阶段 3：通过 CoachFeedbackStore 持久化 + 节流策略联动。
   * never_today 额外标记 RuleEngine 临时屏蔽 + 让 HintLadder 重置 L5 状态。
   */
  recordFeedback(input: {
    bubbleId?: string
    interventionId?: string
    feedbackType: CoachFeedbackType
  }): boolean {
    const eventType = this.currentBubbleEventType
    // 阶段 3：委托 CoachFeedbackStore（同时更新内存计数器 + 落库）
    this.feedbackStore.recordFeedback({
      intervention_id: input.interventionId ?? this.currentBubbleInterventionId ?? null,
      bubble_id: input.bubbleId ?? this.currentBubbleId ?? null,
      feedback_type: input.feedbackType,
      event_type: eventType ?? null,
    })

    if (input.feedbackType === 'never_today' && eventType) {
      this.ruleEngine.markNeverToday(eventType)
      // 也通知 session tracker
      this.sessionTracker.suppressToday(eventType)
      // 阶段 3：never_today 时同时重置 L5 状态
      this.hintLadder.resetL5State(eventType)
    } else if (input.feedbackType === 'dismiss' && eventType) {
      this.ruleEngine.markDismissed(eventType)
      this.hintLadder.resetL5State(eventType)
    }

    // 关气泡 + 切回 idle
    if (input.feedbackType !== 'helpful') {
      this.options.getCoachPetWindow()?.dismissBubble()
      this.options.getCoachPetWindow()?.setPetState('idle')
    }
    return true
  }

  /**
   * 用户点"再给一点"。返回新的 intervention 或 null（拒绝升级）。
   *
   * 阶段 3：L5 升级需二次确认。
   * - 第一次点击升级到 L5：返回 confirmation 干预（needsConfirmation=true），
   *   展示"该提示接近题解方向，确认查看？"气泡
   * - 第二次点击（pending 状态）：真正升级到 L5
   * - dismiss 后重新开始：pending 状态被清空
   */
  async requestHintUpgrade(bubbleId?: string): Promise<{
    accepted: boolean
    level: number
    note?: string
    interventionId?: string
    needsConfirmation?: boolean
  }> {
    void bubbleId
    if (this.contestGuard.isContestMode()) {
      return { accepted: false, level: 0, note: '比赛模式硬关闭' }
    }

    const nextLevel = Math.min(this.currentHintLevel + 1, 5) as CoachInterventionLevel
    const llmReady = this.llmHintService.isReady()

    // L5 二次确认（LLM 和本地模式都需要）
    if (nextLevel === 5 && !this.l5PendingConfirmed) {
      this.l5PendingConfirmed = true
      const confirmIntervention = buildCoachIntervention({
        event_id: this.currentBubbleInterventionId,
        trigger_reason: 'l5_confirmation_pending',
        intervention_level: 5,
        source_type: llmReady ? 'llm' : 'local_rule',
        message: '该提示接近题解方向，确认查看？',
        related_tags: [],
        problem_id: this.sessionTracker.getCurrentSession()?.problem_id ?? null,
        platform: this.sessionTracker.getCurrentSession()?.platform ?? null,
        session_id: this.sessionTracker.getCurrentSession()?.session_id ?? null,
      })
      insertCoachIntervention(confirmIntervention)
      this.showIntervention(confirmIntervention)
      return {
        accepted: false,
        level: 5,
        interventionId: confirmIntervention.intervention_id,
        needsConfirmation: true,
        note: '该提示接近题解方向，请二次点击确认',
      }
    }

    this.l5PendingConfirmed = false

    // LLM 启用：优先走 LLM 路径
    if (llmReady) {
      const stubEvent: CoachEvent = {
        event_id: this.currentBubbleInterventionId ?? crypto.randomUUID(),
        session_id: this.sessionTracker.getCurrentSession()?.session_id ?? null,
        event_type: this.currentBubbleEventType ?? 'multiple_wrong',
        severity: 'warn',
        score: 50,
        problem_id: this.sessionTracker.getCurrentSession()?.problem_id ?? null,
        platform: this.sessionTracker.getCurrentSession()?.platform ?? null,
        evidence: {},
        created_at: nowBeijing(),
      }

      this.options.getCoachPetWindow()?.setPetState('thinking')
      try {
        const llmResult = await this.llmHintService.generateHint({
          event: stubEvent,
          session: this.sessionTracker.getCurrentSession(),
          constraints: this.currentConstraints,
          targetLevel: nextLevel,
          userExplicitAsk: true,
        })
        if (llmResult) {
          this.currentHintLevel = nextLevel
          const intervention = buildCoachIntervention({
            event_id: stubEvent.event_id,
            trigger_reason: stubEvent.event_type,
            intervention_level: nextLevel,
            source_type: 'llm',
            message: llmResult.message,
            related_tags: llmResult.related_tags,
            problem_id: stubEvent.problem_id,
            platform: stubEvent.platform,
            session_id: stubEvent.session_id,
          })
          insertCoachIntervention(intervention)
          this.showIntervention(intervention)
          return {
            accepted: true,
            level: nextLevel,
            interventionId: intervention.intervention_id,
          }
        }
      } catch (err) {
        console.warn('[coach] LLM upgrade failed, falling back to local:', err)
      }
    }

    // 本地 HintLadder 路径（LLM 未启用或 LLM 失败时降级）
    return this.requestLocalHintUpgrade(nextLevel)
  }

  /**
   * 点击桌宠：触发第一次提示（L0→L1）。
   * - LLM 启用：走 LLM 生成 L1 提示
   * - LLM 未启用：走本地 HintLadder 生成 L1 提示
   * - 无当前题目：显示"请先打开题目"气泡
   */
  async petClick(): Promise<{
    triggered: boolean
    level: number
    llmEnabled: boolean
    note?: string
  }> {
    if (this.contestGuard.isContestMode()) {
      return { triggered: false, level: 0, llmEnabled: this.llmHintService.isReady(), note: '比赛模式' }
    }

    const session = this.sessionTracker.getCurrentSession()
    if (!session) {
      const pet = this.options.getCoachPetWindow()
      pet?.setPetState('alert')
      pet?.showBubble({
        id: `no-problem-${Date.now()}`,
        title: '暂无题目',
        message: '请先打开一道题目，我才能给你针对性的提示哦。',
        source: 'local',
        level: 0,
      })
      return { triggered: false, level: 0, llmEnabled: this.llmHintService.isReady(), note: '无当前题目' }
    }

    // 有题目：重置等级，触发 L1 提示
    this.currentHintLevel = 0
    this.l5PendingConfirmed = false
    if (!this.currentBubbleEventType) {
      this.currentBubbleEventType = 'idle_too_long'
    }

    const result = await this.requestHintUpgrade(undefined)
    return {
      triggered: result.accepted,
      level: result.level,
      llmEnabled: this.llmHintService.isReady(),
      note: result.note,
    }
  }

  /**
   * 本地 HintLadder 提示升级（LLM 未启用或失败时降级）。
   */
  private requestLocalHintUpgrade(level: CoachInterventionLevel): {
    accepted: boolean
    level: number
    interventionId?: string
    note?: string
  } {
    const session = this.sessionTracker.getCurrentSession()
    const eventType = this.currentBubbleEventType ?? 'idle_too_long'

    const context: GetMessageForLevelContext = {
      eventType,
      constraints: this.currentConstraints,
      problemTags: this.currentProblemTags,
      problemRating: session?.problem_rating ?? null,
    }

    const content = this.hintLadder.getMessageForLevel(level, context)
    if (content.rejected) {
      return { accepted: false, level: 0, note: content.rejectReason ?? '不展示提示' }
    }

    const intervention = buildCoachIntervention({
      event_id: this.currentBubbleInterventionId ?? crypto.randomUUID(),
      trigger_reason: eventType,
      intervention_level: level,
      source_type: 'local_rule',
      message: content.message,
      related_tags: content.tags,
      problem_id: session?.problem_id ?? null,
      platform: session?.platform ?? null,
      session_id: session?.session_id ?? null,
    })
    insertCoachIntervention(intervention)
    this.showIntervention(intervention)
    this.currentHintLevel = level

    return { accepted: true, level, interventionId: intervention.intervention_id }
  }

  /** 用户点"先不用" */
  dismissHint(bubbleId?: string): boolean {
    if (this.currentBubbleEventType) {
      this.ruleEngine.markDismissed(this.currentBubbleEventType)
      this.hintLadder.resetL5State(this.currentBubbleEventType)
    }
    this.options.getCoachPetWindow()?.dismissBubble()
    this.options.getCoachPetWindow()?.setPetState('idle')

    if (this.currentBubbleInterventionId) {
      updateInterventionUserAction(this.currentBubbleInterventionId, 'dismissed')
    }
    void bubbleId
    this.currentHintLevel = 0
    this.l5PendingConfirmed = false
    this.clearCurrentBubble()
    return true
  }

  // --- 内部 ---

  private async handleCoachEvent(event: CoachEvent): Promise<void> {
    // 比赛模式硬关闭：事件仍记录到 coach_events（用于审计"零介入"事实对比），
    // 但不触发任何提示。审计日志可证明"虽然有事件，但比赛期间无任何 intervention"。
    if (this.contestGuard.isContestMode()) {
      insertCoachEvent(event)
      return
    }
    // 落库（事件本身）
    insertCoachEvent(event)

    // 检查 feedbackStore 是否节流
    if (this.feedbackStore.shouldSuppress(event.event_type)) {
      return
    }

    // 如果 LLM 未启用，不产生任何 intervention（只有桌宠陪伴）
    if (!this.llmHintService.isReady()) {
      return
    }

    // LLM 启用：直接调 LLM 生成提示
    this.options.getCoachPetWindow()?.setPetState('thinking')
    try {
      const llmResult = await this.llmHintService.generateHint({
        event,
        session: this.sessionTracker.getCurrentSession(),
        constraints: this.currentConstraints,
        targetLevel: 1,
        userExplicitAsk: false,
        problemUrl: this.currentProblemUrl,
      })
      if (llmResult) {
        this.feedbackStore.markTriggered(event.event_type)
        this.currentHintLevel = 1
        const intervention = buildCoachIntervention({
          event_id: event.event_id,
          trigger_reason: event.event_type,
          intervention_level: llmResult.reveals_solution ? 5 : 1,
          source_type: 'llm',
          message: llmResult.message,
          related_tags: llmResult.related_tags,
          problem_id: event.problem_id,
          platform: event.platform,
          session_id: event.session_id,
        })
        insertCoachIntervention(intervention)
        this.showIntervention(intervention)
      }
    } catch (err) {
      console.warn('[coach] LLM generateHint failed:', err)
    }
  }

  private handleIntervention(intervention: CoachIntervention, _event: CoachEvent): void {
    insertCoachIntervention(intervention)
    // showIntervention 由 handleCoachEvent 调用 handleEvent 后通过返回值触发
    // 这里保留 onIntervention 回调用于阶段 3 HintSelector 接入
  }

  private showIntervention(intervention: CoachIntervention): void {
    const pet = this.options.getCoachPetWindow()
    if (!pet) return

    // L0 不展示
    if (intervention.intervention_level === 0) return

    // 根据来源切换状态
    if (intervention.event_id && intervention.source_type === 'local_rule') {
      // 提醒类
      pet.setPetState('alert')
    }

    const payload: CoachBubblePayload = {
      id: intervention.intervention_id,
      title: bubbleTitleFor(intervention),
      message: intervention.message,
      source: intervention.source_type === 'llm' ? 'llm' : 'local',
      problemId: intervention.problem_id ?? undefined,
      eventId: intervention.event_id ?? undefined,
      level: intervention.intervention_level,
    }
    pet.showBubble(payload)

    this.currentBubbleInterventionId = intervention.intervention_id
    this.currentBubbleEventType = (intervention.trigger_reason.split(' ')[0] as CoachEventType) ?? null
    this.currentBubbleId = payload.id
  }

  private handleContestEnter(info: { platform: string; contestId: string; contestUrl: string; enteredAt: number }): void {
    const pet = this.options.getCoachPetWindow()
    // 切换桌宠到 alert/sleep（不展示气泡）；contest 状态用独立 channel 通知（避免破坏 6 状态）
    pet?.setPetState('sleep')
    pet?.dismissBubble()
    // 通知 renderer 进入比赛模式（独立 channel，renderer 可订阅切换 UI）
    this.options.getMainWindow()?.webContents.send('coach:contestModeChanged', {
      isContestMode: true,
      contest: {
        url: info.contestUrl,
        platform: info.platform,
        contest_id: info.contestId,
        entered_at: new Date(info.enteredAt).toISOString(),
      },
    })

    // 写审计日志：进入比赛（zero_intervention=true，比赛期间无任何干预）
    const intervention = buildCoachIntervention({
      trigger_reason: `contest_enter (${info.platform}:${info.contestId})`,
      intervention_level: 0,
      source_type: 'contest_audit',
      message: `进入比赛页 ${info.contestUrl}，规则引擎硬关闭`,
      is_contest_mode: true,
      contest_url: info.contestUrl,
      contest_start: new Date(info.enteredAt).toISOString(),
      contest_end: null,
      zero_intervention: true,
      user_action: 'shown',
    })
    insertCoachIntervention(intervention)
  }

  private handleContestEnd(info: { platform: string; contestId: string; contestUrl: string; enteredAt: number }, durationSec: number): void {
    const pet = this.options.getCoachPetWindow()
    pet?.setPetState('idle')
    this.options.getMainWindow()?.webContents.send('coach:contestModeChanged', {
      isContestMode: false,
      contest: null,
    })

    // 写审计日志：离开比赛（更新 contest_end）
    const end = new Date().toISOString()
    const intervention = buildCoachIntervention({
      trigger_reason: `contest_end (${info.platform}:${info.contestId}, ${durationSec}s)`,
      intervention_level: 0,
      source_type: 'contest_audit',
      message: `离开比赛页 ${info.contestUrl}，规则引擎恢复。建议复盘 / upsolve。`,
      is_contest_mode: false,
      contest_url: info.contestUrl,
      contest_start: new Date(info.enteredAt).toISOString(),
      contest_end: end,
      zero_intervention: true,
      user_action: 'shown',
    })
    insertCoachIntervention(intervention)

    // 赛后提示复盘/upsolve（仅赛后，非应用退出场景）
    pet?.setPetState('alert')
    pet?.showBubble({
      id: crypto.randomUUID(),
      title: '比赛结束',
      message: `比赛已结束（${durationSec}s）。要不要进入复盘 / upsolve 模式？`,
      source: 'local',
      level: 1,
    })
  }

  private clearCurrentBubble(): void {
    this.currentBubbleInterventionId = null
    this.currentBubbleEventType = null
    this.currentBubbleId = null
  }

  private loadSuppressedTypes(): Set<CoachEventType> {
    return getNeverTodayEventTypes(todayBeijing())
  }

  private computeMetricsSince(): string {
    const d = new Date()
    d.setDate(d.getDate() - METRICS_LOOKBACK_DAYS)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}T00:00:00.000`
  }
}

function bubbleTitleFor(intervention: CoachIntervention): string {
  if (intervention.source_type === 'contest_audit') return '比赛模式'
  if (intervention.intervention_level >= 4) return '策略提示'
  if (intervention.intervention_level >= 2) return '元认知提示'
  return '提醒'
}
