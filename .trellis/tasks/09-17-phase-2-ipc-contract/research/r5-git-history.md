# Research: R5 Historical Database and Timestamp Writers

- Query: What did the v1.0.0 application actually create and write, and can reproducible historical-code fixtures replace unavailable old private databases?
- Scope: Internal, read-only Git object/history inspection. No checkout, reset, branch change, application startup, migration execution, or user-database access.
- Date: 2026-11-04

## Findings

### 1. Release anchors are available and sufficient for reconstruction

These are peeled commit IDs (`<tag>^{commit}`), not annotated tag object IDs.

| Git ref | Commit | Package version | Maximum migration | Commit date |
| --- | --- | --- | --- | --- |
| `v1.0.0` | `0758b253766db648f47418e95116437762001261` | `1.0.0` | 021 | 2026-07-04 |
| `v1.1.0-beta.2` | `b27debfcac5a368da1a19113bd1a48dc87526b79` | `2.0.0-beta.2` | 024 | 2026-07-13 |
| `v2.0.0-rc.1` | `7d052efcf37903ff22ad0a72d3147e62b600e0b9` | `2.0.0-rc.1` | 029 | 2026-09-03 |
| `v2.0.0` | `d2d2b0c6b758e1936b00aa602ea172dbb848b065` | `2.0.0` | 029 | 2026-10-25 |

Evidence: each ref's `algo-electron/package.json`, `electron/db/connection.ts`, and migration directory. The beta tag/package mismatch is real history, not a typo to silently repair. In this document, paths after a Git ref are relative to `algo-electron/` unless explicitly written otherwise.

`v1.0.0:electron/db/connection.ts:32` declares a private `allMigrations` array through 021. `initDbAtPath` at line 60 opens the specified path and sets WAL, FK enforcement and busy timeout before `runMigrations` (lines 68-74). It exports `initDbAtPath`, `getDb`, `closeDb`, and `getDbPath`, **not** `allMigrations`. The old connection assigns the global DB before migrations; the current connection's later assignment must not be assumed for historical code.

`v1.0.0:electron/db/migrate.ts:10` creates the `schema_migrations` ledger with `applied_at TEXT NOT NULL`; lines 28-33 run each `up` and ledger insert in one SQLite transaction. Schema is therefore reproducible without finding someone's old database or booting the old UI.

### 2. The key correction: old user-script timestamps contain UTC `Z`

The earlier feasibility report overestimated ambiguity in `user_scripts`. The actual code history gives a reliable distinction:

| Change | Evidence | Timestamp behavior |
| --- | --- | --- |
| Script repository introduced, `f08b2e5` (2026-06-04) | `electron/db/repositories/userScriptRepository.ts:47` and update branch | `new Date().toISOString()`, explicit UTC `Z` |
| Repository split, `ddfb983` (2026-07-03) | `electron/db/repositories/userScript/mutations.ts:5` | `nowIso()` still calls `toISOString()` |
| v1.0.0 and beta.2 release code | same file lines 5-6, 12, 35 | Both create/update timestamps are UTC `Z` |
| `e35212be1e88f3c312a028b8317b57ae9ada7536` (2026-08-18) | diff of `electron/shared/time.ts` and script mutations | Replaces `nowIso()` with new fixed UTC+8 helper |
| rc.1 and v2.0.0 | script mutations lines 3, 9, 66, 132, 156, 184 | New/create/update/claim times are fixed UTC+8 with no suffix |

The fixed helper is `new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, -1)` (`v2.0.0:electron/shared/time.ts:34`). Its no-suffix output means UTC+8 wall time, not system-local time.

Exhaustiveness checks for script timestamps:

