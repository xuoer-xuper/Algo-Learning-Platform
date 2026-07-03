import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing, todayBeijing } from '../../../shared/time'
import { AI_CONTEXT_VERSION, exportAIContext } from '../../../ai/contextExporter'
import type { AIContextSnapshot } from './types'
import { getSnapshotRowByDate } from './queries'
import { buildAIContextSnapshotRecord } from './serialization'

export function ensureTodaySnapshot(): AIContextSnapshot {
  const db = getDb()
  const today = todayBeijing()
  const existing = getSnapshotRowByDate(today)

  if (existing) return existing

  const snapshot = buildAIContextSnapshotRecord({
    id: crypto.randomUUID(),
    snapshotDate: today,
    context: exportAIContext(),
    schemaVersion: AI_CONTEXT_VERSION,
    createdAt: nowBeijing(),
  })

  db.prepare(`
    INSERT INTO ai_context_snapshots (id, snapshot_date, context_json, schema_version, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    snapshot.id,
    snapshot.snapshot_date,
    snapshot.context_json,
    snapshot.schema_version,
    snapshot.created_at,
  )

  return snapshot
}
