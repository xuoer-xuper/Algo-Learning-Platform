import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import { recomputeDailyStats } from '../../electron/db/repositories/statsRepository.ts'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-daily-stats-performance-'))
const dbPath = path.join(tempDir, 'performance.sqlite')
const targetDay = '2026-06-15'

try {
  initDbAtPath(dbPath)
  const database = getDb()
  const createdAt = '2025-01-01T00:00:00.000'
  database.prepare(`
    INSERT INTO problems (
      id, platform, platform_problem_id, canonical_url, status,
      first_seen_at, created_at, updated_at
    ) VALUES ('problem-1', 'codeforces', '1A', 'https://codeforces.com/problemset/problem/1/A', 'solved', ?, ?, ?)
  `).run(createdAt, createdAt, createdAt)

  const insertVisit = database.prepare(`
    INSERT INTO problem_visits (
      id, problem_id, platform, url, entered_at, left_at,
      duration_seconds, active_seconds, leave_reason, created_at, updated_at
    ) VALUES (?, 'problem-1', 'codeforces', 'https://codeforces.com/problemset/problem/1/A', ?, ?, 60, 50, 'navigate', ?, ?)
  `)
  const insertSubmission = database.prepare(`
    INSERT INTO submissions (
      id, problem_id, platform, platform_submission_id, verdict,
      submitted_at, created_at, updated_at
    ) VALUES (?, 'problem-1', 'codeforces', ?, ?, ?, ?, ?)
  `)
  const seed = database.transaction(() => {
    const start = new Date(2025, 0, 1)
    for (let dayOffset = 0; dayOffset < 730; dayOffset += 1) {
      const day = new Date(start)
      day.setDate(start.getDate() + dayOffset)
      const localDay = [
        day.getFullYear(),
        String(day.getMonth() + 1).padStart(2, '0'),
        String(day.getDate()).padStart(2, '0'),
      ].join('-')
      for (let row = 0; row < 20; row += 1) {
        const timestamp = `${localDay}T10:${String(row).padStart(2, '0')}:00.000`
        const id = `${dayOffset}-${row}`
        insertVisit.run(`visit-${id}`, timestamp, timestamp, timestamp, timestamp)
        insertSubmission.run(`submission-${id}`, `platform-${id}`, row % 4 === 0 ? 'AC' : 'WA', timestamp, timestamp, timestamp)
      }
    }
  })
  seed()

  recomputeDailyStats(targetDay)
  const startedAt = performance.now()
  recomputeDailyStats(targetDay)
  const elapsedMs = performance.now() - startedAt

  const stats = database.prepare(`
    SELECT visited_problem_count, submission_count, ac_submission_count
    FROM user_daily_stats WHERE local_day = ?
  `).get(targetDay) as Record<string, number>
  assert.deepStrictEqual(stats, {
    visited_problem_count: 1,
    submission_count: 20,
    ac_submission_count: 5,
  })
  assert.ok(elapsedMs < 50, `Daily stats recompute took ${elapsedMs.toFixed(2)}ms; expected <50ms`)
  console.log(`[PASS] daily stats recompute benchmark: ${elapsedMs.toFixed(2)}ms`)
} finally {
  closeDb()
  fs.rmSync(tempDir, { recursive: true, force: true })
}
