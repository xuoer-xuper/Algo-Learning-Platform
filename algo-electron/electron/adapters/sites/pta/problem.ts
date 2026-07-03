import type { ProblemIdentity } from '../../../shared/types'

export function buildPtaCanonicalUrl(setId: string, problemSetProblemId: string): string {
  return `https://pintia.cn/problem-sets/${setId}/exam/problems/type/7?problemSetProblemId=${problemSetProblemId}`
}

export function parsePtaProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'pintia.cn' && parsed.hostname !== 'www.pintia.cn') return null

    const typeMatch = parsed.pathname.match(/^\/problem-sets\/(\d+)\/(?:exam\/)?problems\/type\/\d+/)
    const typeProblemId = parsed.searchParams.get('problemSetProblemId')
      ?? parsed.searchParams.get('problemId')
    if (typeMatch && typeProblemId) {
      const setId = typeMatch[1]
      return {
        platform: 'pta',
        platformProblemId: `${setId}-${typeProblemId}`,
        canonicalUrl: buildPtaCanonicalUrl(setId, typeProblemId),
        contestId: setId,
        problemIndex: typeProblemId,
        confidence: 'url',
      }
    }

    const problemMatch = parsed.pathname.match(/^\/problem-sets\/(\d+)\/(?:exam\/problems|exam-problems|problems)\/(\d+)/)
    if (!problemMatch) return null

    const setId = problemMatch[1]
    const problemId = problemMatch[2]
    return {
      platform: 'pta',
      platformProblemId: `${setId}-${problemId}`,
      canonicalUrl: buildPtaCanonicalUrl(setId, problemId),
      contestId: setId,
      problemIndex: problemId,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

export function matchPtaRealtimeCandidateUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'pintia.cn' && parsed.hostname !== 'www.pintia.cn') return false
    if (/^\/submissions\/\d+\/?$/.test(parsed.pathname)) return true
    return /^\/problem-sets\/\d+(?:\/.*)?$/.test(parsed.pathname)
  } catch {
    return false
  }
}