- Release-tree search for `INSERT/UPDATE/DELETE ... user_scripts` finds only repository mutations and migrations 025/027. Historical repository history has no `nowBeijing` writer.
- `v2.0.0:electron/db/migrations/025_userscript_identity.ts:17` changes identity fields and uses `created_at` for ranking; it does not rewrite timestamps. The later metadata backfill in `027_userscript_runtime.ts:148` changes metadata only, not `created_at` or `updated_at`.
- `021_sync_metadata_fields.ts:19` adds nullable `user_scripts.deleted_at`; no normal script writer sets it to a date (delete physically deletes). NULL remains NULL; explicitly supplied non-null test/foreign data needs the documented table policy.
- Learning-data JSON's table allowlist at `v1.0.0:electron/backup/learningDataExport.ts:13` contains six fact/stat/account tables and **does not import/export user_scripts**. The same remains true at v2.0.0. Importing a `.user.js` file calls the repository and generates new timestamps; it does not restore a historical timestamp from script metadata.
- Hence an old script row can have `created_at` ending in `Z` and a later `updated_at` suffixless UTC+8, but the individual values are distinguishable. There is no demonstrated suffixless-system-local script producer in the inspected lineage.

**Conclusion:** Honor explicit suffixes first, then interpret suffixless script timestamps as fixed UTC+8. Missing historical row provenance is not a blocker for this table under known application writers.

### 3. General timestamp history

`275ecf26d67c22cd34a6f3e439938a0b38355dc9` (2026-05-14) introduces `nowBeijing` and changes problem writes, migration ledger and tracking from `toISOString()` to local date getters. Earlier stored values remain UTC `Z`; this commit does not migrate existing timestamps.

`1b3e1360ab3661eb1c701520e6530895e44c9e07` (2026-05-16) adds `toBeijing(Date)`, also using local getters. `03b7f47` (2026-06-28) corrects comments to say the function is **system-local**, not explicitly Beijing. v1.0.0 already contains those comments.

`v1.0.0:electron/shared/time.ts:4` (`nowBeijing`) and line 22 (`toBeijing`) both emit `YYYY-MM-DDTHH:mm:ss.SSS` with no offset using `getFullYear/getHours`. This behavior remains at beta.2, rc.1, v2.0.0 and the R4 branch. Thus pre-helper UTC strings must not be rejected merely because a column normally became local later.

General local writer evidence at v1.0.0:

- `electron/db/repositories/problem/mutations.ts:14`: first-seen/last-visit/bookkeeping.
- `electron/tracking/TrackingService.ts:36`: visit, activity and local-day writes; line 65 finishes visits with `nowBeijing`.
- `electron/db/repositories/submission/mutations.ts:9`: row bookkeeping.
- `electron/db/repositories/stats/recompute.ts:19`: daily aggregate bookkeeping.
- `electron/db/repositories/account/accounts.ts:8`, `32`, `41`, and `account/ratingHistory.ts:8`.
- `electron/db/repositories/site/{crud.ts:27,builtins.ts:23}`.
- `electron/notes/NoteService.ts:59`, `123`, `138`, `167`.
- `electron/db/repositories/aiContextSnapshot/mutations.ts:21`, `aiOutput/mutations.ts:10`, `40`.
- `electron/db/repositories/cookieRecord/mutations.ts:9`: cookie bookkeeping is local, **but** `electron/cookies/CookieVault.ts:79` stores expiration through `new Date(expirationDate * 1000).toISOString()`.

Coach appears in 022-024. At beta.2, repository event/intervention/feedback created times are local. `RuleEngine.ts:438` has a duplicated `defaultNowIso` implementation using local getters despite its name. Contest audit `contest_start/contest_end` are explicit UTC `Z` in `CoachOrchestrator.ts:998`, `1015`, `1023`; honor their suffix. `CoachFeedbackStore.computeSince()` removing `Z` was a **query boundary bug**, not a persisted timestamp producer; do not classify persisted Coach timestamps as UTC-naive on that evidence.

### 4. Exact fixed-UTC+8 exceptions

All these families first appeared after the fixed helper or adopted it from explicit UTC strings. The policy applies to **suffixless** values only; suffixes always take precedence.

