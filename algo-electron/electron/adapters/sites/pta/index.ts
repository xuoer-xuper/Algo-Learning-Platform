import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import {
  createPtaRealtimeHookScript,
  parsePtaFrontendVerdictPayload,
  parsePtaSubmissionData,
  scrapePta,
} from '../../../submissions/scrapers/ptaScraper'
import { pickFinalRealtimeSubmission } from '../../../submissions/realtimeSubmissionFilter'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import type { SiteAdapter, SubmissionDetectionPayload, SubmissionScrapeContext } from '../../types'

function getResponseRecord(raw: SubmissionDetectionPayload): Record<string, unknown> | null {
  return raw.response && typeof raw.response === 'object'
    ? raw.response as Record<string, unknown>
    : null
}

function buildPtaCanonicalUrl(setId: string, problemSetProblemId: string): string {
  return `https://pintia.cn/problem-sets/${setId}/exam/problems/type/7?problemSetProblemId=${problemSetProblemId}`
}

function parsePtaProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'pintia.cn' && parsed.hostname !== 'www.pintia.cn') return null

    const typeMatch = parsed.pathname.match(/^\/problem-sets\/(\d+)\/(?:exam\/)?problems\/type\/\d+/)
    const typeProblemId = parsed.searchParams.get('problemSetProblemId')
      ?? parsed.searchParams.get('problemId')
    if (typeMatch && typeProblemId) {
      const setId = typeMatch[1]
      return {
        platform: 'pta',
        platformProblemId: `${setId}-${typeProblemId}`,
        canonicalUrl: buildPtaCanonicalUrl(setId, typeProblemId),
        contestId: setId,
        problemIndex: typeProblemId,
        confidence: 'url',
      }
    }

    const problemMatch = parsed.pathname.match(/^\/problem-sets\/(\d+)\/(?:exam\/problems|exam-problems|problems)\/(\d+)/)
    if (!problemMatch) return null

    const setId = problemMatch[1]
    const problemId = problemMatch[2]
    return {
      platform: 'pta',
      platformProblemId: `${setId}-${problemId}`,
      canonicalUrl: buildPtaCanonicalUrl(setId, problemId),
      contestId: setId,
      problemIndex: problemId,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

function isPtaRealtimeCandidateUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'pintia.cn' && parsed.hostname !== 'www.pintia.cn') return false
    if (/^\/submissions\/\d+\/?$/.test(parsed.pathname)) return true
    return /^\/problem-sets\/\d+(?:\/.*)?$/.test(parsed.pathname)
  } catch {
    return false
  }
}

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
    return isPtaRealtimeCandidateUrl(url)
  },

  scrapeSubmissions(ctx: SubmissionScrapeContext): Promise<SubmissionData[]> {
    return scrapePta(ctx)
  },

  injectHookScript(): string {
    return createPtaRealtimeHookScript(this.id)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    const frontendSubmission = parsePtaFrontendVerdictPayload(raw)
    if (frontendSubmission) return frontendSubmission

    const response = getResponseRecord(raw)
    if (!response) return null
    return pickFinalRealtimeSubmission(parsePtaSubmissionData(raw.pageUrl, response))
  },

  resolveProblemIdentity(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const browserTitleIdentity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (browserTitleIdentity) return browserTitleIdentity

    try {
      const ptaProblemId = JSON.parse(submission.rawJson || '{}')?._ptaProblemId
      if (typeof ptaProblemId === 'string' && ptaProblemId.trim()) {
        const [setId, problemId] = ptaProblemId.split('-')
        return {
          platform: this.id,
          platformProblemId: ptaProblemId,
          canonicalUrl: setId && problemId
            ? `https://pintia.cn/problem-sets/${setId}/exam/problems/type/7?problemSetProblemId=${problemId}`
            : raw.pageUrl,
          contestId: setId,
          problemIndex: problemId,
          confidence: 'url',
        }
      }
    } catch { /* ignore */ }

    return resolveProblemIdentityFromBrowserTitle(this, raw)
  },
}
