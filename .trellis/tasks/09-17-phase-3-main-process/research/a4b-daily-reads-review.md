# A4b Daily Reads: Independent Design Precheck

Date: 2026-11-20. Design-only independent review of the complete 32544-byte
research/a4b-daily-reads-contract.md, active check.jsonl/PRD/design/implement,
actual source/callers, physical baseline, pinned public APIs and relevant specs.
This reviewer owns ONLY this artifact. No product/test/spec/task metadata/Git
edit, original D-worktree access, native/full/UI/build suite or delegation.

## Verdict And Explicit Policy

The research is correct on the material baseline NULL and Recharts risks.
Recommend its two-slice split, with the following decisions recorded by the
parent BEFORE implementation. This precheck is not completed implementation or
UI/native acceptance, and does not extend A4a's approved three-read boundary.

### A4b1: Four Reads And Bounded Consumer Correction

Approve the proposed bounded design conditional on explicit parent acceptance:

1. Three shared READ schemas, repository DailyActiveStat and AI daily_stats must
   represent local_day as string|null. The baseline allows several NULL TEXT
   primary keys. Preserve NULL, empty/malformed/future text and every original
   metric; do not add date parsing/filtering/coalescing or broaden to arbitrary
   numbers/objects/undefined. No SQL-side sentinel or fabricated valid date.
2. Use shared DailyActiveStats as the authoritative seven-field read shape:
   keep the repository's exported DailyActiveStat name as a type alias, and use
   DailyActiveStats[] in AIContextExport.trends.daily_stats. Both currently have
   the identical shape. Type-only reuse introduces no DB/renderer runtime import.
   Keep TrendPoint and SubmissionTrendPoint names/other fields unchanged.
3. Preserve all four repository result/order/default/LIMIT/cutoff/native-error
   contracts and all existing loader/export/snapshot transformations. This part
   is a truthful type/query migration, not a runtime cleanup of invalid rows.
4. Explicitly approve the narrow TrendPanel behavior correction: one categorical
   position per supplied row, including multiple NULL dates. Both visited/AC
   charts omit XAxis dataKey="local_day", explicitly keep type="category", and
   retain the original LineChart arrays without mutation/copying/merging/filtering.
   Installed Recharts then uses ordinal positions, not collapsed NULL categories.
5. Map each numeric category to the SAME chart array for tickFormatter AND
   Tooltip labelFormatter. A small local formatter accepts category:unknown,
   checks number/integer/nonnegative plus actual row existence, returns '' for
   an invalid/stale category, and never guesses by coerced string or tooltip
   payload:any. Do not use the formatter callback's second argument as the row
   index: that index belongs to ticks, while the category is the row ordinal.
6. Exact label policy: NULL alone gets the display-only Chinese missing-date
   label '\u65e5\u671f\u7f3a\u5931'. A nonnull string keeps its existing tick
   .slice(5) and full raw Tooltip label, including empty/impossible/malformed
   text. Thus empty string still displays empty and short malformed strings can
   have blank ticks; this is deliberately NOT calendar-label sanitization.
   No display label enters DTOs/JSON/DB. A literal string equal to the missing
   label is still a separate ordinal row; label equality cannot merge counts.
7. Retain colors, chart size/type/animation, legend/name/count metric, responsive
   layout, range buttons, loading/error handling and accessibility conventions.
   Ordinary valid-date spacing stays unchanged. Do not build a generic chart
   abstraction, new domain key, route, global missing-day type or UI redesign.

This is an intentional correction of an existing all-time chart bug, NOT full
UI equivalence. Phase3 PRD currently excludes broad renderer work: parent must
record this precise consumer-safety exception, plus nullable public-output
acceptance. If either is declined, defer A4b1; widening types or null-guarding
.slice alone does not make the baseline data safe for the current chart.

### A4b2: Streak And Ordered Local Validation

Approve a separate streak SELECT conversion plus a stats-local dayDiff signature
change. No output/UI decision is needed for StreakDays (still two numbers).
The original loops, today check, clock count and error priority stay unchanged.
The helper change must validate each argument at its original point:

