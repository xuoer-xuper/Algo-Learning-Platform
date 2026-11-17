# Database Foundation And Upgrade Safety

## 1. Responsibilities / 职责

Main-process-only Drizzle schema/client and trusted migration coordination live beside the released upgrade-verification helpers. The native connection and frozen migrations remain owned by `electron/db/connection.ts` and `electron/db/migrations/`. Importing schema/client must not open a database or mutate user data.

## 2. Current Implementation / 当前实现

The schema describes all 25 post-030 tables and 82 `timestamp_ms` instant columns. Default asynchronous initialization validates legacy history and physical schema before adopting the Drizzle baseline. Synchronous `initDbAtPath` and explicit `options.migrations` (including an empty array) retain their legacy-only test route.

Problem overview, platform-key ID lookup and upsert are bounded ORM slices; other query domains are not yet converted. Integration of released 2.0.1 checkpoint/recovery safety is a separate verification gate, not a claim that this branch or all of phase 3 has shipped.

## 3. Key Files / 关键文件

- `schema.ts`: exact columns, defaults, nullability, keys, indexes, CHECK and FK constraints; `client.ts` wraps the supplied native connection without owning its lifecycle.
- `migration-resources.ts`: validates compiled migration tags, timestamps, SQL hashes and journal before opening the target database; uses development appRoot or packaged resources, never cwd fallback. Startup and maintenance share that provider; recovery stages only a verified recorded target prefix.
- `drizzle-ledger.ts`: verifies the physical ledger and every trusted hash/time identity, distinguishes an absent ledger from an empty one, and compares exact ordered prefixes.
- `schema-validation.ts`: compares the complete physical structure against a trusted in-memory baseline, including integrity/FK validation; does not open a second user database.
- `migrate.ts`: validates continuous legacy/Drizzle histories, adopts the baseline and delegates later migrations to the pinned Drizzle migrator.
- `legacy-ledger-validation.ts`: strict ordered history and known-prefix validation, integrity/FK checks and exact schema fingerprints, including optional views/triggers rather than silently discarding them.
- `migration-diagnostics.ts`: associates secondary cleanup/logging failures with the original thrown object without replacing it.
- `resolve-upgrade.ts`: verifies source/target recovery, protects current data and records explicit resolution; associates provable old failure markers with preserved raw audits. Versioned recovery replays only the recorded legacy/Drizzle target, never all migrations the current binary knows.
- Root `drizzle.config.ts`: explicit `pnpm db:generate` tooling, never connects to user data.

## 4. Boundaries / 边界

- Drizzle `timestamp_ms` reads are `Date`; storage and public DTO/IPC remain integer milliseconds. Write `new Date(ms)` and convert results with `.getTime()`, preserving epoch zero and null.
- Legacy TEXT PRIMARY KEY permits null. Keep table-level `primaryKey` semantics rather than silently tightening the database; BLOB stays buffer and unknown JSON remains text.
- Frozen `drizzle/0000_baseline.sql` and legacy 001–030 are not rewritten. An existing 030 database must pass complete history/schema validation before only registering `__drizzle_migrations`; do not re-execute baseline CREATE.
- Drizzle-only pending changes require the same verified pre-write backup and durable unresolved-state block as legacy changes. No empty pending list, valid-looking latest timestamp or failure-marker deletion may bypass recovery.
- `__drizzle_migrations.id` follows upstream SERIAL PRIMARY KEY nullability. Identity comes from the complete trusted hash/timestamp prefix, not maximum time or automatic IDs.
- Unknown/partial/future histories and mismatched physical structures fail closed. Later non-baseline versions require their own physical contracts; do not bless a target using only its current ledger or replay arbitrary DML against an empty database.
- `readDatabaseState` describes a database, while `validateDatabaseState` validates against an independently established source/target. `inspectUpgradeRecovery(userData)` describes verified instructions; `resolveUpgrade(userData, { attemptId, resolution })` supports `keep-current` or `retry-source` under the main process single-instance lock.
- Checkpoint persistence belongs to `services/backup/lib/migration-checkpoint.ts`; snapshots and recovery files belong to `electron/backup/sqliteMigrationBackup.ts`. Format1 records retain compatibility; format2 carries both histories through backup, restoration and resolution audits. Only initialization owns automatic restoration before normal business use. Never overwrite later records automatically or call SQLite snapshots complete profile backups.
- Packaged resources contain only SQL and `meta/_journal.json`; generation snapshots are not runtime resources. No environment-variable replacement of production migration sources.
- Client wrappers do not manage pragmas, backup, notification transactions or user-data paths. Ongoing integration must validate both released legacy checkpoint compatibility and Drizzle adoption before claiming acceptance.

## 5. Verification / 验证

```powershell
pnpm db:generate
pnpm vitest run tests/db/drizzleSchema.test.ts tests/db/drizzleClient.test.ts
pnpm test:db
pnpm test:all
pnpm build:win
pnpm typecheck
pnpm typecheck:tests
```

Safety suites include `databaseInitialization`, `sqliteMigrationBackup`, `migrationCheckpoint`, `migrateLogging`, `resolve-upgrade` and the Drizzle migration/resource/schema suites. `migrationInterruption.test.ts` preserves the four-stage format-1 legacy crash matrix. `drizzleMigrationInterruption.test.ts` adds four format-2 forced exits around baseline/Drizzle-only preparation and commit, checking explicit resolution, later rows and fresh protected retries. Historical fixtures, native ABI tests, unpacked application checks and isolated NSIS acceptance remain distinct evidence.
