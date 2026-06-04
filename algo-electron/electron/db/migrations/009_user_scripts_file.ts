import { Database } from 'better-sqlite3'

export const migration009 = {
  version: 9,
  name: 'user_scripts_add_file_path',
  up: (db: Database) => {
    try {
      db.exec(`ALTER TABLE user_scripts ADD COLUMN file_path TEXT;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) throw e;
    }
    try {
      db.exec(`ALTER TABLE user_scripts ADD COLUMN site_ids_json TEXT DEFAULT '[]';`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) throw e;
    }
  },
  down: (_db: Database) => {
    // SQLite doesn't easily drop columns before version 3.35, but it's safe to just ignore down for this simple field add in our dev stage
  }
}