```ts
export function dayDiff(laterDay: string | null, earlierDay: string | null): number {
  if (laterDay === null) throw new TypeError('Invalid local day')
  localDayBounds(laterDay)
  if (earlierDay === null) throw new TypeError('Invalid local day')
  localDayBounds(earlierDay)
  return (Date.parse(`${laterDay}T00:00:00Z`) - Date.parse(`${earlierDay}T00:00:00Z`)) / 86_400_000
}
```

A combined upfront null check is NOT equivalent: later '9999-12-31' must raise
its RangeError before an earlier NULL TypeError. Do not prevalidate all rows,
filter malformed keys, return NaN/0, move today checking before longest, add a
clock, or widen the shared calendar API. dayDiff has only the two streak loops
as production callers. Exact stack frames are not a compatibility guarantee;
error name/message, order, clock calls and native pass-through are.

A4b2 can be accepted independently if A4b1's UI policy is deferred. Coordinate
insights.ts ownership with A4a rather than editing the same file concurrently.
No current A3b2 freeze or queued A4a change was touched during this review.

## Actual Baseline And Cross-Layer Evidence

Paths below are relative to algo-electron/ unless otherwise stated.

- src/main/db/schema.ts:504 and drizzle/0000_baseline.sql:335 declare nullable
  local_day TEXT primary key; six selected metrics are NOT NULL/default0.
  Multiple NULL keys are valid baseline rows, not a schema-drift fixture.
  Unique nonnull text does not prove canonical date text or prohibit empty text.
- electron/db/repositories/stats/trends.ts:6/27/53/78 contains the four raw
  readers; stats/insights.ts:95 holds streak. stats/types.ts:1 currently asserts
  string-only DailyActiveStat; shared/types/stats.ts:28/41/49 does the same for
  daily/trend/submission read schemas. Do not change schema.ts to hide this gap.
- electron/ipc/registerStatsIpc.ts:42/46/50/54/91 passes responses through.
  shared/types/ipc/stats.ts keeps request days/limits integer/bounded/optional
  and recompute date a nonnullable optional regex string. No new response parse
  or input validation. A regex is not complete calendar validation.
- src/preload/index.ts:296/298/311 exposes visited/AC/streak; daily-active and
  submission-trend have main channels but no matching renderer method currently.
  Do not invent preload API. statsRepository.ts facade/exports remain stable.
- analytics/types.ts:64 already uses shared TrendPoint arrays. analyticsApi.ts:10
  maps raw day keys, then fills canonical local dates for finite windows. With
  All/undefined it returns the original arrays unchanged; future/malformed/NULL
  rows vanish from finite display only through the existing canonical fill.
- Dashboard.tsx:29/40 loads core/streak and trends with separate useIpcQuery calls.
  A streak failure therefore does not guarantee that NULL trends never reach
  TrendPanel. No new cross-loader suppression or catch/fallback belongs here.
- TrendPanel.tsx:59/91 uses one LineChart per independent array; both XAxis use
  local_day and unsafe d.slice(5); Tooltips currently have no label formatter.
  A permissive Recharts callback type does not validate data consistency.
- contextExporter.ts:59 copies exactly the seven daily fields; contextTypes.ts:15
  must become honest without changing that projection. Version remains2. Export
  calls streak too: some qualifying malformed/NULL combinations already throw,
  but singleton qualifying NULL/nonqualifying NULL rows can still be exported.
- contextMarkdown.ts never renders daily_stats/trends. ContextGatherer.ts:148
  keeps its existing export/render catch-to-empty learner profile. Do not add
  daily labels/private fields to prompts merely because JSON typing changes.
- aiContextSnapshot/serialization.ts preserves NULL via JSON.stringify and
  normalizeLegacyAIContext; legacy-ai-context.ts only normalizes known instant
  fields, not daily keys. Snapshot date and snapshot/context versions stay fixed.
- summary/periodSummaryAggregation.ts:34 matches raw daily.local_day strictly to
  string snapshot_date. NULL does not match; denominator and metric calculation
  stay as-is. No filter/normalization needed. periodSummary's streak failures
  also stay unchanged.
