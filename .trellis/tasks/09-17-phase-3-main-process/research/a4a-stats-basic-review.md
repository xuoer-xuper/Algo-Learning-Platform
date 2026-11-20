# A4a Basic Stats Reads: Independent Design Precheck

Date: 2026-11-20. Design only. Reviewed the complete32688-byte A4 research,
current task artifacts/context, raw-time/lifecycle/type-safety specs, actual
stats source/callers and pinned Drizzle0.45.4 APIs. Parent owns active A3 work.
This reviewer owns only this artifact and makes no A3/product/test/spec/Git edit.

## Verdict

**Approve the smallest A4a slice:** getPlatformDistribution,
getProblemVisitStats and getLastActiveTime in stats/insights.ts, after the planned
A3 acceptance sequence and parent recording of this boundary. No unresolved
public-interface, nullable-output or UI-policy decision is needed for these
three functions. Keep all existing signatures and exported names.

This is not approval for trends, streak, timeline/revisit/wrong/unreviewed lists,
or stats recompute. Those have separate nullable/date/migration dependencies.
No layout move, query consolidation, generic framework or cross-domain redirect.

## Precise Source And Caller Evidence

Paths in this section are relative to algo-electron/:

- `electron/db/repositories/stats/insights.ts:13`: active-parent COUNT(*) by
  platform, descending count only, no cap. At26: one four-scalar visit aggregate
  for exact bound problem_id. At57: raw latest occurred_at, DESC LIMIT1, optional
  row with nullish fallback. None writes, starts a transaction or catches errors.
- `src/main/db/schema.ts:268`: problems.platform NOT NULL, id nullable and
  deleted_at nullable. At302: visits.id nullable, problem_id NOT NULL, durations
  and active_seconds nullable. At17: activity occurred_at NOT NULL timestamp_ms;
  nullable event IDs do not matter because A4a does not select them.
- `stats/types.ts:11` and `src/shared/types/stats.ts:58` already agree on four
  numeric visit scalars; shared platform schema at12 is string+number. SQL COUNT
  and COALESCE supply numeric outputs despite nullable IDs/duration inputs. There
  is no reachable baseline NULL result needing a widened public DTO here.
- `electron/ipc/registerStatsIpc.ts:62/66/78` routes the three repository reads;
  `src/shared/types/ipc/stats.ts` keeps the existing nonempty<=200 identifier
  validation for visit requests. No repository input normalization is introduced.
- `src/preload/index.ts:300` exposes visit stats; `problemsApi.ts:24` loads them
  alongside problem detail; ProblemDetail renders total count/duration. Current
  preload exposes no standalone platform/latest methods despite main handlers;
  do not invent API additions as part of this conversion.
- `electron/ai/contextExporter.ts:69` uses the stats platform distribution and
  forwards only its existing platform/count data. No privacy projection changes.
- `problem/overview.ts:14` is a valid analogous distribution query pattern, but
  its latest-time function at42 Date-decodes and calls getTime(). Stats' raw
  latest-time contract is distinct for fractional/extreme diagnostics. Leave
  overview unchanged; do not delegate stats latest-time to it or deduplicate
  repository ownership in this slice.

## Required Executable Contracts

### Platform Distribution

Use current `createDrizzleClient(getDb())`, synchronous SELECT of
`{ platform: problems.platform, count: count() }`, WHERE deleted_at IS NULL,
GROUP BY platform, ORDER BY count DESC, all(). The accepted overview pattern
uses desc(count()). Preserve the exact two returned keys and numeric count.

- COUNT(*) includes active rows with NULL/empty IDs; COUNT(id) is not equivalent.
- deleted_at0 is deleted, not falsy-active. Do not add status or platform filters.
- Group exact native text values/collation, with no spelling/case normalization.
- Empty returns[]; no max rows, platform zero-fill, alphabetical/tie secondary
  sort or JS reorder. Compare ordered results for tied counts against original
  SQL on identical native fixtures rather than inventing a stable new order.

