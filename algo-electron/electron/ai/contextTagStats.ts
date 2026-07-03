import { getDb } from '../db/connection'
import { parseTagsJson } from './recommendations/tagParsing'
import type { ContextTagAggregate, ContextTagStat } from './contextTypes'

interface TaggedProblemRow {
  id: string
  tags_json: string | null
  status: 'solved' | 'attempted' | 'visited'
}

export function aggregateContextTagStats(): ContextTagStat[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT p.id, p.tags_json,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE 'visited'
      END as status
    FROM problems p
    WHERE p.deleted_at IS NULL AND p.tags_json IS NOT NULL AND p.tags_json != '[]' AND p.tags_json != ''
  `).all() as TaggedProblemRow[]

  const tagMap = new Map<string, ContextTagAggregate>()
  for (const row of rows) {
    for (const tag of parseTagsJson(row.tags_json)) {
      if (!tagMap.has(tag)) tagMap.set(tag, { total: 0, solved: 0, attempted: 0 })
      const entry = tagMap.get(tag)!
      entry.total++
      if (row.status === 'solved') entry.solved++
      else if (row.status === 'attempted') entry.attempted++
    }
  }

  return Array.from(tagMap.entries())
    .map(([tag, value]) => ({
      tag,
      total: value.total,
      solved: value.solved,
      attempted: value.attempted,
      ac_rate: value.total > 0 ? Math.round((value.solved / value.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}
