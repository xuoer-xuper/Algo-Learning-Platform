import type { ProblemIdentity } from '../../../shared/types'

export function parseAcwingProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'www.acwing.com' && parsed.hostname !== 'acwing.com') return null

    const match = parsed.pathname.match(/^\/problem\/content\/(?:description\/|submission\/)?(\d+)\/?/)
    if (!match) return null

    const id = match[1]
    return {
      platform: 'acwing',
      platformProblemId: id,
      canonicalUrl: `https://www.acwing.com/problem/content/${id}/`,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

export function matchAcwingSubmissionResult(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.hostname === 'www.acwing.com' || parsed.hostname === 'acwing.com')
      && /^\/problem\/submission\/\d+\/?$/.test(parsed.pathname)
  } catch {
    return false
  }
}