### Problem Visit Aggregate

Select the original four scalars from problemVisits WHERE problem_id equals the
bound argument, with no GROUP BY, join, parent check, tombstone filter or cap:

```ts
const row = db.select({
  total_visits: count(),
  total_duration: sql<number>`COALESCE(SUM(${problemVisits.duration_seconds}), 0)`,
  total_active: sql<number>`COALESCE(SUM(${problemVisits.active_seconds}), 0)`,
  avg_duration: sql<number>`COALESCE(AVG(${problemVisits.duration_seconds}), 0)`,
}).from(problemVisits).where(eq(problemVisits.problem_id, problemId)).get()
if (row === undefined) throw new Error('Visit aggregate unexpectedly returned no row')
return row
```

- SQLite emits one aggregate row even when no visits/parent exist. Empty and all
  NULL duration fields produce SQL-defined zero aggregates, not a missing row.
  Keep the truthful optional `.get()` result and explicit invariant guard; no
  assertion, non-null operator, catch/fabricated zero object or implicit fallback.
- COUNT(*) includes nullable IDs, duplicate facts, deleted visits and visits
  whose parent is deleted or diagnostically absent. Parent membership does not
  affect the query. Retain exact bound empty/Unicode/quoted/NUL keys at repository
  level even though public input validation is stricter.
- AVG ignores NULL duration inputs. Three visits with durations10,NULL,20 return
  total_visits3,total_duration30,avg_duration15, not10. All-NULL average is0 only
  because of the existing COALESCE. Active SUM has its independent NULL set.
- Preserve SQLite aggregate/storage behavior for negative/fractional/raw values
  and integer SUM overflow. No JS reduction, total(), per-row coalesce, rounding,
  dividing by COUNT(*), Date conversion or numeric decoder on SUM/AVG outputs.
- A raw SQL generic states the existing supported numeric contract; it does not
  validate data or expand public input. Diagnostic storage retains SQLite native
  affinity/aggregation behavior rather than being normalized for TypeScript.

### Latest Active Time

Select only raw `sql<number>` occurred_at from activityEvents, ORDER BY its
column DESC, static limit1, get(), return row?.occurred_at ?? null.

- Empty=>null, epoch0=>0. Preserve negative/fractional/out-of-Date-range values,
  and diagnostic SQLite storage behavior without Date/String/Number decoding.
- Include every event type/platform/problem and tombstone; no activity threshold,
  parent join, calendar filter, tie-break, cache or fallback-to-now.
- Keep the ordered-row query, not MAX or overview delegation. No clock/date helper
  is needed. Static public `.limit(1)` is supported and has no negative/NaN input
  hole; it emits one fixed parameter rather than the original literal1. There is
  no variable-size input/bind-maximum boundary in this A4a function. Do not add
  private API hacks to force identical SQL text.

## Installed API / Decoder Findings

- `node_modules/drizzle-orm/sql/functions/aggregate.js:4` count() generates COUNT(*)
  with Number decoding; appropriate for native numeric counts in these queries.
  At11/17 avg()/sum() attach String decoders, so using those helpers directly
  changes the public scalar values. At22 max(timestampColumn) inherits Date
  decoding; max(rawExpression) also does not provide the desired raw contract.
- `sqlite-core/query-builders/select.d.ts:428/459/462` permits static numeric LIMIT,
  prepare() and synchronous typed get() through the native session. Its optional
  row type is real even for this guaranteed SQL aggregate, so use the guard.
- `better-sqlite3/session.js:22/87/94` prepares via the current native client and
  runs raw statement get before mapping selected fields. Native exceptions are
  not wrapped by this path. Generic ORM run/raw whole-query escape is unnecessary.
- Pinned dialect's numeric limit builder at212 drops negative/NaN inputs, but
  that issue does not apply to constant1. Dynamic-limit edge matrices belong to
  later stats functions and must not expand A4a now.

## Lifecycle / Error Scope

