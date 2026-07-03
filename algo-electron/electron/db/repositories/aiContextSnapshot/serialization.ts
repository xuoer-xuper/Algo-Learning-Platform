import type { AIContextExport } from '../../../ai/contextExporter'
import type { AIContextSnapshot, AIContextSnapshotWithContext } from './types'

export function buildAIContextSnapshotRecord(options: {
  id: string
  snapshotDate: string
  context: AIContextExport
  schemaVersion: number
  createdAt: string
}): AIContextSnapshot {
  return {
    id: options.id,
    snapshot_date: options.snapshotDate,
    context_json: JSON.stringify(options.context),
    schema_version: options.schemaVersion,
    created_at: options.createdAt,
  }
}

export function attachParsedContext(snapshot: AIContextSnapshot): AIContextSnapshotWithContext {
  return {
    ...snapshot,
    context: JSON.parse(snapshot.context_json) as AIContextExport,
  }
}
