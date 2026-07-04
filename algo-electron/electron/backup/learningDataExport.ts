import { getDb } from '../db/connection'
import { nowBeijing } from '../shared/time'
import {
  LEARNING_DATA_EXPORT_APP,
  LEARNING_DATA_EXPORT_VERSION,
  type ExportRow,
  type ImportConflict,
  type ImportPreview,
  type ImportResult,
  type LearningDataExport,
} from './types'

const EXPORT_TABLES = [
  'problems',
  'problem_visits',
  'submissions',
  'user_daily_stats',
  'platform_accounts',
  'rating_history',
] as const

type ExportTableName = typeof EXPORT_TABLES[number]

interface ExistingKeyRow {
  id?: string
  local_day?: string
}

export function exportLearningData(): LearningDataExport {
  const db = getDb()

  return {
    app: LEARNING_DATA_EXPORT_APP,
    schema_version: LEARNING_DATA_EXPORT_VERSION,
    exported_at: nowBeijing(),
    metadata: {
      excluded: [
        'cookie_records',
        'sync_queue',
        'raw_json',
        'local absolute file paths',
        'logs',
      ],
    },
    tables: {
      problems: sanitizeRows(db.prepare(`
        SELECT id, platform, platform_problem_id, canonical_url, title, status,
          contest_id, problem_index, source_platform, source_problem_id,
          difficulty, tags_json, first_seen_at, last_visited_at, first_solved_at,
          created_at, updated_at, deleted_at
        FROM problems
      `).all() as ExportRow[]),
      problem_visits: sanitizeRows(db.prepare(`
        SELECT id, problem_id, session_id, platform, url, entered_at, left_at,
          duration_seconds, active_seconds, leave_reason, created_at, updated_at,
          deleted_at
        FROM problem_visits
      `).all() as ExportRow[]),
      submissions: sanitizeRows(db.prepare(`
        SELECT id, problem_id, platform, platform_submission_id, verdict,
          raw_verdict, language, submitted_at, is_first_ac, runtime_ms, memory_kb,
          source_url, created_at, updated_at, deleted_at
        FROM submissions
      `).all() as ExportRow[]),
      user_daily_stats: sanitizeRows(db.prepare(`
        SELECT local_day, active_seconds, duration_seconds, visited_problem_count,
          solved_problem_count, submission_count, ac_submission_count,
          platform_distribution_json, recomputed_at, created_at, updated_at,
          deleted_at
        FROM user_daily_stats
      `).all() as ExportRow[]),
      platform_accounts: sanitizeRows(db.prepare(`
        SELECT id, platform, handle, display_name, current_rating, peak_rating,
          last_synced_at, created_at, updated_at, deleted_at
        FROM platform_accounts
      `).all() as ExportRow[]),
      rating_history: sanitizeRows(db.prepare(`
        SELECT id, account_id, platform, contest_id, contest_name, rank,
          rating_before, rating_after, delta, contest_at, created_at, updated_at,
          deleted_at
        FROM rating_history
      `).all() as ExportRow[]),
    },
  }
}

function sanitizeRows(rows: ExportRow[]): ExportRow[] {
  return rows.map(row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'string' && isLocalPathLike(value) ? null : value,
    ]),
  ) as ExportRow)
}

function isLocalPathLike(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^file:\/\//i.test(value)
}

export function parseLearningDataExport(raw: unknown): LearningDataExport {
  if (!raw || typeof raw !== 'object') {
    throw new Error('导入文件不是有效 JSON 对象')
  }

  const data = raw as Partial<LearningDataExport>
  if (data.app !== LEARNING_DATA_EXPORT_APP) {
    throw new Error('导入文件不是 Algo Learning Platform 学习数据导出')
  }
  if (data.schema_version !== LEARNING_DATA_EXPORT_VERSION) {
    throw new Error(`不支持的导出版本：${String(data.schema_version)}`)
  }
  if (!data.tables || typeof data.tables !== 'object') {
    throw new Error('导入文件缺少 tables')
  }

  for (const table of EXPORT_TABLES) {
    if (!Array.isArray(data.tables[table])) {
      throw new Error(`导入文件缺少 ${table} 数组`)
    }
  }

  return data as LearningDataExport
}

