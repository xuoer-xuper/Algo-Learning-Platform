# A4c Insight Lists: Independent Design Precheck

Date: 2026-11-20. Design only. Read the active task context, complete 32688-byte
A4 research, original SQL, baseline/schema, caller chain and raw-time/type/UI
specs. This artifact is the only A4c owned file; no product/test/spec/Git edits.

## Verdict And Required Acceptance Decisions

Recommend a bounded four-function A4c slice: getTimeline, getRevisitStats,
getWrongProblems and getUnreviewedProblems. Parent must explicitly accept and
record the output/UI policy below before implementation; no hidden public
contract change. A4a basic reads, A4b daily reads and recompute stay separate.

1. Timeline and unreviewed IDs become string|null in read outputs. Real baseline
   nullable TEXT primary keys can return NULL, including multiple NULL rows.
   Keep rows and values; no filtering/coalescing/stringification/synthetic IDs.
2. Wrong-row ID becomes string|null conservatively in internal/shared outputs.
   The equality join excludes NULL at runtime, but neither nullable schema side
   supplies a NOT NULL witness. This is a deliberate conservative type, NOT a
   claim that this SQL returns NULL IDs. No sql<string>, assertion or added filter.
3. Revisit problem_id stays string: project the existing joined NOT NULL
   problemVisits.problem_id under that key, using the baseline TEXT/BINARY
   equality witness (A2e precedent). Still group by parent id. Empty IDs remain.
4. Propagate nullable IDs into dashboard view models, preferably indexed shared
   ID types rather than unrelated numeric IDs. Make problem-list
   platform_problem_id required/non-null, as both authoritative outputs and the
   physical unique platform tuple guarantee it. No unrelated view-model cleanup.
5. Wrong/unreviewed React keys use JSON.stringify([platform,platform_problem_id])
   following HomePage/sidebar precedent. This is rendering identity, never a
   replacement local ID. Revisit keeps its existing non-null problem_id key.
6. Timeline minimally separates identified/anonymous key domains:
   JSON.stringify(event.id == null ? ['anonymous',index] : ['id',event.id]).
   Existing event.id ?? index collides for anonymous index0 and real ID "0"
   after React stringification (independently verified). Empty ID stays identified.
   This preserves anonymous POSITIONAL identity; it does not promise stability
   across prepend/reorder. Timeline rows have no action/local state. Stable
   identity for indistinguishable anonymous events is a separate data-model
   decision, not justification to invent IDs or select extra persistent fields.

If these choices are declined, defer affected reads rather than hiding nullable
outputs. Revisit can technically stand alone, but does not settle the coherent
list contract. No implementation was made in this review.

## Actual Source And Caller Evidence

Paths relative to algo-electron/:

- electron/db/repositories/stats/insights.ts:43/70/137/166 holds the four original
  native reads. src/main/db/schema.ts:17/268/302/446 and drizzle/0000_baseline.sql
  confirm nullable activity/parent/submission IDs, NOT NULL visit FK and unique
  NOT NULL (platform,platform_problem_id). This is baseline behavior, not DDL drift.
- stats/types.ts:19/35/46 and src/shared/types/stats.ts:70/83/96/109 own output
  contracts. Change only three output IDs; preserve revisit string, all integer
  time validators, strict request IDs and backup/import schemas. No numeric/
  object/undefined IDs. Do not insert output parsers into native query paths.
- electron/ipc/registerStatsIpc.ts:74/82/95/99, src/preload/index.ts:305/307/316/320
  and shared/types/ipc/stats.ts keep endpoints/signatures/defaults/input bounds.
  Unreviewed IPC still uses its strict single object. Detail/delete IDs remain
  nonempty bounded strings. No widening routes/callback inputs.
- analytics/analyticsApi.ts:39 forwards four arrays unchanged via Promise.all;
  DashboardCoreData/list models are the renderer boundary, not a filter layer.
- DashboardListsPanel.tsx:54/92/112 uses canonical_url for all problem actions,
  IDs only for keys, no timeline actions. ListRow click/Enter/Space all invoke
  onActivate. NULL/empty IDs must not disable URL actions or add disabled-action
  badges. Unlike A2g, these lists do not navigate by internal detail/notes IDs.
- analytics/types.ts:11/18/28 currently accepts string/number IDs and optional
  platform_problem_id. HomePage.tsx:207 already uses serialized platform tuples.
  No generic key framework, shared ListRow API or layout/style change is needed.
