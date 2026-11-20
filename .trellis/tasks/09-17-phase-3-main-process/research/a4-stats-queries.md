# Research: A4 Stats Queries

- Query: Inventory the next stats-domain Drizzle conversion, recommend bounded read/write slices, and identify exact native/type/caller contracts and acceptance blockers.
- Scope: internal code/spec/caller/test/installed-library inspection; synthetic in-memory SQL, virtual TypeScript and isolated module probes only.
- Date: 2026-11-20

## Findings

### Recommendation and smallest next scope

**A4a: convert ONLY getPlatformDistribution, getProblemVisitStats and getLastActiveTime in stats/insights.ts.** These three scalar/aggregate reads have no new nullable-output/UI policy, need no date helpers or writes, and establish the stats pattern with a small independently testable patch. Preserve current signatures and all other functions. Do not silently broaden A3b or start this while its native gates run.

Follow with separately reviewed slices:

1. **A4b daily-cache reads:** four functions in trends.ts plus getStreakDays. Blocked on an explicit truthful nullable local_day output policy and preservation of existing invalid-day failure behavior. Schema permits multiple NULL TEXT primary keys, so this is not merely arbitrary-DDL drift.
2. **A4c insight lists:** getTimeline/getRevisitStats/getWrongProblems/getUnreviewedProblems. Timeline ID and wrong/unreviewed IDs need truthful nullable policy; dashboard uses IDs for keys but URL for actions. Revisit can use its existing equality join's NOT NULL visit FK. No count/order/date redesign.
3. **A4d recompute writes:** recompute.ts/recompute-core.ts only after a separate migration-aware design. The supposedly internal core is executed by released migration030, so changing it changes historical migration execution even if the030 source file is untouched. Do not couple this to read conversion or treat it as routine cache writes.

A4a minimum implementation files: `algo-electron/electron/db/repositories/stats/insights.ts`, new `tests/db/stats-basic-reads.test.ts` + independent `stats-basic-reads-oracle.ts`, a few decisive native cases in `tests/db/repositories.test.ts`, DB runner registration in `tests/verify.mjs`, and scoped README/task/spec evidence handled by authorized owners. No shared/API/renderer/time/schema/migration changes are necessary. Reuse existing behavior-test infrastructure, not new connection caches/helpers/frameworks.

Paths below are relative to algo-electron/ unless fully prefixed.

### Full read inventory and exact contracts

| Function / source | Legacy contract |
| --- | --- |
| insights.ts:13 getPlatformDistribution | COUNT(*) of active parents (`deleted_at IS NULL`), GROUP BY platform, descending count only, no cap; nullable IDs still count. Empty =>[]. |
| insights.ts:26 getProblemVisitStats | Exact bound problem_id, COUNT(*) plus COALESCE(SUM duration,0), COALESCE(SUM active,0), COALESCE(AVG duration,0); one row even no facts, all zeros. Includes NULL visit IDs, tombstones and orphan/deleted-parent visits. AVG ignores NULL durations rather than dividing by total_visits. |
| insights.ts:43 getTimeline(limit=50) | Six columns only: id,event_type,occurred_at,platform,url,problem_id. All activity rows including tombstones, occurred_at DESC only, native bound LIMIT. NULL activity ID is reachable. |
| insights.ts:57 getLastActiveTime | Latest raw occurred_at from all activity rows, DESC LIMIT1. Empty =>null, epoch0 preserved with ??, no MAX rewrite or Date decoder. |
| insights.ts:70 getRevisitStats(limit=50) | Active parents INNER JOIN all visits; GROUP BY p.id, COUNT(pv.id), MAX entered_at; HAVING count>1; order count DESC only; native LIMIT. NULL visit IDs do NOT count but still participate in MAX. No visit tombstone filter. |
| insights.ts:95 getStreakDays | Daily rows with active>=300 OR submission_count>0 OR solved_count>0, descending TEXT local_day; no tombstone filter. Unchanged JS loops calculate longest/current; current requires top row exactly today, not yesterday. |
| insights.ts:137 getWrongProblems(limit=50) | Active parents JOIN all non-exact-AC submissions, exclude any parent with any exact AC (including tombstoned AC); GROUP p.id, COUNT(s.id), MAX submitted_at, last_attempt DESC only/native LIMIT. NULL submission IDs do NOT count; a returned row can have wrong_count0. Includes TESTING/UNKNOWN/etc, not a curated failure-verdict list. Parent status is irrelevant. |
| insights.ts:166 getUnreviewedProblems(days=30,limit=50) | Active parents, last_visited_at strictly before cutoff local midnight, status !='visited'; oldest first/native LIMIT. days_since is SQL CAST((first nowMillis - last_visited_at)/86400000 AS INTEGER), not calendar-day difference. NULL last_visited_at excluded by comparison; NULL parent ID still returned. |
| trends.ts:6 getDailyActiveStats(days=30) | Seven selected fields/aliases from ALL cache rows, local_day DESC, native LIMIT days. This is last N rows, not last N calendar days; missing dates not filled. |
| trends.ts:27/53 getVisitedTrend/getAcTrend(days?) | If days truthy, local_day>=localDateDaysAgo(days); otherwise no filter. ASC text order, no LIMIT. AC trend reads solved_problem_count (first solves), not AC submission count. Future/malformed text may pass lexical cutoff. |
| trends.ts:78 getSubmissionTrend(days=30) | local_day,total=submission_count,ac=ac_submission_count; local_day DESC/native LIMIT days; all cache rows. |

