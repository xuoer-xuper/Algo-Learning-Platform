# Research: A1 Safe Drizzle Migration Protocol

- Query: Activate Drizzle migrations after A0 without bypassing legacy schema validation, backup/restore, retry markers, or existing test injection contracts.
- Scope: Internal source/spec and installed dependency inspection; no application edits, database opens, migrations or Git operations.
- Date: 2026-11-07

## Findings

### 1. Smallest A1 boundary

Keep `electron/db/connection.ts` as the lifecycle owner. Add main-only modules under `src/main/db/` for resource loading, schema validation and Drizzle migration orchestration. Do not relocate repositories or rewrite application queries in this slice. Production `initDb()` continues to call the asynchronous safety initializer; that initializer gains the default Drizzle path after legacy001-030. No second live database connection is introduced.

`initDbAtPath()` is currently the synchronous, no-backup test helper (`electron/db/connection.ts:111`). Keep it **legacy-only** for A1 and document that distinction, rather than activating production migrations without backups or breaking the existing A0 tests that assert no Drizzle ledger. Add A1 tests against `initDbAtPathWithMigrationSafety()`; production does not use the synchronous helper.

When `options.migrations !== undefined`, including `[]`, retain the explicit **legacy-only** injection path. Existing fake initialization, synthetic failure, retention and recovery tests use that seam (`tests/db/databaseInitialization.test.ts:92,127`; `migrationSafety.test.ts:113,156,183,257`). Never interpret an explicitly empty list as permission to run default Drizzle. New Drizzle failure tests can inject a resource bundle/manifest separately while leaving `migrations` undefined.

### 2. Proposed modules and API

All paths below are package-relative.

```ts
// src/main/db/migration-resources.ts
resolveMigrationFolder(input: {
  packaged: boolean; appRoot: string; resourcesPath: string
}): string
loadMigrationResources(folder: string, expected: readonly KnownDrizzleMigration[]): MigrationResources

// src/main/db/schema-validation.ts
assertPost030Schema(sqlite: Database.Database, baselineSql: string): void

// src/main/db/migrate.ts
inspectMigrationState(sqlite: Database.Database, resources: MigrationResources,
  legacy: readonly { version: number; name: string }[]): MigrationPlan
applyDrizzleMigrations(sqlite: Database.Database, resources: MigrationResources,
  plan: MigrationPlan): void
```

Suggested immutable records:

- `KnownDrizzleMigration`: `{ tag, when, sha256 }`; compiled trusted list, initially exactly the A0 baseline. Update explicitly whenever adding a later migration, never infer trust from the mutable journal alone.
- `MigrationResources`: validated folder, baseline SQL, ordered validated migration metadata/SQL and immutable expected identities.
- `MigrationPlan`: pending legacy `{version,name}` entries, `needsBaseline`, exact recorded Drizzle prefix length, pending Drizzle entries, and stable `pendingKeys`.
- Key syntax: `legacy:<version>` and `drizzle:<tag>`. These identify a failed logical migration across repaired file hashes; hashes remain separately validated provenance.

One worker can own these modules plus lifecycle/backup wiring and dedicated tests. Parent owns `.trellis`/docs. A narrow packaging/test worker is optional later but not required; avoid splitting ownership of baseline metadata and recovery state.

### 3. Resource validation before opening or changing a database

Load resources before `openDatabase()` when using the default production path. Current `openDatabase` creates directories and enables WAL (`connection.ts:203`), so checking only afterward is not strictly “before mutation.” Explicit legacy test overrides skip resource loading.

Resolution is explicit and testable:

- Unpackaged app: `<appRoot>/drizzle`, where `appRoot` comes from the known app root (`electron/main.ts:193` sets APP_ROOT to package root) or `app.getAppPath()`, not the process working directory.
- Packaged app: `<process.resourcesPath>/drizzle`.
- Unit/native tests: pass an explicit temporary resource folder through typed options. Do not add a general production environment variable that redirects migration SQL.
- Avoid top-level named Electron imports in modules used by RUN_AS_NODE. Follow the current connection's lazy `createRequire('electron')` pattern or pass the resolution inputs from production `initDb()`.

