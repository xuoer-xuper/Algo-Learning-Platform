import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import { scrapeLuogu } from '../../../submissions/scrapers/luoguScraper'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import type { SiteAdapter, SubmissionDetectionPayload, SubmissionScrapeContext } from '../../types'
import { buildLuoguProblemUrl, matchLuoguSubmissionResult, parseLuoguProblem } from './problem'
import {
  createLuoguRealtimeHookScript,
  parseLuoguRawProblemInfo,
  parseLuoguRealtimeSubmission,
} from './submissions'

export const luoguAdapter: SiteAdapter = {
  id: 'luogu',
  name: 'Luogu',
  domains: ['luogu.com.cn', 'www.luogu.com.cn'],
  homeUrl: 'https://www.luogu.com.cn',
  isSpa: true,
  injectOnProblemPage: false,

  matchProblem(url: string): boolean {
    return parseLuoguProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseLuoguProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchLuoguSubmissionResult(url)
  },

  scrapeSubmissions(ctx: SubmissionScrapeContext): Promise<SubmissionData[]> {
    return scrapeLuogu(ctx)
  },

  injectHookScript(): string {
    return createLuoguRealtimeHookScript(this.id)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    return parseLuoguRealtimeSubmission(raw)
  },

  resolveProblemIdentity(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const rawProblemInfo = parseLuoguRawProblemInfo(submission)
    const browserTitleIdentity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (browserTitleIdentity) {
      return {
        ...browserTitleIdentity,
        title: browserTitleIdentity.title ?? rawProblemInfo.title,
      }
    }

    if (rawProblemInfo.problemId) {
      return {
        platform: this.id,
        platformProblemId: rawProblemInfo.problemId,
        canonicalUrl: buildLuoguProblemUrl(rawProblemInfo.problemId),
        title: rawProblemInfo.title,
        confidence: 'url',
      }
    }

    return null
  },
}