export function previewLearningDataImport(raw: unknown): ImportPreview {
  try {
    const data = parseLearningDataExport(raw)
    const conflicts = collectConflicts(data)
    const counts = tableCounts(data)
    const duplicateCounts = collectDuplicateCounts(data)
    const newCounts: Record<string, number> = {}
    for (const table of EXPORT_TABLES) {
      newCounts[table] = Math.max(0, counts[table] - duplicateCounts[table] - countConflictsForTable(conflicts, table))
    }

    return {
      valid: true,
      schema_version: data.schema_version,
      counts,
      new_counts: newCounts,
      duplicate_counts: duplicateCounts,
      conflicts,
    }
  } catch (error) {
    return {
      valid: false,
      counts: emptyCounts(),
      new_counts: emptyCounts(),
      duplicate_counts: emptyCounts(),
      conflicts: [],
      error: errorMessage(error),
    }
  }
}

export function importLearningData(data: LearningDataExport, overwriteConflicts = false): ImportResult {
  const db = getDb()
  const conflicts = collectConflicts(data)
  if (conflicts.length > 0 && !overwriteConflicts) {
    return {
      success: false,
      inserted: emptyCounts(),
      updated: emptyCounts(),
      skipped: emptyCounts(),
      conflicts,
      error: '存在冲突，未执行导入。请先确认冲突处理策略。',
    }
  }

  const inserted = emptyCounts()
  const updated = emptyCounts()
  const skipped = emptyCounts()

  const transaction = db.transaction(() => {
    const problemIdMap = importProblems(data.tables.problems, overwriteConflicts, inserted, updated, skipped)
    importProblemVisits(data.tables.problem_visits, problemIdMap, overwriteConflicts, inserted, updated, skipped)
    importSubmissions(data.tables.submissions, problemIdMap, overwriteConflicts, inserted, updated, skipped)
    importDailyStats(data.tables.user_daily_stats, overwriteConflicts, inserted, updated, skipped)
    const accountIdMap = importAccounts(data.tables.platform_accounts, overwriteConflicts, inserted, updated, skipped)
    importRatingHistory(data.tables.rating_history, accountIdMap, overwriteConflicts, inserted, updated, skipped)
  })

  transaction()

  return {
    success: true,
    inserted,
    updated,
    skipped,
    conflicts: [],
  }
}

function collectConflicts(data: LearningDataExport): ImportConflict[] {
  const conflicts: ImportConflict[] = []
  const db = getDb()

  for (const problem of data.tables.problems) {
    const existing = db.prepare(`
      SELECT id, canonical_url, title, tags_json
      FROM problems
      WHERE platform = ? AND platform_problem_id = ?
    `).get(problem.platform, problem.platform_problem_id) as ExistingKeyRow | undefined
    if (existing && existing.id !== problem.id && differs(existing, problem, ['id'])) {
      conflicts.push(conflict('problems', String(problem.id), '同一平台题目已存在且元数据不同'))
    }
  }

  for (const submission of data.tables.submissions) {
    const existing = db.prepare(`
      SELECT id, verdict, submitted_at, language
      FROM submissions
      WHERE platform = ? AND platform_submission_id = ?
    `).get(submission.platform, submission.platform_submission_id) as ExistingKeyRow | undefined
    if (existing && existing.id !== submission.id && differs(existing, submission, ['id'])) {
      conflicts.push(conflict('submissions', String(submission.id), '同一平台提交已存在且元数据不同'))
    }
  }

  for (const dailyStat of data.tables.user_daily_stats) {
    const existing = db.prepare(`
      SELECT local_day, visited_problem_count, solved_problem_count, submission_count, ac_submission_count
      FROM user_daily_stats
      WHERE local_day = ?
    `).get(dailyStat.local_day) as ExistingKeyRow | undefined
    if (existing && differs(existing, dailyStat, ['local_day'])) {
      conflicts.push(conflict('user_daily_stats', String(dailyStat.local_day), '同一日期统计已存在且数值不同'))
    }
  }

  return conflicts
}

