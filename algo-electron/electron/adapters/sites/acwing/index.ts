import type { ProblemIdentity } from '../../../shared/types'
import type { SiteAdapter, SubmissionDetectionPayload, TableParseContext } from '../../types'
import type { GenericTableData } from '../../../submissions/scrapers/GenericTableScanner'
import { resolveProblemIdentityFromBrowserTitle } from '../../browserTitleIdentity'
import {
  createFrontendVerdictHookScript,
  parseFrontendVerdictPayload,
  parseRealtimeTablePayload,
  scanBestTable,
} from '../../shared/genericSubmission'

function parseAcwingProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'www.acwing.com' && parsed.hostname !== 'acwing.com') return null

    const match = parsed.pathname.match(/^\/problem\/content\/(?:description\/|submission\/)?(\d+)\/?/)
    if (!match) return null

    const id = match[1]
    return {
      platform: 'acwing',
      platformProblemId: id,
      canonicalUrl: `https://www.acwing.com/problem/content/${id}/`,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

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
    try {
      const parsed = new URL(url)
      return (parsed.hostname === 'www.acwing.com' || parsed.hostname === 'acwing.com')
        && /^\/problem\/submission\/\d+\/?$/.test(parsed.pathname)
    } catch {
      return false
    }
  },

  parseSubmissionTables(tables: GenericTableData[], ctx: TableParseContext) {
    return scanBestTable(tables, 'acwing', 'ac', ctx)
  },

  injectHookScript(): string {
    return createFrontendVerdictHookScript(this.id)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload) {
    const frontendSubmission = parseFrontendVerdictPayload(raw, this.id, 'ac')
    if (frontendSubmission) return frontendSubmission
    return parseRealtimeTablePayload(raw, this.parseSubmissionTables!.bind(this))
  },

  resolveProblemIdentity(_submission, raw): ProblemIdentity | null {
    return resolveProblemIdentityFromBrowserTitle(this, raw)
  },
}