No read creates transactions, mutates/cache-rebuilds, emits notifications or catches SQL failures. Wrap current getDb with createDrizzleClient on each call; no adapter survives close/reinit. Do not add input validation, date fill, tombstone filters, sorting tie-breaks or error-to-empty fallback. Scope equivalence to unchanged validated030 tables plus explicitly identified diagnostic value/error fixtures, not all possible replacement schemas.

### A4a executable public-builder pattern

- Platform distribution already has a semantically identical typed version at `electron/db/repositories/problem/overview.ts:14`: select platform/count(), active filter, group platform, desc(count()). Copy/reuse its accepted query pattern without reorganizing domain ownership in this slice. COUNT(id) is wrong. No need to touch overview.
- Visit aggregate: select `total_visits: count()` and raw scalar `sql<number>` expressions for `COALESCE(SUM(duration_seconds),0)`, `COALESCE(SUM(active_seconds),0)`, `COALESCE(AVG(duration_seconds),0)`, from problemVisits, where eq(problem_id,input), synchronous get(). Keep SQL functions inside SQLite (including integer-overflow errors), no JS reduction or `.mapWith(Number)` around sums/average.
- Drizzle get() remains statically optional even for a no-GROUP-BY aggregate. Use explicit impossible-state throw if undefined, not `!`, assertion or fabricated zeros. Real SQLite always returns the aggregate row after successful execution; test empty result values, not a mocked missing row as expected behavior.
- Latest activity: select raw `sql<number>`${activityEvents.occurred_at}``, order desc(column), limit(1), get(); return row?.occurred_at ?? null. A static cap1 needs no input-placeholder workaround. Do NOT delegate to problem/overview.ts:42: that function Date-decodes and getTime() truncates fractional/destroys extreme diagnostic values. Its valid-data behavior is similar but raw stats parity differs. Leave overview unchanged.

Virtual strict compilation confirmed the raw aggregate/invariant guard, raw latest-time return, and joined NOT NULL visit-FK projection without casts. Existing sum()/avg() helpers return strings; max(timestampColumn) returns Date (1.75 becomes1ms). Raw SQL aggregates/projections preserve numeric SQLite output and diagnostic storage without declaring corrupt timestamps valid shared inputs.

### Deferred nullable/date policy: genuine baseline values, not DDL drift

