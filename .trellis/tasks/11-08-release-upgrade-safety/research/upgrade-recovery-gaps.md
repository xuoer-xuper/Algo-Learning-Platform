# Research: Upgrade recovery gaps and bounded hardening

- Query: What minimal changes make the existing dev migration lifecycle verifiably recoverable without arbitrary downgrade or a whole-profile snapshot system?
- Scope: Internal, read-only source inspection of dev3702f01; paths below are relative to `algo-electron/`.
- Date: 2026-11-08
- Evidence level: Control-flow findings are source-proven; no runtime fault injection, native/UI/build commands, Git operations or private-data access were performed.

## Findings

### Existing protection worth retaining

- `electron/db/connection.ts:148` awaits SQLite's backup API before running pending migrations; the backup spans earlier committed migrations if a later migration fails.
- `electron/db/migrate.ts:77` executes each migration and its ledger insert in one transaction. For030 it validates FK/integrity before commit and restores enforcement afterward (`:89`, `:99`). Do not rewrite030.
- `tests/db/historicalUpgradePath.test.ts:350` already covers historical schema/facts/BLOB and repeated startup; `:476` covers restoration after later failure. `migration030.test.ts:198` verifies a real backup after late-column failure.
- The earlier `release-201-scope.md` proves shipped2.0.0 has the same35 migration/helper source hashes as the pinned rc.1 fixture. Reuse that schema evidence, not another invented private snapshot.

### Concrete lifecycle gaps

| Finding | Code evidence | Consequence / bounded response |
| --- | --- | --- |
| Pre-try connection leaks | `connection.ts:141` opens, `:143` reads ledger before `try`; `:205` opens then applies pragmas without local cleanup | A malformed ledger or failed pragma can leave the native handle open. Put every post-open operation under owned cleanup and preserve the primary error if close fails. |
| Unknown ledger is accepted | `migrate.ts:32` and `:54` read version numbers into a Set only | Unknown/future versions and wrong names are ignored; gaps cause old migrations to run against an unexpected schema. Default production initialization must validate a known ordered prefix and reject populated unversioned databases before writes. Preserve explicitly documented synthetic migration seams rather than forcing9001 tests into the production prefix. |
| Backup is never reopened/verified | `sqliteMigrationBackup.ts:70` immediately proceeds to retention | There is no explicit proof that the completed snapshot is readable or matches the pre-upgrade ledger; retention can discard an older good recovery point first. Validate a completed snapshot before promoting it or pruning anything. |
| Incomplete backups look complete | `sqliteMigrationBackup.ts:63` writes directly to the final `.sqlite` name | A killed/failed copy can remain eligible for retention or manual restore. Use an attempt-specific partial name, validate, then promote; ignore partial files in retention. |
| No durable pre-mutation attempt record | `connection.ts:182` writes a marker only after a caught failure and restoration | Process termination bypasses catch. Restart can resume/retry without knowing an attempt was interrupted, including after some earlier migrations committed. Add a durable active-attempt record before the first migration write. |
| Restore-failed marker can be bypassed | `sqliteMigrationBackup.ts:38` blocks only overlapping pending versions, never examines `restoreError` | If migrations committed and orphan cleanup/marker clearing fails, then restoration also fails, the next start can have `pending=[]`, perform startup writes and clear the failure marker (`connection.ts:161`). Unresolved restoration/interrupted attempts must block independently of pending versions. |
| Destructive restoration ordering | `sqliteMigrationBackup.ts:104` deletes WAL/SHM before renaming the live file; `:106` rename is outside the cleanup try | A rename failure can already have removed sidecars; a later failure can recover only the main file. Preserve the closed database and its sidecars as a named recovery set until replacement is validated; never claim the present rename sequence is crash-atomic. |
| Restored file not verified | `sqliteMigrationBackup.ts:109` installs, `:110` deletes displaced DB immediately | Reopen/read-only integrity+expected-ledger validation must precede discarding any displaced state. Snapshot corruption must fail before touching current files. |
| Failure diagnostics can replace the primary error | `connection.ts:166` close and `:182` marker write can throw before `:191` rethrow | A disk-full/permission error can hide the migration failure and leave no durable block. Retain the prewritten attempt record; collect close/restore/marker errors as secondary diagnostics. |