- contextExporter.ts:88/95/103 explicitly exports only selected problem metadata,
  counts/times and event type/time/platform. It omits local IDs, canonical_url,
  event URL/problem_id/payload_json. Keep exporter production code unchanged.
  ai/summary/periodSummary.ts consumes wrong/unreviewed lengths, not IDs. No AI
  export schema-version change or new private fields.

## Exact Query Contracts

### Timeline

SELECT exactly id,event_type,occurred_at,platform,url,problem_id. Keep all rows,
including tombstones, NULL and empty IDs; occurred_at DESC only/default LIMIT50.
No secondary order, active filter, join or payload/full-row selection. Raw
sql<number> occurred_at avoids Date truncation; strict integer output schema
remains unchanged and is not newly applied at runtime to diagnostic rows.

### Revisit

Active parents INNER JOIN all visits on visit.problem_id=parent.id. Select the
same seven keys, with existing visit FK as the equality-proven string witness.
GROUP BY parent.id; COUNT(visit.id), HAVING count>1, ORDER BY count DESC only.
NULL visit IDs do NOT count but their entered_at still participates in MAX.
One identified plus one anonymous visit does not qualify. Deleted visits count;
deleted parents do not. Orphans remain excluded by the join. Use count(child.id),
not count(), and raw numeric MAX(entered_at), not timestamp-decoding max().
Keep default50 and native named LIMIT.

### Wrong Problems

Active parents JOIN submissions on equal parent ID. Include every nonexact-AC
verdict: UNKNOWN, TESTING, lowercase ac, not a curated failure list. Parent status
is irrelevant. NOT EXISTS ANY exact AC, including deleted AC or NULL-ID AC.
No active-child filters. GROUP BY parent.id; COUNT(submissions.id), raw numeric
MAX(submitted_at). Anonymous non-AC-only groups return wrong_count0.
Public sqlite-core alias(submissions,'s2') supports the correlated SELECT1.
Keep fixed AC literals, same correlation and bind count. Seven fields, descending
last_attempt only/default50/native LIMIT. Parent ID is honestly nullable in types;
never substitute an unrelated platform ID or add an IS NOT NULL condition.

### Unreviewed Problems

Active parents, last_visited_at strictly < cutoff, status != 'visited'; unknown,
attempted, solved and other existing statuses still qualify. NULL parent IDs
survive. NULL visit time is excluded by the EXISTING comparison, permitting raw
numeric projection without added filtering/COALESCE/Date normalization. Seven
keys, oldest first only/default days30/limit50.

Keep SQLite CAST((now-last_visited_at)/86400000 AS INTEGER), not calendar-day
arithmetic or Math.floor. Local cutoff is independently computed via
localDayBounds(localDateDaysAgo(days)).start. Original execution order is prepare,
first nowMillis, localDateDaysAgo (second nowMillis), bounds, all. Use named raw
now/cutoff/limit placeholders and prepare().all({now:nowMillis(),
cutoff:localDayBounds(localDateDaysAgo(days)).start,limit}) in that order. Do not
precompute dates before preparing or reuse one clock for both reads. Raw SQL
wrapping avoids the Date column encoder. Binding order remains now,cutoff,limit.
Preserve invalid-day errors and prepare-before-helper error precedence.

### Common Native/Lifecycle Boundary

Use getDb per call/createDrizzleClient around the lifecycle-owned connection.
No cached connection/statement, open/close/migration, async result, write, new
transaction, event, catch/guard or repository-ownership move.

Every caller-controlled LIMIT uses .limit(sql.placeholder('limit')), not numeric
builder limits: pinned0.45.4 omits negative/NaN numeric limits. Preserve native
0/-0, negative unlimited, fractions, NaN/infinities and safe-integer edges; no
clamp/floor/prevalidation. Strict IPC inputs do not erase repository contracts.
Supported post030 schema and diagnostic values are in scope. Arbitrarily damaged
schema qualified-column error spelling can differ; do not rewrite native errors
or add probes to claim universal arbitrary-DDL parity.

## Independent Evidence

Node22.23.2 in-memory node:sqlite with real baseline DDL and pinned Drizzle
better-sqlite3 builder/session via a small synchronous adapter. Loaded original
functions from actual source. Compared complete rows/error objects/prepare-clock-
step traces. No native-addon rebuild, repository write or native acceptance claim.

- 79 comparisons matched: 234 returned rows and25 matched error outcomes. Four
  empty/default reads,15 LIMIT cases for every list,11 unreviewed days cases,
  explicit count/MAX/nullable/cutoff assertions and a stepped-midnight clock case.
