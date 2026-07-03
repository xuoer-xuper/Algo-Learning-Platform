import type { ProblemIdentity } from '../../../shared/types'

export function parseLuoguProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'luogu.com.cn' && parsed.hostname !== 'www.luogu.com.cn') return null

    const match = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_]+)/)
    if (!match) return null

    const problemId = match[1]
    if (problemId.toLowerCase() === 'list') return null

    return {
      platform: 'luogu',
      platformProblemId: problemId,
      canonicalUrl: buildLuoguProblemUrl(problemId),
      confidence: 'url',
    }
  } catch {
    return null
  }
}

export function buildLuoguProblemUrl(problemId: string): string {
  return `https://www.luogu.com.cn/problem/${problemId}`
}

export function matchLuoguSubmissionResult(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.hostname === 'luogu.com.cn' || parsed.hostname === 'www.luogu.com.cn')
      && /^\/record\/\d+\/?$/.test(parsed.pathname)
  } catch {
    return false
  }
}