function collectDuplicateCounts(data: LearningDataExport): Record<string, number> {
  const db = getDb()
  const counts = emptyCounts()

  counts.problems = data.tables.problems.filter(row => existsByProblemKey(db, row)).length
  counts.problem_visits = data.tables.problem_visits.filter(row => existsById(db, 'problem_visits', String(row.id))).length
  counts.submissions = data.tables.submissions.filter(row => existsBySubmissionKey(db, row)).length
  counts.user_daily_stats = data.tables.user_daily_stats.filter(row => existsByLocalDay(db, row)).length
  counts.platform_accounts = data.tables.platform_accounts.filter(row => existsByAccountKey(db, row)).length
  counts.rating_history = data.tables.rating_history.filter(row => existsByRatingKey(db, row)).length
  return counts
}

function importProblems(
  rows: ExportRow[],
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
): Map<string, string> {
  const db = getDb()
  const idMap = new Map<string, string>()

  for (const row of rows) {
    const exportedId = String(row.id)
    const existing = db.prepare(`
      SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?
    `).get(row.platform, row.platform_problem_id) as { id: string } | undefined

    if (existing) {
      idMap.set(exportedId, existing.id)
      if (overwrite) {
        db.prepare(`
          UPDATE problems SET canonical_url = ?, title = ?, status = ?, contest_id = ?,
            problem_index = ?, source_platform = ?, source_problem_id = ?, difficulty = ?,
            tags_json = ?, first_seen_at = ?, last_visited_at = ?, first_solved_at = ?,
            updated_at = ?, deleted_at = ?
          WHERE id = ?
        `).run(
          row.canonical_url, row.title, row.status, row.contest_id,
          row.problem_index, row.source_platform, row.source_problem_id, row.difficulty,
          row.tags_json, row.first_seen_at, row.last_visited_at, row.first_solved_at,
          row.updated_at, row.deleted_at, existing.id,
        )
        updated.problems++
      } else {
        skipped.problems++
      }
      continue
    }

    db.prepare(`
      INSERT INTO problems (
        id, platform, platform_problem_id, canonical_url, title, status,
        contest_id, problem_index, source_platform, source_problem_id, difficulty,
        tags_json, first_seen_at, last_visited_at, first_solved_at,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.platform, row.platform_problem_id, row.canonical_url, row.title, row.status,
      row.contest_id, row.problem_index, row.source_platform, row.source_problem_id, row.difficulty,
      row.tags_json, row.first_seen_at, row.last_visited_at, row.first_solved_at,
      row.created_at, row.updated_at, row.deleted_at,
    )
    idMap.set(exportedId, exportedId)
    inserted.problems++
  }

  return idMap
}

function importProblemVisits(
  rows: ExportRow[],
  problemIdMap: Map<string, string>,
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
): void {
  const db = getDb()
  for (const row of rows) {
    const existing = existsById(db, 'problem_visits', String(row.id))
    const targetProblemId = row.problem_id ? problemIdMap.get(String(row.problem_id)) : null
    if (!targetProblemId) {
      skipped.problem_visits++
      continue
    }
    if (existing) {
      if (!overwrite) {
        skipped.problem_visits++
        continue
      }
      db.prepare(`
        UPDATE problem_visits SET problem_id = ?, session_id = ?, platform = ?, url = ?,
          entered_at = ?, left_at = ?, duration_seconds = ?, active_seconds = ?,
          leave_reason = ?, updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        targetProblemId, row.session_id, row.platform, row.url,
        row.entered_at, row.left_at, row.duration_seconds, row.active_seconds,
        row.leave_reason, row.updated_at, row.deleted_at, row.id,
      )
      updated.problem_visits++
      continue
    }

    db.prepare(`
      INSERT INTO problem_visits (
        id, problem_id, session_id, platform, url, entered_at, left_at,
        duration_seconds, active_seconds, leave_reason, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, targetProblemId, row.session_id, row.platform, row.url,
      row.entered_at, row.left_at, row.duration_seconds, row.active_seconds,
      row.leave_reason, row.created_at, row.updated_at, row.deleted_at,
    )
    inserted.problem_visits++
  }
}

function importSubmissions(
  rows: ExportRow[],
  problemIdMap: Map<string, string>,
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
): void {
  const db = getDb()
  for (const row of rows) {
    const existing = db.prepare(`
      SELECT id FROM submissions WHERE platform = ? AND platform_submission_id = ?
    `).get(row.platform, row.platform_submission_id) as { id: string } | undefined
    const targetProblemId = row.problem_id ? problemIdMap.get(String(row.problem_id)) ?? null : null

    if (existing) {
      if (!overwrite) {
        skipped.submissions++
        continue
      }
      db.prepare(`
        UPDATE submissions SET problem_id = ?, verdict = ?, raw_verdict = ?, language = ?,
          submitted_at = ?, is_first_ac = ?, runtime_ms = ?, memory_kb = ?,
          source_url = ?, updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        targetProblemId, row.verdict, row.raw_verdict, row.language,
        row.submitted_at, row.is_first_ac, row.runtime_ms, row.memory_kb,
        row.source_url, row.updated_at, row.deleted_at, existing.id,
      )
      updated.submissions++
      continue
    }

    db.prepare(`
      INSERT INTO submissions (
        id, problem_id, platform, platform_submission_id, verdict, raw_verdict,
        language, submitted_at, is_first_ac, runtime_ms, memory_kb, source_url,
        raw_json, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(
      row.id, targetProblemId, row.platform, row.platform_submission_id, row.verdict,
      row.raw_verdict, row.language, row.submitted_at, row.is_first_ac,
      row.runtime_ms, row.memory_kb, row.source_url, row.created_at, row.updated_at,
      row.deleted_at,
    )
    inserted.submissions++
  }
}

function importDailyStats(
  rows: ExportRow[],
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
): void {
  const db = getDb()
  for (const row of rows) {
    const exists = existsByLocalDay(db, row)
    if (exists) {
      if (!overwrite) {
        skipped.user_daily_stats++
        continue
      }
      db.prepare(`
        UPDATE user_daily_stats SET active_seconds = ?, duration_seconds = ?,
          visited_problem_count = ?, solved_problem_count = ?, submission_count = ?,
          ac_submission_count = ?, platform_distribution_json = ?, recomputed_at = ?,
          updated_at = ?, deleted_at = ?
        WHERE local_day = ?
      `).run(
        row.active_seconds, row.duration_seconds, row.visited_problem_count,
        row.solved_problem_count, row.submission_count, row.ac_submission_count,
        row.platform_distribution_json, row.recomputed_at, row.updated_at,
        row.deleted_at, row.local_day,
      )
      updated.user_daily_stats++
      continue
    }

    db.prepare(`
      INSERT INTO user_daily_stats (
        local_day, active_seconds, duration_seconds, visited_problem_count,
        solved_problem_count, submission_count, ac_submission_count,
        platform_distribution_json, recomputed_at, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.local_day, row.active_seconds, row.duration_seconds,
      row.visited_problem_count, row.solved_problem_count, row.submission_count,
      row.ac_submission_count, row.platform_distribution_json, row.recomputed_at,
      row.created_at, row.updated_at, row.deleted_at,
    )
    inserted.user_daily_stats++
  }
}

