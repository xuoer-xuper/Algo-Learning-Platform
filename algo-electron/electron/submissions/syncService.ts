import { upsertSubmission, updateFirstAc } from '../db/repositories/submissionRepository'
import { upsertProblem } from '../db/repositories/problemRepository'
import { syncCodeforcesSubmissions } from './syncers/codeforces'
import { scrapeCurrentPage } from './scrapers/domScraper'
import { getDb } from '../db/connection'
import { BrowserHost } from '../browser/BrowserHost'
import { parseUrl } from '../parsers/registry'
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

  // AcWing/牛客/VJudge 从当前页面 DOM 抓取
  async syncCurrentPage(): Promise<SyncResult> {
    if (!this.browserHost) return { platform: 'unknown', fetched: 0, inserted: 0, error: 'BrowserHost not ready' }

    try {
      const submissions = await scrapeCurrentPage(this.browserHost)
      if (!submissions || submissions.length === 0) {
        const url = this.browserHost.getUrl()
        return { platform: 'unknown', fetched: 0, inserted: 0, error: `当前页面无提交记录 (${url})` }
      }

      // 从当前 URL 尝试识别题目（用于关联提交到题目）
      const url = this.browserHost.getUrl()
      let identity = parseUrl(url)
      let pageProblemId = identity?.platformProblemId

      // VJudge 特殊处理
      if (!pageProblemId && url.includes('vjudge.net')) {
        try {
          const u = new URL(url)
          // 比赛状态页: #status/xuper/K/0/
          if (url.includes('/contest/')) {
            const hashMatch = u.hash.match(/#status\/[^\/]+\/([A-Za-z0-9]+)/)
            if (hashMatch) {
              const contestMatch = url.match(/\/contest\/(\d+)/)
              if (contestMatch) {
                pageProblemId = `contest-${contestMatch[1]}-${hashMatch[1]}`
              }
            }
          }
          // 全局状态页: #un=xuper&OJId=Gym&probNum=105173E
          if (!pageProblemId && url.includes('/status')) {
            const hash = decodeURIComponent(u.hash)
            const ojMatch = hash.match(/OJId=([^&]+)/)
            const probMatch = hash.match(/probNum=([^&]+)/)
            if (ojMatch && probMatch) {
              pageProblemId = `${ojMatch[1]}-${probMatch[1]}`
            }
          }
        } catch { /* ignore */ }
      }

      // 牛客特殊处理
      if (!pageProblemId && url.includes('nowcoder.com')) {
        // 方式1：contest 页 + 题号列
        const contestMatch = url.match(/\/contest\/(\d+)/)
        const probLetter = (submissions[0] as any)?._ncProbLetter
        if (contestMatch && probLetter) {
          pageProblemId = `contest-${contestMatch[1]}-${probLetter}`
        }
        // 方式2：profile 页 + search 参数
        if (!pageProblemId) {
          try {
            const u = new URL(url)
            const search = u.searchParams.get('search')
            if (search && /^\d+$/.test(search)) {
              // 用内部题号查数据库
              const db = getDb()
              const problem = db.prepare(
                "SELECT platform_problem_id FROM problems WHERE platform = 'nowcoder' AND platform_problem_id LIKE ?"
              ).get(`%${search}%`) as { platform_problem_id: string } | undefined
              if (problem) {
                pageProblemId = problem.platform_problem_id
              } else {
                // 数据库没有，用 search 作为临时 ID
                pageProblemId = `nc-${search}`
              }
            }
          } catch { /* ignore */ }
        }
      }

      // 如果当前页面是题目页，确保题目存在于数据库中
      if (identity) {
        upsertProblem(identity)
      }

      return this.writeSubmissions(submissions[0]?.platform ?? 'unknown', submissions, pageProblemId)
    } catch (e: any) {
      return { platform: 'unknown', fetched: 0, inserted: 0, error: e.message }
    }
  }

  private writeSubmissions(platform: string, submissions: SubmissionData[], pageProblemId?: string): SyncResult {
    let inserted = 0
    const db = getDb()

    // 如果当前页面是题目页，找到对应的 problem_id
    let pageProblemDbId: string | null = null
    if (pageProblemId) {
      const problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get(platform, pageProblemId) as { id: string } | undefined
      if (problem) pageProblemDbId = problem.id
    }

    for (const sub of submissions) {
      // 尝试关联题目
      if (platform === 'codeforces') {
        try {
          const raw = JSON.parse(sub.rawJson || '{}')
          if (raw.problem?.contestId && raw.problem?.index) {
            const pid = `${raw.problem.contestId}${raw.problem.index}`
            const problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('codeforces', pid) as { id: string } | undefined
            if (problem) sub.problemId = problem.id
          }
        } catch { /* ignore */ }
      } else if (pageProblemDbId) {
        sub.problemId = pageProblemDbId
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
