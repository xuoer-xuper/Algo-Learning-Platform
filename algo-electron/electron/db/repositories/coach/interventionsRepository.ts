import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type {
  CoachIntervention,
  CoachInterventionLevel,
  CoachInterventionSourceType,
  CoachInterventionUserAction,
} from '../../../coach/types'

/**
 * Coach 干预与比赛模式审计 repository。
 *
 * 同一张表（coach_interventions）承载两种数据：
 * 1. 普通干预（source_type = local_rule / local_hint / llm）
 * 2. 比赛模式审计（source_type = 'contest_audit'，记录零介入事实）
 *
 * 写入：insertCoachIntervention / insertContestAudit。
 * 查询：getCoachIntervention / listCoachInterventions / listContestAuditRecords / 聚合计数。
 *
 * 比赛模式审计记录的 contest_start/contest_end/zero_intervention 字段是合规卖点，
 * 通过 listContestAuditRecords 导出（coach:exportAuditLog）。
 */

interface CoachInterventionRow {
  intervention_id: string
  event_id: string | null
  trigger_reason: string
  intervention_level: number
  source_type: string
  message: string
  related_tags_json: string | null
  user_action: string
  problem_id: string | null
  platform: string | null
  session_id: string | null
  created_at: string
  is_contest_mode: number
  contest_url: string | null
  contest_start: string | null
  contest_end: string | null
  zero_intervention: number
}

export function insertCoachIntervention(
  intervention: CoachIntervention,
): CoachIntervention {
  const db = getDb()
  db.prepare(`
    INSERT OR IGNORE INTO coach_interventions
      (intervention_id, event_id, trigger_reason, intervention_level,
       source_type, message, related_tags_json, user_action,
       problem_id, platform, session_id, created_at,
       is_contest_mode, contest_url, contest_start, contest_end, zero_intervention)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    intervention.intervention_id,
    intervention.event_id,
    intervention.trigger_reason,
    intervention.intervention_level,
    intervention.source_type,
    intervention.message,
    JSON.stringify(intervention.related_tags),
    intervention.user_action,
    intervention.problem_id,
    intervention.platform,
    intervention.session_id,
    intervention.created_at,
    intervention.is_contest_mode ? 1 : 0,
    intervention.contest_url,
    intervention.contest_start,
    intervention.contest_end,
    intervention.zero_intervention ? 1 : 0,
  )
  return intervention
}

export function buildCoachIntervention(input: {
  event_id?: string | null
  trigger_reason: string
  intervention_level: CoachInterventionLevel
  source_type: CoachInterventionSourceType
  message: string
  related_tags?: string[]
  user_action?: CoachInterventionUserAction
  problem_id?: string | null
  platform?: string | null
  session_id?: string | null
  is_contest_mode?: boolean
  contest_url?: string | null
  contest_start?: string | null
  contest_end?: string | null
  zero_intervention?: boolean
}): CoachIntervention {
  return {
    intervention_id: crypto.randomUUID(),
    event_id: input.event_id ?? null,
    trigger_reason: input.trigger_reason,
    intervention_level: input.intervention_level,
    source_type: input.source_type,
    message: input.message,
    related_tags: input.related_tags ?? [],
    user_action: input.user_action ?? 'shown',
    problem_id: input.problem_id ?? null,
    platform: input.platform ?? null,
    session_id: input.session_id ?? null,
    created_at: nowBeijing(),
    is_contest_mode: input.is_contest_mode ?? false,
    contest_url: input.contest_url ?? null,
    contest_start: input.contest_start ?? null,
    contest_end: input.contest_end ?? null,
    zero_intervention: input.zero_intervention ?? false,
  }
}

export function updateInterventionUserAction(
  interventionId: string,
  action: CoachInterventionUserAction,
): boolean {
  const db = getDb()
  const result = db.prepare(
    'UPDATE coach_interventions SET user_action = ? WHERE intervention_id = ?',
  ).run(action, interventionId)
  return result.changes > 0
}

export function getCoachIntervention(
  interventionId: string,
): CoachIntervention | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM coach_interventions WHERE intervention_id = ?')
    .get(interventionId) as CoachInterventionRow | undefined
  return row ? deserializeIntervention(row) : null
}

export function listCoachInterventions(limit = 50): CoachIntervention[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT * FROM coach_interventions ORDER BY created_at DESC LIMIT ?',
    )
    .all(limit) as CoachInterventionRow[]
  return rows.map(deserializeIntervention)
}

export function listCoachInterventionsSince(
  since: string,
  limit = 500,
): CoachIntervention[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT * FROM coach_interventions WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(since, limit) as CoachInterventionRow[]
  return rows.map(deserializeIntervention)
}

/**
 * 列出某道题的全部干预记录（按时间升序，含比赛审计），供阶段 4 时间轴复盘使用。
 * 数据来自现有 coach_interventions 表，不新增采集。
 */
export function listCoachInterventionsByProblem(
  problemId: string,
  limit = 500,
): CoachIntervention[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT * FROM coach_interventions WHERE problem_id = ? ORDER BY created_at ASC LIMIT ?',
    )
    .all(problemId, limit) as CoachInterventionRow[]
  return rows.map(deserializeIntervention)
}

export function countCoachInterventionsSince(since: string): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM coach_interventions
       WHERE created_at >= ? AND source_type != 'contest_audit'`,
    )
    .get(since) as { n: number }
  return row.n
}

