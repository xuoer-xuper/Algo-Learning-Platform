import type { ProblemIdentity } from '../../../shared/types'
import type { SiteAdapter } from '../../types'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import { matchAcwingSubmissionResult, parseAcwingProblem } from './problem'
import {
  createAcwingRealtimeHookScript,
  parseAcwingRealtimeSubmission,
  parseAcwingSubmissionTables,
} from './submissions'

export const acwingAdapter: SiteAdapter = {
  id: 'acwing',
  name: 'AcWing',
  domains: ['acwing.com', 'www.acwing.com'],
  homeUrl: 'https://www.acwing.com',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parseAcwingProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseAcwingProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchAcwingSubmissionResult(url)
  },

  parseSubmissionTables: parseAcwingSubmissionTables,

  injectHookScript(): string {
    return createAcwingRealtimeHookScript()
  },

  parseSubmissionResult: parseAcwingRealtimeSubmission,

  resolveProblemIdentity(_submission, raw): ProblemIdentity | null {
    return resolveProblemIdentityFromBrowserTitle(this, raw)
  },
}
