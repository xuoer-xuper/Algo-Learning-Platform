# A4d Runtime Statistics Recompute: Migration-Safe Design

Date: 2026-11-20. Research only; A3b2 product/tests remain frozen under parent
acceptance gates. A4a basic reads come first. This document does not authorize
implementation, an API/schema policy change, or editing released migration code.

## Recommendation

**Leave `stats/recompute-core.ts` byte-for-byte unchanged at its current path.**
Treat it as an explicit historical-migration helper exception, not an unfinished
runtime repository conversion. Add a separate runtime implementation, suggested
`stats/recompute-runtime.ts`, using public Drizzle SELECT/INSERT builders. Change
only the import source in the live `stats/recompute.ts` wrapper; leave its three
function bodies unchanged. Migration030 must continue importing and executing the
original core without any new dependency, forwarding shim, feature flag or ORM.

This is deliberate historical duplication, not a reusable-helper opportunity.
Do not factor shared queries/state derivation out of the old core, move it and
update030, or turn its exports into delegates to the runtime implementation.
Retain the original shared time helper behavior as well; no time-helper edits in
this slice. A later directory-layout migration must honor the same exception.

The separate runtime implementation is feasible with installed public APIs and
strict types. It requires explicit parent acceptance of the supported unchanged
post030 schema boundary (INSERT12 versus original11), a late nullable-cache-key
failure narrowing, and independent review before implementation. If that bounded
contract is rejected, defer this write conversion rather than mutate history or
hide a full raw SQL statement behind an ORM escape.

### Alternatives

| Approach | Assessment |
| --- | --- |
| Freeze existing core/path; add runtime-only implementation; switch wrapper import | Recommended. Keeps historical executable graph unchanged; runtime conversion and tests can be bounded independently. |
| Move/copy core into migrations and alter030 import | Unnecessary released-source edit and dependency-graph churn. Not authorized; fails the strongest unchanged-history goal. |
| Rewrite shared live core and prove old/new equal | Highest risk. Alters030 execution before post030 validation, and generated INSERT has real omitted-column/default differences. Existing fixtures cannot prove arbitrary historical DDL equivalence. |
| Old path forwarding to new Drizzle implementation | Not a freeze. Changes historical behavior/dependencies despite leaving the import text intact. |
| Leave everything native for now | Safe fallback if the parent does not accept the runtime boundary. Label runtime A4d deferred; do not call it converted. |

## Evidence And Historical Dependency

Paths in this document are relative to `algo-electron/` unless explicitly stated.

- `electron/db/migrations/030_timestamps_to_unix_ms.ts:7` imports
  `recomputeAllDailyStatsAt` from `../repositories/stats/recompute-core`.
- At030:228, after rebuilding all timestamp tables, restoring views, updating
  activity/feedback local-day labels and deleting only known ten-digit numeric
  pseudo-day cache keys, it invokes that function with the explicit native DB
  and one `nowMillis()`. Preserved triggers are restored only afterwards (229).
- Migration030 is run inside its existing guarded FK-disabled transaction; the
  core must work before global connection initialization. It must not call
  `getDb`, emit repository events, create another connection, or own a transaction.
- `recompute-core.ts` imports only the native DB type and unchanged
  `src/shared/time` functions at runtime. Freezing it avoids introducing current
  schema/client/Drizzle imports into this historical branch.
- `src/main/db/migrate.ts:109` invokes physical baseline validation only after
  the legacy prefix is complete and while recorded Drizzle count <=1. The guard
  is not a guarantee about intermediate030 tables or per-write session DDL.
- `schema-validation.ts:200` rejects views/triggers for ordinary adopted schema;
  its full table metadata comparison rejects altered defaults/layout. In
  contrast030 explicitly preserves historical objects. Do not conflate these
  acceptance domains or relax either validator to accommodate ORM SQL.

Observed SHA256 before and after the read-only probes:

