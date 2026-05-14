import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

// /problem/content/123/
// /problem/content/description/123/
const PATTERNS = [
  /^\/problem\/content\/(?:description\/)?(\d+)\/?/,
]

export const acwingParser: SiteParser = {
  siteId: 'acwing',

  match(url: string): boolean {
    try {
      const u = new URL(url)
      return u.hostname === 'www.acwing.com' || u.hostname === 'acwing.com'
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
          const id = m[1]
          return {
            platform: 'acwing',
            platformProblemId: id,
            canonicalUrl: `https://www.acwing.com/problem/content/${id}/`,
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
