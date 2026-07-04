import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { runMigrations } from './migrate'
import { migration001 } from './migrations/001_initial'
import { migration002 } from './migrations/002_submissions'
import { migration003 } from './migrations/003_fix_codeforces_canonical_urls'
import { migration004 } from './migrations/004_fix_codeforces_gym_page_urls'
import { migration005 } from './migrations/005_daily_stats'
import { migration006 } from './migrations/006_rating'
import { migration007 } from './migrations/007_site_configs'
import { migration008 } from './migrations/008_user_scripts'
import { migration009 } from './migrations/009_user_scripts_file'
import { migration010 } from './migrations/010_notes'
import { migration011 } from './migrations/011_notes_content'
import { migration012 } from './migrations/012_submission_code_snippets'
import { migration013 } from './migrations/013_drop_submission_code_snippets'
import { migration014 } from './migrations/014_ai_context_snapshots'
import { migration015 } from './migrations/015_ai_outputs'
import { migration016 } from './migrations/016_clear_codeforces_placeholder_titles'
import { migration017 } from './migrations/017_backfill_problem_context'
import { migration018 } from './migrations/018_normalize_codeforces_submission_ids'
import { migration019 } from './migrations/019_cookie_records'

let db: Database.Database | null = null
const require = createRequire(import.meta.url)

const allMigrations = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008,
  migration009, migration010, migration011, migration012, migration013,
  migration014, migration015, migration016, migration017, migration018,
  migration019,
]

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(): Database.Database {
  if (db) return db

  const electron = require('electron') as { app?: { getPath: (name: string) => string } }
  if (!electron.app) {
    throw new Error('Electron app is not available. Use initDbAtPath() in Node tests.')
  }

  const dataDir = path.join(electron.app.getPath('userData'), 'data')
  const dbPath = path.join(dataDir, 'algo-learning.sqlite')
  return initDbAtPath(dbPath)
}

export function initDbAtPath(dbPath: string): Database.Database {
  if (db) return db

  const dataDir = path.dirname(dbPath)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db, allMigrations)

  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