| Historical dependency | SHA256 |
| --- | --- |
| `electron/db/repositories/stats/recompute-core.ts` | `d816c3ee693563e3a84e5333396eac4ab83eefb042cd33118158be1ea78bc508` |
| `electron/db/migrations/030_timestamps_to_unix_ms.ts` | `0dd5967628e9074a0315933e6bf96f0efd404fe9463455e4c95d8a23b250c395` |
| `src/shared/time.ts` | `9ca11982850f6b13d082e60e34b1ed56aed4d7d0c28c68bdef756d32aa8435cf` |

These hashes describe this research snapshot, not a new runtime verification
mechanism or a claim of release/source provenance. Parent should independently
compare source/import graph against its accepted base when reviewing A4d.

## Exact Live Wrapper Contract

Keep `electron/db/repositories/stats/recompute.ts:6/11/17` bodies unchanged.
Import substitution must be the only production edit there.

### `recomputeDailyStats(date?: string): void`

1. Evaluate `getDb()` first. An uninitialized connection fails before clocks/day
   conversion. The explicit native handle is passed to the runtime core.
2. For a supplied nonnull date, skip the day clock; then capture one write clock.
   For undefined (and the existing diagnostic nullish JS case), call nowMillis
   to derive `toLocalDay`, then call nowMillis again for the write instant.
   Those are distinct reads: do not collapse them, even across local midnight.
3. Core validates day boundaries only after the wrapper's write clock capture.
   An invalid explicit day therefore still consumes that clock before failing.
4. On successful core completion emit `['stats']` unconditionally, including a
   same-value conflict update or a diagnostic trigger's successful changes0
   IGNORE. No result.changes guard. Return undefined.
5. A thrown prepare/step/date/serialization error yields no wrapper event. There
   is no new catch/retry/rollback or automatic notification scope.

### `recomputeDailyStatsForDates(dates: Iterable<string>): number`

Eager `[...new Set(dates)].sort()` precedes any getDb/clock/query. Consume the
whole iterable, deduplicate in JS, then use default lexical sort, not calendar
sorting or SQL ordering. Empty input returns0 even with no initialized DB.
An iterator getter/next exception causes no repository calls/writes; do not
stream and process earlier yields. Each sorted unique date calls the existing
single-day wrapper, with a separate clock and notification. Return unique count
only after all calls succeed. A later date failure retains earlier autocommit
rows/events. Do not prevalidate every day or add an outer transaction.

### `recomputeAllDailyStats(): number`

Get current DB, capture one clock, call explicit-DB all-days core. No per-day
clock or event. Emit one stats event only if the returned count is >0 after the
entire core succeeds. Empty/no dates ->0/no event. Count is the attempted Set
size, not changed/inserted rows; successful IGNORE on all dates still produces
count>0 and one event. A later core failure can leave earlier autocommit updates
with **no** wrapper event. This existing asymmetry versus selected-date rebuild
must be preserved, not silently repaired as part of ORM adoption.

### Existing Ownership And Callers

- `tracking/TrackingService.ts:111/155`: individual day recalculation after visit
  changes; retain existing local-day and failure handling.
- `submissions/createDefaultSubmissionBatchWriter.ts:20` supplies selected-date
  recompute. `SubmissionBatchWriter.ts` intentionally permits partial autocommit
  writes and catches statistics errors after submission processing.
- `db/repositories/problem/mutations.ts:129` recomputes after its owned deletion
  transaction and catches/logs statistics errors; do not pull stats into it.
- `backup/learningDataExport.ts:381-389` performs first-AC and selected-date
  recompute in its existing native transaction, with notification scope around
  the invocation including COMMIT. Preserve savepoints and failed-COMMIT discard.
- `ipc/registerStatsIpc.ts:86/103` retains daily->true and all->number responses.
  Do not change input schemas or add nullable day arguments to the public API.
- Facade `statsRepository.ts` stays unchanged. Existing read/type/UI policy work
  (A4a/b/c) is separate; A4d must not redefine chart or AI data contracts.

## Exact Single-Day Core Contract

Original: `stats/recompute-core.ts:16`. Suggested runtime export keeps the same
explicit signature `(db: Database.Database, day: string, now: number): void`.
No captured global connection; wrap only the supplied DB locally when needed.

1. `localDayBounds(day)` validates before any SQL preparation. Keep the unchanged
   host-local helper and its exact errors. Range is `[start,end)`, with end being
   next local midnight, not start+86400000. DST can produce23/25-hour days.
