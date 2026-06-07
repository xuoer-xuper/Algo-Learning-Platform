import { upsertSubmission, updateFirstAc } from '../db/repositories/submissionRepository'
import { upsertProblem } from '../db/repositories/problemRepository'
import { syncCodeforcesSubmissions } from './syncers/codeforces'
import { scrapeCurrentPage } from './scrapers/domScraper'
import { getDb } from '../db/connection'
import { BrowserHost } from '../browser/BrowserHost'
import { parseUrl } from '../parsers/registry'
import { buildCodeforcesProblemUrlFromApi } from '../parsers/sites/codeforcesUrls'
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

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: Error | null = null
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn()
      } catch (e: any) {
        lastError = e
        if (i < maxRetries) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
    }
    throw lastError
  }

  // Codeforces 使用公开 API（带重试）
  async syncCodeforces(handle: string): Promise<SyncResult> {
    if (!handle) return { platform: 'codeforces', fetched: 0, inserted: 0, error: '请输入 Codeforces Handle' }
    try {
      const submissions = await this.withRetry(() => syncCodeforcesSubmissions(handle))
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
              const db = getDb()
              const problem = db.prepare(
                "SELECT platform_problem_id FROM problems WHERE platform = 'nowcoder' AND platform_problem_id LIKE ?"
              ).get(`%${search}%`) as { platform_problem_id: string } | undefined
              if (problem) {
                pageProblemId = problem.platform_problem_id
              } else {
                pageProblemId = `nc-${search}`
              }
            }
          } catch { /* ignore */ }
        }
      }

      // PTA 特殊处理：从提交行的题目链接中提取 platformProblemId
      if (!pageProblemId && url.includes('pintia.cn')) {
        for (const sub of submissions) {
          try {
            const raw = JSON.parse(sub.rawJson || '{}')
            if (raw._ptaProblemId) {
              (sub as any)._ptaProblemId = raw._ptaProblemId
            }
          } catch { /* ignore */ }
        }
      }

      // Luogu 特殊处理：从提交行的题目提取 platformProblemId
      if (!pageProblemId && url.includes('luogu.com.cn')) {
        for (const sub of submissions) {
          try {
            const raw = JSON.parse(sub.rawJson || '{}')
            if (raw._luoguProblemId) {
              (sub as any)._luoguProblemId = raw._luoguProblemId
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

    // 如果当前页面是题目页，找到对应的 problem_id（不存在则自动创建）
    let pageProblemDbId: string | null = null
    if (pageProblemId) {
      let problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get(platform, pageProblemId) as { id: string } | undefined
      if (!problem) {
        // 自动创建题目
        const identity = {
          platform,
          platformProblemId: pageProblemId,
          canonicalUrl: this.browserHost?.getUrl() || '',
          confidence: 'url' as const,
        }
        upsertProblem(identity)
        problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get(platform, pageProblemId) as { id: string } | undefined
      }
      if (problem) pageProblemDbId = problem.id
    }

    for (const sub of submissions) {
      // 尝试关联题目
      if (platform === 'codeforces') {
        try {
          const raw = JSON.parse(sub.rawJson || '{}')
          if (raw.problem?.contestId && raw.problem?.index) {
            const pid = `${raw.problem.contestId}${raw.problem.index}`
            let problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('codeforces', pid) as { id: string } | undefined
            // 题目不存在时自动创建
            if (!problem) {
              const identity = {
                platform: 'codeforces',
                platformProblemId: pid,
                canonicalUrl: buildCodeforcesProblemUrlFromApi(raw.problem.contestId, raw.problem.index),
                contestId: String(raw.problem.contestId),
                problemIndex: raw.problem.index,
                confidence: 'url' as const,
              }
              upsertProblem(identity)
              problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('codeforces', pid) as { id: string } | undefined
            }
            if (problem) sub.problemId = problem.id
          }
        } catch { /* ignore */ }
      } else if (pageProblemDbId) {
        sub.problemId = pageProblemDbId
      }

      // PTA 逐行关联：每条提交可能对应不同题目
      if (!sub.problemId && sub.platform === 'pta') {
        try {
          const ptaPid = (sub as any)._ptaProblemId
          if (ptaPid) {
            let problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('pta', ptaPid) as { id: string } | undefined
            if (!problem) {
              const parts = ptaPid.split('-')
              const identity = {
                platform: 'pta' as const,
                platformProblemId: ptaPid,
                canonicalUrl: parts.length >= 2
                  ? `https://pintia.cn/problem-sets/${parts[0]}/exam/problems/type/7?problemSetProblemId=${parts[1]}`
                  : `https://pintia.cn/problem-sets/${ptaPid}`,
                contestId: parts[0],
                problemIndex: parts.length >= 2 ? parts[1] : undefined,
                confidence: 'url' as const,
              }
              upsertProblem(identity)
              problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('pta', ptaPid) as { id: string } | undefined
            }
            if (problem) sub.problemId = problem.id
          }
        } catch { /* ignore */ }
      }

      // Luogu 逐行关联
      if (!sub.problemId && sub.platform === 'luogu') {
        try {
          const lgPid = (sub as any)._luoguProblemId
          if (lgPid) {
            let problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('luogu', lgPid) as { id: string } | undefined
            if (!problem) {
              const identity = {
                platform: 'luogu' as const,
                platformProblemId: lgPid,
                canonicalUrl: `https://www.luogu.com.cn/problem/${lgPid}`,
                confidence: 'url' as const,
              }
              upsertProblem(identity)
              problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('luogu', lgPid) as { id: string } | undefined
            }
            if (problem) sub.problemId = problem.id
          }
        } catch { /* ignore */ }
      }

      // PTA 降级：如果仍然没有关联题目，尝试用提交记录中的 URL 匹配
      if (!sub.problemId && sub.platform === 'pta' && sub.sourceUrl) {
        try {
          const sourceIdentity = parseUrl(sub.sourceUrl)
          if (sourceIdentity) {
            upsertProblem(sourceIdentity)
            const problem = db.prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?').get('pta', sourceIdentity.platformProblemId) as { id: string } | undefined
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