- Every call acquires the lifecycle-owned current handle and wraps it locally.
  No cached adapter, new database, lazy migration, transaction, write or event.
  Readonly/query_only must work; caller-owned uncommitted facts must be visible
  and caller rollback must leave no retained client/state.
- Uninitialized/closed, prepare and step errors throw synchronously. Native SUM
  integer overflow is a required step-time case; do not convert it into0/[]/null.
- Supported baseline/value fixtures get exact result keys/scalars and native
  name/message/code comparisons. Broken column diagnostics may differ through
  qualified/quoted generated identifiers, as already accepted in A3. Preserve
  failure stage and no later effects; do not promise universal arbitrary-DDL
  text identity or rewrite errors/validators to manufacture it.
- No runtime per-read schema validation is added. Current baseline checks remain
  startup/adoption-only with their existing ledger-count limits; this is not
  unrestricted support for replacing tables/views after initialization.

## Independent Feasibility Evidence

Probes used Node22.23.2, actual frozen baseline SQL and in-memory databases plus
an adapter for Drizzle's public statement methods. Original functions were
extracted from actual insights.ts and transpiled with only getDb supplied. No
probe file, product or user database was written. These are NOT native ABI gates.

- 22 fixtures x3 original/candidate calls: all22 complete outcome bundles matched,
 including scalar types, prepare counts and unchanged total_changes; no run/write
 calls. Fixtures included empty, tied groups, NULL/empty IDs, deleted parents,
 NULL/all-NULL/fraction durations, orphan visits, integer overflow, readonly,
 uncommitted transaction visibility, literal/Unicode/NUL keys and raw latest
 zero/negative/fraction/extreme/TEXT values with tombstones/ties.
- Pinned decoder contrast independently reproduced sum/avg1.75 as strings and
 max(timestamp1.75) as Date1ms, while raw candidates retained native values.
- Visit null-duration result was3/30/7/15. Overflow remained an integer overflow
 exception, not a successful result. Node SQLite's Error/ERR_SQLITE_ERROR is not
 the expected Electron SqliteError identity; native tests must compare afresh.
- Virtual strict check of all three candidate functions against current project
 types passed with0 diagnostics and no emitted files. No casts/type/interface
 changes were needed beyond an internal aggregate invariant guard.

## Minimum Implementation And Test Boundary

1. Product: only the three functions/imports in stats/insights.ts. Keep stats
   types/facade, overview, IPC/preload, renderer/AI callers and all other stats
   functions unchanged. No new helper/module boundary or schema modification.
2. Add independent stats-basic-reads-oracle.ts with all three original SQL/return
   bodies and a focused stats-basic-reads.test.ts. Do not derive expected values
   from production builders/types. Compare independent identical fixtures with
   full ordered rows, exact key sets, scalar runtime types and native outcomes.
3. Native repository cases must cover COUNT(*) with nullable IDs, duration/AVG
   null semantics, fractional aggregates, INTEGER SUM overflow, raw latest0/
   fractional/extreme values, tombstones and lifecycle/transaction behavior.
   Seed overflowing integer values using exact SQL integer literals (or bigint
   where supported), not rounded JS literals; assert storage typeof so the
   fixture actually exercises INTEGER overflow rather than floating-point SUM.
4. Differential matrix: empty/missing/no-visit/all-null, active/deleted parents,
   ties/group text, orphans/deleted visits, exact keys, each raw time class,
   query_only/read-only, close/reinit, missing table/column scope and step failure;
   snapshot table/schema/ledger/change counts and verify no notifications or
   newly owned transactions. Existing problem-detail/AI/IPC consumers compile
   unchanged; existing tests should supplement the new direct stats oracle.
5. Register the focused suite in tests/verify.mjs DB list. Both type programs,
   scoped lint and focused suites precede parent-owned serial test:db/native/full/
   build gates. No new UI fixture is needed without renderer behavior changes.
   Parent owns acceptance/task/spec/README evidence and scheduling after A3.

## Deferred Work / No Scope Extension

