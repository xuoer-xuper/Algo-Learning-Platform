import { exportAIContext, renderContextAsMarkdown } from '../../ai/contextExporter'
import { getProblemDetail } from '../../db/repositories/problemRepository'
import { getSubmissionsByProblemAsc } from '../../db/repositories/submissionRepository'
import type { ProblemSession } from '../types'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'
import type { CoachEvent, CoachInterventionLevel } from '../types'
import type { LlmHintRequestContext } from './LlmHintTypes'

/**
 * 上下文数据采集器。
 *
 * 从数据库 + 内存会话状态中聚合 LLM 需要的上下文：
 * - 题目信息（problems 表 + 当前 constraints 缓存 + URL）
 * - 会话状态（ProblemSessionTracker）
 * - 提交历史（submissions 表，最近 10 条）
 * - 用户画像（ai_context_snapshots 最新快照）
 * - 完整学习者画像 Markdown（exportAIContext + renderContextAsMarkdown）
 *   含错题、待复习、标签统计、趋势、最近活动
 *
 * session 为 null 时返回默认上下文（空题目 + 用户画像 + 学习者画像），
 * 确保 LLM 即使在未打开题目时也能正常对话。
 */
export class ContextGatherer {
  /**
   * 采集完整上下文。
   *
   * @param event 触发事件
   * @param session 当前题目会话（可能为 null）
   * @param constraints 当前题目约束（可能为 null）
   * @param targetLevel 目标提示等级
   * @param userExplicitAsk 用户是否主动请求更深提示
   * @param problemUrl 当前题目 URL（可能为 null）
   */
  collect(
    event: CoachEvent,
    session: ProblemSession | null,
    constraints: ProblemConstraints | null,
    targetLevel: CoachInterventionLevel,
    userExplicitAsk: boolean,
    problemUrl?: string | null,
  ): LlmHintRequestContext {
    // 采集完整学习者画像 Markdown（含错题/待复习/标签统计/趋势）
    const learnerProfileMd = this.loadLearnerProfileMarkdown()

    // session 为 null 时返回默认上下文（仍可对话）
    if (!session) {
      return {
        problem: {
          platform: '',
          problem_id: '',
          title: '',
          difficulty: null,
          statement: null,
          constraints: null,
          tags: [],
          url: problemUrl ?? null,
        },
        session: {
          attempt_duration_sec: 0,
          active_seconds: 0,
          detected_stuck_level: 'reading',
          phase: 'idle',
        },
        submissions: [],
        learner_profile_md: learnerProfileMd,
        hint_request: {
          target_level: targetLevel,
          event_type: event.event_type,
          user_explicit_ask: userExplicitAsk,
          verdict: event.evidence.verdict,
        },
      }
    }

    // 1. 题目信息
    const problem = session.problem_id ? getProblemDetail(session.problem_id) : null
    const problemInfo = {
      platform: session.platform,
      problem_id: session.platform_problem_id,
      title: problem?.title ?? session.platform_problem_id,
      difficulty: null as string | null,
      statement: null,
      constraints,
      tags: [] as string[],
      url: problemUrl ?? problem?.canonical_url ?? null,
    }

    // 2. 会话状态
    const attemptDurationSec = session.active_seconds
    const stuckLevel = this.deriveStuckLevel(session)

    // 3. 提交历史（最近 10 条）
    let submissions: LlmHintRequestContext['submissions'] = []
    if (session.problem_id) {
      try {
        const rows = getSubmissionsByProblemAsc(session.problem_id)
        submissions = rows.slice(-10).map((s) => ({
          verdict: s.verdict,
          language: s.language,
          runtime_ms: s.runtime_ms,
          submitted_at: s.submitted_at,
        }))
      } catch {
        submissions = []
      }
    }

    return {
      problem: problemInfo,
      session: {
        attempt_duration_sec: attemptDurationSec,
        active_seconds: session.active_seconds,
        detected_stuck_level: stuckLevel,
        phase: session.phase,
      },
      submissions,
      learner_profile_md: learnerProfileMd,
      hint_request: {
        target_level: targetLevel,
        event_type: event.event_type,
        user_explicit_ask: userExplicitAsk,
        verdict: event.evidence.verdict,
      },
    }
  }

  /**
   * 从 ProblemSession 推导卡壳状态。
   */
  private deriveStuckLevel(session: ProblemSession): 'reading' | 'coding' | 'stuck' {
    if (session.phase === 'reading') return 'reading'
    if (session.detected_stuck_level >= 1) return 'stuck'
    return 'coding'
  }

  /**
   * 加载完整学习者画像 Markdown。
   *
   * 调用 exportAIContext() 获取完整上下文（含概览/趋势/错题/待复习/标签统计/最近活动），
   * 再用 renderContextAsMarkdown() 渲染为 Markdown 文本。
   * 失败时返回空字符串。
   */
  private loadLearnerProfileMarkdown(): string {
    try {
      const ctx = exportAIContext()
      return renderContextAsMarkdown(ctx)
    } catch {
      return ''
    }
  }
}
