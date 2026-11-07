# Installed Drizzle Migration Contract

Checked locally on 2026-11-07 after installing drizzle-orm 0.45.4 and drizzle-kit
0.31.11. This is preparation for A1; A0 must not activate the migrator.

## Source Evidence

- `node_modules/drizzle-orm/migrator.js`: reads `meta/_journal.json`, resolves each
  entry's `<tag>.sql`, splits `--> statement-breakpoint`, calculates SHA256 of the
  SQL file, and uses journal `when` as `folderMillis`.
- `node_modules/drizzle-orm/better-sqlite3/migrator.js`: delegates to the synchronous
  SQLite dialect after reading migration files.
- `node_modules/drizzle-orm/sqlite-core/dialect.js`, `SQLiteSyncDialect.migrate`:
  creates `__drizzle_migrations(id SERIAL PRIMARY KEY, hash text NOT NULL,
  created_at numeric)` by default. Reads the last row by descending `created_at`,
  starts `BEGIN`, applies migrations with `folderMillis` greater than that recorded
  timestamp, inserts hash/timestamp rows, then commits or rolls back.

## Implications

- Drizzle's built-in selection is timestamp-driven, not a complete historical
  hash-validation mechanism. Validate journal order, unique timestamps, known
  hashes and a contiguous recorded prefix before calling it; a forged future
  timestamp must not silently skip migrations.
- Baseline marking must use the installed contract's actual SQL hash and journal
  timestamp, after verifying legacy 1-30 history and the physical schema. Never
  mark a database from `MAX(version) == 30` alone.
- The migration ledger's `SERIAL PRIMARY KEY` declaration is not SQLite's special
  `INTEGER PRIMARY KEY` rowid alias. Do not independently guess an id generation
  scheme or alter the upstream ledger definition.
- `BEGIN` is opened internally. Do not wrap `migrate()` in an already-active SQLite
  transaction; arrange baseline validation/marking and failure recovery around the
  actual installed behavior. Back up before any baseline or Drizzle-only change.
- Missing resources fail during file loading. Read/check resources and pending
  migrations before determining whether backup is needed; backup must cover
  Drizzle-only migrations even when no legacy migration remains.

## A0 Primary-Key Mapping

`sqlite-core/primary-keys.js` builds a table-level primary-key descriptor without
mutating column not-null flags. This preserves nullable legacy TEXT primary keys.
Column-builder `.primaryKey()` sets not-null by default and is not equivalent to
all legacy SQLite declarations. Verify generated DDL using actual SQLite metadata
and behavior, not only Drizzle inferred TypeScript types.

No production migration path, ledger or user database was changed during this
inspection. Pin tests to these observed semantics before any A1 activation.