The research's other risks are credible but outside approval: nullable daily
local_day and streak failure timing, nullable list IDs and their caller policies,
caller-controlled LIMIT/date inputs, and the stats core imported by historical
migration030. Do not change their APIs, filters/date helpers or migration path
while implementing these three reads. Preserve A3 files and review artifacts.

## Findings And Verification Status

- Findings fixed: none; this is a design precheck with no implementation edits.
- Findings not fixed: no A4a blocker. Required raw aggregate/time projections,
  invariant guard and exact error/test scope are recorded above.
- Source/spec/API review and independent in-memory parity probes: pass.
- Virtual candidate TypeCheck: pass, zero diagnostics, no emitted file.
- Lint/native/UI/global/build tests: not run for this research-only review.
- Wrote only research/a4a-stats-basic-review.md; no product/test/spec/task metadata,
  Git/original D-worktree changes or subagents. No A3 acceptance or release claim.

## A4a Implementation Review (2026-11-20)

Independent COMPLETE diff review against HEADfa13260: three functions, frozen
oracle, all43 focused cases, all4 native groups and runner registration. The
parent explicitly released the freeze once for the native test-fixture fix
below. The five product/test files are now FROZEN again; no further source
changes are planned. Parent can immediately resnapshot and run serial gates.

### Verdict

No product implementation issue found. One native fixture mismatch was fixed
with authorization. Both typechecks, scoped lint, formatting and reviewer focused
regressions pass after the fix. Approve code/test scope pending parent rerun of
DB/native/full/build and normal remote/integration gates. The first native gate
failed; no rerun pass or native acceptance is claimed by this reviewer.

Only three insights.ts functions/imports change in product code. Five remaining
stats functions are programmatically verified unchanged against fa13260. No
stats types/shared/IPC/preload/renderer/AI/overview/schema/migration/date-helper/
recompute change. A4b1 planning acceptance is now separate, not implementation;
A4b2/A4c/A4d and phase3 remain open.

### Findings Fixed

File: algo-electron/tests/db/repositories.test.ts, nativeStatsSnapshot and
compareNativeStatsReads.

The first parent test:db failed all4 new native groups at cross-fixture snapshot
equality; retained log: algo-electron/tmp/drizzle-a4a-db.log. Independently created
original/candidate databases have different legacy schema_migrations.applied_at
values. nowBeijing uses new Date(), so Date.now override does not fix that native
initialization clock. Migration030 preserves these distinct instants. Vitest's
fake Date hid this fixture distinction. This was not a product read regression.

Fix: nativeStatsSnapshot remains complete by default. Every checked() read still
compares ALL tables/schema/ledger fields INCLUDING applied_at before/after, plus
total_changes/inTransaction and no event/clock assertions. Only final independent
fixture-to-fixture snapshots omit schema_migrations.applied_at by selecting its
version/name. Migration identity/count/order, sqlite_schema, other tables and
Drizzle ledger, total_changes, transaction state/results/events stay compared.
No database/ledger/clock or production code was changed to force equivalence.

An in-memory execution of the actual updated helper confirms cross-fixture
initial-clock differences are ignored, while an applied_at UPDATE still changes
the full local ledger snapshot AND total_changes. Migration identity changes
still fail cross-fixture comparison and Drizzle ledger values remain present.
This helper probe is not the required actual Electron native rerun.

Only this authorized test-file fix changes the implementer's5-file freeze.
Parent was informed before editing and given re-freeze approval. Parent owns
native/global/UI/build reruns and added the fixture-clock lesson to the spec.

### Product And Oracle Review

- Distribution selects only platform/count(), active parent filter, GROUP BY
  platform and descending count only. COUNT(*) includes NULL/empty IDs; no cap,
  normalization, extra status filter/order or repository redirection.
- Visits use exact bound ID, COUNT(*), raw COALESCE SUM(duration)/SUM(active)/
  AVG(duration), no join/group/filter. NULL-ID/deleted/orphan visits count; AVG
  retains the nonnull denominator and native numeric/fractional/TEXT-affinity
  behavior. No sum/avg String decoder, JS reduction or per-row null replacement.