Validate `meta/_journal.json` with an explicit schema before reading SQL: expected dialect/version, zero-based contiguous idx, safe integer strictly increasing unique `when`, unique safe tag names (no separators, traversal, absolute paths), and entries exactly matching the compiled expected list. Reject unknown extra SQL/journal entries or a missing baseline. For each SQL file verify the expected SHA256 over exact bytes. Missing resource, malformed journal, wrong baseline timestamp/hash or unknown future resource fails without opening the user DB.

A0 baseline identity is `0000_baseline`, journal `when=1794022401703`, SHA256 `b92f46f0e3cf2258b73dd4c1845c4646640b2f7d98309ef96d681bbf2bc20216`. Confirm these against committed artifacts when implementing; never silently regenerate the accepted baseline. Snapshot JSON is generation provenance, not an authoritative runtime hash source.

### 4. Read-only state inspection and legacy history

Current `getPendingMigrations()` only checks a set of version numbers (`electron/db/migrate.ts:18-40`); it does not establish a trustworthy history. A1 inspection must validate ordered legacy rows against the actual known migration list:

- A truly empty database without `schema_migrations` is a fresh installation. A populated database missing the ledger is not fresh: reject it.
- Existing history must be a contiguous known prefix1..N, matching both version and name. Reject gaps, wrong names, duplicates/malformed types, unknown/newer versions, malformed ledger schema, and a Drizzle ledger appearing before legacy30.
- After legacy execution require exactly1..30. `MAX(version)=30` alone is never enough.
- Before adopting a30 database with no Drizzle rows, validate its physical post030 schema as below. Empty Drizzle ledger is also “not adopted,” not implicit success.
- If resources, history or ledger validation fails before any migration began, close the connection and reject. Do not clear an existing failure marker or publish the singleton connection.

Move planning/get-pending work inside the connection try/close guard; today `getPendingMigrations` is called outside it (`connection.ts:143`), so an inspection failure can leak an opened connection.

### 5. Physical schema validation decision

For the first adoption and for databases with **only the baseline recorded**, build a separate **in-memory** expected database from the already hash-validated baseline SQL. This is deterministic local schema parsing, not opening a second user connection. Read production metadata with a small `src/main/db/schema-validation.ts` helper; do not import `tests/db/drizzle-test-helpers.ts` into production.

Compare actual25tables excluding only `__drizzle_migrations` to expected, full table_xinfo/column type/null/default/PK/hidden metadata, FKactions, index semantic multisets/order/collation/direction/unique/partial predicates, existing expected explicit index names, and quote-aware CHECK expressions. Preserve quoted literal values during normalization. A0 demonstrated table UNIQUE can be an anonymous SQLite autoindex on old DBs but a named unique index in Kit output: account for **that known representation equivalence only**, not arbitrary missing named indexes. Run `foreign_key_check` and `integrity_check` before adopting. Unknown application tables/columns/views/triggers are fail-closed conditions in A1, not objects to delete; document that this is stricter validation rather than silent schema repair.

**Do not replay arbitrary future DML in an empty expected database.** After a later known migration is recorded, the old baseline alone is no longer the expected physical schema. For this bounded A1, validate the exact ledger prefix plus FK/integrity, and apply each new migration's explicit postconditions in its tests; require a version-specific expected schema manifest before promising physical drift detection for those future versions. At initial release only baseline exists, so every supported current startup still gets the full post030 comparison. Do not accidentally keep comparing baseline-only columns after a future migration legitimately adds a table.

### 6. Validate the entire Drizzle prefix, not only its last row

Installed ORM0.45.4 reads only the newest `created_at` and applies entries with larger journal timestamps. It does not validate the whole hash history (`node_modules/drizzle-orm/sqlite-core/dialect.js:643-674`). Therefore inspect `__drizzle_migrations` directly before delegation:

- Validate ledger structure against the installed definition: `id SERIAL PRIMARY KEY`, `hash TEXT NOT NULL`, `created_at NUMERIC`. SERIAL is **not** INTEGER's SQLite rowid alias; upstream inserts omit id, so valid rows may have null ids. Do not invent an id-sequence requirement.
- Ordered by created_at, require each row to match exactly one expected migration at that ordinal (hash and timestamp), beginning with the baseline. Reject a gap, unknown hash/timestamp, duplicate timestamp, duplicate hash row, future timestamp, or rows beyond the known resource list.
- An empty ledger or missing ledger requires baseline adoption after legacy history/schema validation; ledger creation and baseline insertion are pending writes and need backup.
- Check no active transaction before invoking upstream `migrate()`: it issues its own `BEGIN`/COMMIT/ROLLBACK.

