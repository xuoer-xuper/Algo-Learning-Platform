import type { AIOutput, AIOutputMetadata, SaveAIOutputInput } from './types'

function stringifyMetadata(value: AIOutputMetadata | undefined): string | null {
  return value ? JSON.stringify(value) : null
}

export function buildAIOutputRecord(id: string, now: string, input: SaveAIOutputInput): AIOutput {
  return {
    id,
    output_type: input.output_type,
    title: input.title,
    content: input.content,
    content_markdown: input.content_markdown || null,
    input_summary_json: stringifyMetadata(input.input_summary),
    source_refs_json: stringifyMetadata(input.source_refs),
    model_info_json: stringifyMetadata(input.model_info),
    created_at: now,
    updated_at: now,
  }
}
