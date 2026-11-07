# Research: A2 Problem Repository ORM Slices

- Date: 2026-11-07.
- Scope: read-only source, consumers, tests and installed Drizzle 0.45.4 inspection while A1 integrates.
- No application/test edits, database opens, test executions, schema generation, commits or pushes were performed for this research.
- Paths below are relative to `algo-electron/`, except explicit `.trellis/` paths.
- Recommendation: start with **`problem/overview.ts` only**, after A1 is green. Do not combine the whole problem domain, PK policy, query optimization and directory relocation.

## 1. Smallest First Delivery

Convert the four read statements in `electron/db/repositories/problem/overview.ts` to the existing `createDrizzleClient(getDb())` adapter; keep all five exported synchronous functions, numeric return values and the compatibility export in `electron/db/repositories/problemRepository.ts`.

This slice exercises counts, grouping, timestamp parameters and Date-to-number output without returning nullable legacy primary keys or changing mutation transactions. It does not need changes to `schema.ts`, `client.ts`, `connection.ts`, IPC, preload or renderer.

Expected edit boundary:

- `electron/db/repositories/problem/overview.ts`: replace its four native queries with typed selections and `.get()` / `.all()`.
- New `tests/db/problemOverview.test.ts`: real temporary/in-memory SQLite characterization and ORM regression tests.
- `tests/verify.mjs`: add the new file to `dbVitestFiles`; `test:db` has an explicit list, while `test:core` runs all Vitest files.
- `electron/db/repositories/problem/README.md`: document this bounded conversion and the preserved filtering differences.
- Optional small cases in the existing real-Electron `tests/db/repositories.test.ts` to verify numeric/zero output through the native ABI. Keep its other-domain cases unchanged.

Do not introduce a global ORM singleton/cache, shared repository base, generic recursive Date serializer, new error wrapper or query-result envelope. A local call to the existing factory retains the lifecycle owner's connection, including after `closeDb()` and reinitialization. `src/main/db/client.ts:9` never opens a second connection; `node_modules/drizzle-orm/better-sqlite3/driver.js:14` constructs an adapter over a supplied client. Do not invent a cache without evidence of a bottleneck.

### Exact first-slice behavior