Baseline adoption creates the exact upstream ledger and inserts its expected `(hash,created_at)` in a small synchronous transaction. It deliberately **does not run baseline CREATE TABLE SQL against the existing database**. Then call upstream `migrate(createDrizzleClient(sqlite), {migrationsFolder})` for later entries; it sees baseline timestamp and skips0000. The baseline transaction and upstream transaction need not be forced into one transaction because the outer pre-migration backup/recovery contract restores the entire attempt if any later step fails. Validate final exact ledger prefix and FK/integrity before publishing connection or clearing marker.

Resources should be loaded/verified immediately before the synchronous apply step and not await between validation and upstream file reload; tests should detect modified SQL before apply. Do not use a hand-written SQL runner merely to mimic Drizzle. If a stronger immutable in-memory resource execution contract is later required, design it explicitly rather than silently calling undocumented internals.

### 7. Extend retry markers compatibly

Choose **optional `pendingMigrationKeys?: string[]`** on `MigrationFailureMarker`; retain current `pendingMigrations: Array<{version,name}>` unchanged for old readers/tests. Do not encode Drizzle journal milliseconds as fake legacy migration versions.

Recommended compatible API:

```ts
assertMigrationRetryAllowed(backupDir, databasePath, pendingLegacy,
  pendingMigrationKeys?: readonly string[]): void
```

- Derive current legacy keys from pendingLegacy; union them with supplied Drizzle keys.
- When reading a marker, validate its structure. Union keys derived from its old pendingMigrations with optional new keys; any overlap blocks. Existing markers without new keys retain old numeric-version behavior. Invalid JSON or malformed new keys fail closed.
- A new failure marker writes both the real pending legacy list and all stable plan keys, including `drizzle:0000_baseline` for adoption and later `drizzle:<tag>` entries.
- Tag-based keys survive a repaired SQL hash and still prevent a blind rerun of the same failed logical migration. Hash changes are independently rejected until the expected compiled resource contract is deliberately updated.
- Success clears a stale marker only after all state/resources/schema checks, legacy/Drizzle migration and startup orphan recovery complete. Existing explicit legacy-only tests with `migrations: []` retain their established stale-marker handling.

### 8. Full production safety sequence

1. Resolve/load/validate migration resources (default production path only).
2. Open native DB; enter one try/close guard; read and validate legacy/Drizzle state without writes.
3. Build the combined pending-key set, assert retry allowed.
4. If any legacy migration, baseline adoption or later Drizzle migration is pending, call the existing SQLite `backup()` **once before all of them**. A schema30 DB with only Drizzle work is not exempt.
5. Run existing legacy migrations unchanged; assert full1..30; validate post030 physical schema before first adoption.
6. Adopt baseline if needed; call Drizzle for later pending migrations; validate final prefix/FK/integrity.
7. Close startup orphan visits, clear marker, assign global connection, resolve initialization.
8. On any failure after backup: close DB, restore original consistent snapshot (including any already committed legacy/adoption stages), write both old/new marker identities, throw original error. Preserve restoration error separately as today. On pre-backup validation error: close and throw with no destructive repair.

Do not introduce R4 notifications from baseline/schema inspection. Existing orphan recovery notifications occur after migrations. No query-layer changes or public IPC return-shape changes in A1.

### 9. Packaging and guard touch points

- `electron-builder.json5`: `extraResources` copies only required SQL and `meta/_journal.json` into resources/drizzle; do not package test fixtures/private DBs. Retain asar/fuses/native SQLite externalization.
- `tests/packaging/check-packaging.mjs`: assert resource whitelist; `checkPackagedApp.mjs` should prove packaged startup resolves actual packaged SQL (not test-tree files), baseline ledger exists, and missing/corrupt resource tests fail clearly in dedicated temp copies.
- `tests/architecture/check-architecture.mjs:364`: add `src/main/db` as the allowed new DB infrastructure boundary and scan new main paths instead of leaving the rule scoped only to electron. Preserve legacy SQL budgets outside db. Add mutation coverage proving raw SQL in `src/main/services/...` is not hidden by the new path.
- Avoid a blanket “all src is renderer” exemption. Explicit main-process dependencies are allowed only under `src/main`; shared/renderer cannot import DB/native bindings.
- Existing `initDbAtPath()` and A0 schema tests remain25tables/noDrizzleledger. Safe default startup tests now expect an additional ledger; adjust assertions deliberately, not global count replacements.