- backup/types.ts defines ExportRow as generic string|number|null scalars;
  learningDataExport.ts parser is not a strict date schema. markAffectedDay at
  :1052 validates string dates via shiftLocalDay(day,0) and skips NULL. Preserve
  backup format/parser/import behavior, not an inaccurate 'all keys strict' claim.

## Exact Repository Contracts

### A4b1 Four Query Shapes

| Reader | Must remain unchanged |
| --- | --- |
| getDailyActiveStats(days=30) | Seven keys: local_day,active_seconds,duration_seconds,visited,solved,submissions,ac; metrics map from the same six cache columns; DESC local_day; native LIMIT days. Last N rows, not N canonical days. |
| getVisitedTrend(days?) | local_day,visited_problem_count as count; if(days) branch adds lexical local_day>=cutoff; ASC local_day; no LIMIT. Otherwise all rows ASC. |
| getAcTrend(days?) | Same branch/order but count=solved_problem_count, NOT ac_submission_count. |
| getSubmissionTrend(days=30) | local_day,submission_count as total,ac_submission_count as ac; DESC local_day; native LIMIT days. |

All retain tombstones. No SQL date parsing, new tie-break, application sort,
NULL filtering, cache repair, count rewrite, fill, transaction or event.
NULL ASC is first/DESC last; relative ordering among NULL ties is not a new
stable identity guarantee. Preserve the actual one ORDER BY, including LIMIT
selection, rather than adding rowid for test convenience.

For capped readers use .limit(sql.placeholder('limit')).all({limit:days}). Pinned
Drizzle numeric .limit drops negative/NaN values; the named placeholder keeps
native LIMIT/bind behavior for0/-0/negative/fraction/NaN/infinity/large integers.
Do not clamp or let strict IPC erase these direct repository contracts.

Visited/AC retain if(days): undefined,0,-0,NaN mean unfiltered/no clock; negative
integer days give a future cutoff. Positive d means today minus d INCLUSIVE,
not d-1. The loader's separate d-day fill does not justify changing this query.

Filtered queries explicitly prepare before evaluating localDateDaysAgo:

```ts
const statement = orm.select({ local_day: daily.local_day, count: daily.visited_problem_count })
  .from(daily)
  .where(gte(daily.local_day, sql.placeholder('cutoff')))
  .orderBy(asc(daily.local_day))
  .prepare()
return statement.all({ cutoff: localDateDaysAgo(days) })
```

Native preparation errors precede clock/date/shift errors. No evaluating cutoff
in a builder where clause before prepare. Bind cutoff only; no extra unrelated
validation. All calls acquire the current lifecycle-owned getDb and synchronous
adapter; no global connection/statement/cache, open/close, migration or async API.

### A4b2 Streak Query And Algorithm

Select only local_day WHERE active_seconds>=300 OR submission_count>0 OR
solved_problem_count>0; DESC local_day, no deleted_at filter/limit. Duration,
visits or AC-submission counts alone do not qualify. Use the schema's nullable
column, not sql<string>/assertion. Fixed threshold SQL or equivalent public
predicates must preserve predicate behavior, native failure stage and no clock
before successful row retrieval.

Algorithm order is fixed: empty short-circuit; longest over all adjacent pairs;
then top-day comparison with toLocalDay(nowMillis()); then current loop if today.
The current loop repeats adjacent validation. No valid-day Set/gap-and-island/
UTC-instant division/reverse loop/yesterday grace optimization.

| Qualifying rows / condition | Existing outcome |
| --- | --- |
| Empty | current0,longest0, zero clocks. |
| One NULL or malformed text | current0,longest1 after one clock; no dayDiff. |
| Two NULL | TypeError Invalid local day before clock. |
| Later9999-12-31, earlierNULL | RangeError supported calendar range before clock. |
| Yesterday only | current0,longest1, no grace. |
| Future top day plus today | current0; longest still computed first. |
| Today/yesterday | current2,longest2; pair validation before and after one clock. |
| active299, no submission/solve | Not selected even if visit/duration/AC large. |
| Tombstoned today with active300 | Selected; current1,longest1. |
| Throwing/invalid clock with singletonNULL | Clock/instant failure; do not prevalidate NULL. |

