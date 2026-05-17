import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'
import { buildCodeforcesProblemUrl, type CodeforcesUrlKind } from './codeforcesUrls'

const PATTERNS: { pattern: RegExp; kind: CodeforcesUrlKind }[] = [
  { pattern: /^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/, kind: 'problemset' },
  { pattern: /^\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/, kind: 'contest' },
  { pattern: /^\/gym\/(\d+)\/problem\/([A-Za-z]\d*)/, kind: 'gym' },
]

export const codeforcesParser: SiteParser = {
  siteId: 'codeforces',

  match(url: string): boolean {
    try {
      const u = new URL(url)
      return u.hostname === 'codeforces.com' || u.hostname === 'www.codeforces.com'
    } catch {
      return false
    }
  },

  parse(url: string): ProblemIdentity | null {
    try {
      const u = new URL(url)
      for (const { pattern, kind } of PATTERNS) {
        const m = u.pathname.match(pattern)
        if (m) {
          const contestId = m[1]
          const index = m[2]
          return {
            platform: 'codeforces',
            platformProblemId: `${contestId}${index}`,
            canonicalUrl: buildCodeforcesProblemUrl(contestId, index, kind),
            contestId,
            problemIndex: index,
            confidence: 'url',
          }
        }
      }
    } catch {
      // invalid URL
    }
    return null
  },
}
