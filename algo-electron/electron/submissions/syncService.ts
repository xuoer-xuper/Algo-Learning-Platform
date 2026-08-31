import { scrapeCurrentPage } from './scrapers/domScraper'
import { parseUrl } from '../parsers/registry'
import { getAdapter } from '../adapters/registry'
import type { SubmissionScrapeContext } from '../adapters/types'
import type { SubmissionBatchWriter } from './SubmissionBatchWriter'
import { resolveSubmissionPageContext } from './SubmissionPageContextResolver'
import { errorMessage } from '../shared/errors'

export interface SyncResult {
  platform: string
  fetched: number
  inserted: number
  error?: string
}

/**
 * 本服务真正需要 batchWriter 的能力：只有 `write`。
 *
 * 原先声明成完整的 `SubmissionBatchWriter`。那个类有两个 private 字段（`problemAttacher`、
 * `deps`），private 让类型变成 nominal 的——对象字面量无论写多全都不可能满足它。于是
 * syncService.test.ts 里 5 个替身有 4 个靠 `as any` 蒙过去，而 `as any` 盖的是整个
 * options 对象，连 `notifyProblemsUpdated` 拼错都不会报。
 *
 * 收窄成 `Pick<…, 'write'>` 之后真实类仍然满足（它有 write），替身也终于能诚实地通过检查。
 */
export type SubmissionBatchWriterLike = Pick<SubmissionBatchWriter, 'write'>

export interface SyncServiceDeps {
  batchWriter: SubmissionBatchWriterLike
  findNowcoderProblemBySearch?: (search: string) => string | undefined
  notifyProblemsUpdated?: () => void
}

export class SyncService {
  private readonly batchWriter: SubmissionBatchWriterLike
  private readonly findNowcoderProblemBySearch: (search: string) => string | undefined
  private readonly notifyProblemsUpdated: () => void

  constructor(deps: SyncServiceDeps) {
    this.batchWriter = deps.batchWriter
    this.findNowcoderProblemBySearch = deps.findNowcoderProblemBySearch ?? (() => undefined)
    this.notifyProblemsUpdated = deps.notifyProblemsUpdated ?? (() => undefined)
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    // `unknown` 而非 `Error`：被重试的是网络与适配器代码，它们不保证抛 `Error`。
    // 原先声明成 `Error | null` 只是靠 `catch (e: any)` 骗过检查，真抛字符串时类型是假的。
    let lastError: unknown = null
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn()
      } catch (error: unknown) {
        lastError = error
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
    } catch (error: unknown) {
      return { platform: 'codeforces', fetched: 0, inserted: 0, error: errorMessage(error) }
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
    } catch (error: unknown) {
      return { platform: 'vjudge', fetched: 0, inserted: 0, error: errorMessage(error) }
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
    } catch (error: unknown) {
      return { platform: 'unknown', fetched: 0, inserted: 0, error: errorMessage(error) }
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
