import crypto from 'node:crypto'
import { getDb } from '../db/connection'
import { parseUrl } from '../parsers/registry'
import { upsertProblem } from '../db/repositories/problemRepository'
import type { ProblemIdentity } from '../shared/types'

export class TrackingService {
  private currentVisit: { problemId: string; enteredAt: number } | null = null
  private onProblemDetected: ((identity: ProblemIdentity) => void) | null = null

  setProblemDetectedCallback(callback: (identity: ProblemIdentity) => void) {
    this.onProblemDetected = callback
  }

  handleNavigation(url: string): ProblemIdentity | null {
    const identity = parseUrl(url)
    if (!identity) return null

    upsertProblem(identity)
    this.onProblemDetected?.(identity)

    this.endCurrentVisit()

    const db = getDb()
    const problem = db.prepare(
      'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?'
    ).get(identity.platform, identity.platformProblemId) as { id: string } | undefined

    if (problem) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO problem_visits (id, problem_id, platform, url, entered_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), problem.id, identity.platform, identity.canonicalUrl, now, now, now)

      this.currentVisit = { problemId: problem.id, enteredAt: Date.now() }
    }

    return identity
  }

  endCurrentVisit(): void {
    if (!this.currentVisit) return
    const db = getDb()
    const now = Date.now()
    const duration = Math.floor((now - this.currentVisit.enteredAt) / 1000)
    db.prepare(`
      UPDATE problem_visits SET left_at = ?, duration_seconds = ?, updated_at = ?
      WHERE problem_id = ? AND left_at IS NULL
    `).run(new Date(now).toISOString(), duration, new Date(now).toISOString(), this.currentVisit.problemId)
    this.currentVisit = null
  }
}
