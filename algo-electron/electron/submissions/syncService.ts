import { upsertSubmission, updateFirstAc } from '../db/repositories/submissionRepository'
import { syncCodeforcesSubmissions } from './syncers/codeforces'
import { syncAcwingSubmissions } from './syncers/acwing'
import { syncNowcoderSubmissions } from './syncers/nowcoder'
import { syncVjudgeSubmissions } from './syncers/vjudge'
import { CookieVault } from '../cookies/CookieVault'
import { getDb } from '../db/connection'
import type { SubmissionData } from '../shared/types'

export interface SyncResult {
  platform: string
  fetched: number
  inserted: number
  error?: string
}

export class SyncService {
  private cookieVault: CookieVault

  constructor(cookieVault: CookieVault) {
    this.cookieVault = cookieVault
  }

  async syncCodeforces(handle: string): Promise<SyncResult> {
    try {
      const submissions = await syncCodeforcesSubmissions(handle)
      return this.writeSubmissions('codeforces', submissions)
    } catch (e: any) {
      return { platform: 'codeforces', fetched: 0, inserted: 0, error: e.message }
    }
  }

  async syncAcwing(): Promise<SyncResult> {
    try {
      const cookies = await this.getCookiesForDomain('acwing.com')
      const submissions = await syncAcwingSubmissions(cookies)
      return this.writeSubmissions('acwing', submissions)
    } catch (e: any) {
      return { platform: 'acwing', fetched: 0, inserted: 0, error: e.message }
    }
  }

  async syncNowcoder(): Promise<SyncResult> {
    try {
      const cookies = await this.getCookiesForDomain('nowcoder.com')
      const submissions = await syncNowcoderSubmissions(cookies)
      return this.writeSubmissions('nowcoder', submissions)
    } catch (e: any) {
      return { platform: 'nowcoder', fetched: 0, inserted: 0, error: e.message }
    }
  }

  async syncVjudge(username: string): Promise<SyncResult> {
    try {
      const cookies = await this.getCookiesForDomain('vjudge.net')
      const submissions = await syncVjudgeSubmissions(cookies, username)
      return this.writeSubmissions('vjudge', submissions)
    } catch (e: any) {
      return { platform: 'vjudge', fetched: 0, inserted: 0, error: e.message }
    }
  }

  private async getCookiesForDomain(domain: string): Promise<string> {
    const cookies = await this.cookieVault.getCookiesByDomain(domain)
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  }

  private writeSubmissions(platform: string, submissions: SubmissionData[]): SyncResult {
    let inserted = 0

    // 尝试关联 problem_id
    const db = getDb()
    for (const sub of submissions) {
      // 按 platform + 题号尝试匹配 problems 表
      const problem = this.findProblemBySubmission(db, platform, sub)
      if (problem) {
        sub.problemId = problem.id
      }

      const isNew = upsertSubmission(sub)
      if (isNew) inserted++

      // 如果是 AC，更新题目状态
      if (isNew && sub.verdict === 'AC' && sub.problemId) {
        updateFirstAc(sub.problemId)
      }
    }

    return { platform, fetched: submissions.length, inserted }
  }

  private findProblemBySubmission(db: any, platform: string, sub: SubmissionData): { id: string } | null {
    // Codeforces: submission ID 包含 contestId，尝试匹配
    if (platform === 'codeforces') {
      // 从 rawJson 提取 contestId 和 index
      try {
        const raw = JSON.parse(sub.rawJson || '{}')
        if (raw.problem?.contestId && raw.problem?.index) {
          const pid = `${raw.problem.contestId}${raw.problem.index}`
          return db.prepare(
            'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?'
          ).get(platform, pid) as { id: string } | undefined ?? null
        }
      } catch { /* ignore */ }
    }
    return null
  }
}
