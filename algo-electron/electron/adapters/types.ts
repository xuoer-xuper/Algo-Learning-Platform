import type { ProblemIdentity, SubmissionData } from '../shared/types'
import type { GenericTableData } from '../submissions/scrapers/GenericTableScanner'

export interface ParseContext {
  url: string
  title?: string
}

export interface SyncContext {
  url?: string
  cookies?: string
  handle?: string
}

export interface TableParseContext {
  now: () => string
}

export interface SubmissionScrapeContext {
  getUrl(): string
  executeScript(code: string): Promise<any>
}

export interface SubmissionDetectionPayload {
  adapterId?: string
  pageUrl: string
  requestUrl?: string
  response?: unknown
  meta?: Record<string, unknown>
  detectedAt?: string
}

export interface SiteAdapter {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  isSpa?: boolean
  injectOnProblemPage?: boolean

  matchProblem(url: string): boolean
  parseProblem(url: string, ctx: ParseContext): Promise<ProblemIdentity | null> | ProblemIdentity | null

  matchSubmissionResult?(url: string): boolean
  injectHookScript?(): string
  parseSubmissionResult?(raw: SubmissionDetectionPayload): SubmissionData | null
  resolveProblemIdentity?(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null
  parseSubmissionTables?(tables: GenericTableData[], ctx: TableParseContext): SubmissionData[]
  scrapeSubmissions?(ctx: SubmissionScrapeContext): Promise<SubmissionData[]>

  syncSubmissions?(ctx: SyncContext): Promise<SubmissionData[]>
}