**Daily local_day is nullable on the real schema:** src/main/db/schema.ts:504 and drizzle/0000_baseline.sql:335 use table-level TEXT primary key without NOT NULL. Synthetic baseline-shaped SQL inserted TWO NULL keys successfully. Unfiltered daily/submission/visited/AC reads retain them, ASC puts them first/DESC last; a string cutoff excludes NULL naturally. Do not add an IS NOT NULL filter, stringify NULL, coalesce sentinel or sql<string> cast to satisfy existing output types.

Existing declared string-only surfaces: stats/types.ts:1 DailyActiveStat; shared/types/stats.ts:28/41/49 DailyActiveStats/TrendPoint/SubmissionTrendPoint; electron/ai/contextTypes.ts:15 daily_stats.local_day. Conservative proposal for A4b is nullable outputs throughout those read contracts, with no runtime row filtering. AI contextExporter.ts:59 already copies the raw day; periodSummaryAggregation.ts:34 compares it strictly to a string snapshot day (NULL already does not match). Dashboard analyticsApi.ts:10 maps raw day keys, then fills canonical requested days; NULL map key never matches generated date strings. The all-time trend path returns input rows unchanged. Validate chart/AI consumers before acceptance; no automatic shared-type widening now.

**Streak cannot merely 'fix malformed keys'.** It consumes cached text/NULL rows and validates dates only through dayDiff inside loops. Synthetic execution of the unmodified function observed:

- [] => {current:0,longest:0} without reading now.
- A single NULL or 'bad' key => {current:0,longest:1}; its loop never calls dayDiff.
- Two NULL rows, or 'bad' followed by a real day => TypeError('Invalid local day') from dayDiff before the today check.
- One yesterday row => current0,longest1; no grace day. Future newest rows also break current, while longest still computed.

Truthful nullable typing must preserve those short circuits/failure locations. A focused dayDiff signature/error guard at the actual pairwise comparison can represent nullable input without casting; prevalidating/filtering all SELECT rows changes one-row behavior. Decide this explicitly in A4b; leave date.ts unchanged in A4a. Preserve thresholds exactly300,>0,>0 (not any visit, any duration or >=0); tombstoned daily rows currently count.

**Timeline ID:** activityEvents.id is nullable; widen only read-only timelineEventSchema.id and DashboardTimelineEvent.id when implementing A4c. Existing DashboardListsPanel.tsx:92 already uses event.id ?? index; no ID-based event action. Occurred_at remains raw repository number but shared integer output validator remains strict; no new parser is inserted.

**Revisit IDs:** unchanged INNER JOIN on baseline TEXT/BINARY parent id and NOT NULL problemVisits.problem_id proves equality. Project that existing visit FK to infer truthful string (already accepted A2e-style proof). Do not add joins/filters or replace native-bound values in JS. Keep groupBy parent id and count visit.id, not COUNT(*).

**Wrong IDs:** both parent id and submissions.problem_id are nullable in schema. INNER JOIN eliminates NULL at SQL runtime, but neither side provides a declared NOT NULL witness. Select schema column and conservatively widen internal/shared wrong-row ID plus dashboard view-model key policy, or explicitly defer. Do not hide nullability in sql<string> or unrelated non-null platform ID. The AI wrong-problem projection intentionally drops local ID already.

**Unreviewed IDs:** actual baseline NULL parent ID can pass last_visited/status predicates; widen id rather than drop row. last_visited_at is nullable in schema but the existing `< cutoff` excludes NULL, so a raw numeric projection can represent the predicate-proven nonnull timestamp, retaining diagnostic fractions/TEXT. Keep canonical_url-based action; DashboardListsPanel.tsx:54/57 currently requires string/number keys, so separately review a stable fallback key rather than pretending nullable id is addressable. Empty-string keys/actions remain unchanged. A2g invalid internal-page policy need not be copied: these lists navigate to canonical_url, not internal problem IDs.

### Date/limit/prepare details for later read slices

