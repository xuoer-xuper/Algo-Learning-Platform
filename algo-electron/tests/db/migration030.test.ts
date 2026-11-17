import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migration030 } from '../../electron/db/migrations/030_timestamps_to_unix_ms'
import { runMigrations } from '../../electron/db/migrate'
import { closeDb, initDbAtPathWithMigrationSafety } from '../../electron/db/connection'
import {
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
} from '../../electron/backup/sqliteMigrationBackup'
import { TIMESTAMP_COLUMNS } from '../../electron/db/timestampColumns'
import { normalizeLegacyAIContext } from '../../electron/db/legacy-ai-context'

const schema = fs.readFileSync(path.join(process.cwd(), 'tests/db/fixtures/rc1.schema.sql'), 'utf8')
const directories: string[] = []
afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) {
    expect(
      path
        .resolve(directory)
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-migration030-`),
    ).toBe(true)
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})

function legacyDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys=ON')
  db.exec(schema)
  return db
}

function context() {
  return {
    schema_version: 1,
    exported_at: '2026-01-15T02:20:30.123Z',
    wrong_problems: [
      { last_attempt: '2026-01-15T10:20:30.123+08:00', title: '2026-01-01T00:00:00' },
    ],
    unreviewed_problems: [{ last_visited_at: '1970-01-01T00:00:00Z' }],
    recent_activity: [{ occurred_at: '2026-01-15T02:20:30.123Z' }],
    trends: { daily_stats: [{ local_day: '2026-01-15' }] },
    extra: '2026-01-01T00:00:00',
  }
}

describe('migration 030', () => {
  it('should reject direct or nested unsafe use and restore foreign key enforcement', () => {
    const db = legacyDb()
    try {
      expect(() => migration030.up(db)).toThrow('guarded')
      expect(() => db.transaction(() => runMigrations(db, [migration030]))()).toThrow(
        'existing transaction',
      )
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      runMigrations(db, [migration030])
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(
        db
          .prepare('SELECT typeof(applied_at) AS type FROM schema_migrations WHERE version=30')
          .get(),
      ).toEqual({ type: 'integer' })
      expect(
        Object.values(TIMESTAMP_COLUMNS).reduce((sum, value) => sum + value.columns.length, 0),
      ).toBe(82)
    } finally {
      db.close()
    }
  })

  it('should preserve rowid, views, triggers and explicit epoch zero while converting owned JSON only', () => {
    const db = legacyDb()
    try {
      db.prepare(
        `INSERT INTO notes(rowid,id,title,file_path,created_at,updated_at,content) VALUES (77,'n','title','n.md',?,?,?)`,
      ).run('1970-01-01T00:00:00Z', '2026-01-15T02:20:30.123Z', '2026-01-01T00:00:00')
      db.exec(`CREATE VIEW note_clock AS SELECT created_at FROM notes;
        CREATE TRIGGER note_title_update AFTER UPDATE OF title ON notes BEGIN UPDATE notes SET word_count=99 WHERE id=NEW.id; END;`)
      db.prepare(
        `INSERT INTO ai_context_snapshots(id,snapshot_date,context_json,schema_version,created_at)
        VALUES ('snapshot','2026-01-15',?,1,'2026-01-15T02:20:30.123Z')`,
      ).run(JSON.stringify(context()))
      runMigrations(db, [migration030])
      expect(
        db.prepare('SELECT rowid,created_at,updated_at,content,word_count FROM notes').get(),
      ).toEqual({
        rowid: 77,
        created_at: 0,
        updated_at: 1768443630123,
        content: '2026-01-01T00:00:00',
        word_count: 0,
      })
      expect(db.prepare('SELECT * FROM note_clock').get()).toEqual({ created_at: 0 })
      db.prepare('UPDATE notes SET title=?').run('changed')
      expect(db.prepare('SELECT word_count FROM notes').get()).toEqual({ word_count: 99 })
      const row = db
        .prepare('SELECT context_json,schema_version FROM ai_context_snapshots')
        .get() as { context_json: string; schema_version: number }
      expect(row.schema_version).toBe(2)
      expect(JSON.parse(row.context_json)).toEqual({
        ...context(),
        schema_version: 2,
        exported_at: 1768443630123,
        wrong_problems: [{ last_attempt: 1768443630123, title: '2026-01-01T00:00:00' }],
        unreviewed_problems: [{ last_visited_at: 0 }],
        recent_activity: [{ occurred_at: 1768443630123 }],
      })
    } finally {
      db.close()
    }
  })

  it('should preserve numeric millisecond values stored with legacy TEXT affinity', () => {
    const db = legacyDb()
    const instant = 1768443630123
    try {
      db.prepare(
        `INSERT INTO problems
        (id, platform, platform_problem_id, canonical_url, status, first_seen_at, first_solved_at, created_at, updated_at)
        VALUES ('numeric-problem', 'codeforces', '1000A', 'https://example.test/problem', 'solved', ?, ?, ?, ?)`,
      ).run(
        '2026-01-15T02:20:30.123Z',
        instant,
        '2026-01-15T02:20:30.123Z',
        '2026-01-15T02:20:30.123Z',
      )
      db.prepare(
        `INSERT INTO submissions
        (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
        VALUES ('numeric-submission', 'numeric-problem', 'codeforces', 'cf-100', 'AC', ?, ?, ?)`,
      ).run(instant, '2026-01-15T02:20:30.123Z', '2026-01-15T02:20:30.123Z')
      expect(
        db.prepare('SELECT submitted_at, typeof(submitted_at) AS type FROM submissions').get(),
      ).toEqual({ submitted_at: `${instant}.0`, type: 'text' })
      const insertBucket = db.prepare(`INSERT INTO user_daily_stats
        (local_day, submission_count, ac_submission_count, solved_problem_count, created_at, updated_at)
        VALUES (?, 8, 7, 6, '2026-01-15T02:20:30.123Z', '2026-01-15T02:20:30.123Z')`)
      insertBucket.run(String(instant).slice(0, 10))
      insertBucket.run('1234567890')
      insertBucket.run('2000-01-01')
      runMigrations(db, [migration030])
      expect(
        db.prepare('SELECT submitted_at, typeof(submitted_at) AS type FROM submissions').get(),
      ).toEqual({ submitted_at: instant, type: 'integer' })
      expect(
        db.prepare('SELECT first_solved_at, typeof(first_solved_at) AS type FROM problems').get(),
      ).toEqual({ first_solved_at: instant, type: 'integer' })
      expect(
        db
          .prepare(
            'SELECT SUM(solved_problem_count) AS solved, SUM(ac_submission_count) AS ac FROM user_daily_stats',
          )
          .get(),
      ).toEqual({ solved: 1, ac: 1 })
      expect(
        db
          .prepare("SELECT local_day FROM user_daily_stats WHERE local_day NOT GLOB '*[^0-9]*'")
          .all(),
      ).toEqual([])
      expect(
        db
          .prepare(
            "SELECT submission_count, created_at FROM user_daily_stats WHERE local_day = '2000-01-01'",
          )
          .get(),
      ).toEqual({ submission_count: 0, created_at: instant })
    } finally {
      db.close()
    }
  })

  it('should reject unknown malformed aggregate keys and roll back rather than broaden cache repair', () => {
    const db = legacyDb()
    try {
      db.prepare(
        `INSERT INTO user_daily_stats (local_day, created_at, updated_at)
        VALUES ('not-a-day', '2026-01-15T02:20:30.123Z', '2026-01-15T02:20:30.123Z')`,
      ).run()
      expect(() => runMigrations(db, [migration030])).toThrow('Invalid local day')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(db.prepare('SELECT local_day, created_at FROM user_daily_stats').get()).toEqual({
        local_day: 'not-a-day',
        created_at: '2026-01-15T02:20:30.123Z',
      })
      expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
        version: 29,
      })
    } finally {
      db.close()
    }
  })

  it('should restore a real pre-migration backup after a late invalid column and block retry', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-migration030-'))
    directories.push(directory)
    const dbPath = path.join(directory, 'input.sqlite')
    const backupDir = path.join(directory, 'backups')
    const source = new Database(dbPath)
    source.exec(schema)
    source
      .prepare(
        `INSERT INTO user_scripts(id,name,code,match_urls_json,created_at,updated_at)
      VALUES ('bad','bad','','[]','2026-01-15T02:20:30.123Z',?)`,
      )
      .run('PRIVATE_INVALID_DATE')
    source.close()
    await expect(initDbAtPathWithMigrationSafety(dbPath, { backupDir })).rejects.toThrow(
      'user_scripts.updated_at',
    )
    const restored = new Database(dbPath, { readonly: true })
    try {
      expect(
        restored.prepare('SELECT MAX(version) AS version FROM schema_migrations').get(),
      ).toEqual({ version: 29 })
      expect(restored.prepare('SELECT updated_at FROM user_scripts').get()).toEqual({
        updated_at: 'PRIVATE_INVALID_DATE',
      })
      expect(
        (restored.pragma('table_info(notes)') as { name: string; type: string }[]).find(
          (c) => c.name === 'created_at',
        )?.type,
      ).toBe('TEXT')
    } finally {
      restored.close()
    }
    const marker = fs.readFileSync(getMigrationFailureMarkerPath(backupDir, dbPath), 'utf8')
    expect(marker).not.toContain('PRIVATE_INVALID_DATE')
    await expect(initDbAtPathWithMigrationSafety(dbPath, { backupDir })).rejects.toBeInstanceOf(
      MigrationRetryBlockedError,
    )
  })

  it('should reject malformed or unknown-version AI context without changing the database', () => {
    expect(() => normalizeLegacyAIContext({ ...context(), schema_version: 3 })).toThrow('version')
    expect(() =>
      normalizeLegacyAIContext({
        ...context(),
        wrong_problems: [{ last_attempt: 'secret invalid' }],
      }),
    ).toThrow('timestamp')
    const db = legacyDb()
    try {
      db.prepare(
        `INSERT INTO ai_context_snapshots(id,snapshot_date,context_json,schema_version,created_at)
        VALUES ('snapshot','2026-01-15','{"schema_version":3}',3,'2026-01-15T02:20:30.123Z')`,
      ).run()
      expect(() => runMigrations(db, [migration030])).toThrow('version')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
        version: 29,
      })
      expect(
        db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE '__timestamps_030_%'").all(),
      ).toEqual([])
    } finally {
      db.close()
    }
  })
})
