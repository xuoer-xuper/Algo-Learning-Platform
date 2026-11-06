# R5 feasibility reconnaissance (2026-11-04)

Read-only investigation. No migrations, application startup, user-data copies, or application edits were performed. Local SQLite connections used `mode=ro` and `PRAGMA query_only=ON`; only schema and `schema_migrations` metadata were queried. No cookie, credential, script, note, or learning-data rows were read or printed.

> Follow-up correction, 2026-11-04: the user directed us to inspect historical Git
> rather than require an unavailable v1.0.0 user database. That requirement is
> superseded by pinned-source reconstruction plus existing real-copy evidence.
> Git also establishes old scripts wrote UTC `Z`, and only later fixed-UTC+8
> writers emitted suffixless values: the suspected suffixless script ambiguity
> below is not supported by history. See `r5-git-history.md` and
> `r5-reconstruction-plan.md`; preserve the remaining migration safety findings.

## Decision gates before implementation

1. **Three real historical fixtures are not available in the inspected locations.** Only a current version-29 database and one version-24 pre-migration backup were found. The version-21/v1.0.0 real copy is missing. Do not label a generated database or a downgraded current copy as historical evidence.
2. **Suffixless timestamps do not all mean system-local time.** Current code has both local and fixed UTC+8 producers. A blanket conversion using the migration machine's timezone corrupts script/credential/runtime timestamps outside UTC+8. Historic mixed `user_scripts` rows may need explicit provenance policy.
3. **Invalid values cannot silently become NULL.** 45 of the 82 timestamp columns are NOT NULL. Preserve existing NULLs only where allowed; reject invalid non-null values with table/column metadata (not raw sensitive values), keep the automatic backup/failure marker. Choosing lossy repair is a product/data decision, not a local implementation detail.
4. **Whole-schema reconstruction needs an FK-safe transaction design.** Current migration runner already wraps `migration.up` in a transaction with FK enforcement ON. `PRAGMA foreign_keys=OFF` inside that transaction is ineffective; dropping parent tables can reject or cascade-delete children. A per-table transaction inside `up` is a nested savepoint, not the promised independent commit. Do not change released migrations.
5. **Stats-preservation AC needs clarification for timezone-aware historical data.** Existing day grouping uses string prefixes, so converting a `Z`/offset instant to system-local day can legitimately move it across dates. Decide whether existing incorrect aggregates should be preserved or repaired, and compare per metric with provenance rather than requiring unconditional equality.

## Real fixture discovery

App identity: package name `algo-electron`, product name `AlgoLearningPlatform`, app id `com.algo.learning`. `electron/db/connection.ts` uses `<userData>/data/algo-learning.sqlite`; backups are `<userData>/backups`. Development adds `-dev` in `electron/app/envSetup.ts`.

Inspected repository fixture/database filenames and app-specific Roaming/Local directory names, then `data/` and `backups/` only. No broad home-drive or browser-store search.

| Source | File metadata | Migration metadata | Evidence limits |
| --- | --- | --- | --- |
| `%APPDATA%/algo-electron/data/algo-learning.sqlite` | 2,101,248 bytes; modified 2026-10-31 | 1-29; 25-29 applied 2026-09-01 | Real current database; schema matches rc.1, but current contents are not an immutable rc.1-era snapshot |
| `%APPDATA%/algo-electron/backups/algo-learning-pre-migration-20260901100624662.sqlite` | 1,671,168 bytes; created/modified 2026-09-01 | 1-24 | Real pre-25 backup; matches beta.2 schema generation, but is dated after beta.2 release |
| `tests/db/fixtures/` | No database fixtures found | N/A | Promised three named fixtures not present |

No `%APPDATA%/algo-electron-dev` or `%APPDATA%/AlgoLearningPlatform` directory exists. Git tag `v1.0.0` contains migrations through 21, `v1.1.0-beta.2` through 24 (package version is actually `2.0.0-beta.2`), and `v2.0.0-rc.1` through 29. Schema generation alone does not establish exact release provenance. Ask for a protected version-21 backup and confirmation whether the two located copies qualify for the intended acceptance evidence. Sanitization must remove private payloads without changing timestamp distributions/relationships; no original private DB may enter Git.

## Actual schema inventory

Version-29 schema metadata has **82 timestamp TEXT columns across 25 tables**, including `schema_migrations.applied_at`; **81 application columns** if the migration ledger is explicitly excluded. **45 NOT NULL**, 37 nullable. The historical plan's 65 is stale. Version-24 backup has 67 timestamp columns.

`!` below means NOT NULL. This inventory is schema-only; it does not assert every stored value is valid or has a particular format.