| Function and source                         | Required behavior                                                                                                                                         | ORM mapping                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getProblemCount`, `overview.ts:5`          | Count every problem whose `deleted_at IS NULL`; empty DB returns 0. Count rows, not nullable IDs.                                                         | `count()` with `isNull(problems.deleted_at)`; not `count(problems.id)`.                                                                               |
| `getPlatformDistribution`, `overview.ts:13` | Same active-problem filter, `GROUP BY platform`, count descending. No secondary ordering is currently specified.                                          | Select `platform` and `count()`, group and order by the aggregate. Do not add lexical tie-breaking as an incidental cleanup.                          |
| `getTodayVisitedCount`, `overview.ts:26`    | Count distinct `problem_id` for local day `[start,end)`. Includes soft-deleted visits and visits linked to soft-deleted problems. Does not join problems. | Keep `localDayBounds(toLocalDay(nowMillis()))`; use `gte(entered_at, new Date(start))`, `lt(entered_at, new Date(end))`, `countDistinct(problem_id)`. |
| `getLastActiveTime`, `overview.ts:42`       | Latest `activity_events.occurred_at` across all events, including tombstones; null for no rows; numeric epoch 0 must survive.                             | Select column, order descending, limit 1, `.get()`; `row?.occurred_at.getTime() ?? null`; never use a truthiness fallback for zero. |
| `getOverviewStats`, `overview.ts:55`        | Same camel-case object and synchronous composition of the four functions.                                                                                 | Keep composition unchanged.                                                                                                                           |

Count APIs need to remain synchronous: `count()` / `countDistinct()` selections are appropriate. Installed `$count` is also an SQL expression but its standalone builder implements `Promise<number>` (`node_modules/drizzle-orm/sqlite-core/query-builders/count.d.ts:6`); do not return that thenable in place of a number or make these APIs async.

First-slice tests should pin:

1. Empty DB returns `{ totalProblems: 0, todayVisited: 0, platformDistribution: [], lastActiveTime: null }`.
2. Deleted problem at timestamp **0** is excluded from counts/distribution; null-ID active problem still counts as a row, without tightening schema.
3. Multiple visits of one problem count once; start-minus-one excluded, start included, end-minus-one included, end excluded. Compute fixture boundaries with the existing local calendar helpers, not a fixed 86,400,000 ms day.
4. Soft-deleted visits and visits for a deleted problem remain counted today, matching existing SQL; latest soft-deleted activity remains visible.
5. A single activity at epoch 0 returns 0, then a millisecond-precision later activity wins; values in the entire overview are numeric, not Dates/ISO strings.
6. Distribution only pins order for unequal counts unless testing against the exact legacy SQL oracle; equal-count order is not a new public guarantee.
7. Repeated reads create no R4 notifications, writes, migration ledger or second connection; close/reopen does not reuse a closed adapter.

Suggested focused verification after implementation: both typechecks, targeted ESLint, `vitest run tests/db/problemOverview.test.ts tests/db/drizzleClient.test.ts`, then `test:db` and existing real-Electron repository coverage. Parent retains ownership of serialized full `test:all`, build and CI gates.

## 2. Subsequent Bounded Order

1. **Overview reads** as above: four native statements, no DTO PK decision required.
2. **Identity lookup / visit reads**, then **recent/detail reads** in `problem/queries.ts`, with explicitly scoped row-to-DTO conversion and tests. Identity lookup can be first because `row?.id ?? null` already accommodates a nullable stored ID. Visit/list/detail conversion must resolve the storage-vs-DTO nullability issue before implementation, not hide it with `as`.
3. **Upsert** in `problem/mutations.ts`, retaining title-quality decisions, two-step existence/update logic and enclosing-transaction notification behavior.
4. **Delete** in the same file, retaining child deletion order, affected-date collection, actual-commit notification boundary and post-commit stats-error handling.
5. **Omnibox**, last: two bounded candidate pipelines, CTE/subquery aliasing, escaping, ranking and post-merge deduplication require dedicated compatibility/performance fixtures. Fix its stale timestamp fixtures in this slice, not by teaching production ORM reads to accept old strings.

The existing repository directory and `problemRepository.ts` facade stay in place until PR B. The two duplicated stats reads in `electron/db/repositories/stats/insights.ts:13` and `electron/db/repositories/stats/insights.ts:57` are separate consumers today; do not silently reroute them or claim they were migrated by changing problem overview. `registerStatsIpc.ts:39` uses problem overview, while the standalone distribution/last-active channels use statsRepository.

## 3. Storage, DTO And Time Boundaries

### Nullable primary keys are real, not a typing accident

- `src/main/db/schema.ts:271`, `src/main/db/schema.ts:305` and `src/main/db/schema.ts:449` declare problem/visit/submission `id` as `text` with table-level primary keys. Their inferred IDs are `string | null` because SQLite's legacy TEXT PK accepts null. A0 intentionally preserved this; `tests/db/drizzleSchema.test.ts:111` tests the behavior using notes, and the problem tables use the same mapping.
- `problem/types.ts:1`, `problem/types.ts:20`, `problem/types.ts:31` and `problem/types.ts:59` instead declare IDs as `string`. Shared `problemRecordSchema` and `omniboxSuggestionSchema` also require string IDs (`src/shared/types/problem.ts:17`, `src/shared/types/problem.ts:43`). Existing raw-query casts mask this mismatch; they do not prove all persisted IDs are non-null.
- Do not append `.notNull()`, switch to column `.primaryKey()`, add `isNotNull(id)` filters, fabricate IDs, coerce `String(null)` or use `as`/`!` to force ORM rows into DTOs. Each either changes accepted schema/data or hides missing policy.
- Application writers generate UUIDs, so normal rows satisfy DTO IDs. A future projection slice needs an explicit decision for schema-valid null-ID rows: expose truthful nullable storage rows and handle them at the caller, or reject an invalid application DTO with a checked narrowing guard. Rejecting/skipping a previously returned row is a behavior decision and needs a documented regression, not an unannounced refactor. **A2 overview avoids that decision.**
- `findProblemIdByPlatformKey` already collapses absent or null ID to null (`queries.ts:97`); preserve that instead of converting a null match into an empty string.

### Dates versus numbers

- ORM `timestamp_ms` fields decode to `Date` and encode with `.getTime()` (`node_modules/drizzle-orm/sqlite-core/columns/integer.js:65`). Comparisons to columns encode their RHS using the column (`node_modules/drizzle-orm/sql/expressions/conditions.js:16`): pass `new Date(ms)`, not an asserted number.
- Direct row fields need explicit output conversion. Preserve `date === null ? null : date.getTime()` or `date?.getTime() ?? null`; null and epoch 0 differ.
- `problems.last_visited_at` is nullable (`schema.ts:286`), and public `ProblemRecord.last_visited_at` already permits null (`src/shared/types/problem.ts:24`). Local `RecentProblem.last_visited_at: number` and optional nonnullable `ProblemRow.last_visited_at` are inaccurate (`problem/types.ts:13`, `problem/types.ts:26`). Correct local types only as those readers are converted, rather than forcing null to 0 or omitting it.
- `getProblemDetail` returns `p.*` and full submission rows, not only the public schema's documented subset (`queries.ts:39`, `queries.ts:58`). Preserve extra runtime columns; do not parse with a stripping Zod schema merely to satisfy typechecking. Map all six problem timestamps (`first_seen_at`, `last_visited_at`, `first_solved_at`, `created_at`, `updated_at`, `deleted_at`) and all four submission timestamps (`submitted_at`, `created_at`, `updated_at`, `deleted_at`). Otherwise hidden Date values still cross IPC even if the visible UI date works.
- Runtime problem extras currently include `difficulty`, `tags_json`, `extra_json`; submission extras include `is_first_ac` and `deleted_at`, despite incomplete handwritten row interfaces. Avoid shrinking these returned objects during query replacement.
- A `sql<Date>`/`sql<number>` generic is only a type declaration. Computed `COALESCE` / aggregate expressions do not automatically inherit timestamp decoders. Choose `.mapWith(timestampColumn)` plus DTO `.getTime()`, or an explicit raw numeric decoder for an expression known to produce SQLite milliseconds. `.mapWith` is implemented at `node_modules/drizzle-orm/sql/sql.js:221`; null is retained before decoding in `node_modules/drizzle-orm/utils.js:29`.
- `count()` / `countDistinct()` already use `.mapWith(Number)`; `max(timestampColumn)` uses the column decoder and therefore returns a Date for a non-null result (`node_modules/drizzle-orm/sql/functions/aggregate.js:4`, `node_modules/drizzle-orm/sql/functions/aggregate.js:22`). Do not assume every aggregate is numeric.
- Public wire contracts remain numeric and retain current shapes: list array, detail object/null, delete boolean, overview object, omnibox array (`src/preload/index.ts:174`, `src/preload/index.ts:232`, `src/preload/index.ts:294`). Do not add result wrappers or move ORM imports into shared/preload/renderer.

## 4. Recent/Detail/Visit Read Compatibility

| Behavior           | Exact current contract and evidence                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status precedence  | AC exists => `solved`; any submission exists => `attempted`; otherwise stored `p.status`. Both counts and status include soft-deleted submissions (`queries.ts:9`, `queries.ts:40`).                                                                                                                                                  |
| Recent limit       | Filter active problems and optional platform first; `ORDER BY last_visited_at DESC LIMIT limit`; apply optional status **after** limit in JavaScript (`queries.ts:20`, `queries.ts:30`). Moving status into WHERE changes visible results.                                                                                            |
| Known status issue | `tests/db/auditDataIntegrity.repro.ts:377` records 200 newer non-solved rows plus one older solved row: filtered result is empty. It is explicitly a historical defect observation, not permission to fix this behavior inside an ORM refactor. Add a small normal regression to pin parity until a separate product fix is approved. |
| Defaults/input     | Repository default limit is 50. Public input guard accepts integer 1..1000 and the existing platform/status enums (`src/shared/types/ipc/problem.ts:30`). Sidebar requests 200 (`ProblemSidebar.tsx:31`), home requests 8. Keep the established guard layer.                                                                          |
| Ordering           | Recent only orders descending last-visit; detail submissions only descending submitted-at, capped at 100; visits only ascending entered-at, no limit (`queries.ts:25`, `queries.ts:58`, `queries.ts:78`). Do not add ID tie-breaks to these APIs in a parity conversion.                                                              |
| Tombstones         | Detail and platform-key lookup exclude deleted problems. Visit listing includes deleted visits, and does not itself check whether the problem is active (`queries.ts:48`, `queries.ts:74`, `queries.ts:94`). Do not apply a global active-row helper.                                                                                 |
| Detail counts      | Counts consider all submissions, even when the returned submission array is capped at 100. A query joining children must not multiply counts or accidentally count only the displayed page.                                                                                                                                           |
| Missing row        | Detail returns null, ID lookup returns null, visit listing returns an empty array. `.get()` returns undefined in Drizzle; translate only where the existing API did.                                                                                                                                                                  |

Keep correlated `EXISTS` and counts or use equivalent typed correlated subqueries. `getTableColumns(problems)` can preserve `p.*` before replacing computed status and mapping dates; explicit select aliases avoid duplicate `status` columns. Do not implement these small reads as a global `JOIN/GROUP BY` rework without proving identical multiplicity and plans.

Main consumers to retain: `electron/ipc/registerProblemIpc.ts:20`, `src/features/problems/problemsApi.ts:23`, `electron/coach/CoachOrchestrator.ts:768` (numeric visit timeline), and `electron/coach/llm/ContextGatherer.ts:79`. `tests/coach/contextGatherer.test.ts:12` intentionally supplies full rows with sensitive sentinels and verifies outbound prompt allow-listing; repository projection work must not weaken that test.

## 5. Upsert And Delete Compatibility

### Upsert (`problem/mutations.ts:15`)

- Existing-row lookup is by platform/key and **does not exclude tombstones**. Updating an existing deleted problem leaves `deleted_at` unchanged; it does not resurrect it.
- New row has a fresh UUID and explicit `status = 'visited'`, although schema default is `'unknown'`. `first_seen_at`, `last_visited_at`, `created_at`, `updated_at` share one `nowMillis()` instant. Use one `new Date(now)` for the ORM inputs.
- Existing update only changes canonical URL, optional contest/index, approved title, last-visit and updated-at. Preserve first-seen/created/solved/status/source fields. Source-platform/source-problem are only inserted, never backfilled by this update.
- `COALESCE(incoming, stored)` preserves contest/index when incoming is absent/null, but accepts an empty string. Use `incoming ?? undefined` in `.set()` or equivalent; `incoming || undefined` changes semantics. Installed `mapUpdateSet` ignores undefined, not null (`node_modules/drizzle-orm/utils.js:83`).
- Title uses `isValidScrapedTitle` and `shouldReplaceScrapedTitle` from `electron/parsers/titleValidation.ts:20`, `electron/parsers/titleValidation.ts:30`; an invalid placeholder cannot overwrite a valid title, while a valid CJK title can replace a non-CJK one. Keep this existing JS decision, not a simplistic UPSERT that overwrites all columns.
- Do not switch to `ON CONFLICT` solely for brevity: native flow first fetches title, then updates by ID. Schema-valid null IDs are another policy edge (`WHERE id = NULL` currently affects no row); changing the predicate to platform/key would change behavior.
- It returns void and emits `['problems','stats']` after the statement. Calls inside `startProblemVisit` are already enclosed by the outer actual-commit notification scope (`problemVisitRepository.ts:29`); the adapter must use that same connection, not open another or require an async callback.

### Delete (`problem/mutations.ts:80`)

- Hard-delete remains hard-delete. Before mutation collect local-day keys from all matching visits, submissions, activity events and non-null first-solved instants. No child tombstone filter exists. `UNION` deduplicates timestamps and the Set deduplicates days; preserve this result if using typed unions or bounded per-table reads.
- Delete submissions, then visits, then activity events, then problem in one synchronous transaction. Notes are deliberately not included; UI offers separate confirmation and optionally deletes them first (`src/features/problems/ProblemDetail.tsx:51`). `notes.problem_id` has no FK (`schema.ts:224`), so notes can remain after problem deletion; do not add a cascade or require note deletion. Preserve rollback on actual FK/trigger/statement failures.
- Return `removed.changes > 0`, emit `['problems','submissions','stats']` only when the problem is removed, and preserve missing-row false/no-notification behavior.
- Preserve `withDataChangeTransaction(() => orm.transaction((tx) => { ... }))`, not `orm.transaction(() => withDataChangeTransaction(...))`. Installed `BetterSQLiteSession.transaction` invokes the native transaction and commits before returning (`node_modules/drizzle-orm/better-sqlite3/session.js:37`); the outer scope must include that return/commit.
- Keep recomputation **after** successful deletion, outside its transaction. `recomputeDailyStatsForDates` emits additional `stats` events per successful day (`stats/recompute.ts:11`). A recomputation failure logs `problem.delete-stats-recompute-failed` but still returns true, because the delete already committed (`mutations.ts:114`). Do not roll back/report failure for that later derived-cache error.
- Existing focused tests: `tests/db/deleteProblem.test.ts:148` (all affected days), `tests/db/deleteProblem.test.ts:202` (later delete failure rolls back earlier deletes), `tests/db/deleteProblem.test.ts:230` (post-commit stats failure). Add delete-specific commit failure/no-early-event assertions; existing commit-failure test in `dataChangeNotifications.test.ts:244` exercises script transactions, not this exact delete path.
- Retain broader R4 tests at `dataChangeNotifications.test.ts:119`, `dataChangeNotifications.test.ts:143`, `dataChangeNotifications.test.ts:262`, `dataChangeNotifications.test.ts:280`: duplicates/no-op, visit rollback, caught inner rollback, and partial autocommit submission batches are distinct contracts.

## 6. Omnibox: Preserve Two Bounded Pipelines

`problem/omnibox.ts` is not a generic search query and should not be the first conversion.

1. Normalize input with `trim().slice(0, 256)` (`omnibox.ts:49`). SQL binds the exact, escaped-prefix and escaped-contains values. Escape `%`, `_` and backslash with backslash and retain SQL `ESCAPE '\'` and `COLLATE NOCASE` (`omnibox.ts:25`, `omnibox.ts:176`). Installed `like()` adds no ESCAPE clause; `ilike()` emits `ILIKE`, which is not SQLite syntax (`conditions.js:115`, `conditions.js:121`). Use bound `sql` fragments for these clauses, never raw user interpolation.
2. Problem candidates: active problems, metadata contains-match when nonempty; empty query additionally requires non-null last-visit. Rank exact=0 / prefix=1 / other=2, then last-visit descending and problem ID ascending; limit **24 before** latest-visit enrichment (`omnibox.ts:87`).
3. Latest visit enrichment: only active visits; order entered-at descending and visit ID ascending, limit 1 per problem. Use its URL/time over the canonical problem URL/time. The source flag comes from whether `latest_visit.id IS NULL` (`omnibox.ts:118`), not whether a URL happens to exist. Note nullable visit IDs can affect the scalar-id join; do not replace with a differently defined row-presence check invisibly.
4. Recent visit candidates: take latest **64 active visits first**, ordered only entered-at descending; then join to active problems and apply metadata-or-visit-URL search (`omnibox.ts:148`). Pushing the search or problem filter inside that CTE expands the candidate horizon and changes results. No deterministic visit-ID tie-break is specified for this 64-row horizon.
5. Concatenate problem candidates first, then recent candidates. Final JS rank uses title, problem key, platform, canonical URL **and chosen visit URL**; exact before prefix before other, then timestamp descending with null treated as 0, history before problem, then problemId lexical, then URL lexical (`omnibox.ts:202`). Preserve simple `<` ordering rather than localeCompare. SQL NOCASE and JS lowercase are separate stages; do not claim arbitrary Unicode collation equivalence.
6. Deduplicate **after sorting** by problem ID or normalized URL, then stop at **8**. URL normalization uses `new URL(...).toString()` with trimmed fallback, not lowercasing the whole URL (`omnibox.ts:62`, `omnibox.ts:230`). Do not remove `canonicalUrl` before ranking; do not expose it as an extra public output key.
7. Preserve CTE limits and the indexed latest-visit lookup. README forbids whole-history grouping/window scans (`problem/README.md:31`); no dedicated omnibox EXPLAIN assertion was found in the inspected architecture/performance tests. Add bounded candidate fixtures and inspect generated query plans instead of replacing this with a full-history join/aggregation.

