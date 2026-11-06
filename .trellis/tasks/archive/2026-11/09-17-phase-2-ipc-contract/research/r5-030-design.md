# Research: Concrete Migration 030 Protocol

- Query: Implement the smallest safe TEXT-to-Unix-ms migration without modifying released migrations, losing FK children, or calling an uninitialized global DB.
- Scope: Internal source/spec inspection only; no user database access or application edits.
- Date: 2026-11-04

## Findings

### 1. Chosen interfaces and ownership

Parent-confirmed paths take precedence over earlier research proposals:

```ts
// src/shared/time.ts: pure, renderer-safe; no Electron or DB imports
nowMillis(): number
toLocalDay(milliseconds: number): string
formatForDisplay(milliseconds: number): string
localDayBounds(day: string): { start: number; end: number }
shiftLocalDay(day: string, days: number): string

// electron/shared/legacyTimestamp.ts: boundary conversion, not normal storage formatting
type LegacyTimestampPolicy = 'local' | 'utc8'
parseLegacyTimestamp(value: string | number, policy: LegacyTimestampPolicy): number

// electron/db/timestampColumns.ts: explicit known table/column inventory, 82 instants
TIMESTAMP_COLUMNS

// electron/db/migrate.ts
interface Migration {
  version: number
  name: string
  up(db: Database.Database): void
  requiresForeignKeysDisabled?: boolean
}
```

The parser throws for invalid non-null values. Nullable DB/import callers preserve `null` before invoking it; do not make invalid input indistinguishable from legitimate NULL. Callers wrap parse failures with table/column and a non-sensitive category, never the raw value/credential/user content. `electron/shared/time.ts` retains only the frozen legacy `nowBeijing` export required by released migrations, plus re-exports if parent chooses; all current runtime writers move to milliseconds. Do not modify 001-029 or the pinned fixture sources.

**Final parent ownership split:** core owns all `electron/db/**` (including repositories and explicit-DB stats), `src/shared/time.ts`, `electron/shared/time.ts`, `electron/shared/legacyTimestamp.ts`, and DB/shared-time tests. Runtime owns other `electron/**` services/adapters/backup and their domain tests. Shared/renderer owns `src/shared/types/**`, renderer/preload and component/IPC/UI fixtures, but not the core-owned pure time helper. This keeps migration and repository numeric SQL in one owner. Parent owns specs/docs and final real-copy verification.

### 2. Runner: one atomic 030 transaction with explicit FK boundary

Existing runner (`electron/db/migrate.ts:45-71`) creates a TEXT ledger and prepares its INSERT **before** invoking `up`. Connection enables foreign keys before migrations (`connection.ts:201-207`) and assigns global DB only afterward (`:158-161`). Therefore:

1. Keep creating the legacy TEXT ledger for a new database so immutable 001-029 remain behaviorally compatible. Existing INTEGER ledger is unaffected by `CREATE TABLE IF NOT EXISTS`.
2. For each pending migration, if `requiresForeignKeysDisabled === true`, require `!db.inTransaction`. Read/save FK state, set `foreign_keys=OFF` **before** opening the transaction, and verify it is off. Only030 opts in.
3. Within one `db.transaction` invocation: `migration.up(db)`; prepare a fresh ledger INSERT **after up** (030 rebuilds the ledger); inspect the actual declared `schema_migrations.applied_at` type and write `Date.now()` for INTEGER, frozen local string for legacy TEXT; for FK-disabled migration run `PRAGMA foreign_key_check` and integrity validation before returning/committing. Throw on any failure.
4. Restore original FK state in `finally` outside the completed/rolled-back transaction and verify restoration. Do not use `defer_foreign_keys` as a substitute: it does not stop ON DELETE CASCADE actions.
5. `migration030.up` itself requires `db.inTransaction === true` and `PRAGMA foreign_keys === 0`; direct misuse fails before writes. Its successful completion is not independent of runner commit.
6. Existing `initDbAtPathWithMigrationSafety` backup/restore/failure-marker protocol remains authoritative (`connection.ts:143-189`). A late failed030 restores the pre-all-pending-migrations backup, including versions22-29 that may already have committed when upgrading21.

