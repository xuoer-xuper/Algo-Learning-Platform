export type CodeforcesUrlKind = 'problemset' | 'contest' | 'gym'

export function buildCodeforcesProblemUrl(
  contestId: string,
  index: string,
  kind: CodeforcesUrlKind,
): string {
  const base = 'https://codeforces.com'
  switch (kind) {
    case 'gym':
      return `${base}/gym/${contestId}/attachments`
    case 'contest':
      return `${base}/contest/${contestId}/problem/${index}`
    case 'problemset':
      return `${base}/problemset/problem/${contestId}/${index}`
  }
}

export function buildCodeforcesProblemUrlFromApi(contestId: string | number, index: string): string {
  return buildCodeforcesProblemUrl(String(contestId), index, 'problemset')
}

export function buildCodeforcesContestUrl(contestId: string, kind: 'gym' | 'contest'): string {
  const base = 'https://codeforces.com'
  return kind === 'gym' ? `${base}/gym/${contestId}` : `${base}/contest/${contestId}`
}

const CF_PROBLEM_PATH =
  /^\/(?:problemset\/problem\/\d+\/[A-Za-z]\d*|(?:contest|gym)\/\d+\/problem\/[A-Za-z]\d*)$/

function isGymContestId(contestId: string): boolean {
  return Number(contestId) > 100000
}

export function resolveCodeforcesNavigateUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('codeforces.com')) return url

    const path = parsed.pathname.replace(/\/+$/, '') || '/'

    const gymProblemMatch = path.match(/^\/gym\/(\d+)\/problem\/[A-Za-z]\d*$/)
    if (gymProblemMatch) return `https://codeforces.com/gym/${gymProblemMatch[1]}/attachments`

    const problemsetMatch = path.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)$/)
    if (problemsetMatch) {
      if (isGymContestId(problemsetMatch[1])) {
        return `https://codeforces.com/gym/${problemsetMatch[1]}/attachments`
      }
      return url
    }

    if (CF_PROBLEM_PATH.test(path)) return url

    const gymMatch = path.match(/^\/gym\/(\d+)(?:\/.*)?$/)
    if (gymMatch) return `https://codeforces.com/gym/${gymMatch[1]}/attachments`

    const contestMatch = path.match(/^\/contest\/(\d+)(?:\/.*)?$/)
    if (contestMatch) return buildCodeforcesContestUrl(contestMatch[1], 'contest')

    return url
  } catch {
    return url
  }
}
