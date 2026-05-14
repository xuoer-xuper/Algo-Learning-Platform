import { upsertSubmission, updateFirstAc } from '../db/repositories/submissionRepository'
import { syncCodeforcesSubmissions } from './syncers/codeforces'
import { scrapeCurrentPage } from './scrapers/domScraper'
import { getDb } from '../db/connection'
import { BrowserHost } from '../browser/BrowserHost'
import type { SubmissionData } from '../shared/types'

export interface SyncResult {
  platform: string
  fetched: number
  inserted: number
  error?: string
}

export class SyncService {
  private browserHost: BrowserHost | null = null

  setBrowserHost(host: BrowserHost) {
    this.browserHost = host
  }

  // Codeforces 使用公开 API
  async syncCodeforces(handle: string): Promise<SyncResult> {
    if (!handle) return { platform: 'codeforces', fetched: 0, inserted: 0, error: '请输入 Codeforces Handle' }
    try {
      const submissions = await syncCodeforcesSubmissions(handle)
      return this.writeSubmissions('codeforces', submissions)
    } catch (e: any) {
      return { platform: 'codeforces', fetched: 0, inserted: 0, error: e.message }
    }
  }

  // VJudge 从当前页面 DOM 抓取（需要在 vjudge.net/status 页面）
  async syncVjudge(): Promise<SyncResult> {
    if (!this.browserHost) return { platform: 'vjudge', fetched: 0, inserted: 0, error: 'BrowserHost not ready' }
    try {
      const submissions = await scrapeCurrentPage(this.browserHost)
      if (!submissions || submissions.length === 0) {
        return { platform: 'vjudge', fetched: 0, inserted: 0, error: '当前页面无提交记录，请先打开 vjudge.net/status' }
      }
      return this.writeSubmissions('vjudge', submissions)
    } catch (e: any) {
      return { platform: 'vjudge', fetched: 0, inserted: 0, error: e.message }
    }
  }

  // AcWing/牛客 从当前页面 DOM 抓取
  async syncCurrentPage(): Promise<SyncResult> {
    if (!this.browserHost) return { platform: 'unknown', fetched: 0, inserted: 0, error: 'BrowserHost not ready' }

    try {
      const submissions = await scrapeCurrentPage(this.browserHost)
      if (!submissions || submissions.length === 0) {
        const url = this.browserHost.getUrl()
        return { platform: 'unknown', fetched: 0, inserted: 0, error: `当前页面无提交记录 (${url})` }
      }
      return this.writeSubmissions(submissions[0]?.platform ?? 'unknown', submissions)
    } catch (e: any) {
      return { platform: 'unknown', fetched: 0, inserted: 0, error: e.message }
    }
  }

  private writeSubmissions(platform: string, submissions: SubmissionData[]): SyncResult {
    let inserted = 0
    const db = getDb()

    for (const sub of submissions) {
      if (platform === 'codeforces') {
        try {
          const raw = JSON.parse(sub.rawJson || '{}')
          if (raw.problem?.contestId && raw.problem?.index) {
            const pid = `${raw.problem.contestId}${raw.problem.index}`
            const problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('codeforces', pid) as { id: string } | undefined
            if (problem) sub.problemId = problem.id
          }
        } catch { /* ignore */ }
      }

      const isNew = upsertSubmission(sub)
      if (isNew) inserted++
      if (isNew && sub.verdict === 'AC' && sub.problemId) {
        updateFirstAc(sub.problemId)
      }
    }

    return { platform, fetched: submissions.length, inserted }
  }
}