2. Prepare/execute visits aggregate, then submissions aggregate, then solved
   aggregate, then platforms SELECT, then prepare/run INSERT. Preserve these
   separate operations and failure order. No combined CTE/read snapshot or
   eager preparation of later statements before earlier reads finish.
3. Visits: `COALESCE(SUM(duration_seconds),0) AS duration`,
   `COALESCE(SUM(active_seconds),0) AS active`,
   `COUNT(DISTINCT problem_id) AS visited`, from all visits in entered_at range.
4. Submissions: `COUNT(*) AS total`, exact uppercase AC
   `COALESCE(SUM(CASE WHEN verdict='AC' THEN 1 ELSE 0 END),0) AS ac`, all submissions
   in submitted_at range. Do not substitute COUNT(id), count AC groups, or JS sum.
5. Solved: `COUNT(*) AS count` of parents whose first_solved_at is in range and
   `deleted_at IS NULL`. This is the only aggregate's tombstone filter.
6. Platforms: `platform, COUNT(*) AS count` from all visits in entered_at range,
   GROUP BY platform, no explicit order, no joins, parent checks or active filter.
   Preserve native row order and selected property order `{platform,count}` in
   `JSON.stringify(platforms)`; empty array stores NULL, not `'[]'` or `'{}'`.
7. Cache INSERT/ON CONFLICT described next. No core return value, no events.

Visits/submissions/platforms include tombstones and orphan links. NULL row IDs
still count. DISTINCT visit problem keys count an empty string, but SQL would
exclude NULL (the actual visit FK is NOT NULL; do not relax it for a fixture).
Nullable submission problem IDs/parent IDs are reachable. Deleted parents do
not contribute solved counts, but their visits/submissions still contribute.
Activity events seed all-day dates only; they do not add metrics.

Use raw `sql<number>` aggregate projections, not Drizzle sum/avg/min decoders,
Number coercion, TOTAL, floating conversion or JS reduction. SQLite INTEGER SUM
overflow must throw at visit-aggregate step; COALESCE does not catch overflow.
No aggregate has GROUP BY, so successful SQLite execution yields one row even
for empty facts. Narrow each optional `.get()` with an explicit impossible-row
throw if needed; no casts, assertions or synthesized 0/default row. Keep raw
fractional, TEXT-affinity and negative diagnostic seconds behavior; no input
validation is broadened by preserving existing stored results.

Use direct indexed-column range comparisons with SQL-wrapped raw bound numbers,
e.g. `gte(problemVisits.entered_at, sql`${start}`)`. Do not invoke timestamp_ms
Date encoding or wrap indexed columns in date/strftime/cast arithmetic. The
existing day recompute performance contract depends on these ranges.

## Cache INSERT11 Versus Generated12

Original explicit columns and binds, in order:

`day, active, duration, visited, solved, total, ac, platformsJson, now, now, now`.

Corresponding fields are local_day, active_seconds, duration_seconds,
visited_problem_count, solved_problem_count, submission_count,
ac_submission_count, platform_distribution_json, recomputed_at, created_at,
updated_at. It omits deleted_at. Actual baseline at `0000_baseline.sql:335` and
`schema.ts:504` has nullable deleted_at with no default, nullable local_day TEXT
PK, NOT NULL metric defaults0, and no dynamic/onUpdate defaults.

Public `orm.insert(userDailyStats).values(...).onConflictDoUpdate(...)` emits all
12 schema columns and inserts literal NULL for omitted deleted_at. Thus exact
baseline new rows match original11, while arbitrary altered deleted_at defaults
or omitted-column names are NOT equivalent. A synthetic altered DEFAULT7 gave
old7 versus generatedNULL; unchanged baseline gave NULL/NULL. Do not fake an
11-column shadow schema, use private dialect/session internals, or broaden the
production validator to conceal this distinction.

This boundary applies ONLY to the new runtime route. The frozen030 route keeps
original11 and does not need to accept any changed migration-time SQL behavior.
Ordinary diagnostic table triggers on the baseline are useful test observers,
not a promise that app adoption supports arbitrary triggers/views.

