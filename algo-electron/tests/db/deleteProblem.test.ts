import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import { deleteProblem } from '../../electron/db/repositories/problemRepository.ts'
import { recomputeDailyStatsForDates } from '../../electron/db/repositories/statsRepository.ts'
import type { Logger } from '../../electron/shared/logger.ts'

let temporaryDirectory = ''

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-delete-problem-'))
  initDbAtPath(path.join(temporaryDirectory, 'delete-problem.sqlite'))
})

afterEach(() => {
  closeDb()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

function insertProblem(
  db: Database.Database,
  id: string,
  platformProblemId: string,
  firstSolvedAt: string | null = null,
): void {
  const now = '2026-08-18T08:00:00+08:00'
  db.prepare(`
    INSERT INTO problems (
      id, platform, platform_problem_id, canonical_url, status,
      first_seen_at, first_solved_at, created_at, updated_at
    ) VALUES (?, 'codeforces', ?, ?, 'visited', ?, ?, ?, ?)
  `).run(
    id,
    platformProblemId,
    `https://codeforces.com/problemset/problem/${platformProblemId}`,
    now,
    firstSolvedAt,
    now,
    now,
  )
}

function insertVisit(
  db: Database.Database,
  id: string,
  problemId: string,
  enteredAt: string,
  durationSeconds: number,
  activeSeconds: number,
): void {
  db.prepare(`
    INSERT INTO problem_visits (
      id, problem_id, platform, url, entered_at, left_at,
      duration_seconds, active_seconds, created_at, updated_at
    ) VALUES (?, ?, 'codeforces', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    problemId,
    `https://codeforces.com/problemset/problem/${problemId}`,
    enteredAt,
    enteredAt,
    durationSeconds,
    activeSeconds,
    enteredAt,
    enteredAt,
  )
}

function insertSubmission(
  db: Database.Database,
  id: string,
  problemId: string,
  submittedAt: string,
  verdict: 'AC' | 'WA',
): void {
  db.prepare(`
    INSERT INTO submissions (
      id, problem_id, platform, platform_submission_id, verdict,
      submitted_at, created_at, updated_at
    ) VALUES (?, ?, 'codeforces', ?, ?, ?, ?, ?)
  `).run(id, problemId, id, verdict, submittedAt, submittedAt, submittedAt)
}

function insertActivity(
  db: Database.Database,
  id: string,
  problemId: string,
  occurredAt: string,
): void {
  db.prepare(`
    INSERT INTO activity_events (
      id, event_type, occurred_at, local_day, problem_id, platform, created_at
    ) VALUES (?, 'visit_start', ?, ?, ?, 'codeforces', ?)
  `).run(id, occurredAt, occurredAt.slice(0, 10), problemId, occurredAt)
}

interface DailyStatsRow {
  active_seconds: number
  duration_seconds: number
  visited_problem_count: number
  solved_problem_count: number
  submission_count: number
  ac_submission_count: number
}

function dailyStats(db: Database.Database, day: string): DailyStatsRow {
  const row = db.prepare(`
    SELECT active_seconds, duration_seconds, visited_problem_count,
      solved_problem_count, submission_count, ac_submission_count
    FROM user_daily_stats WHERE local_day = ?
  `).get(day) as DailyStatsRow | undefined
  expect(row).toBeDefined()
  return row!
}

class MemoryLogger implements Logger {
  readonly warnings: Array<{ message: string, data: unknown[] }> = []

  debug(): void {}
  info(): void {}
  warn(message: string, ...data: unknown[]): void { this.warnings.push({ message, data }) }
  error(): void {}
  fatal(): void {}
  getLogFilePath(): string | null { return null }
}

describe('deleteProblem', () => {
  it('recomputes every affected daily-stat date from the remaining facts', () => {
    const db = getDb()
    insertProblem(db, 'target', '1900A', '2026-08-20T08:00:00+08:00')
    insertProblem(db, 'retained', '1900B', '2026-08-20T09:00:00+08:00')
    insertVisit(db, 'target-visit', 'target', '2026-08-18T10:00:00+08:00', 100, 80)
    insertVisit(db, 'retained-visit', 'retained', '2026-08-18T11:00:00+08:00', 60, 50)
    insertSubmission(db, 'target-submission', 'target', '2026-08-19T10:00:00+08:00', 'AC')
    insertSubmission(db, 'retained-submission', 'retained', '2026-08-19T11:00:00+08:00', 'WA')
    insertActivity(db, 'target-activity', 'target', '2026-08-21T10:00:00+08:00')

    const days = ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']
    recomputeDailyStatsForDates(days)
    db.prepare(`
      UPDATE user_daily_stats
      SET active_seconds = 99, duration_seconds = 99, visited_problem_count = 99,
        solved_problem_count = 99, submission_count = 99, ac_submission_count = 99
      WHERE local_day = '2026-08-21'
    `).run()

    expect(deleteProblem('target')).toBe(true)

    expect(dailyStats(db, '2026-08-18')).toMatchObject({
      active_seconds: 50,
      duration_seconds: 60,
      visited_problem_count: 1,
    })
    expect(dailyStats(db, '2026-08-19')).toMatchObject({
      submission_count: 1,
      ac_submission_count: 0,
    })
    expect(dailyStats(db, '2026-08-20').solved_problem_count).toBe(1)
    expect(dailyStats(db, '2026-08-21')).toEqual({
      active_seconds: 0,
      duration_seconds: 0,
      visited_problem_count: 0,
      solved_problem_count: 0,
      submission_count: 0,
      ac_submission_count: 0,
    })
  })

  it('rolls back earlier deletes when a later table delete fails', () => {
    const db = getDb()
    insertProblem(db, 'target', '2000A')
    insertVisit(db, 'target-visit', 'target', '2026-08-18T10:00:00+08:00', 100, 80)
    insertSubmission(db, 'target-submission', 'target', '2026-08-18T10:01:00+08:00', 'AC')
    insertActivity(db, 'target-activity', 'target', '2026-08-18T10:00:00+08:00')
    db.exec(`
      CREATE TRIGGER reject_problem_visit_delete
      BEFORE DELETE ON problem_visits
      BEGIN
        SELECT RAISE(ABORT, 'problem visit delete rejected');
      END;
    `)

    expect(() => deleteProblem('target')).toThrow(/problem visit delete rejected/)

    for (const table of ['problems', 'problem_visits', 'submissions', 'activity_events']) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
      expect(row.count).toBe(1)
    }
  })

  it('logs a post-commit stats failure without reporting the successful delete as failed', () => {
    const db = getDb()
    const logger = new MemoryLogger()
    insertProblem(db, 'target', '2100A')
    insertVisit(db, 'target-visit', 'target', '2026-08-18T10:00:00+08:00', 100, 80)
    recomputeDailyStatsForDates(['2026-08-18'])
    db.exec(`
      CREATE TRIGGER reject_daily_stats_update
      BEFORE UPDATE ON user_daily_stats
      BEGIN
        SELECT RAISE(ABORT, 'daily stats update rejected');
      END;
    `)

    expect(deleteProblem('target', logger)).toBe(true)
    expect(db.prepare('SELECT COUNT(*) AS count FROM problems').get()).toEqual({ count: 0 })
    expect(logger.warnings).toHaveLength(1)
    expect(logger.warnings[0].message).toBe('problem.delete-stats-recompute-failed')
    expect(logger.warnings[0].data[0]).toMatchObject({
      problemId: 'target',
      affectedDates: ['2026-08-18'],
    })
  })
})
