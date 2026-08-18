import type Database from 'better-sqlite3'

export const migration025 = {
  version: 25,
  name: 'userscript_identity',
  up: (db: Database.Database) => {
    addColumnIfMissing(db, 'user_scripts', 'namespace', 'TEXT')
    addColumnIfMissing(db, 'user_scripts', 'identity_name', "TEXT NOT NULL DEFAULT ''")
    addColumnIfMissing(
      db,
      'user_scripts',
      'auto_update_enabled',
      'INTEGER NOT NULL DEFAULT 1 CHECK (auto_update_enabled IN (0, 1))',
    )

    db.exec(`
      UPDATE user_scripts
      SET identity_name = name
      WHERE identity_name = '';

      WITH ranked_legacy_scripts AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY identity_name
            ORDER BY created_at ASC, id ASC
          ) AS identity_rank
        FROM user_scripts
        WHERE namespace IS NULL
          AND deleted_at IS NULL
      )
      UPDATE user_scripts
      SET
        namespace = 'local:' || id,
        auto_update_enabled = 0
      WHERE id IN (
        SELECT id
        FROM ranked_legacy_scripts
        WHERE identity_rank > 1
      );

      CREATE UNIQUE INDEX IF NOT EXISTS user_scripts_active_identity_unique
      ON user_scripts(namespace, identity_name)
      WHERE deleted_at IS NULL AND namespace IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS user_scripts_active_legacy_identity_unique
      ON user_scripts(identity_name)
      WHERE deleted_at IS NULL AND namespace IS NULL;
    `)
  },
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  if (columns.some(column => column.name === columnName)) return
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`)
}
