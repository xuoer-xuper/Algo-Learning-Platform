import type { ProblemIdentity } from '../shared/types'
import { isValidScrapedTitle } from './titleValidation'

export type ParseProblemUrl = (url: string) => ProblemIdentity | null

export interface BrowserTitleCleanOptions {
  platform?: string
  platformProblemId?: string
  problemIndex?: string
}

const SITE_BRANDS = [
  '力扣',
  'LeetCode',
  'Codeforces',
  'AcWing',
  '牛客',
  'Nowcoder',
  'Virtual Judge',
  'VJudge',
  'PTA',
  '拼题A',
  '洛谷',
  'Luogu',
]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripTrailingSiteBrand(value: string): string {
  let title = value
  const brandPattern = SITE_BRANDS.map(escapeRegex).join('|')
  for (let i = 0; i < 4; i++) {
    const next = title.replace(new RegExp(`\\s*[-–—|_]\\s*[^-–—|_]*(${brandPattern})[^-–—|_]*$`, 'i'), '').trim()
    if (next === title || !next) break
    title = next
  }
  return normalizeWhitespace(title)
}

function stripLeadingToken(value: string, token: string | undefined): string {
  if (!token?.trim()) return value
  const escaped = escapeRegex(token.trim())
  return value
    .replace(new RegExp(`^${escaped}(?:\\s*[.．、:：-]\\s*|\\s+)`, 'i'), '')
    .trim()
}

function isPlatformNoiseTitle(title: string, options: BrowserTitleCleanOptions): boolean {
  if (options.platform === 'pta' && /题目列表|题集|problem\s*list/i.test(title)) return true
  if (/^(编程题|函数题|选择题)\s*[-–—|_]\s*题目列表/i.test(title)) return true
  return false
}

export function cleanBrowserProblemTitle(
  title: string | null | undefined,
  options: BrowserTitleCleanOptions = {},
): string | null {
  if (!title) return null

  let cleaned = normalizeWhitespace(title)
  if (isPlatformNoiseTitle(cleaned, options)) return null
  cleaned = stripTrailingSiteBrand(cleaned)
  cleaned = cleaned.replace(/^\d+\.\s*/, '').trim()
  cleaned = stripLeadingToken(cleaned, options.platformProblemId)
  cleaned = stripLeadingToken(cleaned, options.problemIndex)

  return isValidScrapedTitle(cleaned) ? cleaned : null
}

export function resolveBrowserTitleProblemIdentity(
  url: string,
  title: string | null | undefined,
  parseUrl: ParseProblemUrl,
): ProblemIdentity | null {
  const identity = parseUrl(url)
  if (!identity) return null

  const cleanedTitle = cleanBrowserProblemTitle(title, {
    platform: identity.platform,
    platformProblemId: identity.platformProblemId,
    problemIndex: identity.problemIndex,
  })
  if (!cleanedTitle) return null

  return { ...identity, title: cleanedTitle }
}