Installed APIs support `$with(...).as(...)`, `with(...).select(...)`, `.as(...)`, `leftJoin`, correlated subqueries, and `alias` from `drizzle-orm/sqlite-core`. Every computed field referenced through a CTE/subquery needs `.as('field_alias')`; the installed selection proxy throws on an unaliased raw SQL selection (`node_modules/drizzle-orm/selection-proxy.js:50`). Inspect `.toSQL()` while implementing; keeping TypeScript green does not prove the generated LIMIT nesting or ESCAPE syntax is equivalent.

Required additions beyond current five omnibox cases: 24/25 metadata candidates, matching visit beyond 64 excluded, deleted-problem visits consuming the visit horizon as currently specified, ties at final rank/source/ID/URL, latest-visit equal-time ID tie, null last-visit and epoch 0, offset-equivalent timestamps, 256-character truncation, and no input SQL injection. Do not invent a tie guarantee at the 64th visit cutoff where the current query has none.

## 7. Stale Timestamp Fixtures: Narrow Fixes Only

### Confirmed post-030 fixture bug: `tests/db/omniboxSuggestions.test.ts`

- The test calls `initDbAtPath` (all 30 migrations) at line 15, but `ProblemFixture.lastVisitedAt/deletedAt` and `VisitFixture.enteredAt/deletedAt` are still strings (`omniboxSuggestions.test.ts:23`).
- `timestamp()` returns an ISO string at line 89. Helpers bind these strings into INTEGER-affinity timestamp columns at lines 61 and 81; SQLite accepts/stores nonnumeric text. Assertions at lines 129 and 279 also expect strings even though `OmniboxSuggestion.lastVisitedAt` is numeric.
- This is particularly misleading: subtracting ISO strings in `compareCandidates` gives NaN, so the comparator's recency stage cannot establish numeric ordering; input SQL/string ordering can make selected cases appear green.
- When touching omnibox, change fixture instant fields to `number | null`, make `timestamp()` return `Date.parse(...)`, bind numbers, and assert numeric output. Preserve explicit null for `last_visited_at`: the current helper's `fixture.lastVisitedAt ?? defaultTime` loses null; use `fixture.lastVisitedAt === undefined ? defaultTime : fixture.lastVisitedAt`. Keep separate non-null creation/first-seen defaults instead of using a nullable last-visit for mandatory timestamps. Likewise preserve an explicit null title instead of always replacing it with the fixture ID.
- Add `typeof(column) = 'integer'` checks for non-null seeded timestamps and explicit 0/null cases. Do not broaden production Date decoding to tolerate these obsolete fixture strings.

