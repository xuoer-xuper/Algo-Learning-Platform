import crypto from 'node:crypto'
import type { SubmissionNotification } from '../submissions/SubmissionWatcherCore'
import type { ProblemIdentity } from '../shared/types'
import type { Verdict } from '../shared/types'
import type {
  CoachEvent,
  CoachEventEvidence,
  CoachEventType,
} from './types'

/**
 * CoachEventBridge：把 SubmissionWatcher 的提交检测通知与
 * TrackingService 的 problem:detected 转换为 CoachEvent，供 RuleEngine 消费。
 *
 * 职责：
 * 1. 订阅 RealtimeSubmissionService.onSubmissionDetected
 * 2. 维护"当前题目会话级"状态：同题累计 WA 次数、verdict 序列
 * 3. 将每次提交 verdict 转为 CoachEvent：
 *    - AC（首次） → first_ac
 *    - WA/TLE/RE/CE → 累计 ≥ 2 触发 multiple_wrong
 *    - 同题相同 verdict 重复 ≥ 2 → same_error
 * 4. 不持久化（由 RuleEngine 决定是否落库）；只产出事件给上游
 *
 * 不依赖 better-sqlite3 / electron BrowserWindow，便于单元测试。
 *
 * 阶段 3 预留：onCoachEvent 是事件输出出口，HintSelector 可订阅。
 */

/** Verdict 是否为"错误"（计入 wrong_count） */
export function isWrongVerdict(verdict: string): boolean {
  const v = verdict.toUpperCase()
  return v === 'WA' || v === 'TLE' || v === 'MLE' || v === 'RE' || v === 'CE' || v === 'PE' || v === 'OLE'
}

/** Verdict 是否为 AC */
export function isAcVerdict(verdict: string): boolean {
  return verdict.toUpperCase() === 'AC'
}

export interface CoachEventBridgeOptions {
  /** 当前题目会话 id 提供者（ProblemSessionTracker.getCurrentSession） */
  getSessionId?: () => string | null
  /** 当前题目 problem_id 提供者（ProblemSessionTracker.getCurrentSession） */
  getProblemId?: () => string | null
  /** 当前题目 rating 提供者（用于难度自适应阈值；阶段 2 可空） */
  getProblemRating?: () => number | null
  /** 当前题目 identity 提供者 */
  getCurrentIdentity?: () => ProblemIdentity | null
  /** 事件输出回调（RuleEngine 订阅） */
  onCoachEvent?: (event: CoachEvent) => void
}

interface ProblemSubmissionState {
  platform: string
  problemKey: string
  verdictHistory: Verdict[]
  wrongCount: number
  /** 是否已收到过 AC（避免重复 first_ac） */
  hadAc: boolean
}

export class CoachEventBridge {
  private readonly options: CoachEventBridgeOptions
  /** 以 platform:problemKey 为键的累计状态 */
  private readonly problemState = new Map<string, ProblemSubmissionState>()
  /** unsubscribe 句柄 */
  private unsubSubmission: (() => void) | null = null

  constructor(options: CoachEventBridgeOptions = {}) {
    this.options = options
  }

