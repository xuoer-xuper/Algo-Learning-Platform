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
// Default async lifecycle; explicit migrations remain the legacy test seam.
initDbAtPathWithMigrationSafety(dbPath: string, options: {
  backupDir: string
  migrations?: readonly Migration[]
  drizzle?: { folder: string; expected?: readonly KnownDrizzleMigration[] }
}): Promise<Database.Database>
loadMigrationResources(folder: string, expected?: readonly KnownDrizzleMigration[]): MigrationResources
inspectMigrationState(sqlite, resources, legacy): DrizzleMigrationPlan
applyDrizzleMigrations(sqlite, resources, legacy): void
// A2a keeps the existing synchronous public overview API.
getProblemCount(): number
getPlatformDistribution(): PlatformDistributionRow[]
getTodayVisitedCount(): number
getLastActiveTime(): number | null
getOverviewStats(): OverviewStats
// A2b selects only the stored ID and preserves the original nullish result.
findProblemIdByPlatformKey(platform: string, platformProblemId: string): string | null
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
- Convert application queries in bounded domain slices without coupling them to
  the later directory move. Wrap the current native connection at the call site;
  do not retain an adapter across close/reinitialization or introduce a new global
  connection/cache. Use synchronous `.get()`/`.all()` for synchronous repository APIs.
- In problem overview, `count()` counts rows, including nullable legacy IDs;
  `count(problems.id)` is not equivalent. Count/distribution filter active problems.
  Distinct daily visits intentionally include tombstones and visits for deleted
  problems, while latest activity also includes tombstones. Preserve these existing
  per-query differences; changing them is a separate behavior decision.
- Use existing local-day `[start,end)` helpers and Date parameters for timestamp_ms
  comparisons; do not add a fixed 24-hour interval. Latest activity emits `.getTime()`
  with nullish handling, never a truthiness fallback that converts epoch zero to null.
- Platform-key lookup uses two bound, case-sensitive equality predicates and
  `deleted_at IS NULL`. Do not trim/case-fold inputs, use LIKE, or add ID validity
  filters. Absent/null-ID matches return null, but an empty stored ID remains `''`.
  SQLite failures throw; they must not be disguised as a missing record.

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
| Missing/tampered resource or invalid journal | Reject before creating the target DB/data directory; no cwd fallback |
| Gapped/wrong-name legacy history or nonempty DB without history | Close and reject, without marking the baseline |
| Unknown/duplicate/future Drizzle ledger entry | Reject instead of trusting the newest timestamp |
| Pending baseline/later Drizzle migration, no legacy pending | Back up before writes; later failure restores the original whole attempt |
| Malformed existing failure marker | Block startup; absent marker is normal |
| Repaired hash with the same failed migration tag | Stable `drizzle:<tag>` key still blocks automatic retry |
| Explicit legacy `migrations: []` | Skip default Drizzle resources and preserve the existing test route |
| Active problem with null TEXT primary key | Still counted in total/distribution; no schema tightening |
| Overview on empty database | Zero totals, empty distribution, null latest activity; synchronous |
| Visit at local day start / next day start | Included / excluded respectively |
| Latest activity at epoch 0 | Return numeric 0, not null or Date |
| Read-only overview after connection reinitialization | Uses new current connection; no writes/events/migrations |
| Platform-key lookup with quote/percent/underscore/backslash | Exact bound literal matching; no SQL/pattern interpretation |
| Matching lookup row has null / empty-string ID | Return null / empty string respectively |
| Lookup row has deleted_at = 0 | Excluded, exactly like any non-null deletion timestamp |
| Lookup fails because schema/connection is invalid | Throw; do not return a not-found null |

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
- A1 exercises fresh, reconstructed 21/24/29, existing 30 and baseline-only reopen;
  later successful/failing migrations must prove one backup and complete restoration.
- Negative schema tests include hidden generated columns, altered CHECKs, explicit
  index names and DDL semantics not exposed by PRAGMAs. `table_info` hides generated
  columns; use `table_xinfo`. A CHECK inside a SQL comment or string is not a constraint.
- Column collations, conflict clauses, deferred FKs and AUTOINCREMENT are absent from
  the accepted baseline but can change behavior without changing common PRAGMA results.
  Reject unsupported clauses in real SQL tokens, not comments/literals; do not claim
  metadata equality alone proves their absence.