Retention nuance: production uses retention3, so `retention=0` deleting the freshly returned backup is a helper footgun, not a demonstrated production path. Constrain retention or pin the active recovery point. If pruning fails after a valid snapshot, do not delete that snapshot or misclassify it as unusable; choose a documented nonfatal cleanup policy.

### Startup and cross-file boundary

- `main.ts:857` applies theme before `initializeMainServices` at`:928`; `main.ts:169` connects theme reads to `getThemePreference`, which calls `loadConfig`. `app/config.ts:237` can normalize and rewrite an existing config at load time. Therefore DB backup is **not** protection for every startup write.
- Canonical config bytes remain unchanged (`tests/app/configCompatibility.test.ts:89`); corrupt files are preserved (`:122`). Missing/invalid fields may normalize and persist. Protect that small file's original bytes before an automatic normalization write, or defer that write; do not automatically revert later user edits. Keep encrypted envelopes and avoid logging raw config.
- `app/mainServices.ts:24` awaits DB readiness before site seeding (`:25`) and script runtime construction. Orphan-visit cleanup itself writes the DB (`tracking/orphanProblemVisits.ts:14`) after migrations but before assignment. Keep it inside the recovery attempt; a failure must not silently grant a usable global DB.
- Site seeding/service startup runs **after** DB initialization returns. A later service error does not justify restoring an old DB automatically. Preserve upgraded data and fix forward; define the database-recovery boundary separately from whole-app readiness.
-030 imports only SQL/time/JSON/statistics helpers (`db/migrations/030_timestamps_to_unix_ms.ts:1`); no note/image filesystem writes appear. `notes/noteStorage.ts:31`, `:58`, `:98` mutate files only through explicit note operations. Protocol registration is read-only (`notes/noteAssetProtocol.ts:24`). Synthetic packaged startup should assert note/attachment hashes unchanged.
- UserScriptService startup/cache refresh reads existing script files (`scripts/UserScriptService.ts:36`, `:56`); the updater starts later (`main.ts:943`). Session state/marker handling also starts after DB (`main.ts:1010`, `:1038`). Disable independent background updates in recovery tests rather than snapshotting all browser caches.
- These findings support a **DB recovery checkpoint plus scoped config protection**, not a full-profile rollback claim. A user-facing full-backup feature still must include note images per domain rules; do not rebrand the narrow migration checkpoint as that feature.

### Proposed minimal design and ownership

1. Retain `connection.ts` as lifecycle owner. Before opening a writable DB, inspect unresolved attempt/failure records; after opening, put ledger inspection and all work inside cleanup. The default production path rejects unknown/future/gapped/name-mismatched ledgers. Keep custom migration options explicitly test-only in contract.
2. Retain `createPreMigrationBackup(...): Promise<string>` and `restoreDatabaseFromBackup(...): void` compatibility where practical. Add `verifyMigrationBackup(path, expectedLedger)` and typed `MigrationAttempt` metadata with `formatVersion`, attemptId, database identity, backup basename, expected source/target ledger and status. Use Zod validation, not unchecked JSON casts.
3. State sequence: validate source -> create partial SQLite backup -> read-only verify -> promote -> persist active attempt -> migrate/validate -> orphan cleanup -> mark completion/clear active record -> expose DB. No attempt may start if required checkpoint metadata cannot be written.
4. A surviving active/restoring/restore-failed record on restart blocks normal startup **even if all versions are applied**. Safest MVP is explicit controlled recovery, not guessing whether to restore or silently replay. A crash after commit but before completion can conservatively block; preserve the current upgraded DB for inspection.
5. Restoration stages a verified copy, records restoration intent, preserves current main/WAL/SHM together, installs the candidate, verifies it, then marks the outcome. A failure at any filesystem boundary leaves enough state and a durable block for recovery; no blind deletion of leftovers or automatic restore after successful use.
6. Pin active recovery backups during retention. Validate marker paths/basenames belong to this DB/backup directory before using them; malformed or mismatched records fail closed. Legacy markers remain readable, but `restoreError` cannot be treated as stale merely because pending is empty.
7. If small new pure safety helpers are needed, use `src/main/db/` or `src/main/services/backup/lib/` per layout rules; do not import unmerged Drizzle. Existing lifecycle/backup files are integration adapters, not a reason for a broad relocation.
8. Own tests in `tests/db/{databaseInitialization,sqliteMigrationBackup,historicalUpgradePath,migration030}.test.ts`, native `migrationSafety.test.ts`, plus narrowly scoped config and packaged tests. Parent owns final integration/installer gates. Keep migration SQL001–030 unchanged.

