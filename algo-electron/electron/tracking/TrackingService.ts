import crypto from 'node:crypto'
import { getDb } from '../db/connection'
import { parseUrl } from '../parsers/registry'
import { upsertProblem } from '../db/repositories/problemRepository'
import { getSiteById } from '../db/repositories/siteRepository'
import { recomputeDailyStats } from '../db/repositories/statsRepository'
import type { ProblemIdentity } from '../shared/types'
import { nowBeijing, todayBeijing } from '../shared/time'

export class TrackingService {
  private currentVisit: { problemId: string; enteredAt: number } | null = null
  private onProblemDetected: ((identity: ProblemIdentity) => void) | null = null

  setProblemDetectedCallback(callback: (identity: ProblemIdentity) => void) {
    this.onProblemDetected = callback
  }

  handleNavigation(url: string): ProblemIdentity | null {
    const identity = parseUrl(url)
    if (!identity) return null

    const site = getSiteById(identity.platform)
    if (!site || !site.enabled) return null

    upsertProblem(identity)
    this.onProblemDetected?.(identity)

    this.endCurrentVisit()

    const db = getDb()
    const problem = db.prepare(
      'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?'
    ).get(identity.platform, identity.platformProblemId) as { id: string } | undefined

    if (problem) {
      const now = nowBeijing()
      const today = now.slice(0, 10)

      // 写入访问记录
      db.prepare(`
        INSERT INTO problem_visits (id, problem_id, platform, url, entered_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), problem.id, identity.platform, identity.canonicalUrl, now, now, now)

      // 写入活跃事件
      db.prepare(`
        INSERT INTO activity_events (id, event_type, occurred_at, local_day, problem_id, platform, url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), 'visit_start', now, today, problem.id, identity.platform, identity.canonicalUrl, now)

      this.currentVisit = { problemId: problem.id, enteredAt: Date.now() }

      // 实时重算当日统计，保证趋势图/连续天数/AI 上下文与访问记录同步
      try { recomputeDailyStats(today) } catch { /* ignore */ }
    }

    return identity
  }

  endCurrentVisit(): void {
    if (!this.currentVisit) return
    const db = getDb()
    const now = Date.now()
    const duration = Math.floor((now - this.currentVisit.enteredAt) / 1000)
    const nowStr = nowBeijing()
    db.prepare(`
      UPDATE problem_visits SET left_at = ?, duration_seconds = ?, updated_at = ?
      WHERE problem_id = ? AND left_at IS NULL
    `).run(nowStr, duration, nowStr, this.currentVisit.problemId)
    this.currentVisit = null

    // 停留时长更新后重算当日统计（duration_seconds/active_seconds 可能变化）
    try { recomputeDailyStats(todayBeijing()) } catch { /* ignore */ }
  }
}
