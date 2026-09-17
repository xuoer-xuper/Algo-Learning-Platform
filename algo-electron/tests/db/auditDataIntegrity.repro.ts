import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  createDatabaseBackup,
  importLearningDataFromParsedExport,
  previewLearningDataImportFile,
} from '../../electron/backup/backupService'
import { exportLearningData, importLearningData, previewLearningDataImport } from '../../electron/backup/learningDataExport'
import type { ExportRow, LearningDataExport } from '../../electron/backup/types'
import {
  createNote,
  getNoteWithContent,
  resolveNoteAssetPath,
  saveNoteImage,
  updateNoteContent,
  updateNoteTitle,
} from '../../electron/notes/NoteService'
import { getNotesRoot } from '../../electron/notes/noteStorage'
import { getProblemDetail, getRecentProblems } from '../../electron/db/repositories/problem/queries'

// This records current defects, not desired regression-test behavior.
// All paths and records belong to a fresh synthetic profile for each run.
const outputDir = path.resolve('tmp/audit-20260911')
const runDir = path.join(outputDir, `data-${crypto.randomUUID()}`)
const day = '2026-09-10'
const timestamp = `${day}T10:00:00+08:00`
const observations: Record<string, unknown> = {}
fs.mkdirSync(runDir, { recursive: true })
app.setPath('userData', runDir)

function contained(target: string): string {
  const relative = path.relative(runDir, path.resolve(target))
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  return target
}

function database(name: string): void {
  closeDb()
  const profile = contained(path.join(runDir, name))
  fs.mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
  initDbAtPath(path.join(profile, 'data', 'audit.sqlite'))
}

function problem(id = 'audit-problem', overrides: ExportRow = {}): ExportRow {
  return {
    id, platform: 'codeforces', platform_problem_id: id,
    canonical_url: 'https://codeforces.com/problemset/problem/1000/A',
    title: 'Synthetic audit problem', status: 'visited', contest_id: '1000',
    problem_index: 'A', source_platform: null, source_problem_id: null,
    difficulty: null, tags_json: null, first_seen_at: timestamp,
    last_visited_at: timestamp, first_solved_at: null, created_at: timestamp,
    updated_at: timestamp, deleted_at: null, ...overrides,
  }
}

function submission(problemId: string, overrides: ExportRow = {}): ExportRow {
  return {
    id: 'audit-submission', problem_id: problemId, platform: 'codeforces',
    platform_submission_id: 'audit-submission', verdict: 'AC', raw_verdict: 'OK',
    language: 'GNU C++23', submitted_at: timestamp, is_first_ac: 1,
    runtime_ms: 1, memory_kb: 1, source_url: null, created_at: timestamp,
    updated_at: timestamp, deleted_at: null, ...overrides,
  }
}

function visit(problemId: string, overrides: ExportRow = {}): ExportRow {
  return {
    id: 'audit-visit', problem_id: problemId, session_id: 'audit-session',
    platform: 'codeforces', url: 'https://codeforces.com/problemset/problem/1000/A',
    entered_at: timestamp, left_at: `${day}T10:10:00+08:00`,
    duration_seconds: 600, active_seconds: 540, leave_reason: 'test',
    created_at: timestamp, updated_at: timestamp, deleted_at: null, ...overrides,
  }
}

function account(): ExportRow {
  return {
    id: 'audit-account', platform: 'codeforces', handle: 'synthetic-audit-user',
    display_name: 'Synthetic audit', current_rating: 1000, peak_rating: 1000,
    last_synced_at: timestamp, created_at: timestamp, updated_at: timestamp,
    deleted_at: null,
  }
}

function rating(): ExportRow {
  return {
    id: 'audit-rating', account_id: 'audit-account', platform: 'codeforces',
    contest_id: '1000', contest_name: 'Synthetic audit round', rank: 100,
    rating_before: 900, rating_after: 1000, delta: 100, contest_at: timestamp,
    created_at: timestamp, updated_at: timestamp, deleted_at: null,
  }
}

