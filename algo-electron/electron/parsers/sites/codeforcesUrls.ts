export type CodeforcesUrlKind = 'problemset' | 'contest' | 'gym'

/** 按 Codeforces 页面类型生成可访问的题目链接 */
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

/**
 * API 同步无法区分 gym / 正式赛，使用 problemset 链接最稳妥（避免 Illegal contest ID）。
 */
export function buildCodeforcesProblemUrlFromApi(contestId: string | number, index: string): string {
  return buildCodeforcesProblemUrl(String(contestId), index, 'problemset')
}

export function buildCodeforcesContestUrl(contestId: string, kind: 'gym' | 'contest'): string {
  const base = 'https://codeforces.com'
  return kind === 'gym' ? `${base}/gym/${contestId}` : `${base}/contest/${contestId}`
}

const CF_PROBLEM_PATH =
  /^\/(?:problemset\/problem\/\d+\/[A-Za-z]\d*|(?:contest|gym)\/\d+\/problem\/[A-Za-z]\d*)$/

// 正式赛 ID 通常 < 10000，Gym ID 通常 > 100000
function isGymContestId(contestId: string): boolean {
  return Number(contestId) > 100000
}

/**
 * 将附件页、提交页等非单题链接解析为 gym/contest 主页，避免打开失败。
 */
export function resolveCodeforcesNavigateUrl(url: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('codeforces.com')) return url

    const path = u.pathname.replace(/\/+$/, '') || '/'

    // Gym 题目页不存在，统一跳 attachments
    const gymProblemMatch = path.match(/^\/gym\/(\d+)\/problem\/[A-Za-z]\d*$/)
    if (gymProblemMatch) return `https://codeforces.com/gym/${gymProblemMatch[1]}/attachments`

    // problemset 格式：如果是 Gym ID，跳 attachments
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