Do not infer ledger format from `migration.version >= 30`: synthetic migration tests can use9001 against a legacy ledger, while an upgraded DB may receive future arbitrary versions. The column's actual declaration is authoritative. Reprepare after rebuilding avoids stale schema references. Log chosen system timezone, policy revision, converted table/column counts, not row values.

### 3. Exact rebuild algorithm

Use explicit82 inventory from `r5-feasibility.md`, with policy per table family. `run_at`, HTTP `last_modified`, `local_day`, `snapshot_date`, duration/second counters and user JSON are not timestamp columns. All25 current tables contain at least one instant; rc1 snapshot has ordinary CREATE TABLEs, no virtual/generated/AUTOINCREMENT/WITHOUT ROWID tables and no released triggers/views. Still preserve existing explicit schema objects rather than assume users cannot have them.

Inside030's one FK-disabled transaction:

1. Read original table DDL plus explicit indexes, triggers and views from `sqlite_schema`; exclude implicit autoindexes (their SQL is NULL). Validate expected25 tables/82 columns, original `TEXT` declarations, nullability and known schema shape using `table_info`/`table_xinfo`. Reject unsupported structures rather than silently dropping them.
2. Build all replacement DDL before modifying anything. Replace only the CREATE TABLE identifier with a collision-checked temporary name and only declared types of named inventory columns from TEXT to INTEGER. Use a token-aware column-declaration transformation or strictly validated top-level column segmentation; do not global-replace `TEXT`, identifiers in string literals, CHECK clauses or FK targets. Preserve every non-type clause and original FK references to canonical table names.
3. Create shadow tables with their full original constraints. Copy records column-for-column; convert only explicit instant fields and the targeted JSON described below. Preserve row identity, all other strings/JSON/BLOB bytes and NULLs. Hidden rowid can be preserved for ordinary rowid tables with a checked alias, but avoid passing rowid twice where it aliases an INTEGER PRIMARY KEY. Validate copied counts before dropping originals.
4. Capture/drop views before the rename gap, because SQLite ALTER TABLE may validate views referring to temporarily missing original tables. Drop old table-bound triggers before any subsequent data rewrite so migration operations do not run user triggers; recreate afterward. Explicit indexes disappear with old tables; retain their original SQL for recreation.
5. Drop old tables while FK enforcement is actually off, then rename all shadows to canonical names. **Never rename the old table to a backup name first**: SQLite may rewrite child FK/view references to that backup name. Recreate explicit indexes and views; perform intended day/stat/JSON maintenance; recreate triggers after migration data work to avoid unintended side effects.
6. Compare final object sets and metadata to original (only expected type differences), validate every non-null target `typeof(column)='integer'`, preserved fact row counts and critical BLOB/JSON values. Run FK/integrity checks before commit. Derived stats may add corrected day buckets, so distinguish fact counts from intentionally rebuilt aggregate counts.

Use `?` parameters for row data and validated quoted identifiers for known tables/columns. A SQL scalar conversion function plus `INSERT SELECT` is possible but propagating safe contextual parse errors must be tested; row iteration with prepared INSERTs is simpler and sufficient for these local DB sizes. No `.writable_schema` edits or ALTER COLUMN shortcuts.

### 4. Strict legacy parser policy

Source evidence is in `r5-git-history.md`: ordinary writers were local, old scripts UTC-Z, later script/credential/runtime writers fixedUTC+8. Six fixedUTC+8 families are `user_scripts`, `site_credentials`, `user_script_values`, `user_script_resources`, `user_script_host_permissions`, `user_script_update_state`; explicit Z/offset always overrides the family fallback.

