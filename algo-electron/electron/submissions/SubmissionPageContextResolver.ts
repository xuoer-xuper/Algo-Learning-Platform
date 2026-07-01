import type { ProblemIdentity, SubmissionData } from '../shared/types'

export interface SubmissionPageContext {
  pageProblemId?: string
  pageProblemIdentity?: ProblemIdentity | null
}

export interface SubmissionPageContextResolverDeps {
  parseUrl(url: string): ProblemIdentity | null
  findNowcoderProblemBySearch(search: string): string | undefined
}

export function resolveSubmissionPageContext(
  url: string,
  submissions: SubmissionData[],
  deps: SubmissionPageContextResolverDeps,
): SubmissionPageContext {
  const pageProblemIdentity = deps.parseUrl(url)
  let pageProblemId = pageProblemIdentity?.platformProblemId

  if (!pageProblemId && url.includes('vjudge.net')) {
    pageProblemId = resolveVjudgeProblemId(url)
  }

  if (!pageProblemId && url.includes('nowcoder.com')) {
    pageProblemId = resolveNowcoderProblemId(url, submissions, deps)
  }

  if (!pageProblemId && url.includes('pintia.cn')) {
    hydrateRawProblemId(submissions, '_ptaProblemId')
  }

  if (!pageProblemId && url.includes('luogu.com.cn')) {
    hydrateRawProblemId(submissions, '_luoguProblemId')
  }

  return { pageProblemId, pageProblemIdentity }
}

function resolveVjudgeProblemId(url: string): string | undefined {
  try {
    const parsed = new URL(url)

    if (url.includes('/contest/')) {
      const hashMatch = parsed.hash.match(/#status\/[^/]+\/([A-Za-z0-9]+)/)
      const contestMatch = url.match(/\/contest\/(\d+)/)
      if (hashMatch && contestMatch) {
        return `contest-${contestMatch[1]}-${hashMatch[1]}`
      }
    }

    if (url.includes('/status')) {
      const hash = decodeURIComponent(parsed.hash)
      const ojMatch = hash.match(/OJId=([^&]+)/)
      const probMatch = hash.match(/probNum=([^&]+)/)
      if (ojMatch && probMatch) {
        return `${ojMatch[1]}-${probMatch[1]}`
      }
    }
  } catch { /* ignore */ }

  return undefined
}

function resolveNowcoderProblemId(
  url: string,
  submissions: SubmissionData[],
  deps: SubmissionPageContextResolverDeps,
): string | undefined {
  const contestMatch = url.match(/\/contest\/(\d+)/)
  if (contestMatch) {
    const contestId = contestMatch[1]
    const letters = Array.from(new Set(
      submissions
        .map(submission => (submission as any)?._ncProbLetter)
        .filter((letter): letter is string => typeof letter === 'string' && letter.trim().length > 0)
        .map(letter => letter.trim()),
    ))

    for (const submission of submissions) {
      if ((submission as any)._ncProbLetter) {
        ;(submission as any)._ncContestId = contestId
      }
    }

    if (letters.length === 1) {
      return `contest-${contestId}-${letters[0]}`
    }
  }

  try {
    const parsed = new URL(url)
    const search = parsed.searchParams.get('search')
    if (!search || !/^\d+$/.test(search)) return undefined

    return deps.findNowcoderProblemBySearch(search) ?? `nc-${search}`
  } catch { /* ignore */ }

  return undefined
}

function hydrateRawProblemId(submissions: SubmissionData[], field: '_ptaProblemId' | '_luoguProblemId'): void {
  for (const submission of submissions) {
    try {
      const raw = JSON.parse(submission.rawJson || '{}')
      if (raw[field]) {
        ;(submission as any)[field] = raw[field]
      }
    } catch { /* ignore */ }
  }
}
