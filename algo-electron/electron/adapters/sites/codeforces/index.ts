import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import type { SiteAdapter, SubmissionDetectionPayload, SyncContext } from '../../types'
import { createCodeforcesRealtimeHookScript } from './hook'
import { matchCodeforcesSubmissionResult, parseCodeforcesProblem } from './problem'
import {
  parseCodeforcesApiSubmission,
  parseCodeforcesRealtimeTablePayload,
  parseCodeforcesSubmissionTables,
  resolveCodeforcesProblemIdentityFromSubmission,
  type CodeforcesSubmission,
} from './submissions'

export const codeforcesAdapter: SiteAdapter = {
  id: 'codeforces',
  name: 'Codeforces',
  domains: ['codeforces.com', 'www.codeforces.com'],
  homeUrl: 'https://codeforces.com',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parseCodeforcesProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseCodeforcesProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchCodeforcesSubmissionResult(url)
  },

  parseSubmissionTables: parseCodeforcesSubmissionTables,

  injectHookScript(): string {
    return createCodeforcesRealtimeHookScript()
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    return parseCodeforcesRealtimeTablePayload(raw)
  },

  resolveProblemIdentity(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    return resolveCodeforcesProblemIdentityFromSubmission(submission, raw)
  },

  async syncSubmissions(ctx: SyncContext): Promise<SubmissionData[]> {
    const handle = ctx.handle?.trim()
    if (!handle) throw new Error('Codeforces handle is required')

    const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Codeforces API error: ${response.status}`)

    const json = await response.json() as { status: string; result?: CodeforcesSubmission[] }
    if (json.status !== 'OK' || !Array.isArray(json.result)) {
      throw new Error('Codeforces API returned non-OK status')
    }

    return json.result.map(parseCodeforcesApiSubmission)
  },
}