### Required assertions (12 groups)

1. Ledger-query and each pragma failure close exactly the owned handle, leave global DB unset and preserve the primary error.
2. Future/gapped/name-mismatched/default-ledger or populated-unversioned DB rejects before migrations, orphan writes, backup pruning or marker clearing; valid historical prefix passes.
3. Backup refusal/ENOSPC/partial creation never invokes migration; prior verified backups survive and partials are not eligible recovery points.
4. Reopened snapshot has expected ledger, facts/BLOB and integrity; corrupt/unreadable/mismatched snapshot blocks migration and retention.
5. Active snapshot remains pinned across retention and pruning errors; failure cannot eliminate the only verified recovery point.
6. Child-process termination at before-write, inside030, between committed migrations, aftercommit and before completion yields a detectable attempt; restart does not blindly retry or overwrite state.
7. Throw after a committed migration during orphan cleanup; simulate restore failure. Next startup with `pending=[]` still blocks and does not clear the record.
8. Inject copy/sidecar move/main rename/install/verification failures; current main+WAL data and verified backup remain recoverable, without claiming actual power-cut proof.
9. Marker-write/close/logging failures retain original migration error and durable pre-attempt block; corrupt/mismatched/legacy restore-failed markers fail closed.
10. Successful old-schema upgrade preserves facts and attachments, closes only intended orphan rows, validates FK/integrity, clears attempt and produces no new migration backup on second start.
11. Config normalization preserves original bytes before mutation; failure leaves recoverable originals, canonical/corrupt configs remain unchanged, and encrypted envelopes never appear in logs.
12. Controlled restoration on synthetic data validates the old app can read the recovered schema while retaining a separate current-state copy; explicitly demonstrate that post-upgrade writes are not silently claimed preserved by old-snapshot restore.

## Files Found / Related Specs

- `electron/db/{connection,migrate}.ts`: connection ownership, ledger selection and migration transaction boundaries.
- `electron/backup/sqliteMigrationBackup.ts`: snapshot naming/retention/restoration and failure markers.
- `electron/{main.ts,app/config.ts,app/mainServices.ts,tracking/orphanProblemVisits.ts}`: startup order and non-migration writes.
- `tests/db/{sqliteMigrationBackup,databaseInitialization,migrationSafety,historicalUpgradePath,migration030}.test.ts`: current test seams; filesystem helper unit tests currently use plain text, not SQLite validation.
- `.trellis/spec/project/{domain-rules,unix-millisecond-time,historical-database-fixtures,migration-status}.md`: privacy, frozen migrations, evidence classification and new-file layout.
- `.trellis/spec/backend/{error-handling,environment,directory-structure}.md` and `.trellis/spec/shared/code-quality.md`: preserve errors, isolate userData and typed helpers.

## External References / Caveats

- No new external reference required; prior task research covers SQLite backup and release tools. Current migration wrapper is the source of these findings, not unmerged Drizzle safety code.
- No generic whole-profile backup, arbitrary down migration, new recovery UI or automatic permission escalation is justified by this bounded audit.
- Read-only inspection proves missing guards/control-flow paths, not observed user data loss. Interrupted-process tests do not establish power-loss durability on every filesystem/hardware combination.
- This is design input, not release approval. Current installer, source-merge and isolated Windows upgrade/restore gates remain open; no private profile or actual install was examined.
