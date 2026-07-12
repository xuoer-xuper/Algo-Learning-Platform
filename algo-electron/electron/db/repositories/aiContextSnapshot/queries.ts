import { getDb } from '../../connection'
import type { AIContextSnapshot, AIContextSnapshotMetadata, AIContextSnapshotWithContext } from './types'
import { attachParsedContext } from './serialization'

export function getSnapshotRowByDate(date: string): AIContextSnapshot | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT * FROM ai_context_snapshots WHERE snapshot_date = ?
  `).get(date) as AIContextSnapshot | undefined
  return row ?? null
}

export function getSnapshotByDate(date: string): AIContextSnapshotWithContext | null {
  const row = getSnapshotRowByDate(date)
  return row ? attachParsedContext(row) : null
}

export function listSnapshots(limit = 30): AIContextSnapshotMetadata[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, snapshot_date, schema_version, created_at
    FROM ai_context_snapshots
    ORDER BY snapshot_date DESC
    LIMIT ?
  `).all(limit) as AIContextSnapshotMetadata[]
}

export function getLatestSnapshotWithContext(): AIContextSnapshotWithContext | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT * FROM ai_context_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get() as AIContextSnapshot | undefined
  return row ? attachParsedContext(row) : null
}
