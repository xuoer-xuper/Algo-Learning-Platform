import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type {
  CoachEvent,
  CoachEventEvidence,
  CoachEventType,
} from '../../../coach/types'

/**
 * Coach 事件 repository。
 *
 * 写入：insertCoachEvent（幂等按 event_id 主键去重）。
 * 查询：getCoachEvent / listCoachEvents / listCoachEventsByType / countCoachEventsSince。
 *
 * 不做网络请求、不持有 Electron session；只通过 getDb() 读写。
 * evidence 字段以 JSON 文本存储，读出时自动反序列化。
 */

interface CoachEventRow {
  event_id: string
  session_id: string | null
  event_type: string
  severity: string
  score: number
  problem_id: string | null
  platform: string | null
  evidence_json: string | null
  created_at: string
}

export function insertCoachEvent(event: CoachEvent): CoachEvent {
  const db = getDb()
  db.prepare(`
    INSERT OR IGNORE INTO coach_events
      (event_id, session_id, event_type, severity, score, problem_id, platform, evidence_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.event_id,
    event.session_id,
    event.event_type,
    event.severity,
    event.score,
    event.problem_id,
    event.platform,
    JSON.stringify(event.evidence),
    event.created_at,
  )
  return event
}

export function buildCoachEvent(input: {
  session_id?: string | null
  event_type: CoachEventType
  severity: CoachEvent['severity']
  score: number
  problem_id?: string | null
  platform?: string | null
  evidence: CoachEventEvidence
}): CoachEvent {
  return {
    event_id: crypto.randomUUID(),
    session_id: input.session_id ?? null,
    event_type: input.event_type,
    severity: input.severity,
    score: input.score,
    problem_id: input.problem_id ?? null,
    platform: input.platform ?? null,
    evidence: input.evidence,
    created_at: nowBeijing(),
  }
}

export function getCoachEvent(eventId: string): CoachEvent | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM coach_events WHERE event_id = ?').get(eventId) as
    | CoachEventRow
    | undefined
  return row ? deserializeCoachEvent(row) : null
}

export function listCoachEvents(limit = 50): CoachEvent[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM coach_events ORDER BY created_at DESC LIMIT ?',
  ).all(limit) as CoachEventRow[]
  return rows.map(deserializeCoachEvent)
}

export function listCoachEventsByType(
  eventType: CoachEventType,
  limit = 50,
): CoachEvent[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM coach_events WHERE event_type = ? ORDER BY created_at DESC LIMIT ?',
  ).all(eventType, limit) as CoachEventRow[]
  return rows.map(deserializeCoachEvent)
}

export function listCoachEventsSince(since: string, limit = 500): CoachEvent[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM coach_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?',
  ).all(since, limit) as CoachEventRow[]
  return rows.map(deserializeCoachEvent)
}

export function countCoachEventsSince(since: string): number {
  const db = getDb()
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM coach_events WHERE created_at >= ?',
  ).get(since) as { n: number }
  return row.n
}

/**
 * 列出某道题的全部 Coach 事件（按时间升序），供阶段 4 时间轴复盘使用。
 * 数据全部来自现有 coach_events 表，不新增采集。
 */
export function listCoachEventsByProblem(
  problemId: string,
  limit = 500,
): CoachEvent[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM coach_events WHERE problem_id = ? ORDER BY created_at ASC LIMIT ?',
  ).all(problemId, limit) as CoachEventRow[]
  return rows.map(deserializeCoachEvent)
}

export function countCoachEventsByTypeSince(
  since: string,
): Record<CoachEventType, number> {
  const db = getDb()
  const rows = db.prepare(
    `SELECT event_type, COUNT(*) AS n
     FROM coach_events
     WHERE created_at >= ?
     GROUP BY event_type`,
  ).all(since) as { event_type: string; n: number }[]
  const result = {} as Record<CoachEventType, number>
  for (const row of rows) {
    result[row.event_type as CoachEventType] = row.n
  }
  return result
}

export function getLastEventAt(): string | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT created_at FROM coach_events ORDER BY created_at DESC LIMIT 1',
  ).get() as { created_at: string } | undefined
  return row?.created_at ?? null
}

function deserializeCoachEvent(row: CoachEventRow): CoachEvent {
  return {
    event_id: row.event_id,
    session_id: row.session_id,
    event_type: row.event_type as CoachEventType,
    severity: row.severity as CoachEvent['severity'],
    score: row.score,
    problem_id: row.problem_id,
    platform: row.platform,
    evidence: parseEvidence(row.evidence_json),
    created_at: row.created_at,
  }
}

function parseEvidence(json: string | null): CoachEventEvidence {
  if (!json) return {}
  try {
    return JSON.parse(json) as CoachEventEvidence
  } catch {
    return {}
  }
}