### Other stale non-migration fixtures found, not part of overview

- `tests/db/migrationSafety.test.ts:220` is a current-schema orphan-recovery case: calls `initDbAtPath`, then inserts string `enteredAt` at line 225 into problem/visit timestamps and expects that string back. It uses explicit `migrations: []`, so it is not a legacy conversion fixture. Change only this case to numeric `Date.parse(...)` when startup/visit tests are next touched; do not modify earlier intentionally historical cases in the same file for A2.
- `tests/performance/auditImportPerformance.repro.ts:68` opens a current-schema DB and seeds string `timestamp`, `enteredAt`, `leftAt` at lines 70, 98 and 99. If reused to benchmark the ORM slice, convert these to numeric instants first; otherwise it is not a valid post-030 performance oracle. It is a manual `.repro.ts`, not a normal gate, and need not be edited for overview.
- `tests/db/deleteProblem.test.ts:30`, `tests/db/repositories.test.ts:88`, `tests/db/dataChangeNotifications.test.ts:129`, `tests/ai/traceability.test.ts:78` and the Coach lifecycle timeline fixtures already bind numeric values; do not mechanically change them.
- Strings in migration001-029-specific tests, `historicalUpgradePath.test.ts`, `migration030.test.ts` and legacy export compatibility input are intentional pre-030 data. Do not replace them globally. `tests/db/auditDataIntegrity.repro.ts:34` already has numeric fixture instants and records the status-after-limit behavior separately.

