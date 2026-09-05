import { getDb } from '../db/connection'
import { recomputeProblemSubmissionState } from '../db/repositories/submissionRepository'
import { recomputeDailyStatsForDates } from '../db/repositories/statsRepository'
import { localDayFromTimestamp } from '../db/repositories/stats/date'
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
import { errorMessage } from '../shared/errors'

const EXPORT_TABLES = [
  'problems',
  'problem_visits',
  'submissions',
  'user_daily_stats',
  'platform_accounts',
  'rating_history',
] as const

const EXCLUDED_FIELDS = [
  'submissions.raw_json',
  'local absolute file paths',
  'logs',
] as const

type ExportTableName = typeof EXPORT_TABLES[number]

interface ExistingKeyRow {
  id?: string
  local_day?: string
}

interface ImportEffects {
  problemIds: Set<string>
  dates: Set<string>
}

export function exportLearningData(): LearningDataExport {
  const db = getDb()
  const exportedTables = new Set<string>(EXPORT_TABLES)
  const excludedTables = (db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `).all() as Array<{ name: string }>)
    .map(row => row.name)
    .filter(name => !exportedTables.has(name))

  return {
    app: LEARNING_DATA_EXPORT_APP,
    schema_version: LEARNING_DATA_EXPORT_VERSION,
    exported_at: nowBeijing(),
    metadata: {
      excluded: [
        ...excludedTables,
        ...EXCLUDED_FIELDS,
      ],
      excluded_tables: excludedTables,
      excluded_fields: [...EXCLUDED_FIELDS],
      complete_backup_hint: '完整备份请用数据库备份；数据库备份含本机敏感数据，仅用于受保护的本机恢复。',
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
    const plan = planImport(data)

    return {
      valid: true,
      schema_version: data.schema_version,
      counts: tableCounts(data),
      new_counts: plan.inserts,
      duplicate_counts: plan.duplicates,
      conflicts: collectConflicts(data),
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
    const effects: ImportEffects = { problemIds: new Set(), dates: new Set() }
    const problemIdMap = importProblems(data.tables.problems, overwriteConflicts, inserted, updated, skipped, effects)
    importProblemVisits(data.tables.problem_visits, problemIdMap, overwriteConflicts, inserted, updated, skipped, effects)
    importSubmissions(data.tables.submissions, problemIdMap, overwriteConflicts, inserted, updated, skipped, effects)
    importDailyStats(data.tables.user_daily_stats, overwriteConflicts, inserted, updated, skipped, effects)
    const accountIdMap = importAccounts(data.tables.platform_accounts, overwriteConflicts, inserted, updated, skipped)
    importRatingHistory(data.tables.rating_history, accountIdMap, overwriteConflicts, inserted, updated, skipped)

    // Imported snapshots cannot describe the union of both databases. Rebuild
    // after all fact writes, including dates and problem links replaced above.
    for (const date of recomputeProblemSubmissionState(effects.problemIds)) effects.dates.add(date)
    recomputeDailyStatsForDates(effects.dates)
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
  // Derived state and bookkeeping timestamps do not define metadata conflicts.
  const problemByKey = db.prepare(`
    SELECT id, canonical_url, title, contest_id, problem_index, source_platform,
      source_problem_id, difficulty, tags_json, first_seen_at, last_visited_at, deleted_at
    FROM problems
    WHERE platform = ? AND platform_problem_id = ?
  `)
  const submissionByKey = db.prepare(`
    SELECT id, problem_id, verdict, raw_verdict, submitted_at, language,
      runtime_ms, memory_kb, source_url, deleted_at
    FROM submissions
    WHERE platform = ? AND platform_submission_id = ?
  `)
  // Keep snapshot differences visible for confirmation, including visit time.
  // After import, the final fact rows determine these aggregates.
  const dailyStatByDay = db.prepare(`
    SELECT local_day, active_seconds, duration_seconds, visited_problem_count,
      solved_problem_count, submission_count, ac_submission_count,
      platform_distribution_json
    FROM user_daily_stats
    WHERE local_day = ?
  `)

  const problemIdMap = new Map<string, string>()
  for (const problem of data.tables.problems) {
    const existing = problemByKey.get(problem.platform, problem.platform_problem_id) as ExportRow | undefined
    problemIdMap.set(String(problem.id), String(existing?.id ?? problem.id))
    if (existing && differs(sanitizeRows([existing])[0], problem, ['id'])) {
      conflicts.push(conflict('problems', String(problem.id), '同一平台题目已存在且元数据不同'))
    }
  }

  for (const submission of data.tables.submissions) {
    const existing = submissionByKey.get(submission.platform, submission.platform_submission_id) as ExportRow | undefined
    const remapped = {
      ...submission,
      problem_id: submission.problem_id ? problemIdMap.get(String(submission.problem_id)) ?? null : null,
    }
    if (existing && differs(sanitizeRows([existing])[0], remapped, ['id'])) {
      conflicts.push(conflict('submissions', String(submission.id), '同一平台提交已存在且元数据不同'))
    }
  }

  for (const dailyStat of data.tables.user_daily_stats) {
    const existing = dailyStatByDay.get(dailyStat.local_day) as ExistingKeyRow | undefined
    if (existing && differs(existing, dailyStat, ['local_day'])) {
      conflicts.push(conflict('user_daily_stats', String(dailyStat.local_day), '同一日期统计已存在且数值不同'))
    }
  }

  return conflicts
}

/**
 * Classifies every exported row the way the import will actually treat it, so
 * `new_counts` and `duplicate_counts` cannot drift from what the apply does.
 * Deriving "new" by subtracting duplicates and conflicts from the total used to
 * double-count rows that are both, and matching rating history on the exported
 * account id used to miss duplicates entirely — two machines never share a
 * platform_accounts UUID, so a cross-device import always carries foreign ids.
 */
function planImport(data: LearningDataExport): {
  duplicates: Record<string, number>
  inserts: Record<string, number>
} {
  const db = getDb()
  const duplicates = emptyCounts()
  const inserts = emptyCounts()
  const record = (table: ExportTableName, exists: boolean): void => {
    if (exists) duplicates[table] += 1
    else inserts[table] += 1
  }

  // Prepared once per table: an archive worth uploading holds tens of thousands
  // of submissions, and better-sqlite3 recompiles on every prepare() call.
  const problemByKey = db.prepare('SELECT 1 FROM problems WHERE platform = ? AND platform_problem_id = ?')
  const submissionByKey = db.prepare('SELECT 1 FROM submissions WHERE platform = ? AND platform_submission_id = ?')
  const dailyStatByDay = db.prepare('SELECT 1 FROM user_daily_stats WHERE local_day = ?')
  const visitById = db.prepare('SELECT 1 FROM problem_visits WHERE id = ?')
  const accountByKey = db.prepare('SELECT id FROM platform_accounts WHERE platform = ? AND handle = ?')
  const ratingByKey = db.prepare('SELECT 1 FROM rating_history WHERE platform = ? AND account_id = ? AND contest_id = ?')

  for (const row of data.tables.problems) {
    record('problems', Boolean(problemByKey.get(row.platform, row.platform_problem_id)))
  }
  for (const row of data.tables.submissions) {
    record('submissions', Boolean(submissionByKey.get(row.platform, row.platform_submission_id)))
  }
  for (const row of data.tables.user_daily_stats) {
    record('user_daily_stats', Boolean(dailyStatByDay.get(row.local_day)))
  }

  // importProblemVisits skips a visit whose problem is not part of the export.
  const exportedProblemIds = new Set(data.tables.problems.map(row => String(row.id)))
  for (const row of data.tables.problem_visits) {
    if (row.problem_id === null || row.problem_id === undefined) continue
    if (!exportedProblemIds.has(String(row.problem_id))) continue
    record('problem_visits', Boolean(visitById.get(String(row.id))))
  }

  // importAccounts matches by (platform, handle) and remaps rating history onto
  // the local account id, so the preview must resolve ids the same way.
  const accountIdMap = new Map<string, string>()
  for (const row of data.tables.platform_accounts) {
    const existing = accountByKey.get(row.platform, row.handle) as { id: string } | undefined
    accountIdMap.set(String(row.id), existing?.id ?? String(row.id))
    record('platform_accounts', existing !== undefined)
  }
  for (const row of data.tables.rating_history) {
    if (row.account_id === null || row.account_id === undefined) continue
    const accountId = accountIdMap.get(String(row.account_id))
    if (accountId === undefined) continue
    record('rating_history', Boolean(ratingByKey.get(row.platform, accountId, row.contest_id)))
  }

  return { duplicates, inserts }
}

function importProblems(
  rows: ExportRow[],
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
  effects: ImportEffects,
): Map<string, string> {
  const db = getDb()
  const idMap = new Map<string, string>()

  for (const row of rows) {
    const exportedId = String(row.id)
    const existing = db.prepare(`
      SELECT id, first_solved_at FROM problems WHERE platform = ? AND platform_problem_id = ?
    `).get(row.platform, row.platform_problem_id) as { id: string; first_solved_at: string | null } | undefined

    if (existing) {
      idMap.set(exportedId, existing.id)
      if (overwrite) {
        markAffected(effects, existing.id, existing.first_solved_at)
        markAffected(effects, existing.id, row.first_solved_at)
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
    markAffected(effects, exportedId, row.first_solved_at)
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
  effects: ImportEffects,
): void {
  const db = getDb()
  for (const row of rows) {
    const existing = db.prepare(`
      SELECT problem_id, entered_at FROM problem_visits WHERE id = ?
    `).get(row.id) as { problem_id: string; entered_at: string } | undefined
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
      markAffected(effects, existing.problem_id, existing.entered_at)
      markAffected(effects, targetProblemId, row.entered_at)
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
    markAffected(effects, targetProblemId, row.entered_at)
  }
}

function importSubmissions(
  rows: ExportRow[],
  problemIdMap: Map<string, string>,
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
  effects: ImportEffects,
): void {
  const db = getDb()
  for (const row of rows) {
    const existing = db.prepare(`
      SELECT id, problem_id, submitted_at FROM submissions WHERE platform = ? AND platform_submission_id = ?
    `).get(row.platform, row.platform_submission_id) as {
      id: string; problem_id: string | null; submitted_at: string
    } | undefined
    const targetProblemId = row.problem_id ? problemIdMap.get(String(row.problem_id)) ?? null : null

    if (existing) {
      if (!overwrite) {
        skipped.submissions++
        continue
      }
      markAffected(effects, existing.problem_id, existing.submitted_at)
      markAffected(effects, targetProblemId, row.submitted_at)
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
    markAffected(effects, targetProblemId, row.submitted_at)
  }
}

function importDailyStats(
  rows: ExportRow[],
  overwrite: boolean,
  inserted: Record<string, number>,
  updated: Record<string, number>,
  skipped: Record<string, number>,
  effects: ImportEffects,
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
      markAffected(effects, null, row.local_day)
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
    markAffected(effects, null, row.local_day)
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

function markAffected(
  effects: ImportEffects,
  problemId: string | null | undefined,
  timestamp: ExportRow[string] | undefined,
): void {
  if (problemId) effects.problemIds.add(problemId)
  if (typeof timestamp !== 'string') return
  const date = localDayFromTimestamp(timestamp)
  if (date) effects.dates.add(date)
}

function existsByLocalDay(db: ReturnType<typeof getDb>, row: ExportRow): boolean {
  const existing = db.prepare(`
    SELECT 1 as found FROM user_daily_stats WHERE local_day = ?
  `).get(row.local_day) as { found: number } | undefined
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
