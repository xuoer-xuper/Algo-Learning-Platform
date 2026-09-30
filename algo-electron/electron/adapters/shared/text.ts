import { unknownToText } from '../../shared/textCoercion'

export function stripHtml(value: unknown): string {
  // 非字符串走显式取值：null/undefined 沿用空串（与原先 `value ?? ''` 一致），
  // 对象取 JSON 形式，避免落到默认的 `[object Object]` 上。
  return unknownToText(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseRuntimeMs(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(ms|s)?/i)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2]?.toLowerCase() === 's' ? Math.round(value * 1000) : Math.round(value)
}

export function parseMemoryKb(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(kb|mb|kib|mib)\b/i)
    ?? raw.trim().match(/^(\d+(?:\.\d+)?)$/i)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2]?.toLowerCase().startsWith('m') ? Math.round(value * 1024) : Math.round(value)
}

export function extractLanguage(raw: string): string | undefined {
  const value = raw.replace(/\s+/g, ' ').trim()
  const patterns = [
    /(?:^|[^A-Za-z0-9_+])((?:GNU\s+)?C\+\+\s*\d*(?:\s*\([^)]+\))?)(?=$|[^A-Za-z0-9_+])/i,
    /(?:^|[^A-Za-z0-9_])((?:JavaScript|TypeScript|Python\s*\d*|PyPy\s*\d*|Java|Go|Rust|Pascal|GCC|Clang)(?:\s*\([^)]+\))?)(?=$|[^A-Za-z0-9_])/i,
    /(?:^|[^A-Za-z0-9_+])((?:GNU\s+)?C(?:\s*\([^)]+\))?)(?=$|[^A-Za-z0-9_+])/i,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    const language = match?.[1]?.trim().replace(/\s+/g, ' ')
    if (language) return language
  }
  return undefined
}

export function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(header => keywords.some(keyword => header.toLowerCase().includes(keyword.toLowerCase())))
}

