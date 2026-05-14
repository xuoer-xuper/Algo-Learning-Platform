import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

// /problem/Codeforces-123A
// /problem/POJ-1001
const PROBLEM_PATTERN = /^\/problem\/([A-Za-z]+)-(.+)/

export const vjudgeParser: SiteParser = {
  siteId: 'vjudge',

  match(url: string): boolean {
    try {
      const u = new URL(url)
      return u.hostname === 'vjudge.net' || u.hostname === 'www.vjudge.net'
    } catch {
      return false
    }
  },

  parse(url: string): ProblemIdentity | null {
    try {
      const u = new URL(url)
      const m = u.pathname.match(PROBLEM_PATTERN)
      if (m) {
        const sourceOJ = m[1]
        const problemId = m[2]
        return {
          platform: 'vjudge',
          platformProblemId: `${sourceOJ}-${problemId}`,
          canonicalUrl: `https://vjudge.net/problem/${sourceOJ}-${problemId}`,
          sourcePlatform: sourceOJ,
          sourceProblemId: problemId,
          confidence: 'url',
        }
      }
    } catch {
      // invalid URL
    }
    return null
  },
}
