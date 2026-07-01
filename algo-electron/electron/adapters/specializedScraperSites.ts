import type { ProblemIdentity, SubmissionData } from '../shared/types'
import { EXTRACT_LUOGU_SUBMISSIONS_SCRIPT, parseLuoguSubmissionData, scrapeLuogu } from '../submissions/scrapers/luoguScraper'
import { createPtaRealtimeHookScript, parsePtaFrontendVerdictPayload, parsePtaSubmissionData, scrapePta } from '../submissions/scrapers/ptaScraper'
import { createScriptedRealtimeHookScript } from '../submissions/scriptedRealtimeHook'
import { pickFinalRealtimeSubmission } from '../submissions/realtimeSubmissionFilter'
import { resolveProblemIdentityFromBrowserTitle } from './browserTitleIdentity'
import type { SiteAdapter, SubmissionDetectionPayload, SubmissionScrapeContext } from './types'

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

function parseLuoguProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'luogu.com.cn' && parsed.hostname !== 'www.luogu.com.cn') return null

    const match = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_]+)/)
    if (!match) return null

    const problemId = match[1]
    if (problemId.toLowerCase() === 'list') return null

    return {
      platform: 'luogu',
      platformProblemId: problemId,
      canonicalUrl: `https://www.luogu.com.cn/problem/${problemId}`,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

function parseLuoguRawProblemInfo(submission: SubmissionData): { problemId?: string; title?: string } {
  try {
    const raw = JSON.parse(submission.rawJson || '{}')
    return {
      problemId: typeof raw?._luoguProblemId === 'string' && raw._luoguProblemId.trim()
        ? raw._luoguProblemId.trim()
        : undefined,
      title: typeof raw?._luoguProblemTitle === 'string' && raw._luoguProblemTitle.trim()
        ? raw._luoguProblemTitle.trim()
        : undefined,
    }
  } catch {
    return {}
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
    try {
      const parsed = new URL(url)
      return (parsed.hostname === 'luogu.com.cn' || parsed.hostname === 'www.luogu.com.cn')
        && /^\/record\/\d+\/?$/.test(parsed.pathname)
    } catch {
      return false
    }
  },

  scrapeSubmissions(ctx: SubmissionScrapeContext): Promise<SubmissionData[]> {
    return scrapeLuogu(ctx)
  },

  injectHookScript(): string {
    return createScriptedRealtimeHookScript(this.id, EXTRACT_LUOGU_SUBMISSIONS_SCRIPT)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    const response = getResponseRecord(raw)
    if (!response) return null
    return pickFinalRealtimeSubmission(parseLuoguSubmissionData(response, { requireRealtimeReady: true }))
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
        canonicalUrl: `https://www.luogu.com.cn/problem/${rawProblemInfo.problemId}`,
        title: rawProblemInfo.title,
        confidence: 'url',
      }
    }

    return null
  },
}
