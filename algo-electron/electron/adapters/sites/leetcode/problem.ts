import type { ProblemIdentity } from '../../../shared/types'

const LEETCODE_DOMAINS = ['leetcode.cn', 'www.leetcode.cn']

export function extractLeetcodeTitleSlugFromUrl(url: string): string | undefined {
  try {
    const match = new URL(url).pathname.match(/^\/problems\/([^/]+)\/?/)
    return match?.[1] ? decodeURIComponent(match[1]) : undefined
  } catch {
    return undefined
  }
}

export function matchLeetcodeProblem(url: string): boolean {
  try {
    const parsed = new URL(url)
    return LEETCODE_DOMAINS.includes(parsed.hostname) && /^\/problems\/[^/]+\/?$/.test(parsed.pathname)
  } catch {
    return false
  }
}

export function parseLeetcodeProblem(url: string): ProblemIdentity | null {
  const titleSlug = extractLeetcodeTitleSlugFromUrl(url)
  if (!titleSlug || !matchLeetcodeProblem(url)) return null

  return {
    platform: 'leetcode-cn',
    platformProblemId: titleSlug,
    canonicalUrl: `https://leetcode.cn/problems/${titleSlug}/`,
    confidence: 'url',
  }
}

export function matchLeetcodeSubmissionResult(url: string): boolean {
  return /\/submissions\/(?:detail\/)?\d+(?:\/check)?\/?/.test(url) || /\/graphql\/?/.test(url)
}
