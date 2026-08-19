import type Database from 'better-sqlite3'

interface Migration027Metadata {
  matches: string[]
  includes: string[]
  excludes: string[]
  excludeMatches: string[]
  grants: string[]
  connects: string[]
  noframes: boolean
  runAt?: string
  updateURL?: string
  downloadURL?: string
  antifeatures: string[]
  icon?: string
}

export const migration027 = {
  version: 27,
  name: 'userscript_runtime',
  up: (db: Database.Database) => {
    addColumnIfMissing(
      db,
      'user_scripts',
      'include_rules_json',
      "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(include_rules_json) AND json_type(include_rules_json) = 'array')",
    )
    addColumnIfMissing(
      db,
      'user_scripts',
      'exclude_rules_json',
      "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(exclude_rules_json) AND json_type(exclude_rules_json) = 'array')",
    )
    addColumnIfMissing(
      db,
      'user_scripts',
      'exclude_match_rules_json',
      "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(exclude_match_rules_json) AND json_type(exclude_match_rules_json) = 'array')",
    )
    addColumnIfMissing(
      db,
      'user_scripts',
      'grant_json',
      "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(grant_json) AND json_type(grant_json) = 'array')",
    )
    addColumnIfMissing(
      db,
      'user_scripts',
      'connect_json',
      "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(connect_json) AND json_type(connect_json) = 'array')",
    )
    addColumnIfMissing(db, 'user_scripts', 'noframes', 'INTEGER NOT NULL DEFAULT 0 CHECK (noframes IN (0, 1))')
    addColumnIfMissing(db, 'user_scripts', 'run_at', "TEXT NOT NULL DEFAULT 'document-idle'")
    addColumnIfMissing(db, 'user_scripts', 'update_url', 'TEXT')
    addColumnIfMissing(db, 'user_scripts', 'download_url', 'TEXT')
    addColumnIfMissing(db, 'user_scripts', 'last_install_url', 'TEXT')
    addColumnIfMissing(
      db,
      'user_scripts',
      'antifeature_json',
      "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(antifeature_json) AND json_type(antifeature_json) = 'array')",
    )
    addColumnIfMissing(db, 'user_scripts', 'icon_url', 'TEXT')

    backfillMetadata(db)

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_script_values (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        value_key TEXT NOT NULL CHECK (length(value_key) > 0),
        value_json TEXT NOT NULL CHECK (json_valid(value_json)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(script_id, value_key),
        FOREIGN KEY(script_id) REFERENCES user_scripts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS user_script_values_script_idx
        ON user_script_values(script_id, value_key);

      CREATE TABLE IF NOT EXISTS user_script_resources (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        resource_kind TEXT NOT NULL CHECK (resource_kind IN ('require', 'resource')),
        resource_key TEXT NOT NULL CHECK (length(resource_key) > 0),
        declaration_order INTEGER NOT NULL CHECK (declaration_order >= 0),
        source_url TEXT NOT NULL CHECK (length(source_url) > 0),
        content_blob BLOB,
        content_encoding TEXT NOT NULL DEFAULT 'binary'
          CHECK (content_encoding IN ('binary', 'utf8')),
        content_type TEXT,
        integrity TEXT,
        fetched_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(script_id, resource_kind, resource_key),
        UNIQUE(script_id, resource_kind, declaration_order),
        FOREIGN KEY(script_id) REFERENCES user_scripts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS user_script_resources_script_idx
        ON user_script_resources(script_id, resource_kind, declaration_order);

      CREATE TABLE IF NOT EXISTS user_script_host_permissions (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        host_pattern TEXT NOT NULL CHECK (length(host_pattern) > 0),
        granted_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        UNIQUE(script_id, host_pattern),
        FOREIGN KEY(script_id) REFERENCES user_scripts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS user_script_host_permissions_active_idx
        ON user_script_host_permissions(script_id, host_pattern, revoked_at);

      CREATE TABLE IF NOT EXISTS user_script_update_state (
        script_id TEXT PRIMARY KEY,
        last_checked_at TEXT,
        next_check_at TEXT,
        etag TEXT,
        last_modified TEXT,
        available_version TEXT,
        status TEXT NOT NULL DEFAULT 'idle'
          CHECK (status IN ('idle', 'checking', 'current', 'available', 'error')),
        last_error TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(script_id) REFERENCES user_scripts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS user_script_update_state_next_check_idx
        ON user_script_update_state(next_check_at, status);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS user_script_update_state_next_check_idx;
      DROP TABLE IF EXISTS user_script_update_state;
      DROP INDEX IF EXISTS user_script_host_permissions_active_idx;
      DROP TABLE IF EXISTS user_script_host_permissions;
      DROP INDEX IF EXISTS user_script_resources_script_idx;
      DROP TABLE IF EXISTS user_script_resources;
      DROP INDEX IF EXISTS user_script_values_script_idx;
      DROP TABLE IF EXISTS user_script_values;
    `)
  },
}

function backfillMetadata(db: Database.Database): void {
  const rows = db.prepare('SELECT id, code FROM user_scripts').all() as Array<{ id: string; code: string }>
  const update = db.prepare(`
    UPDATE user_scripts
    SET
      match_urls_json = ?,
      include_rules_json = ?,
      exclude_rules_json = ?,
      exclude_match_rules_json = ?,
      grant_json = ?,
      connect_json = ?,
      noframes = ?,
      run_at = ?,
      update_url = ?,
      download_url = ?,
      antifeature_json = ?,
      icon_url = ?
    WHERE id = ?
  `)

  for (const row of rows) {
    if (!row.code.includes('// ==UserScript==')) continue
    const metadata = parseMigration027Metadata(row.code)
    update.run(
      JSON.stringify(metadata.matches),
      JSON.stringify(metadata.includes),
      JSON.stringify(metadata.excludes),
      JSON.stringify(metadata.excludeMatches),
      JSON.stringify(metadata.grants),
      JSON.stringify(metadata.connects),
      metadata.noframes ? 1 : 0,
      metadata.runAt ?? 'document-idle',
      metadata.updateURL ?? null,
      metadata.downloadURL ?? null,
      JSON.stringify(metadata.antifeatures),
      metadata.icon ?? null,
      row.id,
    )
  }
}

// Keep the 027 backfill parser versioned here so later runtime parser changes
// cannot alter the result of a first-time 026 -> 027 upgrade.
function parseMigration027Metadata(code: string): Migration027Metadata {
  const metadata: Migration027Metadata = {
    matches: [],
    includes: [],
    excludes: [],
    excludeMatches: [],
    grants: [],
    connects: [],
    noframes: false,
    antifeatures: [],
  }
  let inMetadata = false

  for (const line of code.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '// ==UserScript==') {
      inMetadata = true
      continue
    }
    if (trimmed === '// ==/UserScript==') break
    if (!inMetadata) continue

    const directive = trimmed.match(/^\/\/\s*@([a-zA-Z0-9_-]+)(?:\s+(.*?))?\s*$/)
    if (!directive) continue
    const key = directive[1].toLowerCase()
    const value = directive[2]?.trim() ?? ''
    if (key === 'match' && value) metadata.matches.push(value)
    else if (key === 'include' && value) metadata.includes.push(value)
    else if (key === 'exclude' && value) metadata.excludes.push(value)
    else if (key === 'exclude-match' && value) metadata.excludeMatches.push(value)
    else if (key === 'grant' && value) metadata.grants.push(value)
    else if (key === 'connect' && value) metadata.connects.push(value)
    else if (key === 'noframes') metadata.noframes = true
    else if (key === 'run-at' && value) metadata.runAt = value
    else if (key === 'updateurl' && value) metadata.updateURL = value
    else if (key === 'downloadurl' && value) metadata.downloadURL = value
    else if (key === 'antifeature' && value) metadata.antifeatures.push(value)
    else if (key === 'icon' && value) metadata.icon = value
  }

  return metadata
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
