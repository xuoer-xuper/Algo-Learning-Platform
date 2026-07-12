import { getProblemDetail } from '../../db/repositories/problemRepository'
import { getSubmissionsByProblemAsc } from '../../db/repositories/submissionRepository'
import { getLatestSnapshotWithContext } from '../../db/repositories/aiContextSnapshotRepository'
import type { ProblemSession } from '../types'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'
import type { CoachEvent, CoachInterventionLevel } from '../types'
import type { LlmHintRequestContext } from './LlmHintTypes'

/**
 * 上下文数据采集器。
 *
 * 从数据库 + 内存会话状态中聚合 LLM 需要的上下文：
 * - 题目信息（problems 表 + 当前 constraints 缓存）
 * - 会话状态（ProblemSessionTracker）
 * - 提交历史（submissions 表，最近 10 条）
 * - 用户画像（ai_context_snapshots 最新快照）
 *
 * 采集失败时静默降级（返回部分数据），由 LlmHintService 决定是否继续调用。
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
   */
  collect(
    event: CoachEvent,
    session: ProblemSession | null,
    constraints: ProblemConstraints | null,
    targetLevel: CoachInterventionLevel,
    userExplicitAsk: boolean,
  ): LlmHintRequestContext | null {
    if (!session) {
      return null
    }

    // 1. 题目信息
    const problem = session.problem_id ? getProblemDetail(session.problem_id) : null
    const problemInfo = {
      platform: session.platform,
      problem_id: session.platform_problem_id,
      title: problem?.title ?? session.platform_problem_id,
      difficulty: null as string | null, // ProblemDetailRecord 暂无 difficulty 字段
      statement: null, // 题面不存储在 DB，由 LLM 根据题目 ID 自行推断或后续扩展抓取
      constraints,
      tags: [] as string[], // 题目标签（如有 tags 表则查询，当前留空）
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

    // 4. 用户画像（来自最新 AI 上下文快照）
    const userProfile = this.loadUserProfile()

    return {
      problem: problemInfo,
      session: {
        attempt_duration_sec: attemptDurationSec,
        active_seconds: session.active_seconds,
        detected_stuck_level: stuckLevel,
        phase: session.phase,
      },
      submissions,
      user_profile: userProfile,
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
   * 加载用户画像（来自最新 AI 上下文快照）。
   * 快照不存在或解析失败时返回默认值。
   */
  private loadUserProfile(): LlmHintRequestContext['user_profile'] {
    const defaultProfile = {
      total_solved: 0,
      total_submissions: 0,
      ac_rate: 0,
      weak_tags: [] as string[],
      recent_streak_days: 0,
    }

    try {
      const snapshot = getLatestSnapshotWithContext()
      if (!snapshot) return defaultProfile

      const ctx = typeof snapshot.context_json === 'string'
        ? JSON.parse(snapshot.context_json)
        : snapshot.context_json

      const overview = ctx?.overview ?? {}
      const tagStats = ctx?.tag_stats ?? []
      const weakTags = Array.isArray(tagStats)
        ? tagStats
            .filter((t: any) => {
              const total = t.total ?? 0
              const ac = t.ac ?? 0
              return total > 0 && ac / total < 0.7
            })
            .map((t: any) => t.tag)
            .slice(0, 10)
        : []

      return {
        total_solved: overview.total_ac ?? overview.total_solved ?? 0,
        total_submissions: overview.total_submissions ?? 0,
        ac_rate: overview.ac_rate ?? 0,
        weak_tags: weakTags,
        recent_streak_days: overview.recent_streak_days ?? 0,
      }
    } catch {
      return defaultProfile
    }
  }
}
