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
  executeScript(code: string): Promise<unknown>
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
  /**
   * 同步解析。声明过 `Promise<ProblemIdentity | null> | …` 的联合，但 8 个内建适配器全是同步
   * 实现，自定义适配器的扩展点 `ProblemParserAdapter.parse` 也只声明同步——异步分支没有任何
   * 实现，却逼着 4 个调用点写 `identity instanceof Promise ? null : identity`，
   * 也就是为一个不会发生的情况写"静默丢掉解析结果"。谁真要异步解析，届时连调用点一起改，
   * 比现在留一条没人走、走了就丢数据的路诚实。
   */
  parseProblem(url: string, ctx: ParseContext): ProblemIdentity | null

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