| Table | Timestamp columns |
| --- | --- |
| activity_events | occurred_at!, created_at!, updated_at, deleted_at |
| ai_context_snapshots | created_at!, updated_at, deleted_at |
| ai_outputs | created_at!, updated_at!, deleted_at |
| coach_events | created_at! |
| coach_feedback | created_at! |
| coach_interventions | created_at!, contest_start, contest_end |
| contest_results | contest_at, created_at!, updated_at, deleted_at |
| cookie_records | expires_at, last_seen_at!, created_at!, updated_at! |
| notes | created_at!, updated_at!, deleted_at |
| platform_accounts | last_synced_at, created_at!, updated_at!, deleted_at |
| problem_visits | entered_at!, left_at, created_at!, updated_at!, deleted_at |
| problems | first_seen_at!, last_visited_at, first_solved_at, created_at!, updated_at!, deleted_at |
| rating_history | contest_at, created_at!, updated_at, deleted_at |
| schema_migrations | applied_at! |
| site_configs | created_at!, updated_at!, deleted_at |
| site_credentials | last_used_at, created_at!, updated_at!, deleted_at |
| study_sessions | started_at!, ended_at, created_at!, updated_at!, deleted_at |
| submissions | submitted_at!, created_at!, updated_at!, deleted_at |
| sync_queue | created_at!, synced_at |
| user_daily_stats | recomputed_at, created_at!, updated_at!, deleted_at |
| user_script_host_permissions | granted_at!, last_used_at, revoked_at |
| user_script_resources | fetched_at, created_at!, updated_at! |
| user_script_update_state | last_checked_at, next_check_at, updated_at! |
| user_script_values | created_at!, updated_at! |
| user_scripts | created_at!, updated_at!, deleted_at |

Explicit exclusions: `user_scripts.run_at` is a lifecycle enum (`document-idle` etc.), not a timestamp despite the suffix. Preserve day grouping keys in `activity_events.local_day`, `coach_feedback.local_day`, `user_daily_stats.local_day`, and `ai_context_snapshots.snapshot_date`. `user_script_update_state.last_modified` is an HTTP validator string, not an application timestamp. Keep durations/seconds counters and raw remote payloads separate from instant conversion.

## Formats and semantic hazards

- `electron/shared/time.ts`: `nowBeijing` and `toBeijing` use local `getFullYear/getHours`, emitting `YYYY-MM-DDTHH:mm:ss.SSS` without suffix. This has been system-local since commit `275ecf2` (2026-05-14); the names do not prove UTC+8.
- Same file: `toChinaStandardTime` shifts by eight hours then removes the `Z` from ISO output. `nowChinaStandardTime` is therefore **UTC+8 wall time without an offset marker**, independent of host timezone.
- Fixed UTC+8 producers: `db/repositories/credential/mutations.ts`, `db/repositories/userScript/mutations.ts`, `db/repositories/userScriptRuntimeRepository.ts`, `scripts/UserScriptInstaller.ts`, `scripts/UserScriptResourceCache.ts`, `scripts/UserScriptUpdateService.ts`. Older `user_scripts` data predates the helper, so per-table assumptions also need history checks.
- `cookies/CookieVault.ts:83` stores expiration from `expirationDate * 1000` via `.toISOString()` (UTC `Z`), whereas cookie row bookkeeping uses local timestamps.
- Codeforces, Luogu and other submission parsers/scrapers translate upstream seconds or page strings; they must return milliseconds at the same boundary as repository inputs, not retain a string-shaped `submittedAt` hidden in adapter contracts.
- ISO timestamps in injected OJ scripts (`detectedAt`) are internal event payloads, not only log/file-name exceptions. The `toISOString <= 5, only logs/files` acceptance scan touches these independently of SQLite.
- DST: subtracting a single guessed `tzOffsetAt` from `Date.UTC(parts)` can use the wrong side of a transition. Define strict round-trip parsing and explicit ambiguous/nonexistent local-time behavior. Test UTC, Asia/Shanghai and a DST zone, including gaps/folds.
- JSON containers are another versioned surface: `ai_context_snapshots.context_json` embeds `AIContextExport` (with timestamps), while `sync_queue.payload_json`, user-script values, remote `raw_json`, and AI-generated content must not be blindly rewritten. Choose explicit application-owned JSON field conversion or retain historical-version readers; do not recursively convert date-like user strings.

## Migration architecture and safety

`electron/db/migrate.ts` creates `schema_migrations.applied_at TEXT NOT NULL`, prepares its INSERT, then wraps each migration and ledger insert in one `db.transaction`. If 030 converts the ledger too, update the runner's subsequent write to milliseconds and ensure fresh databases/repeated startup do not reintroduce TEXT affinity/string inserts. If it is intentionally an audit-log exception, record that explicitly instead of counting it as converted.

`electron/db/connection.ts` enables WAL/FKs and invokes `runMigrations` **before** `assignDatabase`. Therefore migration code cannot call `recomputeDailyStatsForDates` as-is: that helper calls global `getDb()` which is not initialized yet. Stats recomputation needs a transaction-local database dependency or dedicated migration-local calculation. This dependency choice belongs in the technical design.

Foreign-key edges with destructive rebuild implications:

- `problem_visits.problem_id` and `submissions.problem_id` reference `problems` (NO ACTION).
- `site_credentials.site_id` references `site_configs` (ON DELETE CASCADE).
- Four user-script runtime child tables reference `user_scripts` (ON DELETE CASCADE).

