import type { AIContextExport } from '../../../ai/contextExporter'

export interface AIContextSnapshot {
  id: string
  snapshot_date: string
  context_json: string
  schema_version: number
  created_at: string
}

export type AIContextSnapshotMetadata = Omit<AIContextSnapshot, 'context_json'>

export interface AIContextSnapshotWithContext extends AIContextSnapshot {
  context: AIContextExport
}