- Reuse `.limit(sql.placeholder('limit')).all({limit})` (or named days) for EVERY caller-controlled limit. Pinned0.45.4 numeric limit drops negative/NaN values. Native0/-0 returns[], negative integers unlimited; positive/negative fractions/NaN/infinities must retain original native behavior/error. No JS clamp/floor. Static limit1 in latest activity is safe.
- getVisitedTrend/getAcTrend use `if(days)`, not days!==undefined.0,-0,NaN and omitted mean unfiltered; negative integer means cutoff in the future;1.5/Infinity are truthy and throw 'Day shift must be an integer'. Preserve this repository behavior even though IPC accepts only positive bounded integers.
- Original trends prepare SQL BEFORE evaluating localDateDaysAgo in .all(args). Synthetic trace confirmed broken schema wins over invalid day-shift error. Preserve with cutoff placeholder plus `.prepare()` before computing `.all({cutoff:localDateDaysAgo(days)})`; do not calculate the cutoff while constructing WHERE before native prepare.
- Unreviewed similarly prepares before evaluating `.all(nowMillis(),localDayBounds(localDateDaysAgo(days)).start,limit)`. Keep two separate now reads: first elapsed-ms numerator, second inside localDateDaysAgo cutoff. Freeze/step clock in oracle; don't silently collapse them across midnight. Public builder can use placeholders now/cutoff/limit with unchanged native bind order; raw SQL scalar CAST and raw cutoff placeholder avoid accidental Date encoding.
- localDateDaysAgo uses host-local toLocalDay plus UTC calendar shifting. dayDiff validates localDayBounds but computes UTC calendar ordinal difference, intentionally avoiding23/25-hour DST length. Old 'Beijing' comments are stale descriptions, not permission to hardcode timezone. Reuse helpers, test UTC/Shanghai/NewYork; never toISOString for local label or fixed24h for boundary end.
- Unreviewed days_since is a different contract: constant86400000 elapsed division + SQLite CAST truncation, not dayDiff and not floor. Keep raw SQL arithmetic/affinity behavior, cutoff `<` and status!='visited'. Don't change to <= or 'solved only'.
- AVG/SUM must stay inside COALESCE SQL with raw numeric outputs. `sum()`/`avg()` decode String; min/max on timestamp decode Date. count(column) differs from count() intentionally in revisits/wrong; use exact form per inventory, not a blanket COUNT(*) rule.
- Revisit raw MAX includes nullable-ID/tombstoned child rows even when count excludes NULL IDs; a recent NULL-ID visit can supply last_visit to a group whose earlier two identified visits pass HAVING. Wrong list can have COUNT(s.id)=0 with nonempty non-AC rows, and exact-AC tombstone excludes the parent entirely.
- Use supported sqlite-core alias(submissions,'s2') for wrong-problem NOT EXISTS; fixed 'AC' literals and static HAVING>1/status!='visited' fragments avoid unnecessary bind changes. Keep aggregate aliases/order expressions and no tie-break. Generated public-builder SQL was inspected for these shapes; acceptance still needs native oracle.

### Recompute write boundary: separate, migration-coupled design required

`electron/db/repositories/stats/recompute-core.ts:16` receives an explicit native handle so migration-time rebuilding works before global getDb initialization. Never replace it with a getDb-based helper or cache an ORM client globally.

Single day sequence is exact: localDayBounds(day) validates first; visit SUM/COUNT DISTINCT aggregate; submission COUNT(*)/CASE exact-AC sum; active-parent first_solved COUNT; platform visit COUNT grouped by platform (no explicit ORDER); prepare/run cache INSERT11 with ON CONFLICT(local_day) UPDATE9. Preserve four separate SELECTs and their error order, no consolidation/snapshot transaction. Visits/submissions/platform aggregates include tombstones and orphan links; solved count alone excludes deleted parents. COUNT DISTINCT problem_id counts empty key but excludes NULL, COUNT(*) includes NULL row IDs. Activity rows do not contribute day metrics; they only seed dates in all-days recompute.