- Object filters must match the literal reserved prefix (`GLOB 'sqlite_*'`), not
  `LIKE 'sqlite_%'`, whose underscore wildcard hides a custom `sqliteX...` table.
- Packaged smoke launches the real app from an unrelated cwd, then a development
  Electron helper reads only the isolated smoke DB after exit. Copied-resource
  negative tests exercise the production safe initializer before DB creation; they
  are not evidence of launching a corrupted packaged executable. Keep RunAsNode off
  in the packaged executable.
- A2a compares overview against the original SQL under a frozen test clock. Include
  empty, nullable-ID, zero deletion timestamp, distinct visits, local-day boundaries,
  tombstones and millisecond/epoch-zero results; retain native Electron ABI coverage.
  Distribution ties are unspecified: do not invent a secondary sort for a refactor.
- Fix obsolete string timestamps only in current-schema fixtures when their query
  is converted. Historical migration/export fixtures intentionally contain strings.
  Do not make production Date decoding accept stale test data or assert Date as number.
- A2b compares lookup results to the original SQL for both key dimensions, case,
  whitespace, literal/injection-looking strings, null/empty IDs and tombstones.
  Use real query-only SQLite, transaction reads, notification observation and
  close/reinitialize coverage; retain a native Electron ABI case.

## 7. Wrong vs Correct

```ts
// Wrong when the legacy table permits a null TEXT primary key:
id: text('id').primaryKey()
// Correct: mirror nullability with a table-level key and verify SQLite behavior.
id: text('id')
// extraConfig: primaryKey({ columns: [table.id] })

// Wrong: leaking a Date into a public numeric DTO by assertion.
// Correct: row.created_at.getTime(), with explicit null handling if nullable.

// Wrong: adopting solely because MAX(version) === 30 or the last hash matches.
// Correct: validate resources, all legacy/Drizzle rows, full baseline schema and
// integrity, then back up before baseline marking and later migration writes.

// Wrong: count(problems.id), or latest?.occurred_at.getTime() || null.
// Correct: count() for total rows; latest?.occurred_at.getTime() ?? null for zero.

// Wrong: row?.id || null, trim/case-folding keys, or catch(() => null).
// Correct: bound equality and row?.id ?? null, preserving database exceptions.
```

## A1 Safe Migration Activation

- Default asynchronous initialization validates compiled trusted migration tags,
  journal indexes/timestamps and exact SQL hashes before opening the target file.
  Resource resolution uses explicit application-root/package-resource paths,
  never process cwd or a production environment-variable SQL override.
- Read legacy history as a known continuous version/name prefix. A populated
  database with no ledger, gaps or unknown versions is not a fresh database.
- After legacy 1-30, adoption requires physical post-030 schema equality (including
  semantic constraints and original explicit index names), FK and integrity checks.
  Missing/empty Drizzle ledger requires backed-up baseline marking, not replaying
  CREATE TABLE over existing data. Baseline-only reopen revalidates the schema.
- Read every Drizzle ledger row and validate the exact known hash/timestamp prefix;
  duplicate, unknown or future rows fail closed. Upstream's newest-timestamp check
  is insufficient. Later known schema versions need their own physical-schema
  contracts; do not compare them to the old baseline or replay arbitrary DML in an
  empty expected database to invent a schema oracle.
- One consistent backup covers pending legacy, baseline marking and later Drizzle
  work. A Drizzle-only pending migration still needs a backup. Restore the whole
  attempt if any stage fails, including a previously committed baseline marker.
- Failure markers retain `pendingMigrations` for legacy compatibility and add
  optional `pendingMigrationKeys`: `legacy:<version>` / `drizzle:<tag>`. Same logical
  migration retry stays blocked after a repaired hash; never disguise timestamps as
  legacy numeric versions. Malformed markers fail closed.
- Synchronous `initDbAtPath` stays the legacy-only test helper. Explicit
  `options.migrations`, including an empty array, retains that test override route;
  it must not activate default Drizzle implicitly. Production uses the default
  asynchronous safe initializer and has no such override.
- Package only migration SQL and `meta/_journal.json` into `resources/drizzle`;
  generated snapshots, test fixtures and private files are not runtime resources.
  Test packaged resource resolution and ledger adoption with the real native ABI.