function payload(tables: Partial<LearningDataExport['tables']>): LearningDataExport {
  return {
    app: 'algo-learning-platform', schema_version: 1, exported_at: timestamp,
    metadata: { excluded: [], excluded_tables: [], excluded_fields: [], complete_backup_hint: '' },
    tables: { problems: [], submissions: [], problem_visits: [], user_daily_stats: [], platform_accounts: [], rating_history: [], ...tables },
  }
}

function importFile(name: string, data: LearningDataExport) {
  const file = contained(path.join(runDir, `${name}.json`))
  fs.writeFileSync(file, JSON.stringify(data))
  const preview = previewLearningDataImportFile(file)
  assert.equal(preview.preview.valid, true)
  assert.ok(preview.data)
  const result = importLearningDataFromParsedExport(preview.data)
  assert.equal(result.success, true, result.error)
  return { preview: preview.preview, result }
}

async function backupAssets(): Promise<void> {
  database('backup-source')
  const note = createNote({ title: 'Synthetic image note', content: 'Original body' })
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=', 'base64')
  const image = saveNoteImage(note.id, 'pixel.png', 'image/png', pixel)
  const content = `Original body\n\n![pixel](${image.markdownUrl})`
  assert.equal(updateNoteContent(note.id, content), true)
  const originalAsset = resolveNoteAssetPath(note.id, image.markdownUrl)
  assert.ok(originalAsset && fs.existsSync(originalAsset))
  const result = await createDatabaseBackup(contained(path.join(runDir, 'backups')))
  assert.equal(result.success, true)
  assert.ok(result.path)
  const notesDir = getNotesRoot()
  closeDb()
  // Simulate loss of the source notes directory without deleting any evidence.
  fs.renameSync(contained(notesDir), contained(`${notesDir}-offline`))
  database('backup-restored')
  const restoredDbPath = path.join(app.getPath('userData'), 'data', 'audit.sqlite')
  closeDb()
  fs.copyFileSync(contained(result.path), contained(restoredDbPath))
  initDbAtPath(restoredDbPath)
  const restored = getNoteWithContent(note.id)
  assert.equal(restored?.content, content)
  const asset = resolveNoteAssetPath(note.id, image.markdownUrl)
  assert.ok(asset)
  assert.equal(fs.existsSync(asset), false)
  assert.equal(fs.existsSync(restored!.file_path), false)
  observations.backupAssets = {
    backupSucceeded: true, restoredBodyMatches: true, restoredAssetExists: false,
    restoredMarkdownFileExists: false, backupFiles: fs.readdirSync(path.dirname(result.path)),
    storedPathStillPointsToSource: restored!.file_path === note.file_path,
    integrityCheck: getDb().pragma('integrity_check', { simple: true }),
  }
}

function noteRepresentations(): void {
  database('note-representations')
  const note = createNote({ title: 'Original title', content: '' })
  const emptyRead = getNoteWithContent(note.id)!
  assert.equal(emptyRead.content, '# Original title\n\n')
  assert.equal(updateNoteTitle(note.id, 'New title'), true)
  const renamed = getNoteWithContent(note.id)!
  assert.equal(renamed.title, 'New title')
  assert.equal(renamed.content, '# Original title\n\n')
  assert.equal(updateNoteContent(note.id, 'Actual body'), true)
  const savedFile = fs.readFileSync(note.file_path, 'utf8')
  assert.equal(savedFile, 'Actual body')
  observations.noteRepresentations = {
    requestedBody: '', loadedBody: emptyRead.content, cachedWordCount: emptyRead.word_count,
    renamedTitle: renamed.title, bodyAfterRename: renamed.content, fileAfterBodySave: savedFile,
  }
}

