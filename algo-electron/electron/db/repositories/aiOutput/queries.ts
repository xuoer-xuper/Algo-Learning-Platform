import { getDb } from '../../connection'
import type { AIOutput, AIOutputType } from './types'

export function getAIOutput(id: string): AIOutput | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM ai_outputs WHERE id = ?').get(id) as AIOutput | undefined
  return row ?? null
}

export function listAIOutputs(outputType?: AIOutputType, limit = 20): AIOutput[] {
  const db = getDb()
  if (outputType) {
    return db.prepare(`
      SELECT * FROM ai_outputs WHERE output_type = ? ORDER BY created_at DESC LIMIT ?
    `).all(outputType, limit) as AIOutput[]
  }
  return db.prepare(`
    SELECT * FROM ai_outputs ORDER BY created_at DESC LIMIT ?
  `).all(limit) as AIOutput[]
}