Use named placeholders for all11 supplied values; wrap the three timestamp
placeholders in SQL so raw numeric now/null diagnostic binding is not converted
through Date.getTime(). Preserve a real `.prepare()` before constructing `.run`
arguments, particularly before `JSON.stringify(platforms)`, matching the old
prepare/run evaluation order. Native query rows are plain values, but a throwing
serialization seam can still pin that boundary. Typed `.prepare().run()` retains
native errors; generic `orm.run(sql)` wraps errors and is not acceptable here.

Conflict target remains only local_day. Set exactly these9 targets, each from
its own `excluded` column; use fixed SQL identifier fragments, not user strings:

1. active_seconds
2. duration_seconds
3. visited_problem_count
4. solved_problem_count
5. submission_count
6. ac_submission_count
7. platform_distribution_json
8. recomputed_at
9. updated_at

Do not set created_at, deleted_at or local_day, and do not replace UPSERT with
REPLACE, DO NOTHING, a prior SELECT/update, a WHERE no-op guard or RETURNING.
Existing cache created_at and tombstone remain unchanged, even deleted_at0;
metrics are still refreshed. No extra conflict bindings are needed. Preserving
all9 SET targets matters for UPDATE OF triggers even when values do not change.

The original prepare happens only after the four reads. A bad INSERT target
must not win over an earlier overflow/read failure. A BEFORE INSERT or UPDATE
IGNORE can retain audit effects with no row change; FAIL can retain earlier
trigger side effects while throwing; ABORT rolls them back. Compare state and
wrapper events after failure, not merely a throws assertion.

## Exact All-Days Core And Nullable Cache Keys

Original: `recompute-core.ts:70`. Suggested runtime export keeps
`(db: Database.Database, now: number): number`.

1. Select only existing cache local_day with **no ORDER BY**; materialize rows,
   then map into an insertion-ordered Set. No active filter/cleanup/sort.
2. Prepare/execute one native DISTINCT `UNION` of entered_at from visits,
   submitted_at from submissions, occurred_at from activity events, and nonnull
   first_solved_at from parents. Same four arms/order, no tombstone/parent filters.
   Alias first output as `instant`; use raw SQL projections so no Date decoding.
3. Materialize the entire fact result first, then call unchanged throwing
   `toLocalDay(instant)` for each row and add each returned label to the Set.
   Do not use forgiving localDayFromTimestamp, skip invalid values, stream writes,
   sort facts, use UNION ALL, or validate cached labels before fact conversion.
4. Only after all fact conversions succeed, iterate Set in native-derived first
   occurrence order and recompute each day using the same captured now. Return
   Set size on complete success. Existing valid cache-only dates are retained and
   zeroed; there is no DELETE or removal of stale/tombstoned rows.

Public builders can express the four-arm raw UNION directly, matching the
accepted raw-instant UNION mechanics from problem deletion. Column `first_solved_at`
is nullable in schema, but WHERE IS NOT NULL proves its selected scalar nonnull;
use raw `sql<number>` at that exact projection, not a broad type assertion.

**Reachable NULL local_day needs truthful internal typing.** It is allowed by
physical nullable TEXT PK, not arbitrary damaged schema. Select the nullable
column so Set has `string | null`. Do not cast to string, filter it, coalesce it,
prevalidate all keys, or widen public recompute API. At the precise per-day loop
point, `if (day === null) throw new TypeError('Invalid local day')` is an explicit
preservation of the unchanged helper's existing NULL failure, after all fact
conversion and after any preceding days. Then the remaining day narrows to
string for the runtime daily function. This local guard requires review and an
exact original-outcome test; it is not a cleanup/repair policy. An internal
nullable-day private entry is an alternative only if needed to keep the guard
at function entry; avoid unnecessary exported nullable contracts.

No guaranteed SQL order should be documented beyond preserving the original
query. In the observed baseline SQLite uses a covering local_day index; NULL
appeared first. `PRAGMA reverse_unordered_selects=ON` demonstrates a valid cached
day before NULL, where the valid day commits and then NULL throws. A malformed
`not-a-day` cached key also failed after a prior valid day committed. Preserve
these partial effects; do not add ORDER BY to make errors deterministic.