Keep [start,end) epoch comparisons sargable so existing time indexes apply. A day at DST transition is23/25h; never end=start+86400000 or SQL date() over indexed instants. Helpers already return validated safe integer boundaries; raw bound SQL parameters preserve native numeric binding without Date round-trip. Aggregate result SUM can overflow; no JS total/decimal string decoding. Platform JSON preserves native array order and exact shape `{platform,count}`; null if no platform rows. Do not alphabetize it merely for stability or add zero-count rows.

Upsert cache behavior: new created_at/recomputed_at/updated_at use same explicit now. Conflict updates all metric columns, platform_distribution_json, recomputed_at and updated_at; created_at and existing deleted_at remain unchanged. No change-count gate or no-op elimination. This is already ON CONFLICT behavior, unlike A3b insert lookup, so keep it rather than replacing with preselect/update. Drizzle would enumerate all12 schema columns (adds deleted_at:null) on INSERT and must use exactly the existing9 UPDATE SET targets. The A3b baseline-only INSERT/default and native-error distinctions apply, but migration-time schemas require a separate review; do not assume production's later baseline guard covers migration execution.

`recomputeAllDailyStatsAt` at70: read existing cache local_day WITHOUT ORDER, seed insertion-ordered Set; then one DISTINCT UNION of raw entered/submitted/occurred/nonnull first_solved instants, including tombstones. Validate every fact instant with throwing toLocalDay BEFORE any day write. No Date decoder: malformed/fractional/unsafe values must still fail before writes, not be rounded. Then iterate Set without sorting, validate/recompute each day, return dates.size. Existing cached NULL/malformed day may fail only when reached, after prior days already committed outside a transaction. No new cleanup/filter. Existing dates with no facts remain and are zeroed; no cache-row DELETE. Retain UNION rather than UNION ALL, exact field key and ordering effects where observable in subsequent day writes. Reuse accepted raw union projection pattern in problem/mutations.ts:89 only after scoped review.

Wrapper timing/notifications in recompute.ts:

- recomputeDailyStats(date) evaluates getDb first; if date nullish, calls nowMillis for local day, then calls nowMillis AGAIN for write instant. Explicit date skips first clock read. After successful core call always emit stats, even same-value update/diagnostic IGNORE. No event on throw.
- recomputeDailyStatsForDates consumes entire iterable, deduplicates, then default lexical sort BEFORE getDb/calls. Empty iterable returns0 even with uninitialized connection; iterator throw performs no writes. Each sorted day calls the wrapper separately with its own now/event. Later failure leaves prior autocommit writes/events.
- recomputeAllDailyStats gets current DB then one now, core rebuilds all dates without events; wrapper emits exactly once only count>0 on full success. On an unwrapped later failure earlier writes may persist with NO wrapper stats event. Do not 'fix' this inconsistency by changing buffering/atomicity in query conversion; record differential behavior and plan a separate behavior change if desired.
- Import learningDataExport.ts:381/389 runs first-AC + selected-date recompute inside existing native transaction and withDataChangeTransaction. TrackingService, SubmissionBatchWriter and post-delete recomputation have other autocommit boundaries; preserve each owner. Do not change event payload contents.

**Migration blocker:** migrations/030_timestamps_to_unix_ms.ts:7 imports this live core; at228 it invokes recomputeAllDailyStatsAt after rewriting timestamp columns and before restoring preserved triggers at229. Thus a core edit is part of the historical030 execution path. The ordinary application post-030 schema guard runs later; historical migration may preserve objects unavailable in current-baseline acceptance. Need explicit decision to freeze a migration-specific legacy implementation versus prove unchanged execution with historical fixtures, trigger/view preservation, late-error rollback and packaged restore gates. Research recommends leaving the core untouched until that design is reviewed; do not edit/rewrite released migration files as a shortcut.

Current tests include migration030.test.ts:76 view/trigger/rowid preservation,139 stale-cache rebuild,181 malformed-key rollback; dailyStatsPerformance.test.ts:67 expects recompute below50ms on two years of facts; backupImport.test.ts:612 verifies actual rollback after stats-trigger failure. These are required A4d dependencies, not tests to weaken or run during this read-only research.

