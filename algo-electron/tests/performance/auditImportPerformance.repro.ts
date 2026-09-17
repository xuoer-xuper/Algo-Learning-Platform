import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { app } from 'electron'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { exportLearningDataToFile, importLearningDataFromParsedExport, previewLearningDataImportFile } from '../../electron/backup/backupService'
import { previewLearningDataImport } from '../../electron/backup/learningDataExport'
import { getRecentProblems } from '../../electron/db/repositories/problem/queries'
import { recomputeAllDailyStats } from '../../electron/db/repositories/stats/recompute'

const scenario = process.argv.find(arg => /^D[012]$/.test(arg)) ?? 'D1'
const counts = scenario === 'D2' ? { problems: 10_000, facts: 100_000 }
  : scenario === 'D1' ? { problems: 1_000, facts: 10_000 } : { problems: 0, facts: 0 }
const outputRoot = path.resolve('tmp/renderer-performance/audit-import-20260911')
const runRoot = path.join(outputRoot, `${scenario}-${crypto.randomUUID()}`)
fs.mkdirSync(runRoot, { recursive: true })
app.setPath('userData', runRoot)
const measurements: Array<Record<string, unknown>> = []
const mib = (bytes: number) => Math.round(bytes / 1024 / 1024 * 10) / 10

function memory() {
  const usage = process.memoryUsage()
  return { rssMiB: mib(usage.rss), heapUsedMiB: mib(usage.heapUsed), externalMiB: mib(usage.external), lifetimeMaxRssMiB: mib(process.resourceUsage().maxRSS * 1024) }
}

async function measured<T>(name: string, action: () => T): Promise<T> {
  if (global.gc) global.gc()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const before = memory()
  const scheduledAt = performance.now()
  const heartbeat = new Promise<number>(resolve => setTimeout(() => resolve(performance.now() - scheduledAt), 0))
  const started = performance.now()
  const result = action()
  const synchronousMs = performance.now() - started
  const after = memory()
  const queuedTimerDelayMs = await heartbeat
  measurements.push({ name, synchronousMs, queuedTimerDelayMs, before, after })
  console.log(JSON.stringify({ scenario, phase: name, synchronousMs: Math.round(synchronousMs), rssMiB: after.rssMiB }))
  assert.ok(after.rssMiB < 1800, 'Stop bounded audit if the process exceeds 1.8 GiB RSS')
  return result
}

function seed(): void {
  const db = getDb()
  const timestamp = '2025-01-01T10:00:00.000'
  const days = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10))
  const insertProblem = db.prepare(`INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, title, status, first_seen_at, last_visited_at, created_at, updated_at)
    VALUES (?, 'codeforces', ?, ?, ?, 'visited', ?, ?, ?, ?)`)
  const insertSubmission = db.prepare(`INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, raw_verdict, language, submitted_at, created_at, updated_at)
    VALUES (?, ?, 'codeforces', ?, ?, ?, 'GNU C++23', ?, ?, ?)`)
  const insertVisit = db.prepare(`INSERT INTO problem_visits
    (id, problem_id, session_id, platform, url, entered_at, left_at, duration_seconds, active_seconds, leave_reason, created_at, updated_at)
    VALUES (?, ?, 'synthetic-audit-session', 'codeforces', ?, ?, ?, 60, 50, 'audit', ?, ?)`)
  db.transaction(() => {
    for (let i = 0; i < counts.problems; i++) {
      insertProblem.run(`problem-${i}`, `${1000 + i}A`, `https://codeforces.com/problemset/problem/${1000 + i}/A`, `Synthetic problem ${i}`, timestamp, timestamp, timestamp, timestamp)
    }
    for (let i = 0; i < counts.facts; i++) {
      const problemIndex = i % counts.problems
      const enteredAt = `${days[i % days.length]}T10:00:00.000`
      const leftAt = `${days[i % days.length]}T10:01:00.000`
      const accepted = Math.floor(i / counts.problems) === 0
      insertSubmission.run(`submission-${i}`, `problem-${problemIndex}`, `audit-${i}`, accepted ? 'AC' : 'WA', accepted ? 'OK' : 'WRONG_ANSWER', enteredAt, enteredAt, enteredAt)
      insertVisit.run(`visit-${i}`, `problem-${problemIndex}`, `https://codeforces.com/problemset/problem/${1000 + problemIndex}/A`, enteredAt, leftAt, enteredAt, leftAt)
    }
  })()
}

async function main(): Promise<void> {
  await app.whenReady()
  const idle = await measured('idle-control', () => null)
  assert.equal(idle, null)
  initDbAtPath(path.join(runRoot, 'source.sqlite'))
  seed()
  const file = path.join(runRoot, 'learning-data.json')
  const exported = await measured('export-file', () => exportLearningDataToFile(file))
  assert.equal(exported.success, true, exported.error)
  const fileBytes = fs.statSync(file).size
  assert.ok(fileBytes <= 256 * 1024 * 1024, 'Do not read audit exports larger than 256 MiB')
  closeDb()
  initDbAtPath(path.join(runRoot, 'target.sqlite'))
  const preview = await measured('preview-file', () => previewLearningDataImportFile(file))
  assert.equal(preview.preview.valid, true, preview.preview.error)
  assert.ok(preview.data)
  const imported = await measured('import-confirm', () => importLearningDataFromParsedExport(preview.data!))
  assert.equal(imported.success, true, imported.error)
  assert.equal(imported.inserted.problems, counts.problems)
  assert.equal(imported.inserted.submissions, counts.facts)
  assert.equal(imported.inserted.problem_visits, counts.facts)
  const duplicatePreview = await measured('preview-duplicates', () => previewLearningDataImport(preview.data))
  assert.equal(duplicatePreview.conflicts.length, 0)
  const repeated = await measured('import-duplicates', () => importLearningDataFromParsedExport(preview.data!))
  assert.equal(repeated.success, true, repeated.error)
  assert.equal(repeated.inserted.submissions, 0)
  for (let i = 0; i < 3; i++) await measured(`recent-200-${i + 1}`, () => getRecentProblems(200))
  await measured('recompute-all-days', () => recomputeAllDailyStats())
  const stats = getDb().prepare(`SELECT SUM(active_seconds) AS active, SUM(submission_count) AS submissions FROM user_daily_stats`).get() as { active: number | null; submissions: number | null }
  assert.equal(stats.active ?? 0, counts.facts * 50)
  assert.equal(stats.submissions ?? 0, counts.facts)
  const checks = { integrity: getDb().pragma('integrity_check', { simple: true }), foreignKeys: getDb().pragma('foreign_key_check'), stats }
  closeDb()
  const output = {
    recordedAt: new Date().toISOString(), scenario, counts, fileBytes,
    environment: { mode: 'real Electron main, no application windows, synthetic databases', os: os.release(), cpu: os.cpus()[0]?.model, totalMemoryMiB: mib(os.totalmem()), electron: process.versions.electron, node: process.versions.node, gcAvailable: Boolean(global.gc) },
    measurements, checks, runDirectory: path.relative(process.cwd(), runRoot),
  }
  const resultFile = path.join(runRoot, 'results.json')
  fs.writeFileSync(resultFile, JSON.stringify(output, null, 2))
  console.log(JSON.stringify({ scenario, results: path.relative(process.cwd(), resultFile) }))
  app.exit(0)
}

void main().catch(error => { closeDb(); console.error(error); app.exit(1) })