  /**
   * 处理一次提交检测结果通知，转换为 0~2 个 CoachEvent：
   * - 任何 verdict → 可能产生 multiple_wrong 或 same_error
   * - AC（首次） → first_ac
   */
  handleSubmission(notification: SubmissionNotification): CoachEvent[] {
    const events: CoachEvent[] = []
    const platform = notification.platform
    const verdict = (notification.verdict || 'UNKNOWN').toUpperCase() as Verdict
    const problemKey = notification.problemId ?? `unknown:${platform}`

    let state = this.problemState.get(problemKey)
    if (!state) {
      state = {
        platform,
        problemKey,
        verdictHistory: [],
        wrongCount: 0,
        hadAc: false,
      }
      this.problemState.set(problemKey, state)
    }

    // 更新累计状态
    state.verdictHistory.push(verdict)
    if (state.verdictHistory.length > 20) {
      // 防止无界增长（超过 20 条只保留最近 20 条）
      state.verdictHistory = state.verdictHistory.slice(-20)
    }
    const previousWrongCount = state.wrongCount
    if (isWrongVerdict(verdict)) {
      state.wrongCount += 1
    }

    const sessionId = this.options.getSessionId?.() ?? null
    const problemId = this.options.getProblemId?.() ?? null
    const rating = this.options.getProblemRating?.() ?? null

    // 1. multiple_wrong：同题累计 WA 类 ≥ 2
    if (isWrongVerdict(verdict) && state.wrongCount >= 2 && previousWrongCount < 2) {
      events.push(this.buildEvent({
        session_id: sessionId,
        event_type: 'multiple_wrong',
        severity: state.wrongCount >= 3 ? 'critical' : 'warn',
        score: 60 + state.wrongCount * 10,
        problem_id: problemId,
        platform,
        evidence: {
          verdict,
          wrong_count: state.wrongCount,
          problem_rating: rating ?? undefined,
        },
      }))
    } else if (isWrongVerdict(verdict) && state.wrongCount >= 2) {
      // 已达到 multiple_wrong 后续仍写一条事件（RuleEngine 内部节流）
      events.push(this.buildEvent({
        session_id: sessionId,
        event_type: 'multiple_wrong',
        severity: state.wrongCount >= 3 ? 'critical' : 'warn',
        score: 60 + state.wrongCount * 10,
        problem_id: problemId,
        platform,
        evidence: {
          verdict,
          wrong_count: state.wrongCount,
          problem_rating: rating ?? undefined,
        },
      }))
    }

    // 2. same_error：同题相同 verdict 连续重复 ≥ 2
    if (state.verdictHistory.length >= 2) {
      const lastTwo = state.verdictHistory.slice(-2)
      if (lastTwo[0] === lastTwo[1] && lastTwo[0] === verdict && isWrongVerdict(verdict)) {
        // 计算相同 verdict 连续重复次数
        let repeat = 0
        for (let i = state.verdictHistory.length - 1; i >= 0; i--) {
          if (state.verdictHistory[i] === verdict) repeat++
          else break
        }
        if (repeat >= 2) {
          events.push(this.buildEvent({
            session_id: sessionId,
            event_type: 'same_error',
            severity: repeat >= 3 ? 'critical' : 'warn',
            score: 55 + repeat * 10,
            problem_id: problemId,
            platform,
            evidence: {
              verdict,
              same_verdict_repeat: repeat,
              problem_rating: rating ?? undefined,
            },
          }))
        }
      }
    }

    // 3. first_ac：同题首次 AC
    if (isAcVerdict(verdict) && !state.hadAc) {
      state.hadAc = true
      events.push(this.buildEvent({
        session_id: sessionId,
        event_type: 'first_ac',
        severity: 'info',
        score: 30,
        problem_id: problemId,
        platform,
        evidence: {
          verdict,
          problem_rating: rating ?? undefined,
        },
      }))
    }

    // 派发给上游
    for (const ev of events) {
      this.options.onCoachEvent?.(ev)
    }
    return events
  }

  /**
   * 处理 problem:detected（来自 TrackingService）。
   * 不清空 problemState：同题切换 tab 后再回来时累计仍应保留，
   * 由 problemKey 自然区分不同题。
   * identity 保留在签名中以供阶段 3 HintSelector 使用。
   */
  handleProblemDetected(_identity: ProblemIdentity): void {
    // 阶段 2：identity 暂不消费；阶段 3 可基于 identity 选提示模板
  }

  /**
   * 订阅 RealtimeSubmissionService 的提交检测出口。
   * 返回 unsubscribe 函数。
   */
  attach(subscribe: (cb: (n: SubmissionNotification) => void) => () => void): () => void {
    this.unsubSubmission = subscribe((n) => {
      this.handleSubmission(n)
    })
    return () => this.detach()
  }

  detach(): void {
    if (this.unsubSubmission) {
      this.unsubSubmission()
      this.unsubSubmission = null
    }
  }

  /** 仅供测试：重置内部状态 */
  resetForTest(): void {
    this.problemState.clear()
  }

  /** 仅供测试：读取某题的累计状态 */
  getProblemStateForTest(problemKey: string): ProblemSubmissionState | undefined {
    return this.problemState.get(problemKey)
  }

  private buildEvent(input: {
    session_id: string | null
    event_type: CoachEventType
    severity: CoachEvent['severity']
    score: number
    problem_id: string | null
    platform: string
    evidence: CoachEventEvidence
  }): CoachEvent {
    return {
      event_id: crypto.randomUUID(),
      session_id: input.session_id,
      event_type: input.event_type,
      severity: input.severity,
      score: input.score,
      problem_id: input.problem_id,
      platform: input.platform,
      evidence: input.evidence,
      created_at: nowIsoLocal(),
    }
  }
}

// 系统本地时间字符串（与 shared/time.nowBeijing 同语义）
function nowIsoLocal(): string {
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
