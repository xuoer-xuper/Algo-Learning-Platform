// P6-004 扩展：每日 AI 上下文快照 repository
// 应用启动时调用 ensureTodaySnapshot()，若当日尚无快照则生成一份入库
// AI 模块（阶段总结/复习计划等）可通过 getSnapshotByDate/listSnapshots 读取历史快照
import crypto from 'node:crypto'
import { getDb } from '../connection'
import { nowBeijing, todayBeijing } from '../../shared/time'
import { exportAIContext, AI_CONTEXT_VERSION } from '../../ai/contextExporter'

export interface AIContextSnapshot {
  id: string
  snapshot_date: string
  context_json: string
  schema_version: number
  created_at: string
}

/**
 * 确保当日快照存在：若不存在则生成一份入库，已存在则跳过
 * 返回当日快照
 */
export function ensureTodaySnapshot(): AIContextSnapshot {
  const db = getDb()
  const today = todayBeijing()

  const existing = db.prepare(
    `SELECT * FROM ai_context_snapshots WHERE snapshot_date = ?`
  ).get(today) as AIContextSnapshot | undefined

  if (existing) return existing

  const ctx = exportAIContext()
  const snapshot: AIContextSnapshot = {
    id: crypto.randomUUID(),
    snapshot_date: today,
    context_json: JSON.stringify(ctx),
    schema_version: AI_CONTEXT_VERSION,
    created_at: nowBeijing(),
  }

  db.prepare(`
    INSERT INTO ai_context_snapshots (id, snapshot_date, context_json, schema_version, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(snapshot.id, snapshot.snapshot_date, snapshot.context_json, snapshot.schema_version, snapshot.created_at)

  return snapshot
}

/** 按日期读取快照（解析后的 JSON 对象） */
export function getSnapshotByDate(date: string): any | null {
  const db = getDb()
  const row = db.prepare(
    `SELECT * FROM ai_context_snapshots WHERE snapshot_date = ?`
  ).get(date) as AIContextSnapshot | undefined
  if (!row) return null
  return { ...row, context: JSON.parse(row.context_json) }
}

/** 列出最近 N 天的快照（仅元数据，不含 context_json） */
export function listSnapshots(limit = 30): Array<Omit<AIContextSnapshot, 'context_json'>> {
  const db = getDb()
  return db.prepare(
    `SELECT id, snapshot_date, schema_version, created_at
     FROM ai_context_snapshots
     ORDER BY snapshot_date DESC
     LIMIT ?`
  ).all(limit) as Array<Omit<AIContextSnapshot, 'context_json'>>
}
