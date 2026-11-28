import type Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type DrizzleClient = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database
}

/** Wrap the lifecycle owner's connection; never open, migrate or close a database here. */
export function createDrizzleClient(sqlite: Database.Database): DrizzleClient {
  return drizzle(sqlite, { schema })
}