- Accept a finite safe-integer JS number as already-canonical milliseconds, never interpret it as seconds. Accept only known full date-time strings: `YYYY-MM-DD[T or space]HH:mm:ss` with optional1-3 fractional digits and optional `Z` or signed `HH:MM` offset. Reject empty/date-only/numeric strings and unknown shapes. If wider fractional precision is supported, it must not silently truncate nonzero sub-ms data.
- Parse numeric components and validate calendar/time ranges before constructing an epoch; do not trust permissive `Date.parse` normalization (e.g. February30). Guard years0-99 explicitly rather than Date constructor's1900 adjustment. Reject nonfinite/out-of-Date-range results.
- Explicit suffix: compute a validated UTC calendar epoch then subtract the signed offset. FixedUTC+8 fallback subtracts480 minutes. Equivalent `Z` and `+08:00` inputs must produce equal milliseconds on every host.
- Local fallback: construct using local setters and require exact component roundtrip. This rejects nonexistent DST spring-gap times and overflow. For fall-back folds, choose JavaScript Date's earlier occurrence (compatible behavior) deliberately, document it, and pin the expected epoch in America/New_York tests. The old string never stored which occurrence it meant; no algorithm can recover that bit. Do not silently label this choice as recovered provenance.
- Capture `Intl.DateTimeFormat().resolvedOptions().timeZone` once for migration logs; local parser and new local-day functions use that same process timezone. Do not mutate `process.env.TZ` within a running migration. Run separate test processes with TZ and assert actual offsets adopted.
- `localDayBounds` uses next local calendar midnight, not start+86400000; DST days can be23/25h. `shiftLocalDay` uses calendar arithmetic; display uses Intl, and number0 remains valid.

### 5. Explicit-DB stats and day keys

Existing `stats/recompute.ts:18-101` calls `getDb()` and emits invalidation, so030 cannot import/call it unchanged. Extract a DB-only sibling such as `electron/db/repositories/stats/recomputeCore.ts` (or agreed kebab-case new filename):

```ts
recomputeDailyStatsAt(db: Database.Database, day: string, nowMs: number): void
recomputeAllDailyStatsAt(db: Database.Database, nowMs: number): number
```

No connection import and no event emission in this helper. Public repository wrapper obtains `getDb`, calls core, then emits as today; migration directly passes its transaction DB. Core uses numeric half-open `[localDayBounds.start,end)` queries and preserves current business predicates unless a separately reviewed semantic change is intended.

- After conversion, update `activity_events.local_day = toLocalDay(occurred_at)` and `coach_feedback.local_day = toLocalDay(created_at)`, using JS timezone semantics rather than SQLite host assumptions.
- Preserve `ai_context_snapshots.snapshot_date`: this is a unique historical snapshot label, not a derived instant. Reassigning it can collide and change historical period meaning.
- Recompute over the union of existing `user_daily_stats.local_day` keys plus converted visit/submission/activity days and non-null problem first-solved days. Recomputing old keys as zero removes stale **metrics** without losing aggregate row metadata or soft-delete fields; newly relevant days are added. Do not merely iterate new fact days or old incorrect daily counts survive.
- Capture one `nowMs` for aggregate recompute. Existing bucket created_at remains its converted value; recomputed_at/updated_at change. Tests comparing all timestamps unchanged must explicitly exempt these intentionally regenerated fields.
- Do not rewrite historical aggregate content inside AI snapshots: those are historical exports; only their timestamp representations change.

### 6. Targeted AI snapshot JSON conversion

The app-owned nested contract is `electron/ai/contextTypes.ts:1-45`; current exporter sets `AI_CONTEXT_VERSION=1` (`contextExporter.ts:18`) and deserializer blindly casts JSON (`aiContextSnapshot/serialization.ts:20-24`). Convert the following exact fields for `schema_version:1` only:

| JSON location | Conversion |
| --- | --- |
| `exported_at` | local fallback, explicit suffix honored |
| `wrong_problems[].last_attempt` | same |
| `unreviewed_problems[].last_visited_at` | same |
| `recent_activity[].occurred_at` | same |

Set both JSON `schema_version` and row `ai_context_snapshots.schema_version` to2; new exporter uses2 and numeric fields. Preserve all other fields/unknown extra keys and `trends.daily_stats[].local_day` exactly. Validate root object, supported version and targeted arrays/field types before rewriting. Unknown versions, malformed JSON or invalid known timestamps abort safely with location-only error, not silent deletion. For canonical2 inputs, validate numeric targets and retain them, supporting idempotent normalizers where reused.

