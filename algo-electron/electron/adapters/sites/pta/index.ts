import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import { scrapePta } from '../../../submissions/scrapers/ptaScraper'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import type { SiteAdapter, SubmissionDetectionPayload, SubmissionScrapeContext } from '../../types'
import { buildPtaCanonicalUrl, matchPtaRealtimeCandidateUrl, parsePtaProblem } from './problem'
import {
  createPtaAdapterRealtimeHookScript,
  parsePtaRealtimeSubmission,
  readPtaProblemIdFromSubmission,
} from './submissions'

export const ptaAdapter: SiteAdapter = {
  id: 'pta',
  name: 'PTA',
  domains: ['pintia.cn', 'www.pintia.cn'],
  homeUrl: 'https://pintia.cn',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parsePtaProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parsePtaProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchPtaRealtimeCandidateUrl(url)
  },

  scrapeSubmissions(ctx: SubmissionScrapeContext): Promise<SubmissionData[]> {
    return scrapePta(ctx)
  },

  injectHookScript(): string {
    return createPtaAdapterRealtimeHookScript(this.id)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    return parsePtaRealtimeSubmission(raw)
  },

  resolveProblemIdentity(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const browserTitleIdentity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (browserTitleIdentity) return browserTitleIdentity

    const ptaProblemId = readPtaProblemIdFromSubmission(submission)
    if (ptaProblemId) {
      const [setId, problemId] = ptaProblemId.split('-')
      return {
        platform: this.id,
        platformProblemId: ptaProblemId,
        canonicalUrl: setId && problemId ? buildPtaCanonicalUrl(setId, problemId) : raw.pageUrl,
        contestId: setId,
        problemIndex: problemId,
        confidence: 'url',
      }
    }

    return resolveProblemIdentityFromBrowserTitle(this, raw)
  },
}