The helper uses host-local midnight validation then UTC calendar ordinals, so
23/25-hour DST days remain adjacent. Do not force Beijing or slice UTC dates.
Preserve impossible date TypeError, range RangeError and skipped civil-day
RangeError priority. Shared input/instant validators and released migration030
remain unchanged. Recompute and its migration-coupled helpers stay out of scope.

## Recharts Defect And Why The Proposed Fix Is Bounded

Independently inspected installed Recharts3.10.1, not generic documentation:

- axisSelectors.js:689 discards null category values; combineDuplicateDomain at
  :1226 considers duplicate NONNULL values only. Multiple NULL keys alone do not
  enable the library's duplicate-category ordinal domain.
- getCateCoordinateOfLine in ChartUtils.js:399 uses ticks[index] for the default
  category axis. With [NULL10,NULL20,Nov19:30,Nov20:40], the old tick domain has
  only Nov19/Nov20; NULL rows receive those coordinates and both real rows have
  null x. All-NULL input has no domain/ticks/points.
- combineAxisDomain at :847 uses [0..n-1] without an axis dataKey. In this panel
  there is one count line, no Brush or per-line data/syncId. Thus displayed array
  index is the chart row index. Do not generalize this solution blindly to a
  chart with sliced data/independent graphical-item data or synchronized axes.
- combineActiveLabel returns numeric category tick value. combineTooltipPayload
  without axis dataKey uses arrayTooltipSearcher by activeIndex, preserving each
  row/count, including repeated NULLs. With dataKey the label-search path can pick
  the wrong duplicate row; merely setting allowDuplicatedCategory=false or one
  shared NULL sentinel does not solve this.
- Both tick and tooltip formatters must map their numeric category through the
  corresponding original array. Default Tooltip would otherwise expose raw
  ordinal0/1 as a date label. Do not recover by searching for equal labels or
  casting the broadly typed payload.

Duplicate ordinary text keys are prohibited by baseline PK. Do not claim the
research's NULL-plus-duplicate-nonnull .slice crash as a baseline-reachable case.
The actual confirmed defect is count/date misassociation and lost points. The
fix intentionally changes NULL display while preserving valid/malformed string
formatting, row order, counts, and spacing of all-valid data.

## Independent Synthetic Evidence

No probe wrote a product/test file or used a user DB. Runtime Node22.23.2 is in
the supported package range. These are design checks, not native/UI acceptance.

1. Real baseline DDL in node:sqlite, actual original functions loaded from source,
   pinned Drizzle better-sqlite3 query/session via a small memory adapter:123
   complete comparisons passed, including63 matched errors. Covered empty reads,
   all four query shapes,16 LIMIT cases each cap,16 cases each truthy cutoff
   reader,25 nullable/malformed helper pairs,11 streak row fixtures with normal/
   failing clocks, threshold/tombstone cases and missing-table prepare precedence.
   Full ordered rows, error names/messages and getDb/prepare/clock/all traces
   matched. Actual multipleNULL rows retained; AC count remained solved count.
2. Separate-process zone probes in UTC, Asia/Shanghai, America/New_York and
   Pacific/Apia:32 ordered dayDiff comparisons matched. NewYork bounds show23/25
   hours but adjacency1; Apia2011-12-30 raises nonexistent-day RangeError; upper
   9999 range error still wins over earlierNULL. No shared runtime TZ mutation.
3. Real Recharts selector/coordinate/active-label/tooltip functions with a simple
   deterministic scale:6 fixtures passed (mixed twoNULL+real, allNULL, allvalid,
   empty/malformed/literal-label strings, singletonNULL count0, empty array).
   Old mixed coordinates [0,100,null,null] became [0,100,200,300]. All tooltip
   payloads/counts stayed associated with their original rows. All-valid/malformed
   nonnull positions matched old spacing. Ten invalid formatter inputs return
   empty label, not index0 or another row. No DOM/visual acceptance claimed.