### Callers and smallest test expansion

A4a callers: `electron/ipc/registerStatsIpc.ts:62/66/78` exposes distribution/visit/latest; `src/features/problems/problemsApi.ts:27` merges visit stats into detail; `electron/ai/contextExporter.ts:69` consumes distribution. Keep IPC inputs unchanged (stats input schema limits/identifiers are stricter than repository signatures). Overview uses its separate already-converted implementation; do not redirect it silently.

Later slices: analyticsApi.ts:30/44 loads trends/streak/wrong/unreviewed/timeline/revisits. TrendPanel charts daily strings; DashboardListsPanel uses canonical URL actions and ID keys. ContextExporter:59/82/88/95/103 exports daily/streak/wrong/unreviewed/activity with explicit projections; periodSummary:26 counts wrong/unreviewed and consumes streak. No extra private rows/URLs need to enter prompts as a side effect of derived row typing.

Freeze the three A4a ORIGINAL SQL functions in an independent oracle before conversion, retaining raw return shapes and empty handling. Compare old/new on independent disposable baseline databases, not inferred query results shared between implementations. Exact result keys, values, number-vs-string types, error name/message/code, event absence and table/schema snapshots are observable.

| A4a area | Required native/differential cases |
| --- | --- |
| Platform groups | Empty; multiple groups/ties; active parents with NULL/empty IDs; deleted_at0 vsNULL; exact platform spelling; COUNT(*) not COUNT(id), no new secondary order. |
| Visit aggregate | Missing problem/no visits => one zero row; NULL durations/active fields; fraction durations/AVG; NULL row IDs; duplicates and orphan/deleted-parent/tombstoned visits; exact literal/Unicode problem key; native SUM integer overflow. |
| Latest event | Empty=>null; epoch0; negative/fractional/out-of-Date-range diagnostic numbers; ties; newest tombstone still selected; no Date/String normalization; same raw diagnostic TEXT behavior if tested under baseline affinity. |
| Lifecycle/error | Uninitialized/closed/reinitialized native connection; read-only/query_only; missing referenced table/column; step-time aggregation failure; caller-owned uncommitted visibility/rollback; no writes/events/new transactions/cache/migration ledger. |

Run focused Vitest through existing DB registration and decisive actual Electron/better-sqlite3 cases in repositories.test.ts via tests/verify.mjs. Do not claim Node built-in SQLite or a tracing mock validates the native ABI/error codes. A4a no renderer patch means no new UI fixture expansion necessary; existing problem-detail/AI consumers plus product/test TS must still compile. Normal full gates run later under owner scheduling.

Later-read matrix additionally needs all input LIMIT edges, truthy/falsy days, SQL-prepare-before-date-error precedence, nullable day/id outputs, all-time vs cutoff horizons, threshold boundaries/streak yesterday/future/malformed cases, NULL child ID COUNT semantics, anti-AC tombstones, MAX sourced by NULL-ID child, exact CAST days_since/DST cutoffs and clock stepping. Add IPC output schema tests without weakening integer timestamps or input IDs. These are planning dependencies, not reasons to broaden A4a now.

## Files Found / Code Patterns