- Fixtures: multiple NULL parent/activity IDs, empty IDs, tombstones, anonymous
  visits/submissions, fractional MAX, wrong_count0, nonexact verdicts, tombstoned
  exact AC, raw TEXT/extreme/fractional event times, NULL last visit and strict
  cutoff equality. Actual NULL unreviewed rows survive; COUNT(id)/MAX differ as
  specified. These probes do not replace native better-sqlite3 ABI tests.
- Missing problems table plus invalid fractional days attempts prepare before
  any clock/helper on both paths. Universal missing-column wording not claimed.
- Generated bind lists are [limit] for first three and [now,cutoff,limit] for last.
  No extra caller parameter/filter/order; HAVING expands equivalently to count>1.
- Virtual strict candidate TypeScript using actual schema/client/shared contracts
  passed with zero diagnostics/no emitted file. Revisit inferred string, other
  selected IDs nullable, raw aggregates/times number, no assertion/sql<string>.
- Real React createElement key coercion confirmed number0/string'0' collision;
  tagged keys distinguish five sample real/anonymous/empty IDs. Serialized pairs
  avoid delimiter collisions and nullable-ID key collisions.
- An isolated consumer-overlay TypeScript probe omitted ambient Vite CSS and
  window.api declarations from its root list and produced14 harness diagnostics.
  Stopped for higher-priority A3b2 review, not misreported as product failure or
  pass. Both full real typecheck programs remain required for implementation.

## Implementation Boundary And Required Tests

Implementation: four functions/imports; wrong/unreviewed internal IDs; three
shared output-ID schemas; bounded analytics ID/platform-pair types/panel keys.
Preload/IPC/exporter/period-summary should compile without production edits.
Parent owns task/spec/design/README/Git and gate scheduling/contract acceptance.

1. Independent frozen four-query oracle/focused suite. Compare full ordered
   rows/key sets/runtime types/native failures, not lengths or builder-derived
   expectations. Include default50, ties/no extra ordering, literal/Unicode/empty
   IDs and every tombstone/count/MAX/anti-AC case.
2. Native LIMIT matrix; prepare-before-invalid-day; two clocks straddling midnight;
   days0/negative/fractional/NaN/infinite; cutoff equality; DST23/25-hour local days
   versus elapsed days_since; fractional/extreme values without Date decoding.
3. Native groups validate actual nullable baseline rows, COUNT(id), NULL-ID MAX,
   wrong_count0, tombstoned AC and better-sqlite3 error/return ABI. Parent runs
   native gates serially; these node:sqlite probes cannot replace acceptance.
4. Schema tests: strings/null (including empty), reject number/object/undefined,
   retain integer instants/revisit string-only ID and strict request IDs/limits.
   Do not broaden learning backup/import DTOs.
5. Components: multiple NULL/empty/real problem IDs, tuple uniqueness/reorder
   DOM-focus retention, canonical URL click/Enter/Space, timeline '0' versus
   anonymous index0, empty IDs and loading-null/empty[] unchanged. Timeline
   stable key identity asserted only for identified events; anonymous positional
   fallback explicitly accepted. Retain millisecondDisplay epoch0 and existing
   asyncStateSurfaces coverage. No new assertions/any in fixtures.
6. AI privacy: positive-anchor allowlist/count/time/platform fixtures plus private
   ID/URL/payload sentinels absent from exported paths; period-summary counts
   unchanged. No exporter rewrite/new prompt fields to accommodate tests.
7. query_only/read-only, no write/event/transaction, close/reinit, schema/ledger/
   change-counter snapshots and supported missing-table/column/step failures.
   Register focused DB suite; both types/scoped lint before parent's serial
   DB/native/global/build gates.

Spec sync: drizzle-stats-reads.md (or bounded follow-on) should record exact
nullable outputs, key rationale, COUNT(id)/MAX, raw times, native LIMIT,
prepare/two-clock order, callers/privacy and tests. Frontend notes distinguish
URL actions from A2g internal-ID restrictions. Do not mark whole stats complete.

## Findings And Verification Status

- Fixed: none; design-only scope.
- Not fixed: nullable public read contracts and conflicting React keys require
  explicit acceptance above, not silent mechanical fixes. Anonymous timeline
  stable identity remains outside this slice with positional behavior explicit.
- Source/spec/generated SQL and79 in-memory comparisons: pass.
- Virtual query TypeCheck: pass. Consumer overlay TypeCheck: incomplete due to
  harness ambient-root omission, not a full implementation gate.
- Product lint/typecheck/native/UI/global/build: not run for this precheck.
- Only this research file created; no A3b2/A4b/product/spec/task/Git/D-worktree
  edits or subagents. No release or completed-implementation claim.