4. Virtual strict TypeScript with six in-memory overlays: shared nullable types,
   repository alias, AI alias, ordered helper, both chart formatters and candidate
   public builders. Real preload/ambient declarations, analytics loader, exporter,
   snapshot serializer, period aggregation and Coach consumers included:ZERO
   diagnostics, no file emission. Unlike a narrow no-ambient probe, window.api
   and Vite declarations were explicitly present. Both real type programs remain
   required after implementation.
5.31 direct schema assertions passed: all three read-key schemas accept NULL/
   empty/bad/impossible/range text; reject undefined/number/object/array/Date;
   existing fractional timestamp rejection remains. This does not change inputs.
6. Actual exporter overview SQL with baseline memory DB and injected downstream
   result rows retained [NULL,private-day-sentinel,2026-11-20] at version2. Actual
   serializer/legacy normalizer/parser preserved them. Actual Markdown kept its
   platform/schema positive anchors and omitted private daily sentinel. Actual
   period aggregation counted only matching dated row, with unchanged denominator.
   Existing export failure rethrows the exact streak error. This is a focused
   transformation probe, not full AI/Coach integration coverage.
7. Actual analytics loader with injected IPC arrays: All preserves both original
   references/NULL rows; finite1/7/30 retain canonical count/fill and do not newly
   include unmatched NULL/malformed/future keys. No loader change is required.

## Minimal File Boundary

A4b1 production:

- stats/trends.ts: four query functions/imports only; correct its stale Beijing
  comment to host-local without changing behavior.
- stats/types.ts: DailyActiveStat alias only, preserve facade/export names and
  unrelated list/streak types.
- src/shared/types/stats.ts: exactly three local_day output schemas and the header
  authority/read-versus-write clarification; do not touch A4c IDs or time schemas.
- electron/ai/contextTypes.ts: type-only shared daily shape reuse, no runtime AI
  exporter/Markdown/Coach/normalizer/snapshot/backup changes.
- src/features/analytics/TrendPanel.tsx: two categorical axes/tooltip labels and
  at most one pure local formatter. No analyticsApi/Dashboard/hooks/UI-widget/CSS
  refactor. Use existing shared TrendPoint and no any/assertions in new code.
- Optional comment-only shared/types/ipc/stats.ts clarification: its current
  Beijing/NaN-NaN-NaN narrative is stale. Validators and channel schema arrays must
  remain byte-semantically unchanged; parent can keep this as documentation work.

A4b2 production: only getStreakDays/imports in stats/insights.ts and dayDiff's
nullable signature/ordered guards in stats/date.ts. No other helper, recompute,
shared time API or input/output change. The other three A4a functions are not
part of A4b2 and must not be overwritten during integration.

Tests: independent frozen trend and streak/helper oracles/focused suites, selected
native repositories cases, statsDate and timestamp/input schema assertions;
focused real TrendPanel/loader tests; AI snapshot/Markdown/period regressions;
runner registration. Parent owns metadata/spec/docs and serial native/UI/full/
build/CI scheduling. Do not split chart correction from nullable-output change
so one accepted commit falsely claims consumer safety without the other.

## Required Acceptance Evidence

1. Four-query oracle preserves complete original SQL/branching/order/prepare
   timing independently. Streak oracle freezes BOTH its old loops AND original
   dayDiff behavior; importing the modified helper into both implementations
   would conceal exactly the error-order regression this slice must prevent.
   Reuse unchanged shared time helpers only with explicit independent outcomes.
2. Native real baseline fixtures prove multipleNULL allowed, duplicate text
   rejected, mandatory created/updated columns supplied, tombstones retained.
   Compare complete key sets/raw metric scalars/ordered rows and error identity
   for empty/default30/limits/branching/lexical cutoff. No arbitrary new tie sort.
