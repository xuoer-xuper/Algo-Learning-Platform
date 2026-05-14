import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

// /problemset/problem/123/A
// /contest/123/problem/A
// /gym/123/problem/A
const PATTERNS = [
  /^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/,
  /^\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/,
  /^\/gym\/(\d+)\/problem\/([A-Za-z]\d*)/,
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
      for (const pattern of PATTERNS) {
        const m = u.pathname.match(pattern)
        if (m) {
          const contestId = m[1]
          const index = m[2]
          return {
            platform: 'codeforces',
            platformProblemId: `${contestId}${index}`,
            canonicalUrl: `https://codeforces.com/contest/${contestId}/problem/${index}`,
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
