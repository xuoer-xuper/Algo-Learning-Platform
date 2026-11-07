import Database from 'better-sqlite3'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import { TIMESTAMP_COLUMNS } from '../../electron/db/timestampColumns'
import * as schema from '../../src/main/db/schema'
import {
  openGeneratedDrizzleDatabase,
  readCheckExpressions,
  readColumnMetadata,
  readForeignKeyMetadata,
  readIndexMetadata,
  readNamedIndexMetadata,
  readSchemaTables,
} from './drizzle-test-helpers'

afterEach(closeDb)

describe('Drizzle post-030 schema', () => {
  it('should exactly preserve columns, nullability, defaults, keys, indexes, foreign keys and CHECK expressions', () => {
    const legacy = initDbAtPath(':memory:')
    const generated = openGeneratedDrizzleDatabase()
    try {
      const tables = readSchemaTables(legacy)
      expect(tables).toHaveLength(25)
      expect(readSchemaTables(generated)).toEqual(tables)
      for (const table of tables) {
        expect(readColumnMetadata(generated, table), `${table} columns`).toEqual(
          readColumnMetadata(legacy, table),
        )
        expect(readIndexMetadata(generated, table), `${table} indexes`).toEqual(
          readIndexMetadata(legacy, table),
        )
        // Kit names previously implicit UNIQUE indexes, but existing explicit names must survive.
        expect(readNamedIndexMetadata(generated, table), `${table} named indexes`).toEqual(
          expect.arrayContaining(readNamedIndexMetadata(legacy, table)),
        )
        expect(readForeignKeyMetadata(generated, table), `${table} foreign keys`).toEqual(
          readForeignKeyMetadata(legacy, table),
        )
        expect(readCheckExpressions(generated, table), `${table} checks`).toEqual(
          readCheckExpressions(legacy, table),
        )
      }
      expect(generated.pragma('foreign_key_check')).toEqual([])
      expect(generated.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(
        generated.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
      ).toBeUndefined()
    } finally {
      generated.close()
    }
  })

  it('should detect renamed explicit indexes even when their constraint semantics are unchanged', () => {
    const original = openGeneratedDrizzleDatabase()
    const changed = openGeneratedDrizzleDatabase()
    try {
      changed.exec(`DROP INDEX idx_problems_status;
        CREATE INDEX renamed_status ON problems(status);`)
      expect(readIndexMetadata(changed, 'problems')).toEqual(
        readIndexMetadata(original, 'problems'),
      )
      expect(readNamedIndexMetadata(changed, 'problems')).not.toEqual(
        expect.arrayContaining(readNamedIndexMetadata(original, 'problems')),
      )
    } finally {
      original.close()
      changed.close()
    }
  })

  it('should preserve quoted values when comparing CHECK predicates', () => {
    const database = new Database(':memory:')
    try {
      database.exec(`CREATE TABLE original (value TEXT CHECK (value = '["a  b"]'));
        CREATE TABLE different (value TEXT CHECK (value = '[a b]'));
        CREATE TABLE equivalent (value TEXT CHECK ("value" = '["a  b"]'));`)
      expect(readCheckExpressions(database, 'different')).not.toEqual(
        readCheckExpressions(database, 'original'),
      )
      expect(readCheckExpressions(database, 'equivalent')).toEqual(
        readCheckExpressions(database, 'original'),
      )
    } finally {
      database.close()
    }
  })

  it('should map exactly the 82 declared instant columns with timestamp_ms without converting day keys', () => {
    let instants = 0
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table)
      const expected = TIMESTAMP_COLUMNS[config.name]
      expect(expected, config.name).toBeDefined()
      for (const column of config.columns) {
        if (expected.columns.includes(column.name)) {
          expect(column.dataType, `${config.name}.${column.name}`).toBe('date')
          expect(column.mapFromDriverValue(1234)).toEqual(new Date(1234))
          expect(column.mapToDriverValue(new Date(1234))).toBe(1234)
          instants += 1
        } else {
          expect(column.dataType, `${config.name}.${column.name}`).not.toBe('date')
        }
      }
    }
    expect(instants).toBe(82)
  })

  it.each(['legacy', 'generated'] as const)(
    'should retain nullable legacy primary keys and the integer rowid alias in %s schema',
    (kind) => {
      const database = kind === 'legacy' ? initDbAtPath(':memory:') : openGeneratedDrizzleDatabase()
      try {
        database
          .prepare(
            'INSERT INTO notes(id,title,file_path,created_at,updated_at) VALUES (NULL,?,?,?,?)',
          )
          .run('one', 'one.md', 0, 0)
        database
          .prepare(
            'INSERT INTO notes(id,title,file_path,created_at,updated_at) VALUES (NULL,?,?,?,?)',
          )
          .run('two', 'two.md', 0, 0)
        expect(
          database.prepare('SELECT COUNT(*) AS count FROM notes WHERE id IS NULL').get(),
        ).toEqual({ count: 2 })
        const result = database
          .prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES (NULL,?,?)')
          .run('synthetic', 0)
        expect(
          database
            .prepare('SELECT version FROM schema_migrations WHERE rowid=?')
            .get(result.lastInsertRowid),
        ).toEqual({ version: Number(result.lastInsertRowid) })
      } finally {
        if (kind === 'generated') database.close()
      }
    },
  )

  it.each(['legacy', 'generated'] as const)(
    'should enforce partial identities, CHECKs, uniqueness and cascades in %s schema',
    (kind) => {
      const database = kind === 'legacy' ? initDbAtPath(':memory:') : openGeneratedDrizzleDatabase()
      try {
        seedScript(database, 'a', null, null)
        expect(() => seedScript(database, 'duplicate', null, null)).toThrow(/UNIQUE constraint/)
        seedScript(database, 'deleted', null, 1)
        seedScript(database, 'b', 'named', null)
        expect(() => seedScript(database, 'same-identity', 'named', null)).toThrow(
          /UNIQUE constraint/,
        )
        expect(() =>
          database.prepare('UPDATE user_scripts SET noframes=2 WHERE id=?').run('a'),
        ).toThrow(/CHECK constraint/)
        expect(() =>
          database.prepare("UPDATE user_scripts SET grant_json='{}' WHERE id=?").run('a'),
        ).toThrow(/CHECK constraint/)
        database
          .prepare(
            'INSERT INTO user_script_values(id,script_id,value_key,value_json,created_at,updated_at) VALUES (?,?,?,?,?,?)',
          )
          .run('v', 'a', 'key', '{"ok":true}', 0, 0)
        expect(() =>
          database.prepare('UPDATE user_script_values SET value_key=? WHERE id=?').run('', 'v'),
        ).toThrow(/CHECK constraint/)
        expect(() =>
          database
            .prepare('UPDATE user_script_values SET value_json=? WHERE id=?')
            .run('not json', 'v'),
        ).toThrow(/CHECK constraint/)
        expect(() =>
          database
            .prepare('UPDATE user_script_values SET script_id=? WHERE id=?')
            .run('missing', 'v'),
        ).toThrow(/FOREIGN KEY constraint/)
        database
          .prepare(
            'INSERT INTO site_configs(id,name,domains_json,home_url,created_at,updated_at) VALUES (?,?,?,?,?,?)',
          )
          .run('site', 'Synthetic', '[]', 'https://example.test', 0, 0)
        const envelope = JSON.stringify({
          version: 1,
          provider: 'electron-safe-storage',
          ciphertextBase64: 'synthetic',
        })
        database
          .prepare(
            'INSERT INTO site_credentials(id,site_id,username,secret_envelope,created_at,updated_at) VALUES (?,?,?,?,?,?)',
          )
          .run('credential', 'site', 'synthetic', envelope, 0, 0)
        expect(() => database.prepare('UPDATE site_credentials SET sync_excluded=0').run()).toThrow(
          /CHECK constraint/,
        )
        expect(() =>
          database.prepare('UPDATE site_credentials SET secret_envelope=NULL').run(),
        ).toThrow(/CHECK constraint/)
        expect(() => database.prepare('UPDATE site_credentials SET deleted_at=1').run()).toThrow(
          /CHECK constraint/,
        )
        database.prepare('UPDATE site_credentials SET deleted_at=1,secret_envelope=NULL').run()
        database.prepare('DELETE FROM site_configs WHERE id=?').run('site')
        expect(database.prepare('SELECT COUNT(*) AS count FROM site_credentials').get()).toEqual({
          count: 0,
        })
        database.prepare('DELETE FROM user_scripts WHERE id=?').run('a')
        expect(database.prepare('SELECT COUNT(*) AS count FROM user_script_values').get()).toEqual({
          count: 0,
        })
      } finally {
        if (kind === 'generated') database.close()
      }
    },
  )
})

function seedScript(
  database: Database.Database,
  id: string,
  namespace: string | null,
  deletedAt: number | null,
): void {
  database
    .prepare(
      `INSERT INTO user_scripts
    (id,name,identity_name,namespace,match_urls_json,code,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, 'Synthetic', 'Synthetic', namespace, '[]', '', 0, 0, deletedAt)
}
