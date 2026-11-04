import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, initDbAtPathWithMigrationSafety } from '../../electron/db/connection'
import {
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
} from '../../electron/backup/sqliteMigrationBackup'
import provenance from './fixtures/provenance.json'

const fixtureRoot = path.join(process.cwd(), 'tests/db/fixtures')
const directories: string[] = []
const LOCAL = '2026-01-15T10:20:30.123'
const UTC = '2026-01-15T02:20:30.123Z'
const OFFSET = '2026-01-15T10:20:30.123+08:00'
const LATER = '2026-01-16T10:20:30.123'
const SYNTHETIC_CODE =
  '// ==UserScript==\n// @name Fixture helper\n// @match https://example.test/*\n// @run-at document-start\n// ==/UserScript=='

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) {
    const resolved = path.resolve(directory)
    assert.ok(
      resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-historical-fixture-`),
    )
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})

function temporaryPaths() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-historical-fixture-'))
  directories.push(directory)
  return {
    dbPath: path.join(directory, 'fixture.sqlite'),
    backupDir: path.join(directory, 'backups'),
  }
}

function insert(
  db: Database.Database,
  table: string,
  values: Record<string, string | number | null | Uint8Array>,
): void {
  const keys = Object.keys(values)
  db.prepare(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
  ).run(...Object.values(values))
}

function createHistoricalDatabase(
  dbPath: string,
  release: (typeof provenance.releases)[number],
): void {
  const db = new Database(dbPath)
  try {
    db.pragma('foreign_keys = ON')
    const sql = fs.readFileSync(path.join(fixtureRoot, release.schemaFile), 'utf8')
    expect(createHash('sha256').update(sql).digest('hex')).toBe(release.schemaSha256)
    db.exec(sql)
    expect(
      db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
    ).toEqual(release.migrations)
    insert(db, 'problems', {
      id: 'problem',
      platform: 'codeforces',
      platform_problem_id: '1000A',
      canonical_url: 'https://example.test/problem',
      status: 'solved',
      first_seen_at: LOCAL,
      first_solved_at: OFFSET,
      created_at: LOCAL,
      updated_at: LATER,
      deleted_at: null,
    })
    insert(db, 'problem_visits', {
      id: 'visit',
      problem_id: 'problem',
      platform: 'codeforces',
      url: 'https://example.test/problem',
      entered_at: LOCAL,
      left_at: LATER,
      duration_seconds: 60,
      created_at: LOCAL,
      updated_at: LATER,
    })
    insert(db, 'submissions', {
      id: 'submission',
      problem_id: 'problem',
      platform: 'codeforces',
      platform_submission_id: 'cf-fixture',
      verdict: 'AC',
      submitted_at: OFFSET,
      created_at: LOCAL,
      updated_at: LATER,
    })
    insert(db, 'activity_events', {
      id: 'activity',
      event_type: 'visit_start',
      occurred_at: LOCAL,
      local_day: '2026-01-15',
      problem_id: 'problem',
      created_at: LOCAL,
      updated_at: LATER,
    })
    insert(db, 'user_daily_stats', {
      local_day: '2026-01-15',
      duration_seconds: 60,
      visited_problem_count: 1,
      solved_problem_count: 1,
      submission_count: 1,
      ac_submission_count: 1,
      platform_distribution_json: '[{"platform":"codeforces","count":1}]',
      recomputed_at: LATER,
      created_at: LOCAL,
      updated_at: LATER,
    })
    insert(db, 'notes', {
      id: 'note',
      problem_id: 'problem',
      title: 'Synthetic note',
      file_path: 'synthetic.md',
      created_at: LOCAL,
      updated_at: LATER,
      content: 'Synthetic data, not user content',
    })
    insert(db, 'platform_accounts', {
      id: 'account',
      platform: 'codeforces',
      handle: 'synthetic',
      created_at: LOCAL,
      updated_at: LATER,
      last_synced_at: OFFSET,
    })
    insert(db, 'rating_history', {
      id: 'rating',
      account_id: 'account',
      platform: 'codeforces',
      contest_id: 'fixture',
      contest_at: OFFSET,
      created_at: LOCAL,
      updated_at: LATER,
    })
    insert(db, 'site_configs', {
      id: 'site',
      name: 'Synthetic',
      domains_json: '["example.test"]',
      home_url: 'https://example.test',
      created_at: LOCAL,
      updated_at: LATER,
    })
    for (const [id, createdAt, deletedAt] of [
      ['script-a', UTC, null],
      ['script-b', '2026-01-16T02:20:30.123Z', null],
      ['script-deleted', '2026-01-14T02:20:30.123Z', UTC],
    ] as const) {
      insert(db, 'user_scripts', {
        id,
        name: 'Fixture helper',
        match_urls_json: '["https://example.test/*"]',
        code: SYNTHETIC_CODE,
        created_at: createdAt,
        updated_at: release.version === 29 ? LOCAL : createdAt,
        deleted_at: deletedAt,
        ...(release.version === 29
          ? {
              namespace: id === 'script-a' ? null : `local:${id}`,
              identity_name: 'Fixture helper',
              auto_update_enabled: id === 'script-a' ? 1 : 0,
              run_at: 'document-start',
            }
          : {}),
      })
    }
    if (release.version >= 24) {
      insert(db, 'coach_events', {
        event_id: 'event',
        event_type: 'first_ac',
        severity: 'info',
        score: 1,
        created_at: LOCAL,
      })
      insert(db, 'coach_feedback', {
        feedback_id: 'feedback',
        feedback_type: 'helpful',
        local_day: '2026-01-15',
        created_at: LOCAL,
      })
    }
    if (release.version === 29) {
      insert(db, 'site_credentials', {
        id: 'credential',
        site_id: 'site',
        username: 'synthetic',
        secret_envelope:
          '{"version":1,"provider":"electron-safe-storage","ciphertextBase64":"fixture"}',
        created_at: LOCAL,
        updated_at: LATER,
      })
      insert(db, 'user_script_values', {
        id: 'value',
        script_id: 'script-a',
        value_key: 'fixture',
        value_json: '{"dateLikeUserString":"2026-01-15T00:00:00"}',
        created_at: LOCAL,
        updated_at: LATER,
      })
      insert(db, 'user_script_resources', {
        id: 'resource',
        script_id: 'script-a',
        resource_kind: 'resource',
        resource_key: 'asset',
        declaration_order: 0,
        source_url: 'https://example.test/asset',
        content_blob: Uint8Array.from([0, 128, 255]),
        fetched_at: LOCAL,
        created_at: LOCAL,
        updated_at: LATER,
      })
      insert(db, 'user_script_host_permissions', {
        id: 'permission',
        script_id: 'script-a',
        host_pattern: 'example.test',
        granted_at: LOCAL,
      })
      insert(db, 'user_script_update_state', {
        script_id: 'script-a',
        updated_at: LATER,
        last_checked_at: LOCAL,
      })
    }
    expect(db.pragma('foreign_key_check')).toEqual([])
  } finally {
    db.close()
  }
}

function stableFacts(db: Database.Database) {
  const selections = {
    problems: 'id, title, first_seen_at, first_solved_at, created_at, updated_at, deleted_at',
    problem_visits: 'id, problem_id, entered_at, left_at, duration_seconds, created_at, updated_at',
    submissions: 'id, problem_id, platform_submission_id, submitted_at, created_at, updated_at',
    activity_events: 'id, occurred_at, local_day, created_at, updated_at',
    notes: 'id, problem_id, content, created_at, updated_at',
    platform_accounts: 'id, last_synced_at, created_at, updated_at',
    rating_history: 'id, contest_at, created_at, updated_at',
    site_configs: 'id, created_at, updated_at',
    user_scripts: 'id, code, created_at, updated_at, deleted_at',
  }
  const rows = Object.fromEntries(
    Object.entries(selections).map(([table, columns]) => [
      table,
      db.prepare(`SELECT ${columns} FROM ${table} ORDER BY id`).all(),
    ]),
  )
  return {
    ...rows,
    user_daily_stats: db.prepare('SELECT * FROM user_daily_stats ORDER BY local_day').all(),
  }
}

function schemaObjects(db: Database.Database) {
  return db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all()
}

function backupFiles(backupDir: string): string[] {
  return fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir).filter((file) => file.endsWith('.sqlite'))
    : []
}

describe('pinned historical schema reconstruction', () => {
  it('should identify synthetic fixtures and their complete pinned provenance without Git at test time', () => {
    expect(provenance.kind).toBe('historical-schema-reconstruction-with-synthetic-test-data')
    expect(provenance.releases.map(({ version }) => version)).toEqual([21, 24, 29])
    expect(provenance.releases.map(({ packageVersion }) => packageVersion)).toEqual([
      '1.0.0',
      '2.0.0-beta.2',
      '2.0.0-rc.1',
    ])
    for (const release of provenance.releases) {
      expect(release.commit).toMatch(/^[a-f0-9]{40}$/)
      expect(release.migrations.map(({ version }) => version)).toEqual(
        Array.from({ length: release.version }, (_, i) => i + 1),
      )
      expect(
        release.sources.filter(({ path: file }) => /\/migrations\/\d{3}_/.test(file)),
      ).toHaveLength(release.version)
      expect(release.sources.some(({ path: file }) => file.endsWith('/shared/time.ts'))).toBe(true)
      for (const source of release.sources) {
        expect(source.gitBlob).toMatch(/^[a-f0-9]{40}$/)
        expect(source.sha256).toMatch(/^[a-f0-9]{64}$/)
      }
    }
  })

  it.each(provenance.releases)(
    'should safely upgrade $tag schema $version to 29 without changing historical TEXT instants',
    async (release) => {
      const { dbPath, backupDir } = temporaryPaths()
      createHistoricalDatabase(dbPath, release)
      const original = new Database(dbPath, { readonly: true })
      const before = stableFacts(original)
      original.close()
      const db = await initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        now: () => new Date('2026-11-04T00:00:00Z'),
      })
      expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
        version: 29,
      })
      expect(
        db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
      ).toEqual(provenance.releases[2].migrations)
      expect(stableFacts(db)).toEqual(before)
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.prepare('SELECT typeof(first_seen_at) AS type FROM problems').get()).toEqual({
        type: 'text',
      })
      const expected = new Database(':memory:')
      try {
        expected.exec(fs.readFileSync(path.join(fixtureRoot, 'rc1.schema.sql'), 'utf8'))
        expect(schemaObjects(db)).toEqual(schemaObjects(expected))
      } finally {
        expected.close()
      }
      expect(
        db
          .prepare(
            'SELECT id, namespace, run_at FROM user_scripts WHERE deleted_at IS NULL ORDER BY id',
          )
          .all(),
      ).toEqual([
        { id: 'script-a', namespace: null, run_at: 'document-start' },
        { id: 'script-b', namespace: 'local:script-b', run_at: 'document-start' },
      ])
      expect(() =>
        db.prepare('UPDATE user_scripts SET namespace = NULL WHERE id = ?').run('script-b'),
      ).toThrow(/UNIQUE constraint/)
      expect(() =>
        db.prepare('UPDATE user_scripts SET noframes = 2 WHERE id = ?').run('script-a'),
      ).toThrow(/CHECK constraint/)
      expect(() => db.prepare('DELETE FROM problems WHERE id = ?').run('problem')).toThrow(
        /FOREIGN KEY constraint/,
      )
      if (release.version === 29) {
        const blob = db
          .prepare('SELECT content_blob AS bytes FROM user_script_resources WHERE id = ?')
          .get('resource') as { bytes: Uint8Array }
        expect([...blob.bytes]).toEqual([0, 128, 255])
        expect(db.prepare('SELECT value_json FROM user_script_values').get()).toEqual({
          value_json: '{"dateLikeUserString":"2026-01-15T00:00:00"}',
        })
        expect(db.prepare('SELECT COUNT(*) AS count FROM site_credentials').get()).toEqual({
          count: 1,
        })
        expect(
          db.prepare('SELECT COUNT(*) AS count FROM user_script_host_permissions').get(),
        ).toEqual({ count: 1 })
        expect(db.prepare('SELECT COUNT(*) AS count FROM user_script_update_state').get()).toEqual({
          count: 1,
        })
      }
      const backups = backupFiles(backupDir)
      expect(backups).toHaveLength(release.version < 29 ? 1 : 0)
      if (backups[0]) {
        const backup = new Database(path.join(backupDir, backups[0]), { readonly: true })
        try {
          expect(
            backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get(),
          ).toEqual({ version: release.version })
          expect(stableFacts(backup)).toEqual(before)
        } finally {
          backup.close()
        }
      }
      closeDb()
      const reopened = await initDbAtPathWithMigrationSafety(dbPath, { backupDir })
      expect(
        reopened.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
      ).toEqual(provenance.releases[2].migrations)
      expect(stableFacts(reopened)).toEqual(before)
      expect(backupFiles(backupDir)).toEqual(backups)
    },
  )

  it('should restore the reconstructed database and block retries after a failed upgrade', async () => {
    const { dbPath, backupDir } = temporaryPaths()
    createHistoricalDatabase(dbPath, provenance.releases[0])
    const original = new Database(dbPath, { readonly: true })
    const beforeSchema = schemaObjects(original)
    const beforeFacts = stableFacts(original)
    original.close()
    const migrations = [
      {
        version: 22,
        name: 'synthetic_committed_before_failure',
        up(db: Database.Database) {
          db.exec('CREATE TABLE synthetic_partial (id INTEGER)')
          db.prepare('UPDATE problems SET title = ?').run('changed')
        },
      },
      {
        version: 23,
        name: 'synthetic_failure',
        up() {
          throw new Error('synthetic migration failure')
        },
      },
    ]
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations }),
    ).rejects.toThrow('synthetic migration failure')
    const restored = new Database(dbPath, { readonly: true })
    try {
      expect(schemaObjects(restored)).toEqual(beforeSchema)
      expect(stableFacts(restored)).toEqual(beforeFacts)
    } finally {
      restored.close()
    }
    expect(fs.existsSync(getMigrationFailureMarkerPath(backupDir, dbPath))).toBe(true)
    const backups = backupFiles(backupDir)
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations }),
    ).rejects.toBeInstanceOf(MigrationRetryBlockedError)
    expect(backupFiles(backupDir)).toEqual(backups)
  })
})
