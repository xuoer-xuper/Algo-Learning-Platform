import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { AIOutput, AIOutputUpdateInput, SaveAIOutputInput } from './types'
import { buildAIOutputRecord } from './serialization'
import { getAIOutput } from './queries'

export function saveAIOutput(input: SaveAIOutputInput): AIOutput {
  const db = getDb()
  const output = buildAIOutputRecord(crypto.randomUUID(), nowBeijing(), input)

  db.prepare(`
    INSERT INTO ai_outputs (id, output_type, title, content, content_markdown,
      input_summary_json, source_refs_json, model_info_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    output.id,
    output.output_type,
    output.title,
    output.content,
    output.content_markdown,
    output.input_summary_json,
    output.source_refs_json,
    output.model_info_json,
    output.created_at,
    output.updated_at,
  )

  return output
}

export function deleteAIOutput(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM ai_outputs WHERE id = ?').run(id)
  return result.changes > 0
}

export function updateAIOutput(id: string, updates: AIOutputUpdateInput): AIOutput | null {
  const db = getDb()
  const now = nowBeijing()

  const sets: string[] = []
  const params: Array<string | null> = []

  if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
  if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
  if (updates.content_markdown !== undefined) { sets.push('content_markdown = ?'); params.push(updates.content_markdown) }

  if (sets.length === 0) return getAIOutput(id)

  sets.push('updated_at = ?')
  params.push(now)
  params.push(id)

  db.prepare(`UPDATE ai_outputs SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getAIOutput(id)
}
