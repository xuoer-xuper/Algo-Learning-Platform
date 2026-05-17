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
      return `${base}/gym/${contestId}/problem/${index}`
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

/**
 * 将附件页、提交页等非单题链接解析为 gym/contest 主页，避免打开失败。
 */
export function resolveCodeforcesNavigateUrl(url: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('codeforces.com')) return url

    const path = u.pathname.replace(/\/+$/, '') || '/'
    if (CF_PROBLEM_PATH.test(path)) return url

    const gymMatch = path.match(/^\/gym\/(\d+)(?:\/.*)?$/)
    if (gymMatch) return buildCodeforcesContestUrl(gymMatch[1], 'gym')

    const contestMatch = path.match(/^\/contest\/(\d+)(?:\/.*)?$/)
    if (contestMatch) return buildCodeforcesContestUrl(contestMatch[1], 'contest')

    return url
  } catch {
    return url
  }
}
