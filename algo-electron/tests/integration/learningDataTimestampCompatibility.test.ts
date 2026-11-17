import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { upsertProblem } from '../../electron/db/repositories/problemRepository'
import { TIMESTAMP_COLUMNS } from '../../electron/db/timestampColumns'
import {
  exportLearningData,
  importLearningData,
  parseLearningDataExport,
  previewLearningDataImport,
} from '../../electron/backup/learningDataExport'

let directory = ''

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-export-time-'))
  initDbAtPath(path.join(directory, 'data.sqlite'))
  upsertProblem({
    platform: 'codeforces',
    platformProblemId: '1000A',
    canonicalUrl: 'https://example.test/1000A',
    title: 'Synthetic timestamp compatibility',
    confidence: 'url',
  })
  getDb()
    .prepare('UPDATE problems SET first_seen_at = ?, last_visited_at = ?')
    .run(1768443630123, 0)
})

afterEach(() => {
  closeDb()
  const resolved = path.resolve(directory)
  expect(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-export-time-`)).toBe(true)
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
})

function legacyExport() {
  const current = exportLearningData()
  const tables = Object.fromEntries(
    Object.entries(current.tables).map(([table, rows]) => [
      table,
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([column, value]) => [
            column,
            TIMESTAMP_COLUMNS[table].columns.includes(column) && typeof value === 'number'
              ? new Date(value).toISOString()
              : value,
          ]),
        ),
      ),
    ]),
  )
  return {
    ...current,
    schema_version: 1,
    exported_at: new Date(current.exported_at).toISOString(),
    tables,
  }
}

describe('learning data timestamp compatibility', () => {
  it('should canonicalize v1 offsets before preview and avoid false conflicts with v2', () => {
    const legacy = legacyExport()
    legacy.tables.problems[0].first_seen_at = '2026-01-15T10:20:30.123+08:00'
    const canonical = parseLearningDataExport(legacy)
    expect(canonical.schema_version).toBe(2)
    expect(typeof canonical.exported_at).toBe('number')
    expect(canonical.tables.problems[0].first_seen_at).toBe(1768443630123)
    expect(canonical.tables.problems[0].last_visited_at).toBe(0)
    expect(canonical.tables.problems[0].deleted_at).toBeNull()
    expect(previewLearningDataImport(legacy)).toMatchObject({ valid: true, conflicts: [] })
    expect(importLearningData(legacy)).toMatchObject({ success: true, skipped: { problems: 1 } })
  })

  it('should accept the original v1.0 metadata shape with only an exclusion list', () => {
    const legacy = legacyExport()
    const originalV1 = {
      ...legacy,
      metadata: {
        excluded: ['cookie_records', 'sync_queue', 'raw_json', 'local absolute file paths', 'logs'],
      },
    }
    const canonical = parseLearningDataExport(originalV1)
    expect(canonical.schema_version).toBe(2)
    expect(canonical.metadata.excluded).toEqual(originalV1.metadata.excluded)
    expect(canonical.metadata.complete_backup_hint).toBeTruthy()
    expect(previewLearningDataImport(originalV1)).toMatchObject({ valid: true, conflicts: [] })
    expect(importLearningData(originalV1)).toMatchObject({
      success: true,
      skipped: { problems: 1 },
    })
  })

  it('should reject invalid, null required or nonnumeric v2 timestamps before any write', () => {
    const before = getDb().prepare('SELECT * FROM problems').all()
    const invalid = legacyExport()
    invalid.tables.problems[0].first_seen_at = '2026-02-30T00:00:00Z'
    expect(previewLearningDataImport(invalid).valid).toBe(false)
    expect(() => importLearningData(invalid, true)).toThrow()
    expect(getDb().prepare('SELECT * FROM problems').all()).toEqual(before)
    const canonical = exportLearningData()
    expect(() => parseLearningDataExport({ ...canonical, exported_at: null })).toThrow()
    canonical.tables.problems[0].created_at = null
    expect(() => parseLearningDataExport(canonical)).toThrow()
    const wrongVersionShape = { ...legacyExport(), schema_version: 2 }
    expect(() => parseLearningDataExport(wrongVersionShape)).toThrow()
  })
})