Two distinct invalid-time phases matter:

- Fractional, unsafe, TEXT or outside-Date-range fact instant throws in
  toLocalDay before **any** day write, even if cached malformed labels exist.
- A safe valid Date at its extreme range can produce a label outside the
  four-digit calendar accepted by localDayBounds (for example year275760).
  toLocalDay itself succeeds; failure occurs later in the per-day loop and may
  follow committed cached days. Do not claim every invalid day fails pre-write
  or add extra fact-label validation. Likewise9999-12-31 can fail while finding
  the following day. Keep exact helper error type/message/stage.

## Focused Synthetic Evidence (Not Acceptance)

No source/test/probe files were emitted. Probes used Node22.23.2 built-in SQLite,
actual baseline SQL, pinned Drizzle0.45.4 and in-memory transpilation of original
source. A minimal statement adapter supplied Drizzle's public native statement
shape; this is not the Electron/better-sqlite3 ABI and cannot certify its errors.

- Inspected generated UPSERT:12 columns, final deleted_at literalNULL,11 native
  binds, conflict target local_day and exactly9 SET targets. Raw now1.75 stayed
  fractional; a subsequent conflict preserved created_at88/deleted_at0 while
  assigning updated_at/recomputed_at0.
- Virtual strict compilation against the real project/schema accepted complete
  daily and all-day candidates with three aggregate invariant checks and late
  nullable-key guard:0 diagnostics, no any/cast/non-null assertion, no emit.
- Compared29 original-source versus public-builder scenarios on separately
  initialized baseline memory DBs. All matched complete cache rows, audit effects,
  native synthetic error name/message/code, normalized prepare/get/all/run and
  bind traces, wrapper clocks/events and returned count/value.
- Those29 covered empty/mixed aggregates, nullable IDs/orphans/tombstones,
  fractional sums, exact AC, conflict metadata, cache-only dates, empty all-days,
  raw fact UNION, malformed/NULL keys, raw fractional/TEXT/out-of-Date-range
  facts, valid extreme Date with invalid later label, readonly and empty readonly,
  explicit/default/empty batch/sorted batch/late-failing wrappers, true INTEGER
  overflow, and audit/IGNORE/FAIL/ABORT with both fresh/conflict cache rows.
- Exact SQL integer literals9223372036854775807 and1, verified as INTEGER storage,
  produced `integer overflow` at the original visit SUM. A JS numeric near2^63
  is not a trustworthy integer-overflow fixture. Initial orphan seed needed
  explicit FK disable in the disposable probe; no production FK was changed.
- Unchanged helper returned24/24h day lengths in UTC and Shanghai and23/25h in
  New York for2026-03-08/2026-11-01. These are feasibility observations, not a
  substitute for the repository's isolated-timezone/native regression gates.
- Altered deleted_at DEFAULT7 produced original7/generatedNULL, proving why the
  runtime supported-schema boundary cannot be extended to historical030.

Installed source anchors: better-sqlite3/session.js:22 prepares synchronously;
its typed run directly calls native statement. sqlite-core/dialect.js:344
iterates all enabled insert columns; buildUpdateSet:65 emits selected targets in
schema order. insert.d.ts exposes values/onConflictDoUpdate/prepare publicly;
SQL-wrapped placeholders bypass timestamp encoders. No private APIs needed.

## Required Implementation Evidence And Gates

This is a future execution checklist, not work performed by this researcher.

1. Independent frozen oracle for **both original core functions and all three
   wrappers**. Do not use the production historical helper as a mutable expected
   implementation or share new projections/aggregation/derivation. DB/time/event
   injection and optional-row guards are documented normalization only.
2. Old/new isolated DB comparisons: full cache/fact/audit/schema/ledger state,
   storage types, exact JSON bytes/property order, return/date iteration order,
   clock counts/values, events and transaction state; synchronous original native
   errors and thrown-object identity through traced statements.
