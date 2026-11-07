import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { createDrizzleClient } from '../../src/main/db/client'
import { notes, userScripts, userScriptResources, schemaMigrations } from '../../src/main/db/schema'

afterEach(closeDb)

describe('Drizzle connection adapter', () => {
  it('should not initialize or migrate a database on import and should retain connection ownership', async () => {
    expect(() => getDb()).toThrow('Database not initialized')
    await import('../../src/main/db/client')
    expect(() => getDb()).toThrow('Database not initialized')
    const sqlite = new Database(':memory:')
    try {
      sqlite.pragma('foreign_keys = ON')
      sqlite.pragma('busy_timeout = 2345')
      const db = createDrizzleClient(sqlite)
      expect(db.$client).toBe(sqlite)
      expect(sqlite.open).toBe(true)
      expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()).toEqual([])
      expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(2345)
      sqlite.close()
      expect(() => db.select().from(notes).all()).toThrow()
    } finally {
      if (sqlite.open) sqlite.close()
    }
  })

  it('should round-trip Date values without losing milliseconds, epoch zero or nullable values', () => {
    const sqlite = initDbAtPath(':memory:')
    const db = createDrizzleClient(sqlite)
    const created = new Date(0)
    const updated = new Date(1768443630123)
    db.insert(notes)
      .values({
        id: 'note',
        title: 'Synthetic',
        file_path: 'synthetic.md',
        created_at: created,
        updated_at: updated,
        deleted_at: null,
      })
      .run()
    const result = db.select().from(notes).where(eq(notes.id, 'note')).get()
    expect(result?.created_at).toEqual(created)
    expect(result?.updated_at).toEqual(updated)
    expect(result?.deleted_at).toBeNull()
    expect(result?.content).toBe('')
    expect(
      sqlite
        .prepare('SELECT created_at,updated_at,typeof(created_at) AS storage FROM notes WHERE id=?')
        .get('note'),
    ).toEqual({ created_at: 0, updated_at: 1768443630123, storage: 'integer' })
    const dto = result
      ? {
          ...result,
          created_at: result.created_at.getTime(),
          updated_at: result.updated_at.getTime(),
        }
      : null
    expect(dto?.created_at).toBe(0)
    expect(dto?.updated_at).toBe(1768443630123)
    expect(db.select().from(schemaMigrations).all()).toHaveLength(30)
    expect(
      sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
    ).toBeUndefined()
  })

  it('should preserve BLOB bytes and rollback writes using the existing synchronous transaction', () => {
    const sqlite = initDbAtPath(':memory:')
    const db = createDrizzleClient(sqlite)
    db.insert(userScripts)
      .values({
        id: 'script',
        name: 'Synthetic',
        match_urls_json: '[]',
        code: '',
        created_at: new Date(0),
        updated_at: new Date(0),
      })
      .run()
    const bytes = Buffer.from([0, 127, 128, 255])
    db.insert(userScriptResources)
      .values({
        id: 'resource',
        script_id: 'script',
        resource_kind: 'resource',
        resource_key: 'asset',
        declaration_order: 0,
        source_url: 'https://example.test',
        content_blob: bytes,
        created_at: new Date(0),
        updated_at: new Date(0),
      })
      .run()
    expect(db.select().from(userScriptResources).get()?.content_blob).toEqual(bytes)
    expect(() =>
      db.transaction((transaction) => {
        transaction
          .update(userScriptResources)
          .set({ content_blob: Buffer.from([1]) })
          .run()
        transaction
          .insert(notes)
          .values({
            id: 'rollback',
            title: 'Rollback',
            file_path: 'rollback.md',
            created_at: new Date(0),
            updated_at: new Date(0),
          })
          .run()
        throw new Error('intentional rollback')
      }),
    ).toThrow('intentional rollback')
    expect(db.select().from(notes).where(eq(notes.id, 'rollback')).all()).toEqual([])
    expect(db.select().from(userScriptResources).get()?.content_blob).toEqual(bytes)
    expect(sqlite.inTransaction).toBe(false)
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
