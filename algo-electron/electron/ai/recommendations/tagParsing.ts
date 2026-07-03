export function parseTagsJson(tagsJson: string | null | undefined): string[] {
  if (!tagsJson) return []
  try {
    const parsed: unknown = JSON.parse(tagsJson)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((tag): tag is string => typeof tag === 'string')
      .map(tag => tag.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}
