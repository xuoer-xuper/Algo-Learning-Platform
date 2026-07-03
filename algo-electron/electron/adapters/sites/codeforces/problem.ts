import type { ProblemIdentity } from '../../../shared/types'
import { buildCodeforcesProblemUrl, type CodeforcesUrlKind } from './urls'

const PROBLEM_PATTERNS: { pattern: RegExp; kind: CodeforcesUrlKind }[] = [
  { pattern: /^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/, kind: 'problemset' },
  { pattern: /^\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/, kind: 'contest' },
  { pattern: /^\/gym\/(\d+)\/problem\/([A-Za-z]\d*)/, kind: 'gym' },
]

export function parseCodeforcesProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'codeforces.com' && parsed.hostname !== 'www.codeforces.com') return null

    for (const { pattern, kind } of PROBLEM_PATTERNS) {
      const match = parsed.pathname.match(pattern)
      if (!match) continue

      const contestId = match[1]
      const index = match[2]
      return {
        platform: 'codeforces',
        platformProblemId: `${contestId}${index}`,
        canonicalUrl: buildCodeforcesProblemUrl(contestId, index, kind),
        contestId,
        problemIndex: index,
        confidence: 'url',
      }
    }
  } catch {
    return null
  }
  return null
}

export function matchCodeforcesSubmissionResult(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'codeforces.com' && parsed.hostname !== 'www.codeforces.com') return false
    return /^\/(?:contest|gym)\/\d+\/submission\/\d+\/?$/.test(parsed.pathname)
      || /^\/(?:contest|gym)\/\d+\/my\/?$/.test(parsed.pathname)
      || /^\/(?:contest|gym)\/\d+\/status(?:\/[A-Za-z]\d*)?\/?$/.test(parsed.pathname)
      || /^\/submissions\/[^/]+\/?$/.test(parsed.pathname)
      || /^\/problemset\/status\/?$/.test(parsed.pathname)
  } catch {
    return false
  }
}