Do not recursively convert date-looking strings in `user_script_values.value_json`, `sync_queue.payload_json`, remote `raw_json`, AI-generated `content`/Markdown, arbitrary input summaries or source refs. Those are opaque or external payloads, not the explicit AIContextExport contract. The AI JSON normalizer can be a DB/legacy-boundary pure module owned core; runtime reader/exporter changes belong application worker and must share its version constants rather than invent a second map.

### 7. Safety validation and real copies

Minimum tests before final030 claims:

- Fresh0->30 and reconstructed21/24/29->30; full ledger1..30 with integer applied_at, reopen no migration/no extra backup.
- All82 target non-null values INTEGER, nullable values preserved, >20 independent expected instants across ordinary/script/credential/runtime/ledger families; explicit exclusions unchanged.
- Child rows and FK cascades preserved, partial unique/CHECK constraints and indexes remain, BLOB/userJSON unchanged; late invalid value after earlier tables copied restores exact original database and blocks retry.
- Direct030.up with FKs on/outside transaction fails; runner rejects FK-disable migration inside caller transaction, restores pragma on success/failure, tests real commit failure.
- UTC/Shanghai/NewYork separate processes: leap date, milliseconds, T/space, offsets, invalid dates, DST gap reject and earlier-fold exact expected epoch.
- Targeted AI v1 JSON->v2 conversion, unknown/invalid JSON failure, opaque strings untouched; derived-day correction vs independent expected aggregates and same-day no-regression case.

Supplementary real-copy tool must take an explicit source path, open `new Database(source,{readonly:true,fileMustExist:true})`, invoke SQLite `backup()` into a fresh ignored destination, then close source and migrate **destination** with its own backup directory. SQLite backup is WAL-consistent; raw filesystem copy of a live DB is not. Avoid app startup/profile discovery. Never print rows/credentials/URLs; report only schema/count/type/FK/integrity statistics and non-sensitive failure locations. Parent owns this later validation, not the research agent.

## Files Found / Code Patterns

- `electron/db/migrate.ts:10,45,60,69`: migration interface, legacy ledger and transaction/INSERT placement.
- `electron/db/connection.ts:132,143,158,164,201`: safe backup/restore, global DB ordering and FK pragmas.
- `electron/backup/sqliteMigrationBackup.ts:52`: SQLite backup API and failure marker primitives.
- `electron/db/repositories/stats/recompute.ts:18,73,110`: current aggregation/write semantics and string-prefix day scan.
- `electron/db/migrations/005_daily_stats.ts:9`, `024_coach_feedback.ts:13`: day-key schemas.
- `electron/ai/contextTypes.ts:1`, `contextExporter.ts:18`, `db/repositories/aiContextSnapshot/serialization.ts:20`: exact versioned nested JSON surface.
- `tests/db/fixtures/rc1.schema.sql`: reconstructed25-table schema and all named constraint/index definitions.
- `research/r5-feasibility.md`, `r5-git-history.md`: explicit82 inventory and provenance exception sets.

## Related Specs / External References

- `.trellis/spec/project/domain-rules.md`: immutable migrations, no sensitive payloads, pre-migration backup.
- `.trellis/spec/backend/error-handling.md`: transaction helpers throw, data-integrity failure rolls back.
- `.trellis/spec/shared/timestamp.md`: numeric milliseconds through DB/IPC and display-only formatting.
- `.trellis/spec/project/data-refresh.md`: post-commit notification; migration core must not emit through normal repository wrappers.
- No external web source used. Runtime versions previously measured: better-sqlite3 13.0.3, SQLite3.53.4, Node22.23.2/Electron43.4.0. Validate actual transaction/pragma behavior with the project's native tests rather than assuming a different installed SQLite.

## Caveats / Not Found

- This is a concrete implementation design, not proof that030 exists or has passed. No actual database was accessed and no code was edited.
- No original-row DST-fold bit or VJudge source timezone exists in old strings; chosen compatibility defaults must be documented, not misrepresented as recovered truth.
- Application-owned JSON conversion changes its version, not historical aggregate meaning. Arbitrary user JSON remains opaque.
- The rebuilding helper targets this fixed known schema, not a general SQL migration framework; unexpected custom/generated/virtual schema must fail explicitly rather than get partially reconstructed.
