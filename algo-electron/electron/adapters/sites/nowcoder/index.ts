import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import type { SiteAdapter, SubmissionDetectionPayload } from '../../types'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import { createNowcoderJudgeStatusHookScript } from './hook'
import { matchNowcoderSubmissionResult, parseNowcoderProblem } from './problem'
import { parseNowcoderJudgeStatusPayload } from './submissions'
import { parseNowcoderSubmissionTables } from './tables'

export const nowcoderAdapter: SiteAdapter = {
  id: 'nowcoder',
  name: 'Nowcoder',
  domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'],
  homeUrl: 'https://www.nowcoder.com',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    if (parseNowcoderProblem(url) !== null) return true
    try {
      const parsed = new URL(url)
      return parsed.hostname === 'ac.nowcoder.com'
        && /^\/acm\/contest\/\d+\/(?!status|rank|ranking|submission|submissions|view-submission)[^/]+\/?$/i.test(parsed.pathname)
    } catch {
      return false
    }
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseNowcoderProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchNowcoderSubmissionResult(url)
  },

  parseSubmissionTables(tables, ctx): SubmissionData[] {
    return parseNowcoderSubmissionTables(tables, ctx)
  },

  injectHookScript(): string {
    return createNowcoderJudgeStatusHookScript()
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload) {
    if (!parseNowcoderProblem(raw.pageUrl)) return null
    // Nowcoder realtime capture is network-result driven. DOM popups and
    // realtime table scans are too similar to self-test panels and history views.
    return parseNowcoderJudgeStatusPayload(raw)
  },

  resolveProblemIdentity(submission, raw): ProblemIdentity | null {
    const identity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (identity) return identity

    const problemLetter = (submission as SubmissionData & { _ncProbLetter?: unknown })._ncProbLetter
    const contestMatch = raw.pageUrl.match(/\/contest\/(\d+)/)
    if (contestMatch && typeof problemLetter === 'string' && problemLetter.trim()) {
      const contestId = contestMatch[1]
      const problemIndex = problemLetter.trim()
      return {
        platform: this.id,
        platformProblemId: `contest-${contestId}-${problemIndex}`,
        canonicalUrl: `https://ac.nowcoder.com/acm/contest/${contestId}/${problemIndex}`,
        contestId,
        problemIndex,
        confidence: 'url',
      }
    }

    return null
  },
}
