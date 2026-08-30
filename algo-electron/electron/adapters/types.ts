import type { ProblemIdentity, ScrapedSubmission } from '../shared/types'
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
  /**
   * 抓取路径统一返回 `ScrapedSubmission`：站点解析时顺手拿到的题目线索
   * （`_luoguProblemId` 一类）要一路带到 `SubmissionProblemAttacher` 才被消费。
   * 声明成 `SubmissionData` 会在这里就把线索类型抹掉，下游只能靠 `as any` 捞回来。
   */
  parseSubmissionResult?(raw: SubmissionDetectionPayload): ScrapedSubmission | null
  resolveProblemIdentity?(submission: ScrapedSubmission, raw: SubmissionDetectionPayload): ProblemIdentity | null
  parseSubmissionTables?(tables: GenericTableData[], ctx: TableParseContext): ScrapedSubmission[]
  scrapeSubmissions?(ctx: SubmissionScrapeContext): Promise<ScrapedSubmission[]>

  syncSubmissions?(ctx: SyncContext): Promise<ScrapedSubmission[]>
}
