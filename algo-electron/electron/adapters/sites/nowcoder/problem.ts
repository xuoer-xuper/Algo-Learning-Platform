import type { ProblemIdentity } from '../../../shared/types'

export function parseNowcoderProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname

    if (parsed.hostname === 'www.nowcoder.com' || parsed.hostname === 'nowcoder.com') {
      const match = path.match(/^\/(?:practice|questionTerminal)\/([a-f0-9-]+)/)
      if (!match) return null

      return {
        platform: 'nowcoder',
        platformProblemId: match[1],
        canonicalUrl: parsed.origin + parsed.pathname,
        confidence: 'url',
      }
    }

    if (parsed.hostname !== 'ac.nowcoder.com') return null

    const problemMatch = path.match(/^\/acm\/problem\/(\d+)/)
    if (problemMatch) {
      return {
        platform: 'nowcoder',
        platformProblemId: problemMatch[1],
        canonicalUrl: parsed.origin + parsed.pathname,
        confidence: 'url',
      }
    }

    const contestMatch = path.match(/^\/acm\/contest\/(\d+)\/(?!status|rank|ranking|submission|submissions|view-submission)([^/]+)\/?$/i)
    if (!contestMatch) return null

    const contestId = contestMatch[1]
    const index = decodeURIComponent(contestMatch[2])
    return {
      platform: 'nowcoder',
      platformProblemId: `contest-${contestId}-${index}`,
      canonicalUrl: parsed.origin + parsed.pathname,
      contestId,
      problemIndex: index,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

export function matchNowcoderSubmissionResult(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'ac.nowcoder.com'
      && (
        /^\/acm\/contest\/view-submission\/?$/i.test(parsed.pathname)
        || /^\/acm\/contest\/\d+\/submission\/\d+\/?$/i.test(parsed.pathname)
      )
  } catch {
    return false
  }
}
