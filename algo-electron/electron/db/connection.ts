import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from './migrate'
import { migration001 } from './migrations/001_initial'
import { migration002 } from './migrations/002_submissions'
import { migration003 } from './migrations/003_fix_codeforces_canonical_urls'
import { migration004 } from './migrations/004_fix_codeforces_gym_page_urls'
import { migration005 } from './migrations/005_daily_stats'
import { migration006 } from './migrations/006_rating'
import { migration007 } from './migrations/007_site_configs'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(): Database.Database {
  if (db) return db

  const dataDir = path.join(app.getPath('userData'), 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = path.join(dataDir, 'algo-learning.sqlite')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db, [migration001, migration002, migration003, migration004, migration005, migration006, migration007])

  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