| Table | Columns | Writer evidence at v2.0.0 |
| --- | --- | --- |
| `user_scripts` | `created_at`, `updated_at`, nullable `deleted_at` policy | `db/repositories/userScript/mutations.ts:9,66,132,156,184`; old actual values have `Z` |
| `site_credentials` | `created_at`, `updated_at`, `last_used_at`, `deleted_at` | `db/repositories/credential/mutations.ts:12,39,49,60` |
| `user_script_values` | `created_at`, `updated_at` | `db/repositories/userScriptRuntimeRepository.ts:88` |
| `user_script_resources` | `created_at`, `updated_at`, `fetched_at` | runtime repository line 146; `scripts/UserScriptResourceCache.ts:95` supplies fixed-helper `fetchedAt` |
| `user_script_host_permissions` | `granted_at`, `last_used_at`, `revoked_at` | runtime repository lines 223,252,261 |
| `user_script_update_state` | `updated_at`, `last_checked_at`, `next_check_at` | runtime repository line 293; `scripts/UserScriptInstaller.ts:57-70,194-195,212-213` supplies fixed-helper schedule values |

Credentials introduced by `df5112f` (2026-08-19), runtime tables by `546f825` (2026-08-19), resource-fetch producer by `f5de859` (2026-08-20). `scripts/UserScriptUpdateService.ts:161` compares against `toChinaStandardTime(clock())`, confirming schedule semantics. `last_modified` is an HTTP validator, `run_at` is a lifecycle enum, and neither belongs in instant conversion.

### 5. Submission-source boundary and bounded assumption

Known v1.0.0 producers:

- Codeforces API: `adapters/sites/codeforces/submissions.ts:55`, upstream seconds -> `toBeijing(new Date(seconds*1000))` -> system-local wall time.
- Codeforces Rating: `rating/codeforces.ts:48`, same local conversion.
- Luogu: `submissions/scrapers/luoguScraper.ts:361`, upstream seconds -> local helper, or current local fallback.
- Generic table scanner: `submissions/scrapers/GenericTableScanner.ts:62` stores injected `options.now()`, wired to `nowBeijing` by `domScraper.ts:25`; it does **not** parse the table's arbitrary date text.
- LeetCode, Nowcoder, PTA and generic VJudge realtime paths predominantly store `nowBeijing()` (e.g. `adapters/sites/nowcoder/submissions.ts:103`, `vjudge/submissions.ts:149`, `ptaScraper.ts:528,645`).
- Exception: `adapters/sites/vjudge/submissions.ts:191-213` accepts `submittedAt/submitTime/submittedTime/submissionTime/createdAt` string verbatim. `vjudge/hook.ts:364` can supply a DOM “Submit Time” label. This may contain a space separator or no milliseconds, and no timezone annotation is added by code.

Practical migration policy: use explicit `Z`/offset wherever present; otherwise follow the already-documented system-local legacy contract for general timestamp columns, recording the selected legacy timezone. Support strict known wall-time shapes with `T` **or space**, seconds and optional fractional seconds. Unknown/invalid non-null input fails safely rather than becoming NULL. VJudge's upstream semantic intent cannot be proven from code when its string lacked a zone, so record this bounded default assumption rather than blocking all migration or silently claiming upstream timezone certainty.

The supplied user environment is Asia/Shanghai. For a database written on an unchanged Asia/Shanghai host, local and fixed UTC+8 wall clocks coincide, so this table-specific distinction preserves the same epochs while still making tests on UTC/DST hosts meaningful. Current host timezone alone is not proof that every historical writer ran in that timezone; retain the explicit assumption in migration evidence, not an inferred fact about private rows.

### 6. Historical migration fixture closure

Current migration filenames are not byte-identical to release blobs. Later type/format cleanup changed many files; 009/011 also factored safe error extraction. For truthful “historical-code reconstructed” fixtures, use pinned release blobs and record their identities, not just today's migrations sliced at version 21.

Minimal dependency closure for 001-021/024/029:

- All tagged `electron/db/migrations/*.ts` up to the target version.
- `electron/shared/time.ts` (003,004,016,017,018 call its old writer).
- `electron/adapters/codeforcesUrls.ts`, which re-exports `./sites/codeforces/urls`; include `electron/adapters/sites/codeforces/urls.ts` (no further imports).
- `electron/parsers/titleValidation.ts` (016; no further imports).
- rc.1/v2.0.0 additionally `electron/shared/errors.ts` (009/011; no further imports).
- Optional tagged `electron/db/migrate.ts`; v1/beta runner only imports time, while rc.1 runner additionally needs historical logger. Directly invoke exported migration objects in a tiny deterministic fixture runner to avoid booting connection/logger/UI.