## 8. Verification And Remaining Decisions

- Existing real-Electron `tests/db/repositories.test.ts:429` covers duplicate problem upsert/title/contest retention; line 482 covers detail status/counts after submissions. It is excluded from Vitest and executed via `tests/verify.mjs`; a plain `vitest run tests/db` does not run it.
- `tests/db/omniboxSuggestions.test.ts:93` covers cap/latest URL, match ranking, escaping, tombstones and deduplication, but currently has the fixture problem above and no >24/>64 horizon tests.
- `tests/coach/coachOrchestratorLifecycle.test.ts:1683` and line 2287 exercise real timeline reads including open-visit nulls. `tests/ui/dataRefresh.pw.spec.ts:30` exercises real sync through DB, bridge, preload and renderer; retain it for full gates.
- `tests/verify.mjs:21` currently lists omnibox but not deleteProblem/dataChangeNotifications in its focused DB list. Full core/all include them. Add newly introduced problem tests to the focused list deliberately; do not assume a new test is covered by `test:db` because its directory is `tests/db`.
- SQL remains inside the existing DB boundary; no `BARE_SQL_BUDGET` increase is needed for these conversions (`tests/architecture/check-architecture.mjs:307`). Do not hide whole raw queries behind `sql.raw` or weaken the guard to obtain a zero `.prepare()` count.
- Before converting DTO-returning queries, choose the nullable-ID handling policy explicitly. Before changing status-limit, tombstone semantics or omnibox horizons, create a separate behavior task. None blocks the overview-first delivery.
- This report is implementation preparation, not proof that a converted query or new test passed. Parent's A1 verification remains independent; no A1 file was changed during this research.