### 10. Minimum A1 matrix

| Scenario | Required evidence |
| --- | --- |
| Fresh empty default startup | Legacy1..30, one baseline row, no duplicate CREATE, backup, FK on |
| Reconstructed21/24/29 | Existing facts preserved, legacy upgrade then validated baseline, one backup covering all stages |
| Existing30, no Drizzle ledger | Full schema/history validation before baseline; backup despite no legacy pending |
| Baseline-only reopen | Idempotent, no extra row/backup; schema still validated |
| Baseline + injected later migration | Drizzle-only pending detected/backed up and recorded once |
| Later migration fails after successful adoption/legacy | Original schema/data/ledgers restored; same tag retry blocked |
| Legacy gaps/wrong names/newer version/missing ledger with populated DB | Fail before baseline marking or migrations |
| Missing/corrupt journal or SQL/hash/path traversal | Fail before opening user DB; no fallback to cwd/HEAD files |
| Drizzle duplicate/gapped/unknown/future/hash-mismatched history | Fail closed instead of silently skipping |
| Drifted30 column/default/null/CHECK/index/FK | Fail adoption and leave no new ledger |
| Explicit `options.migrations` including[] | Legacy-only path unchanged; no default resource requirement |
| Old failure marker/new marker/corrupt marker | Backward-compatible overlap semantics and fail-closed malformed records |
| Packaged native app | Correct resources folder and actual native ABI; no renderer Date/DB access |

## Files Found / Code Patterns

- `electron/db/connection.ts:92,111,127,134,143,146,160,203`: lifecycle, sync test helper, typed override, pending planning placement, backup and publication.
- `electron/db/migrate.ts:18,44,65`: set-based legacy pending detection, runner and FK-disabled030 protocol to preserve.
- `electron/backup/sqliteMigrationBackup.ts:8,28,37,70,99,120`: marker schema/version-only matching, consistent backup, restore and marker persistence.
- `src/main/db/client.ts:10`: no-side-effect existing-connection wrapper.
- `tests/db/databaseInitialization.test.ts:92,127`, `migrationSafety.test.ts:113,156,183,257`: explicit migration overrides/fakes that must not unexpectedly activate Drizzle.
- `tests/db/drizzle-test-helpers.ts`: A0 metadata normalization and quote-aware CHECK parsing; design inspiration only, not a production dependency.
- `tests/db/historicalUpgradePath.test.ts:358,362,466`: safe default path and current full legacy history assertions to extend with baseline evidence.
- `electron/main.ts:193`, `electron/app/envSetup.ts:18`: app-root and pre-ready profile isolation.
- `electron-builder.json5`: currently no migration extraResources; preserve all existing packaging security settings.

## External References / Installed Versions

No web lookup needed for this pass. Source inspected from installed drizzle-orm0.45.4 and drizzle-kit0.31.11. `node_modules/drizzle-orm/migrator.js:1-33` establishes journal/SQL/hash inputs; `better-sqlite3/migrator.js:1-5` delegates; `sqlite-core/dialect.js:643-674` establishes ledger and transaction behavior. A0 checked SQL SHA/when quoted above; recheck before implementation.

Related specs: `.trellis/spec/project/drizzle-adoption.md`, `unix-millisecond-time.md`, `data-refresh.md`, `domain-rules.md`; `.trellis/spec/backend/database.md`, `error-handling.md`, `quality.md`; `.trellis/spec/guides/transaction-consistency-guide.md`.

## Caveats / Not Found

- No real/user DB was opened or migrated; this is an implementation protocol, not execution evidence.
- Future non-baseline physical-schema drift detection needs version-specific expected metadata/postconditions. Empty replay of arbitrary future DML is not a sound substitute. Initial A1 has baseline only and full physical checks.
- Custom application schema objects outside the known contract fail closed; do not delete or silently ignore them. Parent should surface that policy in docs.
- Upstream migrator reloads SQL from disk and has no built-in historical hash verification; this design supplies validation around it, not a claim upstream provides it.
- Marker API compatibility and default-vs-explicit initializer routing are required to keep existing failure tests meaningful. Never let a test-only bypass become the production default.
