import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

const EXAM_TYPE_PATTERN = /^\/problem-sets\/(\d+)\/exam\/problems\/type\/\d+/
const PROBLEM_PATTERN = /^\/problem-sets\/(\d+)\/problems\/(\d+)/
const EXAM_PROBLEM_PATTERN = /^\/problem-sets\/(\d+)\/exam\/problems\/(\d+)/

function buildCanonicalUrl(setId: string, problemSetProblemId: string): string {
  return `https://pintia.cn/problem-sets/${setId}/exam/problems/type/7?problemSetProblemId=${problemSetProblemId}`
}

export const ptaParser: SiteParser = {
  siteId: 'pta',

  match(url: string): boolean {
    try {
      const u = new URL(url)
      return u.hostname === 'pintia.cn' || u.hostname === 'www.pintia.cn'
    } catch {
      return false
    }
  },

  parse(url: string): ProblemIdentity | null {
    try {
      const u = new URL(url)

      if (EXAM_TYPE_PATTERN.test(u.pathname)) {
        const setIdMatch = u.pathname.match(/^\/problem-sets\/(\d+)\//)
        const problemSetProblemId = u.searchParams.get('problemSetProblemId')
        if (setIdMatch && problemSetProblemId) {
          const setId = setIdMatch[1]
          return {
            platform: 'pta',
            platformProblemId: `${setId}-${problemSetProblemId}`,
            canonicalUrl: buildCanonicalUrl(setId, problemSetProblemId),
            contestId: setId,
            problemIndex: problemSetProblemId,
            confidence: 'url',
          }
        }
      }

      let m = u.pathname.match(EXAM_PROBLEM_PATTERN)
      if (m) {
        const setId = m[1]
        const problemId = m[2]
        return {
          platform: 'pta',
          platformProblemId: `${setId}-${problemId}`,
          canonicalUrl: buildCanonicalUrl(setId, problemId),
          contestId: setId,
          problemIndex: problemId,
          confidence: 'url',
        }
      }

      m = u.pathname.match(PROBLEM_PATTERN)
      if (m) {
        const setId = m[1]
        const problemId = m[2]
        return {
          platform: 'pta',
          platformProblemId: `${setId}-${problemId}`,
          canonicalUrl: buildCanonicalUrl(setId, problemId),
          contestId: setId,
          problemIndex: problemId,
          confidence: 'url',
        }
      }
    } catch {
      // invalid URL
    }
    return null
  },
}