export function countUserActionSince(
  action: CoachInterventionUserAction,
  since: string,
): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM coach_interventions
       WHERE created_at >= ? AND user_action = ? AND source_type != 'contest_audit'`,
    )
    .get(since, action) as { n: number }
  return row.n
}

// --- 比赛模式审计日志 ---

export interface ContestAuditRow {
  audit_id: string
  contest_url: string
  platform: string
  contest_id: string
  contest_start: string
  contest_end: string
  duration_seconds: number
  zero_intervention: boolean
  had_any_intervention: boolean
  exported_at: string
}

export function listContestAuditRecords(since?: string): ContestAuditRow[] {
  const db = getDb()
  const rows = (since
    ? db
        .prepare(
          `SELECT * FROM coach_interventions
           WHERE source_type = 'contest_audit' AND created_at >= ?
           ORDER BY contest_start ASC`,
        )
        .all(since)
    : db
        .prepare(
          `SELECT * FROM coach_interventions
           WHERE source_type = 'contest_audit'
           ORDER BY contest_start ASC`,
        )
        .all()) as CoachInterventionRow[]

  return rows.map((row) => {
    const start = row.contest_start ?? row.created_at
    const end = row.contest_end ?? row.created_at
    const duration = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000))
    return {
      audit_id: row.intervention_id,
      contest_url: row.contest_url ?? '',
      platform: row.platform ?? '',
      contest_id: extractContestId(row.contest_url),
      contest_start: start,
      contest_end: end,
      duration_seconds: duration,
      zero_intervention: row.zero_intervention === 1,
      had_any_intervention: row.zero_intervention === 0,
      exported_at: nowBeijing(),
    }
  })
}

export function countContestAuditSince(since: string): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM coach_interventions
       WHERE source_type = 'contest_audit' AND created_at >= ?`,
    )
    .get(since) as { n: number }
  return row.n
}

export function sumContestSecondsSince(since: string): number {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT contest_start, contest_end FROM coach_interventions
       WHERE source_type = 'contest_audit' AND created_at >= ?
         AND contest_start IS NOT NULL AND contest_end IS NOT NULL`,
    )
    .all(since) as { contest_start: string; contest_end: string }[]
  let total = 0
  for (const r of rows) {
    const start = Date.parse(r.contest_start)
    const end = Date.parse(r.contest_end)
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      total += Math.floor((end - start) / 1000)
    }
  }
  return total
}

function deserializeIntervention(row: CoachInterventionRow): CoachIntervention {
  return {
    intervention_id: row.intervention_id,
    event_id: row.event_id,
    trigger_reason: row.trigger_reason,
    intervention_level: row.intervention_level as CoachInterventionLevel,
    source_type: row.source_type as CoachInterventionSourceType,
    message: row.message,
    related_tags: parseTags(row.related_tags_json),
    user_action: row.user_action as CoachInterventionUserAction,
    problem_id: row.problem_id,
    platform: row.platform,
    session_id: row.session_id,
    created_at: row.created_at,
    is_contest_mode: row.is_contest_mode === 1,
    contest_url: row.contest_url,
    contest_start: row.contest_start,
    contest_end: row.contest_end,
    zero_intervention: row.zero_intervention === 1,
  }
}

function parseTags(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function extractContestId(url: string | null): string {
  if (!url) return ''
  // CF /contest/{id}，洛谷 /contest/{id}
  const match = url.match(/\/contest\/(\w+)/)
  return match ? match[1] : ''
}
