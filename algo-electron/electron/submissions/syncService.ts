import { scrapeCurrentPage } from './scrapers/domScraper'
import { parseUrl } from '../parsers/registry'
import { getAdapter } from '../adapters/registry'
import type { SubmissionScrapeContext } from '../adapters/types'
import type { SubmissionBatchWriter } from './SubmissionBatchWriter'
import { resolveSubmissionPageContext } from './SubmissionPageContextResolver'

export interface SyncResult {
  platform: string
  fetched: number
  inserted: number
  error?: string
}

export interface SyncServiceDeps {
  batchWriter: SubmissionBatchWriter
  findNowcoderProblemBySearch?: (search: string) => string | undefined
  notifyProblemsUpdated?: () => void
}

export class SyncService {
  private readonly batchWriter: SubmissionBatchWriter
  private readonly findNowcoderProblemBySearch: (search: string) => string | undefined
  private readonly notifyProblemsUpdated: () => void

  constructor(deps: SyncServiceDeps) {
    this.batchWriter = deps.batchWriter
    this.findNowcoderProblemBySearch = deps.findNowcoderProblemBySearch ?? (() => undefined)
    this.notifyProblemsUpdated = deps.notifyProblemsUpdated ?? (() => undefined)
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: Error | null = null
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn()
      } catch (e: any) {
        lastError = e
        if (i < maxRetries) await new Promise(r => { setTimeout(r, 1000 * (i + 1)) })
      }
    }
    throw lastError
  }

  // Codeforces 使用公开 API（带重试）
  async syncCodeforces(handle: string): Promise<SyncResult> {
    if (!handle) return { platform: 'codeforces', fetched: 0, inserted: 0, error: '请输入 Codeforces Handle' }
    try {
      const adapter = getAdapter('codeforces')
      if (!adapter?.syncSubmissions) {
        return { platform: 'codeforces', fetched: 0, inserted: 0, error: 'Codeforces adapter not ready' }
      }
      const submissions = await this.withRetry(() => adapter.syncSubmissions!({ handle }))
      return this.writeSubmissions('codeforces', submissions)
    } catch (error: any) {
      return { platform: 'codeforces', fetched: 0, inserted: 0, error: error?.message }
    }
  }

  // VJudge 从当前页面 DOM 抓取（需要在 vjudge.net/status 页面）
  async syncVjudge(scrapeHost: SubmissionScrapeContext | null): Promise<SyncResult> {
    if (!scrapeHost) return { platform: 'vjudge', fetched: 0, inserted: 0, error: 'Scrape host not ready' }
    try {
      const { url, context } = this.captureScrapeContext(scrapeHost)
      const submissions = await scrapeCurrentPage(context)
      if (!submissions || submissions.length === 0) {
        return { platform: 'vjudge', fetched: 0, inserted: 0, error: '当前页面无提交记录，请先打开 vjudge.net/status' }
      }
      const { pageProblemId, pageProblemIdentity } = resolveSubmissionPageContext(url, submissions, {
        parseUrl,
        findNowcoderProblemBySearch: this.findNowcoderProblemBySearch,
      })
      return this.writeSubmissions('vjudge', submissions, url, pageProblemId, pageProblemIdentity)
    } catch (e: any) {
      return { platform: 'vjudge', fetched: 0, inserted: 0, error: e.message }
    }
  }

  // AcWing/牛客/VJudge 从当前页面 DOM 抓取
  async syncCurrentPage(scrapeHost: SubmissionScrapeContext | null): Promise<SyncResult> {
    if (!scrapeHost) return { platform: 'unknown', fetched: 0, inserted: 0, error: 'Scrape host not ready' }

    try {
      const { url, context } = this.captureScrapeContext(scrapeHost)
      const submissions = await scrapeCurrentPage(context)
      if (!submissions || submissions.length === 0) {
        return { platform: 'unknown', fetched: 0, inserted: 0, error: `当前页面无提交记录 (${url})` }
      }

      const { pageProblemId, pageProblemIdentity } = resolveSubmissionPageContext(url, submissions, {
        parseUrl,
        findNowcoderProblemBySearch: this.findNowcoderProblemBySearch,
      })

      return this.writeSubmissions(
        submissions[0]?.platform ?? 'unknown',
        submissions,
        url,
        pageProblemId,
        pageProblemIdentity,
      )
    } catch (e: any) {
      return { platform: 'unknown', fetched: 0, inserted: 0, error: e.message }
    }
  }

  private writeSubmissions(
    platform: string,
    submissions: Parameters<SubmissionBatchWriter['write']>[0]['submissions'],
    currentUrl = '',
    pageProblemId?: string,
    pageProblemIdentity?: Parameters<SubmissionBatchWriter['write']>[0]['pageProblemIdentity'],
  ): SyncResult {
    const result = this.batchWriter.write({
      platform,
      submissions,
      pageProblemId,
      pageProblemIdentity,
      currentUrl,
    })
    if (result.inserted > 0) this.notifyProblemsUpdated()
    return result
  }

  private captureScrapeContext(scrapeHost: SubmissionScrapeContext): {
    url: string
    context: SubmissionScrapeContext
  } {
    const url = scrapeHost.getUrl()
    return {
      url,
      context: {
        getUrl: () => url,
        executeScript: (code) => scrapeHost.executeScript(code),
      },
    }
  }
}