function importAccounts(
  rows: ExportRow[],
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
): Map<string, string> {
  const db = getDb()
  const idMap = new Map<string, string>()

  for (const row of rows) {
    const exportedId = String(row.id)
    const existing = db.prepare(`
      SELECT id FROM platform_accounts WHERE platform = ? AND handle = ?
    `).get(row.platform, row.handle) as { id: string } | undefined

    if (existing) {
      idMap.set(exportedId, existing.id)
      if (!overwrite) {
        skipped.platform_accounts++
        continue
      }
      db.prepare(`
        UPDATE platform_accounts SET display_name = ?, current_rating = ?, peak_rating = ?,
          last_synced_at = ?, updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        row.display_name, row.current_rating, row.peak_rating,
        row.last_synced_at, row.updated_at, row.deleted_at, existing.id,
      )
      updated.platform_accounts++
      continue
    }

    db.prepare(`
      INSERT INTO platform_accounts (
        id, platform, handle, display_name, current_rating, peak_rating,
        last_synced_at, raw_json, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(
      row.id, row.platform, row.handle, row.display_name, row.current_rating,
      row.peak_rating, row.last_synced_at, row.created_at, row.updated_at,
      row.deleted_at,
    )
    idMap.set(exportedId, exportedId)
    inserted.platform_accounts++
  }

  return idMap
}

function importRatingHistory(
  rows: ExportRow[],
  accountIdMap: Map<string, string>,
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
): void {
  const db = getDb()
  for (const row of rows) {
    const targetAccountId = row.account_id ? accountIdMap.get(String(row.account_id)) : null
    if (!targetAccountId) {
      skipped.rating_history++
      continue
    }

    const existing = db.prepare(`
      SELECT id FROM rating_history
      WHERE platform = ? AND account_id = ? AND contest_id = ?
    `).get(row.platform, targetAccountId, row.contest_id) as { id: string } | undefined

    if (existing) {
      if (!overwrite) {
        skipped.rating_history++
        continue
      }
      db.prepare(`
        UPDATE rating_history SET contest_name = ?, rank = ?, rating_before = ?,
          rating_after = ?, delta = ?, contest_at = ?, updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        row.contest_name, row.rank, row.rating_before,
        row.rating_after, row.delta, row.contest_at,
        row.updated_at, row.deleted_at, existing.id,
      )
      updated.rating_history++
      continue
    }

    db.prepare(`
      INSERT INTO rating_history (
        id, account_id, platform, contest_id, contest_name, rank,
        rating_before, rating_after, delta, contest_at, raw_json,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(
      row.id, targetAccountId, row.platform, row.contest_id, row.contest_name,
      row.rank, row.rating_before, row.rating_after, row.delta, row.contest_at,
      row.created_at, row.updated_at, row.deleted_at,
    )
    inserted.rating_history++
  }
}

function tableCounts(data: LearningDataExport): Record<string, number> {
  const counts = emptyCounts()
  for (const table of EXPORT_TABLES) {
    counts[table] = data.tables[table].length
  }
  return counts
}

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(EXPORT_TABLES.map(table => [table, 0]))
}

function countConflictsForTable(conflicts: ImportConflict[], table: ExportTableName): number {
  return conflicts.filter(conflictItem => conflictItem.entity_type === table).length
}

function existsById(db: ReturnType<typeof getDb>, tableName: string, id: string): boolean {
  const row = db.prepare(`SELECT 1 as found FROM ${tableName} WHERE id = ?`).get(id) as { found: number } | undefined
  return Boolean(row)
}

function existsByProblemKey(db: ReturnType<typeof getDb>, row: ExportRow): boolean {
  const existing = db.prepare(`
    SELECT 1 as found FROM problems WHERE platform = ? AND platform_problem_id = ?
  `).get(row.platform, row.platform_problem_id) as { found: number } | undefined
  return Boolean(existing)
}

function existsBySubmissionKey(db: ReturnType<typeof getDb>, row: ExportRow): boolean {
  const existing = db.prepare(`
    SELECT 1 as found FROM submissions WHERE platform = ? AND platform_submission_id = ?
  `).get(row.platform, row.platform_submission_id) as { found: number } | undefined
  return Boolean(existing)
}

function existsByLocalDay(db: ReturnType<typeof getDb>, row: ExportRow): boolean {
  const existing = db.prepare(`
    SELECT 1 as found FROM user_daily_stats WHERE local_day = ?
  `).get(row.local_day) as { found: number } | undefined
  return Boolean(existing)
}

function existsByAccountKey(db: ReturnType<typeof getDb>, row: ExportRow): boolean {
  const existing = db.prepare(`
    SELECT 1 as found FROM platform_accounts WHERE platform = ? AND handle = ?
  `).get(row.platform, row.handle) as { found: number } | undefined
  return Boolean(existing)
}

function existsByRatingKey(db: ReturnType<typeof getDb>, row: ExportRow): boolean {
  const existing = db.prepare(`
    SELECT 1 as found FROM rating_history WHERE platform = ? AND account_id = ? AND contest_id = ?
  `).get(row.platform, row.account_id, row.contest_id) as { found: number } | undefined
  return Boolean(existing)
}

function differs(existing: ExistingKeyRow, incoming: ExportRow, ignoredKeys: string[]): boolean {
  for (const [key, value] of Object.entries(existing)) {
    if (ignoredKeys.includes(key)) continue
    if (String(value ?? '') !== String(incoming[key] ?? '')) {
      return true
    }
  }
  return false
}

function conflict(entityType: string, entityId: string, reason: string): ImportConflict {
  return { entity_type: entityType, entity_id: entityId, reason }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