Migration 027 deliberately embeds its historical script metadata parser (line 188 comment) rather than importing mutable runtime parser code. All inspected migration timestamp columns are explicit TEXT columns without `CURRENT_TIMESTAMP`/`datetime()`/`strftime()` defaults. 021 backfills some `updated_at` values by copying `created_at`; it does not normalize timezone. 025/027 leave existing script timestamps unchanged.

Suggested evidence set:

1. Reconstruct schema-21, schema-24, schema-29 databases from their pinned migration source closures. Label them synthetic historical-code fixtures, record tag, commit, source digest, runtime SQLite version and seeded timezone.
2. Seed deterministic representative rows using actual historical writer conventions: ordinary local strings, pre-existing UTC `Z`, old script UTC `Z`, newly updated script fixed UTC+8, nullable dates, date-only grouping keys, real FK relations and binary resources.
3. Test each source version's upgrade through remaining 001-029 and then future 030, including repeated startup, rollback/failure marker, constraints/indexes, timestamp epochs and daily aggregates.
4. Add a continuity fixture: old script `created_at='...Z'` retained while later update produces suffixless UTC+8. This directly tests the most important historical transition.
5. Supplement with protected copies of the two existing real databases already located, without claiming they are exact release-era snapshots or committing private content. Their absence at v1.0.0 is not a hard prerequisite for deterministic old-schema compatibility tests.

### Files found / related specs

- Historical database entrypoints: `electron/db/connection.ts`, `electron/db/migrate.ts`, and `electron/db/migrations/001_initial.ts` through release maximum.
- Historical time producers: `electron/shared/time.ts`, `db/repositories/*/mutations.ts`, `notes/NoteService.ts`, `tracking/TrackingService.ts`, submission adapters/scrapers, Coach writers, user-script installer/cache/runtime repositories.
- Related specs: `.trellis/spec/shared/timestamp.md` (millisecond target); `.trellis/spec/project/domain-rules.md` (backup, private data, immutable released migrations); `.trellis/spec/project/migration-status.md` (current R5 pending state); `.trellis/spec/guides/db-schema-change-guide.md` (cross-layer migration validation).
- External references: none required; evidence is local Git objects. Runtime fixture verification should record installed Electron/better-sqlite3/SQLite versions rather than assume a tag's dependency lock can still be installed unchanged.

## Caveats / Not Found

### Executed historical formatter probe

Parent verification executed the exact `shared/time.ts` blobs from commits
`0758b253` and `7d052efc` after TypeScript transpilation in isolated Node processes
with `TZ=UTC`, `Asia/Shanghai`, and `America/New_York`. No app/database code ran.
For instant `2026-01-15T00:00:00.123Z`, `toBeijing` produced respectively
`00:00`, `08:00`, and the prior day's `19:00`; the rc.1 fixed helper produced
`2026-01-15T08:00:00.123` in all three. The actual offsets were 0, -480 and 300
minutes. This confirms the source-derived distinction at runtime, rather than
only trusting the helper comments. Local log: `algo-electron/tmp/r5-history-time-probe.log`.

- No private database was read, copied or migrated. This report establishes code provenance, not actual private-row provenance.
- Historical-code fixtures cannot prove every real corruption/import case; supplement with available real copies and strict fail-before-mutation validation.
- No suffixless-local script timestamp producer or script-timestamp JSON restore path was found from script introduction through v2.0.0/current lineage. Arbitrary external/manual DB edits remain outside known writer guarantees.
- VJudge raw strings lack source timezone metadata. The bounded system-local fallback is an explicit compatibility assumption, not forensic recovery of missing data.
- DST ambiguous/nonexistent local times, invalid non-null dates, foreign-key-safe schema rebuild, ledger conversion and stats recomputation are still design/test responsibilities. Git history resolves the missing-fixture and script-provenance concerns; it does not itself implement 030.