3. Direct LIMIT edge matrix0/-0/negative/fractions/NaN/infinities/large integers;
   falsy visited/AC cases never read clock; invalid truthy shifts fail after
   successful prepare. Missing table/column precedes even throwing clock or
   invalid day. Scoped damaged qualified-column spelling caveat is not permission
   to wrap errors or change supported native name/message/code behavior.
4. Streak threshold metric independence, all singleton/pairedNULL/bad/range cases,
   longest-before-today, repeated current validation, future/yesterday/gaps and
   one/zero-clock counts. Native and separate-zone UTC/Shanghai/NewYork cases,
   skipped Apia civil day where available; exact pairwise error precedence.
5. Read-only/query_only, current connection close/reinit, external transaction
   visibility/rollback, no notification/new transaction. Snapshot raw data/schema/
   migration ledgers/change count to prove reads do not clean or repair cache.
6. Shared schema tests accept null AND previously allowed malformed/empty text,
   reject numeric/object/undefined day values; unchanged metrics, strict instant
   fields, request days/limit/null handling and nonnullable recompute/snapshot
   keys. Run both real typecheck programs and scoped lint without suppressions.
7. Real Recharts component/browser regression, not a mocked chart asserting props:
   both charts with different counts and twoNULL+two real dates; every point has
   its own x/row, and hover/keyboard Tooltip label AND count match that row. Test
   allNULL, singletonNULL count0, valid-only, empty, malformed/empty/literal-label
   text, All-to7/30 and back, refetch/reorder/stale active index. Assert no ordinal
   date leaks, row dropping/merging, runtime error or changed range callbacks.
   Tick auto-skipping is not missing data: inspect point count/coordinates and
   tooltip association rather than demanding every label be visible at all widths.
8. Responsive real UI acceptance at desktop/mobile widths under parent's serial
   ownership; confirm label clipping/tick behavior and no chart/console errors.
   Selector parity and TypeScript cannot replace mounted interaction/visual QA.
9. AI daily NULL JSON/version2 and snapshot roundtrip, strict period match and
   unchanged averages, Markdown positive anchors plus absent private/day sentinel,
   existing streak exception and Coach catch behavior. Learning backup/parser/
   migration030 regressions remain unchanged, not loosened to satisfy new types.
10. Parent serial DB/native/full/UI/build and remote CI. Log actual counts/errors;
    research probes never stand in for implementation gate evidence.

## Spec Sync And Boundaries

Parent should record A4b1's nullable public-read and bounded renderer exception
in task design/PRD before implementation, plus A4b2's ordered helper contract.
Add executable read/test contracts to drizzle-stats-reads.md or a bounded daily
companion. Clarify unix-millisecond-time.md: valid-day writers/input/snapshot/
period keys stay strings; legacy cached daily READS preserve nullable/unvalidated
text. This does not redefine all local_day columns or permit weaker timestamps.

Frontend notes should describe ordinal categories/unknown-date labels as view
metadata only. AI docs can note type correction with no version/projection/prompt
change. No schema migration/backfill/new cleanup, historical helper edit, broad
calendar policy, A4c list-ID change or stats recompute is authorized here. Do not
repeat or merge A4c/A4d work into this acceptance record.

## Findings And Verification Status

- Fixed: none. Design-only assignment, no product changes allowed.
- Not fixed: public nullable read contract and chart misassociation need the
  explicit parent-approved A4b1 correction. These are evidenced design/public-
  interface decisions, not silent mechanical fixes. A4b2 has no unresolved
  design blocker within the exact ordered-validation boundary.
- Source/spec/full research/public API review: pass.
- Synthetic SQL/helper/streak123, separate-zone helper32, Recharts6 fixtures,
  schema31 and focused loader/AI/snapshot/period transformations: pass.
- Virtual candidate plus real consumer TypeCheck: pass, zero diagnostics/no emit.
- Product lint/two real typecheck programs/native/component/UI/full/build: not
  run for this design precheck; implementation acceptance still required.
- Durable change is only research/a4b-daily-reads-review.md, kept below32768bytes.
  No A3b2/A4a product/test freeze invalidation, Git or unrelated-agent edits.