Safe options require an explicit migration protocol: e.g. disable FKs before opening the single schema-rebuild transaction, reconstruct all relevant tables/indexes/checks with preserved rows, run `foreign_key_check`, commit, and restore FK enforcement in `finally`; or a validated child-first rebuild strategy preserving cascaded data. Do not assume `defer_foreign_keys` prevents ON DELETE CASCADE. Preserve partial unique indexes from migration 025, CHECK constraints/BLOB columns from 026/027, and all existing secondary indexes. PRD's claimed 013 precedent is incorrect: `013_drop_submission_code_snippets.ts` only drops a retired table and contains no column/table reconstruction.

Existing backup safety is useful: SQLite backup before pending migrations, restore on error, failure marker blocks repeat attempts, retention three backups. No migration should weaken this path. Verify whole-transaction failure, restore, retry marker, re-entry/idempotency, FK relationships, row counts, index/constraint behavior, timestamp type/precision, and stats before claiming completion.

## Implementation ownership map

| Concern | Files/modules to cover |
| --- | --- |
| Millisecond helpers and legacy conversion | `electron/shared/time.ts`; process-neutral formatter location for renderer must not import main; strict legacy parser with explicit provenance/timezone rules |
| Migration and startup | `electron/db/migrations/030_*`, `electron/db/migrate.ts`, `electron/db/connection.ts`, backup safety tests |
| Fact writes/types | `db/repositories/{problem,submission,account,cookieRecord,credential,userScript,coach,aiContextSnapshot,aiOutput,site}/`, `problemVisitRepository.ts`, `userScriptRuntimeRepository.ts`, `tracking/`, `notes/NoteService.ts` |
| Input producers | `adapters/sites/*/submissions.ts`, submission scrapers/parser contracts, `rating/codeforces.ts`, cookie expiry mapping, Coach event/audit producers, script scheduling/resource cache |
| SQL/date semantics | `stats/{date,recompute,insights,trends}.ts`, `problem/{mutations,overview}.ts`, `submission/firstAc.ts`, `ai/summary/periodSummaryDates.ts`, Coach `computeSince` callers |
| Backup JSON compatibility | `electron/backup/{types,learningDataExport,backupService}.ts`, shared backup types, preview/conflict/import tests |
| Cross-process types | `src/shared/types/{problem,submission,stats,coach,browser,scripts,credentials,cookies,notes,rating,ai,backup}.ts`; main row/input interfaces; preload output contracts |
| Renderer | `Dashboard`, `DashboardListsPanel`, `ProblemDetail`, `NoteList`, `LearningOverviewPanel`, `RealtimeSubmissionPanel`, `CredentialsPage`, `CoachMetricsView`, `SessionTimelineView`, `computeMetrics`, `mockMetricsBundle`; timestamp view-model types and UI harnesses |
| Documentation/evidence | DATABASE_SCHEMA, DATABASE_MIGRATION_ROLLBACK, DATA_EXPORT_AND_IMPORT, genuine sanitized fixture provenance, upgrade comparison report |

Current search finds 72 source files mentioning old time helpers or `toISOString`. This is not an exact change count, but demonstrates why '11 renderer sites / 65 columns' must not control scope.

Important SQL rewrites: date range queries currently bind `YYYY-MM-DD` strings to timestamp columns; `recomputeAllDailyStats` and problem deletion use `substr(timestamp,1,10)`; unreviewed queries use `julianday(last_visited_at)`. These need millisecond boundaries/local-day calculation, while `local_day` comparisons stay lexical. Recompute all affected dates after complete fact conversion, including removal of stale day buckets where grouping changes.

## Backup version contract

Current learning-data export uses **`schema_version: 1`**, not `schemaVersion`, and `exported_at: string` (`electron/backup/types.ts`). Parser rejects every version other than the current constant and only checks top-level table arrays. Exported tables are problems, problem_visits, submissions, user_daily_stats, platform_accounts, rating_history; cookies/credentials/notes/private payloads are excluded.

Safest compatible direction: version 2 writes milliseconds; explicitly accept v1 with validated conversion into one canonical v2 internal representation **before preview, duplicate/conflict comparison and confirmed import**. Currently `markAffected` ignores non-string timestamps; numeric migration must update that branch or stats silently stop being recomputed. Conflict equality currently uses `String(value ?? '')`, so timestamps must be normalized before comparison. Invalid imports must fail before any transaction mutates data. Do not widen export fields or confuse export version with SQLite migration number.

## Recommended next steps

1. Finish R4 independently. Keep R5 on the separately approved branch.
2. Resolve missing historical fixture provenance, fixed-UTC+8 versus local legacy policy, invalid-value policy, ledger/JSON exceptions, stats equality interpretation, and FK-safe runner design before implementing 030.
3. Implement synthetic unit cases transparently as synthetic tests, but retain the real-fixture acceptance gate as outstanding until the required data exists and is sanitized/validated.
