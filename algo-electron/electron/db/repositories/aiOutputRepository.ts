// P6-009: AI 输出 repository
// 保存/查询/删除 AI 生成的阶段总结、复习计划、复习建议等
// 不涉及核心事实表（problems/submissions/notes）的修改
import crypto from 'node:crypto'
import { getDb } from '../connection'
import { nowBeijing } from '../../shared/time'

export type AIOutputType = 'review_recommendation' | 'review_plan' | 'period_summary' | 'weakness_analysis'

export interface AIOutput {
  id: string
  output_type: AIOutputType
  title: string | null
  content: string         // JSON 格式的结构化内容
  content_markdown: string | null  // Markdown 渲染
  input_summary_json: string | null  // 输入摘要（来源快照、参数等）
  source_refs_json: string | null     // 题目、提交、统计引用
  model_info_json: string | null      // 模型信息（本地规则引擎版本等）
  created_at: string
  updated_at: string
}

export interface SaveAIOutputInput {
  output_type: AIOutputType
  title: string
  content: string              // 结构化 JSON
  content_markdown?: string    // Markdown 渲染
  input_summary?: Record<string, any>
  source_refs?: Record<string, any>
  model_info?: Record<string, any>
}

export function saveAIOutput(input: SaveAIOutputInput): AIOutput {
  const db = getDb()
  const now = nowBeijing()
  const id = crypto.randomUUID()

  const output: AIOutput = {
    id,
    output_type: input.output_type,
    title: input.title,
    content: input.content,
    content_markdown: input.content_markdown || null,
    input_summary_json: input.input_summary ? JSON.stringify(input.input_summary) : null,
    source_refs_json: input.source_refs ? JSON.stringify(input.source_refs) : null,
    model_info_json: input.model_info ? JSON.stringify(input.model_info) : null,
    created_at: now,
    updated_at: now,
  }

  db.prepare(`
    INSERT INTO ai_outputs (id, output_type, title, content, content_markdown,
      input_summary_json, source_refs_json, model_info_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    output.id, output.output_type, output.title, output.content,
    output.content_markdown, output.input_summary_json, output.source_refs_json,
    output.model_info_json, output.created_at, output.updated_at
  )

  return output
}

export function getAIOutput(id: string): AIOutput | null {
  const db = getDb()
  return (db.prepare(`SELECT * FROM ai_outputs WHERE id = ?`).get(id) as AIOutput | undefined) || null
}

export function listAIOutputs(
  outputType?: AIOutputType,
  limit = 20
): AIOutput[] {
  const db = getDb()
  if (outputType) {
    return db.prepare(
      `SELECT * FROM ai_outputs WHERE output_type = ? ORDER BY created_at DESC LIMIT ?`
    ).all(outputType, limit) as AIOutput[]
  }
  return db.prepare(
    `SELECT * FROM ai_outputs ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as AIOutput[]
}

export function deleteAIOutput(id: string): boolean {
  const db = getDb()
  const result = db.prepare(`DELETE FROM ai_outputs WHERE id = ?`).run(id)
  return result.changes > 0
}

export function updateAIOutput(
  id: string,
  updates: Partial<Pick<AIOutput, 'title' | 'content' | 'content_markdown'>>
): AIOutput | null {
  const db = getDb()
  const now = nowBeijing()

  const sets: string[] = []
  const params: any[] = []

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
