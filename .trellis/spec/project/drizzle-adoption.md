# Drizzle Adoption Boundaries

## 1. Scope / Trigger

Phase 3 adopts Drizzle over the already-migrated SQLite database. ORM introduction
must not silently change migration 030's storage semantics, public IPC shapes,
connection ownership or transaction notifications.

## 2. Signatures

```ts
// algo-electron/src/main/db/client.ts
createDrizzleClient(sqlite: Database.Database): DrizzleClient
// Time columns in schema.ts
integer('created_at', { mode: 'timestamp_ms' })
```

Pinned A0 versions: drizzle-orm 0.45.4 and drizzle-kit 0.31.11. `db:generate` reads
schema code and emits SQL/snapshots; `pull` is the introspection command.

## 3. Contracts

- The existing `electron/db/connection.ts` owns opening, pragmas, backup, legacy
  migration, startup recovery and closing. The A0 client factory only wraps the
  supplied connection. No module-import side effects or second database connection.
- Schema describes 25 existing tables: 24 application tables and the legacy
  ledger. Preserve columns, nullability, defaults, PKs, explicit/partial indexes,
  CHECKs, unique constraints, FK actions and BLOBs. No new implicit defaults.
- SQLite legacy TEXT primary keys can be nullable. Use table-level primary keys
  where needed; column `.primaryKey()` can silently add NOT NULL. Test the actual
  generated SQLite definition rather than assuming TypeScript implies SQL parity.
- drizzle-kit 0.31.11 emits table-level UNIQUE as named unique indexes rather than
  SQLite's anonymous autoindexes. Equivalence checks normalize only that naming/
  origin representation while retaining key order, collation, uniqueness and
  predicates; existing explicitly named indexes still match by name. Verify actual
  duplicate/null acceptance behavior, not just normalized metadata counts.
- ORM timestamp_ms values are Dates; physical database and IPC values remain Unix
  integer milliseconds. Explicit `.getTime()` for output and `new Date(ms)` for
  ORM input. Test zero and null, and never cast Date into a numeric shared DTO.
- A0 schema generation is not migration activation. Do not write Drizzle ledger,
  run `push` against user databases, replace runtime queries or move directories
  before their separately validated slice.
- Later baseline activation validates continuous known legacy history and physical
  post-030 schema, not MAX(version) alone. Drizzle-only pending migrations also
  require pre-backup, rollback/restore and retry markers. Installed migrator opens
  its own transaction and selects by journal timestamp; validate known hashes and
  prefix before delegation rather than trusting that it validates all history.
- R4 change notifications remain after actual synchronous commit; preserve nested
  rollback and real partial-autocommit semantics when replacing queries.
- Keep schema and migration resource access main-only. No renderer/preload/shared
  imports of database code or Drizzle native bindings.

## 4. Validation & Error Matrix

| Case | Required behavior |
| --- | --- |
| Import schema/client | No userData access, open connection, ledger or schema mutation |
| Wrap supplied connection | Same native connection and unchanged lifecycle ownership |
| Read/write epoch 0 or nullable timestamp | Exact integer/Date mapping; null remains null |
| Generated table constraints differ | Fail A0 equivalence test, do not ignore/tighten silently |
| Unique/CHECK/FK/partial-index violation | Same acceptance/rejection behavior as post-030 database |
| Transaction throws | Native changes roll back, no premature notification |
| Unsupported or future baseline state | Later A1 fails closed without marking a baseline |

## 5. Good / Base / Bad Cases

- Good: generate SQL into test resources, create a temporary database and compare
  its complete metadata plus constraint behavior with a production 0-to-30 database.
- Base: repositories continue using the existing native connection until their
  bounded conversion is complete.
- Bad: silently add NOT NULL/defaults, treat generated SQL as already applied, open
  a fresh connection from a singleton import, or send ORM Dates over numeric IPC.

## 6. Tests Required

- Exact table/column/type/null/default/PK metadata; all 82 time columns use
  timestamp_ms; explicit index names/order/uniqueness/partial predicates and FKs.
- Exercise CHECKs, unique/nullable-key behavior, BLOBs, Date-zero/null values and
  synchronous rollback on real temporary SQLite databases.
- Re-running `db:generate` without schema changes produces no new migration.
- Typecheck config and both code/test projects, lint, full tests and build check.
  Real Electron ABI verification is required before activating runtime ORM paths.
- Preserve frozen migrations and pinned historical fixture SQL; no private database
  is a test input and no production initialization path changes in A0.

## 7. Wrong vs Correct

```ts
// Wrong when the legacy table permits a null TEXT primary key:
id: text('id').primaryKey()
// Correct: mirror nullability with a table-level key and verify SQLite behavior.
id: text('id')
// extraConfig: primaryKey({ columns: [table.id] })

// Wrong: leaking a Date into a public numeric DTO by assertion.
// Correct: row.created_at.getTime(), with explicit null handling if nullable.
```