function noteWriteFailure(): void {
  database('note-write-failure')
  const note = createNote({ title: 'Failure audit', content: 'Old body' })
  getDb().exec(`CREATE TEMP TRIGGER audit_reject_note_update BEFORE UPDATE OF content ON notes
    BEGIN SELECT RAISE(ABORT, 'synthetic database write failure'); END`)
  const result = updateNoteContent(note.id, 'New body that must remain recoverable')
  const dbBody = getNoteWithContent(note.id)!.content
  const fileBody = fs.readFileSync(note.file_path, 'utf8')
  assert.equal(result, false)
  assert.equal(dbBody, 'Old body')
  assert.equal(fileBody, 'New body that must remain recoverable')
  getDb().exec('DROP TRIGGER audit_reject_note_update')
  observations.noteWriteFailure = { result, dbBody, fileBody, reopenBody: getNoteWithContent(note.id)!.content }
}

function importedPath(): void {
  database('imported-path')
  const importedId = '../../audit-note-outside-profile'
  importFile('traversal-input', payload({ problems: [problem(importedId)] }))
  const listedId = getRecentProblems(200)[0].id
  const note = createNote({ problem_id: listedId, title: 'Synthetic path audit', content: '' })
  contained(note.file_path)
  const relativeToNotes = path.relative(getNotesRoot(), note.file_path)
  assert.ok(relativeToNotes.startsWith(`..${path.sep}`))
  assert.equal(fs.existsSync(note.file_path), true)
  observations.importedPath = {
    importAccepted: true, listedId, relativeToNotes, outsideUserData: !note.file_path.startsWith(`${app.getPath('userData')}${path.sep}`),
    fileExists: true, fileNameIsGeneratedUuid: /^[a-f0-9-]{36}\.md$/.test(path.basename(note.file_path)),
  }
}

function deletedFacts(): void {
  database('deleted-facts')
  importFile('deleted-facts-input', payload({
    problems: [problem()],
    submissions: [submission('audit-problem', { deleted_at: `${day}T12:00:00+08:00` })],
    problem_visits: [visit('audit-problem', { deleted_at: `${day}T12:00:00+08:00` })],
  }))
  const detail = getProblemDetail('audit-problem')!
  const stats = getDb().prepare('SELECT * FROM user_daily_stats WHERE local_day = ?').get(day) as ExportRow
  const liveSubmissions = getDb().prepare('SELECT COUNT(*) AS count FROM submissions WHERE deleted_at IS NULL').get() as { count: number }
  const liveVisits = getDb().prepare('SELECT COUNT(*) AS count FROM problem_visits WHERE deleted_at IS NULL').get() as { count: number }
  assert.equal(liveSubmissions.count, 0)
  assert.equal(liveVisits.count, 0)
  assert.equal(detail.status, 'solved')
  assert.equal(stats.submission_count, 1)
  assert.equal(stats.active_seconds, 540)
  observations.deletedFacts = {
    liveSubmissionCount: liveSubmissions.count, liveVisitCount: liveVisits.count,
    detailStatus: detail.status, detailSubmissionCount: detail.submission_count,
    displayedSubmissionCount: detail.submissions.length, stats,
    foreignKeyCheck: getDb().pragma('foreign_key_check'),
  }
}