- Aggregate optional get is narrowed by explicit impossible-state throw. Real
  successful SQLite no-GROUP aggregate returns one row even for no visits; no
  fabricated zero fallback/assertion. Exact INTEGER SUM overflow propagates.
- Latest selects raw occurred_at, DESC and fixed LIMIT1, then ??null. Epoch0 and
  fractional/extreme/TEXT diagnostics stay raw. No Date/Number/String decoder,
  MAX, horizon/filter/tie-break, clock or overview delegation.
- Public SELECT builders execute synchronously on current lifecycle handle;
  no cache/second connection/write/event/transaction. Typed native session errors
  pass through rather than generic ORM raw error wrapping. Supported native
  identity/details and accepted damaged-column wording boundaries are retained.
- Programmatic AST comparison against git show fa13260 matches all3 original
  oracle bodies after type erasure/rename/DB injection. Visit oracle also changes
  direct return to temporary row plus explicit unreachable undefined guard;
  normalize ONLY that guard/return refactor. All3 SQL literals match byte-for-byte.
  Independent oracle interfaces do not import production result derivation.

### Test Strength And Verification

Read all43 focused cases and4 native groups. Tests compare whole rows, exact key
order/runtime scalar shapes, complete schema/ledger/data/read-only state and
failure outcomes; positive anchors cover real semantics, not lengths alone.
Coverage includes count(NULL-ID), ties and65 groups, NULL AVG denominator/allNULL,
independent active sums, tombstones/orphans, literal/Unicode/NUL/lone-surrogate
keys, raw latest epoch0/fraction/extreme/TEXT and no horizon, real readonly file,
query_only, external transaction/savepoint visibility/rollback, close/reinit,
missing table/column and prepare/step error identity. No hidden output schema or
input change. Static latest LIMIT1 bind is the sole normalized trace parameter.

Both overflow columns use SQL integer literals9223372036854775807 and1, with
explicit typeof=integer on both rows. Tests capture the error at native get,
assert same thrown object and exact SqliteError/integer overflow/SQLITE_ERROR,
not merely a mocked throw or floating-point sum. Native groups repeat decisive
COUNT/AVG/raw latest/overflow/lifecycle behavior. Per-read snapshots remain fully
strict after the fixture fix.

Independently run using Node22.23.2 after the fix:

- Main tsc --noEmit: PASS.
- Test tsc -p tsconfig.tests.json --noEmit: PASS.
- ESLint all5 owned product/test paths, unused-disable/max-warnings0: PASS.
- Prettier repositories.test.ts --check: PASS.
- Focused Vitest5files103tests: stats-basic43, problemOverview8, statsDate2,
  timestampSchemas39, dataEvents11: PASS.
- AST bodies3/3, exact SQL literals3/3, untouched other stats functions5/5: PASS.
- Snapshot normalization/mutation-detection probe: PASS.
- git diff --check: PASS (only normal Windows CRLF informational warnings).

Reviewer ran no native/global/UI/build suites or dependency rebuilds. Parent's
first DB failure remains evidence; await corrected serial rerun. No native/full
pass is inferred from focused tests. Product/test code is frozen and ready now.

### Documentation And Remaining Findings

No uncorrected A4a product issue/design blocker found. Parent stats README/spec/
architecture changes reflect the exact three-read contract and do not complete
all stats. A3b2 integration documentation names PR24CI44691480140 and PR8CI44692300627;
local git proves eb5103f and squashfa13260 have identical tree3b83bac0a6f03a46bd2bf0a45b7686b0ca9677f5.
Remote gate status is parent evidence, not independently rerun here. A4b1 docs are
planning-only acceptance; no A4b/c/d product changes were reviewed as A4a.

Durable reviewer changes: authorized native-test fixture fix and this appendix
only. No Git/spec/task/other-agent/D-worktree edits. Implementation gate reruns,
commit/push/CI and final integration remain parent-owned.
