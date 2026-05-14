import { upsertSubmission, updateFirstAc } from '../db/repositories/submissionRepository'
import { syncCodeforcesSubmissions } from './syncers/codeforces'
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

  async syncCodeforces(handle: string): Promise<SyncResult> {
    if (!handle) return { platform: 'codeforces', fetched: 0, inserted: 0, error: '请输入 Codeforces Handle' }
    try {
      const submissions = await syncCodeforcesSubmissions(handle)
      return this.writeSubmissions('codeforces', submissions)
    } catch (e: any) {
      return { platform: 'codeforces', fetched: 0, inserted: 0, error: e.message }
    }
  }

  async syncAcwing(): Promise<SyncResult> {
    return this.syncViaRenderer('acwing', 'https://www.acwing.com')
  }

  async syncNowcoder(): Promise<SyncResult> {
    return this.syncViaRenderer('nowcoder', 'https://ac.nowcoder.com')
  }

  async syncVjudge(): Promise<SyncResult> {
    return this.syncViaRenderer('vjudge', 'https://vjudge.net')
  }

  // 通过 Renderer 进程的 webContents 执行 fetch（自带 Cookie 登录态）
  private async syncViaRenderer(platform: string, baseUrl: string): Promise<SyncResult> {
    if (!this.browserHost) return { platform, fetched: 0, inserted: 0, error: 'BrowserHost not ready' }

    try {
      const result = await this.browserHost.executeScript(`
        (async () => {
          try {
            const resp = await fetch('${this.getApiUrl(platform)}', {
              method: '${this.getApiMethod(platform)}',
              headers: { 'Content-Type': 'application/json' },
              ${this.getApiBody(platform) ? `body: JSON.stringify(${this.getApiBody(platform)}),` : ''}
              credentials: 'include',
            })
            if (!resp.ok) return { error: 'HTTP ' + resp.status }
            const text = await resp.text()
            try { return JSON.parse(text) } catch { return { error: 'Not JSON response' } }
          } catch (e) { return { error: e.message } }
        })()
      `)

      if (result?.error) {
        return { platform, fetched: 0, inserted: 0, error: result.error }
      }

      const submissions = this.parseResponse(platform, result)
      return this.writeSubmissions(platform, submissions)
    } catch (e: any) {
      return { platform, fetched: 0, inserted: 0, error: e.message }
    }
  }

  private getApiUrl(platform: string): string {
    switch (platform) {
      case 'acwing': return '/api/problem/submission_list/'
      case 'nowcoder': return '/acm/contest/my-submission?pageSize=100'
      case 'vjudge': return '/solution/data?pageSize=100'
      default: return ''
    }
  }

  private getApiMethod(platform: string): string {
    return platform === 'acwing' ? 'POST' : 'GET'
  }

  private getApiBody(platform: string): string | null {
    return platform === 'acwing' ? '{ page: 1, count: 100 }' : null
  }

  private parseResponse(platform: string, data: any): SubmissionData[] {
    if (!data) return []

    switch (platform) {
      case 'acwing': {
        const list = data.data?.submission_list ?? []
        return list.map((s: any) => ({
          platform: 'acwing',
          platformSubmissionId: `ac-${s.id}`,
          verdict: this.mapVerdict(s.status ?? ''),
          rawVerdict: s.status ?? '',
          language: s.language ?? '',
          submittedAt: s.submit_time ? new Date(s.submit_time).toISOString() : new Date().toISOString(),
          sourceUrl: `https://www.acwing.com/problem/submission/${s.id}/`,
        }))
      }
      case 'nowcoder': {
        const list = data.data ?? []
        return list.map((s: any) => ({
          platform: 'nowcoder',
          platformSubmissionId: `nc-${s.submissionId ?? s.id}`,
          verdict: this.mapVerdict(s.statusDesc ?? ''),
          rawVerdict: s.statusDesc ?? '',
          language: s.language ?? '',
          submittedAt: s.submitTime ? new Date(s.submitTime).toISOString() : new Date().toISOString(),
        }))
      }
      case 'vjudge': {
        const list = data.data ?? []
        return list.map((s: any) => ({
          platform: 'vjudge',
          platformSubmissionId: `vj-${s.id}`,
          verdict: this.mapVerdict(s.result ?? ''),
          rawVerdict: s.result ?? '',
          language: s.language ?? '',
          submittedAt: s.submitTime ? new Date(s.submitTime).toISOString() : new Date().toISOString(),
          sourceUrl: `https://vjudge.net/solution/${s.id}`,
        }))
      }
      default: return []
    }
  }

  private mapVerdict(result: string): import('../shared/types').Verdict {
    const r = result.toUpperCase()
    if (r.includes('ACCEPTED') || r === 'AC' || r.includes('OK')) return 'AC'
    if (r.includes('WRONG') || r === 'WA') return 'WA'
    if (r.includes('TIME LIMIT') || r === 'TLE') return 'TLE'
    if (r.includes('MEMORY LIMIT') || r === 'MLE') return 'MLE'
    if (r.includes('RUNTIME') || r === 'RE') return 'RE'
    if (r.includes('COMPILE') || r.includes('COMPILATION') || r === 'CE') return 'CE'
    if (r.includes('PRESENTATION') || r === 'PE') return 'PE'
    return 'UNKNOWN'
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