function conflictCoverage(): void {
  database('conflict-coverage')
  assert.equal(importLearningData(payload({
    problems: [problem()], platform_accounts: [account()], rating_history: [rating()],
  })).success, true)
  const update = payload({
    platform_accounts: [{ ...account(), current_rating: 1500, peak_rating: 1500 }],
    rating_history: [{ ...rating(), rating_after: 1500, delta: 600 }],
  })
  const preview = previewLearningDataImport(update)
  assert.equal(preview.valid, true)
  assert.equal(preview.conflicts.length, 0)
  const result = importLearningData(update)
  assert.equal(result.success, true)
  const afterDefault = exportLearningData()
  assert.equal(afterDefault.tables.platform_accounts[0].current_rating, 1000)
  assert.equal(afterDefault.tables.rating_history[0].rating_after, 1000)
  const unrelatedConflict = { ...update, tables: { ...update.tables, problems: [problem('audit-problem', { title: 'Changed problem title' })] } }
  const prompted = previewLearningDataImport(unrelatedConflict)
  assert.deepEqual(prompted.conflicts.map(c => c.entity_type), ['problems'])
  const overwriteResult = importLearningData(unrelatedConflict, true)
  assert.equal(overwriteResult.success, true)
  const afterOverwrite = exportLearningData()
  assert.equal(afterOverwrite.tables.platform_accounts[0].current_rating, 1500)
  observations.conflictCoverage = {
    previewConflicts: preview.conflicts, duplicateCounts: preview.duplicate_counts,
    defaultImportSucceeded: result.success, defaultSkipped: result.skipped,
    ratingAfterDefault: afterDefault.tables.platform_accounts[0].current_rating,
    promptedConflictTypes: prompted.conflicts.map(c => c.entity_type),
    overwrittenTables: overwriteResult.updated,
    ratingAfterUnrelatedOverwrite: afterOverwrite.tables.platform_accounts[0].current_rating,
  }
}

function recentStatusFilter(): void {
  database('recent-filter')
  const problems = Array.from({ length: 200 }, (_, i) => problem(`recent-${i}`))
  problems.push(problem('older-solved', { first_seen_at: '2026-09-01T10:00:00+08:00', last_visited_at: '2026-09-01T10:00:00+08:00' }))
  assert.equal(importLearningData(payload({ problems, submissions: [submission('older-solved')] })).success, true)
  const detail = getProblemDetail('older-solved')!
  const filtered = getRecentProblems(200, undefined, 'solved')
  assert.equal(detail.status, 'solved')
  assert.equal(filtered.length, 0)
  observations.recentStatusFilter = { totalProblems: 201, matchingProblems: 1, requestedLimit: 200, actualReturned: filtered.length }
}

function invalidDurations(): void {
  database('invalid-durations')
  const outcome = importFile('negative-duration-input', payload({
    problems: [problem()], problem_visits: [visit('audit-problem', { duration_seconds: -600, active_seconds: -540 })],
  }))
  const stats = getDb().prepare('SELECT active_seconds, duration_seconds FROM user_daily_stats WHERE local_day = ?').get(day) as ExportRow
  assert.equal(stats.active_seconds, -540)
  assert.equal(stats.duration_seconds, -600)
  observations.invalidDurations = { previewValid: outcome.preview.valid, importSucceeded: outcome.result.success, stats }
}

function rollbackControl(): void {
  database('rollback-control')
  const malformed = payload({ problems: [problem()], submissions: [submission('audit-problem', { submitted_at: null })] })
  const result = importLearningDataFromParsedExport(malformed)
  assert.equal(result.success, false)
  const exported = exportLearningData()
  assert.equal(exported.tables.problems.length, 0)
  assert.equal(exported.tables.submissions.length, 0)
  observations.rollbackControl = {
    operationRejected: !result.success, problemCount: exported.tables.problems.length,
    submissionCount: exported.tables.submissions.length,
    integrityCheck: getDb().pragma('integrity_check', { simple: true }),
    foreignKeyCheck: getDb().pragma('foreign_key_check'),
  }
}

async function main(): Promise<void> {
  await app.whenReady()
  await backupAssets()
  noteRepresentations()
  noteWriteFailure()
  importedPath()
  deletedFacts()
  conflictCoverage()
  recentStatusFilter()
  invalidDurations()
  rollbackControl()
  closeDb()
  const result = {
    observedAt: new Date().toISOString(), environment: { platform: process.platform, os: os.release(), cpu: os.cpus()[0]?.model, versions: process.versions },
    runDirectory: path.relative(process.cwd(), runDir), observations,
  }
  fs.writeFileSync(path.join(outputDir, 'data-integrity-results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ completed: Object.keys(observations), evidence: 'tmp/audit-20260911/data-integrity-results.json' }))
  app.exit(0)
}

void main().catch(error => {
  closeDb()
  console.error(error)
  app.exit(1)
})
