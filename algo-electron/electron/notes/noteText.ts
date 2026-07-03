// 中英文混排估算：英文按词，中文按字。用于列表展示，不作为严格字数统计。
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length
  const words = (trimmed.match(/[a-zA-Z0-9]+/g) || []).length
  return cjk + words
}
