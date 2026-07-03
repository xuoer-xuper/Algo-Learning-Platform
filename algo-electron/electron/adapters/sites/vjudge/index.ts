import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import type { SiteAdapter, SubmissionDetectionPayload, TableParseContext } from '../../types'
import {
  scanBestTable,
} from '../../shared/genericSubmission'
import {
  attachVjudgeRawProblemContext,
  matchVjudgeProblem,
  matchVjudgeSubmissionResult,
  parseVjudgeProblem,
} from './problem'
import { parseVjudgeSolutionData, parseVjudgeStatusData } from './submissions'
import { createVjudgeStatusHookScript } from './hook'

export const vjudgeAdapter: SiteAdapter = {
  id: 'vjudge',
  name: 'VJudge',
  domains: ['vjudge.net', 'www.vjudge.net'],
  homeUrl: 'https://vjudge.net',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return matchVjudgeProblem(url)
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseVjudgeProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchVjudgeSubmissionResult(url)
  },

  parseSubmissionTables(tables, ctx: TableParseContext): SubmissionData[] {
    return scanBestTable(tables, 'vjudge', 'vj', ctx)
      .map(attachVjudgeRawProblemContext)
  },

  injectHookScript(): string {
    return createVjudgeStatusHookScript()
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    // VJudge problem pages submit inside a modal. Realtime writes stay
    // network-driven: either the modal's solution JSON is final, or a
    // status/data row has been associated with the current formal submit intent.
    return parseVjudgeSolutionData(raw) ?? parseVjudgeStatusData(raw)
  },

  resolveProblemIdentity(_submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const identity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (identity) return identity

    try {
      const parsed = new URL(raw.pageUrl)
      const contestMatch = parsed.pathname.match(/\/contest\/(\d+)/)
      const problemLetter = parsed.hash.match(/#status\/[^/]+\/([A-Za-z0-9]+)/)?.[1]
        ?? parsed.hash.match(/#problem\/([A-Za-z0-9]+)/)?.[1]
      if (contestMatch && problemLetter) {
        const contestId = contestMatch[1]
        return {
          platform: this.id,
          platformProblemId: `contest-${contestId}-${problemLetter}`,
          canonicalUrl: `https://vjudge.net/contest/${contestId}#problem/${problemLetter}`,
          contestId,
          problemIndex: problemLetter,
          confidence: 'url',
        }
      }
    } catch { /* ignore */ }

    return null
  },
}