3. Core boundaries: empty, all-NULL seconds, zero/negative/fraction/TEXT seconds,
   true INTEGER SUM overflow, NULL/empty IDs, tombstones/orphans, exact-AC case,
   DISTINCT problem keys, grouped platform order/ties, active/deleted parents,
   start inclusive/end exclusive, UTC/Shanghai/New York DST, raw now and metadata.
4. UPSERT: native BEFORE/AFTER INSERT/UPDATE and all9 UPDATE OF audits; unrelated
   created_at/deleted_at/local_day targets must not fire. Fresh/conflict
   IGNORE/FAIL/ABORT, readonly, damaged target prepare after reads, serialization
   evaluation after prepare. Diagnostic damaged-column quoting may differ;
   preserve native stage/identity and do not rewrite errors or weaken validators.
5. Iteration/errors: full iterable consumed before any selected-day call, empty
   batch without DB, duplicates/default lexical sort, stepping clock crossing
   midnight, getDb error before clock, all-days native cache query order including
   reverse_unordered_selects, fact conversion before cache-key validation,
   NULL/malformed keys, duplicate facts in UNION, late calendar-range failure,
   later-day partial rows with zero all-wrapper event versus selected-day events.
6. Caller transactions: native commit, callback rollback, nested savepoint
   success/rollback, unwrapped early events and guarded/reentrant subscribers.
   Actual deferred-FK COMMIT failure can use a synthetic cache-write trigger
   inserting a missing-parent submission with PRAGMA defer_foreign_keys=ON;
   assert callback completes, COMMIT fails, prior cache/fact writes roll back and
   withDataChangeTransaction releases no events. Do not mock the COMMIT failure.
7. Migration protection: parent verifies historical core/030/time source hashes
   and imports unchanged; migration-only import must not route through new
   runtime code. Preserve all frozen migration/schema/fixture hashes. Run030
   preservation/rebuild/malformed-key/late-error recovery cases and pinned21/24/29
   historical reconstruction through safe initialization to baseline. Check
   FK/integrity/ledger, views/triggers/rowid/BLOB/facts and cache-only metadata.
   No use of private databases or alteration of historical fixture SQL.
8. Keep existing import movement/replacement/rollback, post-delete recompute,
   tracking/submission batch and notification regressions. Preserve native
   dailyStatsPerformance.test.ts: two years x20 visits+submissions/day, warmed
   daily recompute <50ms. Compare explain plans/range-index use if needed; no
   threshold relaxation or batching redesign to hide a regression.
9. Both TS programs, scoped lint, focused registered Vitest, native DB suite,
   full/UI/build/packaging/recovery/CI under parent scheduling. Existing
   tests/verify.mjs runs backupImport, migration safety/interruption, native daily
   performance and repositories. Packaged historical-upgrade validation remains
   required per release gates even though this route is deliberately frozen.

## Proposed Smallest File Boundary

Later implementation, only after parent approval and preceding slice acceptance:

- Add `electron/db/repositories/stats/recompute-runtime.ts` for the two explicit
  DB algorithms, using current schema/client and unchanged helpers.
- Change only `stats/recompute.ts` import to the runtime file; unchanged wrappers.
- Add independent frozen oracle and differential suite; register in DB runner;
  add representative native repository tests and a narrowly scoped historical
  dependency freeze guard if the reviewer agrees. Preserve previous tests.
- Parent owns README/spec/architecture-exception/task evidence and serial gates.
  Do not alter lint/architecture budgets to hide the historical exception.
- **No edits** to recompute-core.ts,030 or its imports, timestamp helpers,
  schema/migrations/baseline/validators, public types/IPC, call-site orchestration,
  other stats reads or release logic. No global helper/framework/new transaction.

## Remaining Decision / Handoff

Recommended explicit parent decision: approve the unchanged-path historical
exception plus separately bounded runtime INSERT12 semantics and late NULL-key
failure preservation. This is lower risk than proving a changed historical
helper over every preserved legacy schema. If accepted, independent design
review should validate the concrete two-file runtime plan before coding.

No product implementation, lint/test/native/UI/build gate, Git operation,
original D-worktree access, spec/task metadata write or delegation was performed
in this research turn. The only owned write is this document. A3b2 remains frozen;
A4a/b/c and their acceptance remain separate.
