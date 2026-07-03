export type AIOutputType = 'review_recommendation' | 'review_plan' | 'period_summary' | 'weakness_analysis'

export type AIOutputMetadata = Record<string, unknown>

export interface AIOutput {
  id: string
  output_type: AIOutputType
  title: string | null
  content: string
  content_markdown: string | null
  input_summary_json: string | null
  source_refs_json: string | null
  model_info_json: string | null
  created_at: string
  updated_at: string
}

export interface SaveAIOutputInput {
  output_type: AIOutputType
  title: string
  content: string
  content_markdown?: string
  input_summary?: AIOutputMetadata
  source_refs?: AIOutputMetadata
  model_info?: AIOutputMetadata
}

export type AIOutputUpdateInput = Partial<Pick<AIOutput, 'title' | 'content' | 'content_markdown'>>
