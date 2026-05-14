import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

// /problem/Codeforces-123A
// /problem/POJ-1001
// /contest/809557#problem/A
const PROBLEM_PATTERN = /^\/problem\/([A-Za-z]+)-(.+)/
const CONTEST_PATTERN = /^\/contest\/(\d+)/

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

      // /problem/Codeforces-123A
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

      // /contest/809557#problem/A
      const cm = u.pathname.match(CONTEST_PATTERN)
      if (cm) {
        const contestId = cm[1]
        const hash = u.hash // #problem/A
        const problemLetter = hash.match(/#problem\/([A-Za-z0-9]+)/)?.[1] || ''
        return {
          platform: 'vjudge',
          platformProblemId: problemLetter ? `contest-${contestId}-${problemLetter}` : `contest-${contestId}`,
          canonicalUrl: url,
          contestId,
          problemIndex: problemLetter || undefined,
          confidence: 'url',
        }
      }
    } catch {
      // invalid URL
    }
    return null
  },
}