- `.trellis/workflow.md:363`: research/persistence protocol; task prd.md:111 and implement.md:236 retain problem->submission->stats ordering.
- `algo-electron/electron/db/repositories/stats/insights.ts:13`: eight insight reads; recommended first three non-policy-changing functions at13/26/57.
- `algo-electron/electron/db/repositories/stats/trends.ts:6`: four cache trends with raw LIMIT/truthy cutoff semantics.
- `algo-electron/electron/db/repositories/stats/types.ts:1`: manual output types; nullable daily key and list ID mismatches need scoped decisions.
- `algo-electron/electron/db/repositories/stats/date.ts:3`: host-local date cutoff;23 validated calendar-day difference used only by streak.
- `algo-electron/electron/db/repositories/stats/recompute.ts:6`: wrapper clock/notification/batch semantics.
- `algo-electron/electron/db/repositories/stats/recompute-core.ts:16`: explicit-DB day aggregation/upsert;70 all-days raw UNION/rebuild.
- `algo-electron/electron/db/repositories/statsRepository.ts:1`: compatibility export surface; no SQL to move into it.
- `algo-electron/electron/db/repositories/stats/README.md:24`: fact/cache ownership and date guidance, some historical comments are stale.
- `algo-electron/electron/db/repositories/problem/overview.ts:14`: accepted distribution builder;42 latest activity Date mapping is NOT raw stats-equivalent.
- `algo-electron/electron/db/repositories/problem/mutations.ts:89`: accepted raw DISTINCT UNION projection precedent.
- `algo-electron/src/main/db/schema.ts:17`: nullable activity ID;268 nullable parent ID/time;302 NOT NULL visit FK;446 nullable submission FK;504 nullable daily TEXT PK.
- `algo-electron/drizzle/0000_baseline.sql:335`: physical nullable local_day/defaults, not arbitrary replacement DDL.
- `algo-electron/src/shared/time.ts:51`: strict integer day shifts;71 local-midnight bounds.
- `algo-electron/src/shared/types/stats.ts:28`: shared daily/trend/timeline/list outputs currently narrow several reachable nullable values.
- `algo-electron/src/shared/types/ipc/stats.ts:21`: positive bounded day/limit and nonempty-ID inputs remain unchanged.
- `algo-electron/electron/ipc/registerStatsIpc.ts:42`: existing IPC adapters and stats mutation entrypoints.
- `algo-electron/src/features/analytics/analyticsApi.ts:10`: map/fill canonical days;30 trend requests;44 dashboard loading.
- `algo-electron/src/features/analytics/types.ts:11`: dashboard timeline/problem/revisit key contracts.
- `algo-electron/src/features/analytics/DashboardListsPanel.tsx:54`: URL actions/key generation;92 timeline nullish key fallback.
- `algo-electron/src/features/problems/problemsApi.ts:27`: visit aggregate detail caller.
- `algo-electron/electron/ai/contextTypes.ts:15`: daily local_day string-only projection;contextExporter.ts:59 forwards it unfiltered.
- `algo-electron/electron/ai/summary/periodSummaryAggregation.ts:34`: strict daily/snapshot label match;periodSummary.ts:26 streak/list consumers.
- `algo-electron/electron/db/migrations/030_timestamps_to_unix_ms.ts:7`: imports live core;228 executes rebuild before229 trigger restoration.
- `algo-electron/electron/backup/learningDataExport.ts:381`: state/daily reconstruction inside owning native transaction/scope389.
- `algo-electron/tests/db/statsDate.test.ts:5`: small helper tests; no broad current stats-read oracle found.
- `algo-electron/tests/db/repositories.test.ts:970`: native daily aggregate happy path and subsequent visited trend assertion.
- `algo-electron/tests/db/problemOverview.test.ts:119`: related overview read tests, not the separate raw stats implementation.
- `algo-electron/tests/db/migration030.test.ts:76`: preserved views/triggers/rowids;139 cache rebuild;181 malformed-day failure.
- `algo-electron/tests/db/dailyStatsPerformance.test.ts:67`: native sargable daily recompute50ms performance contract.
- `algo-electron/tests/db/backupImport.test.ts:612`: rollback after actual stats-trigger failure.
- `algo-electron/tests/ipc/timestampSchemas.test.ts:92`: day labels remain strings and instant validators remain integer checks.

## External References / Installed APIs

Inspected installed versions: drizzle-orm0.45.4, drizzle-kit0.31.11, better-sqlite3 13.0.3, Electron43.4.0, TypeScript6.0.3 (`algo-electron/package.json:68`). In-memory probe process used Node v26.13.0; this is not the Electron native acceptance runtime.

- `algo-electron/node_modules/drizzle-orm/sql/functions/aggregate.js:4`: count/countDistinct map Number;11/17 avg/sum map String;22 max maps the column decoder or String. Observed sum/avg2.5 as string, max(timestamp1.75) as Date1ms.
- `algo-electron/node_modules/drizzle-orm/sqlite-core/query-builders/select.d.ts:364`: public HAVING;410 callback order aliases;428 LIMIT accepts number|Placeholder. Alias/COUNT(child.id)/raw MAX/limit placeholder query shape generated successfully; join's NOT NULL visit FK compiled as string.
- `algo-electron/node_modules/drizzle-orm/sqlite-core/dialect.js:212`: numeric negative/NaN LIMIT omission; already accepted named-placeholder workaround preserves bound native values.
- `algo-electron/node_modules/drizzle-orm/better-sqlite3/session.js:22`: immediate client.prepare on prepared builder;get/all retain synchronous native calls. Generic `.run(sql)` wrapper is not needed for read conversion and is not an error-parity workaround.

Additional probes (no emitted code/files): virtual strict TS accepted A4a projections/invariant guard and revisit join proof; deliberate assignment of userDailyStats.local_day to string failed TS2322 as expected. Node SQLite memory DB accepted multiple NULL daily PKs, yielded wrong_count0 from NULL-ID WA facts, excluded a two-row revisit with only one identified visit, preserved fractional MAX, and returned unreviewed NULL parent ID. Isolated actual-source modules confirmed trend prepare-before-helper/error precedence and nuanced malformed/null streak behavior. Tracing adapter verified cutoff-placeholder prepare before date calculation; generated unreviewed bind order remains now,cutoff,limit.

Official reference pointers (not fetched during this internal research): https://orm.drizzle.team/docs/select ; https://orm.drizzle.team/docs/sql ; https://orm.drizzle.team/docs/update ; https://www.sqlite.org/lang_aggfunc.html ; https://www.sqlite.org/lang_select.html ; https://www.sqlite.org/lang_expr.html . Pinned local sources/probes are the version-specific evidence, not current-doc assumptions.

## Related Specs

- `.trellis/spec/project/drizzle-adoption.md`: current-connection ownership, bounded domain conversion, schema-derived nullability, raw diagnostic reads/native errors, no schema/layout changes.
- `.trellis/spec/project/drizzle-submission-reads.md`: accepted raw timestamp aggregates/full native error evidence and named LIMIT placeholders; reuse mechanics, not submission-specific filtering assumptions.
- `.trellis/spec/project/drizzle-submission-writes.md`: bounded unchanged-baseline INSERT policy; cannot automatically extend to migration-time stats core.
- `.trellis/spec/project/unix-millisecond-time.md:33`: safe integer instants/local date labels, strict migration030/time/recompute/import contracts; preserve DST/calendar behavior and invalid-value failures.
- `.trellis/spec/project/data-refresh.md:36`: caller-owned transactions/notifications and partial autocommit semantics; no fake atomic read/write batch.
- `.trellis/spec/backend/database.md:103` and `.trellis/spec/backend/type-safety.md:7`: public typed sync builders, no non-null assertions/casts; aggregate invariant guard instead of silently fabricated rows.

## Caveats / Not Found

Research only: writes limited to `research/a4-stats-queries.md`. No A3b/A3a/product/spec/task metadata edits, Git, user DB, original D: checkout, native/global/UI/build run or new agents. Parent will review this after active A3 gates, not silently expand A3.

Smallest A4a has no known implementation blocker; exact native oracle and review are still required. Later reads have unresolved nullable local_day/list-ID consumer policies and precise date/prepare/error ordering. Recompute has a material released-migration dependency and public-builder INSERT12-vs11/default/trigger boundary requiring separate design. No universal arbitrary-DDL equivalence or complete stats-domain conversion is claimed.

Source-only/synthetic probes cannot certify native binding/error/overflow/tie behavior or migration recovery. Use real disposable Electron/better-sqlite3 tests later. No broad stats-read oracle suite was found; existing statsDate and recompute happy paths are insufficient. Preserve existing diagnostics rather than filtering data to make type checks pass.
