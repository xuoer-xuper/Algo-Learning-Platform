# Drizzle Daily Read And Chart Contracts

## 1. Scope / Trigger

A4b1 converts four daily cache readers after A4a acceptance. Baseline nullable
TEXT local_day primary keys permit multiple NULL rows. Existing false string-only
outputs and Recharts dataKey categories hide/misassociate their counts. Parent
explicitly accepts truthful read types and a narrow chart bug correction, not
broader phase4 work. Streak, insight lists and recompute remain separate.

## 2. Signatures

```ts
getDailyActiveStats(days?: number): DailyActiveStat[]
getVisitedTrend(days?: number): TrendPoint[]
getAcTrend(days?: number): TrendPoint[]
getSubmissionTrend(days?: number): SubmissionTrendPoint[]
// DailyActiveStat is a type alias of shared DailyActiveStats.
// Only the three daily read shapes have local_day: string | null.
```

AIContextExport.trends.daily_stats uses shared DailyActiveStats[]. No runtime
export/value/version change. IPC inputs, writer dates and shared calendar helpers
remain their existing nonnull contracts, not a general nullable LocalDay alias.

## 3. Query / Consumer Contracts

- Current-handle synchronous public SELECT, no cache/transaction/write/events.
  Preserve NULL/empty/malformed/future days, tombstones and exact raw counts.
- Daily-active selects seven original fields/aliases DESC local_day LIMIT days
  default30. Submission trend selects local_day,total,ac DESC LIMIT default30.
  Named LIMIT placeholder keeps all native numeric/error behavior; no days clamp.
- Visited/AC keeps if(days): falsy undefined/0/-0/NaN is all-time ASC without a
  clock; truthy days prepares SELECT before cutoff helper, then binds lexical
  >= cutoff, ASC. Keep inclusive today-minus-days and original error precedence.
  AC count is solved_problem_count, not ac_submission_count. No tie-sort/filling.
- local_day projection is inferred schema column string|null. Three shared read
  schemas accept string|null but not numbers/objects/undefined; no calendar regex.
  Preserve every other field, time validation, exports/aliases and request guards.
- Finite-window loader's existing canonical fill remains; All returns original
  arrays. No repository/loader filtering or mutation. AI JSON/snapshot/Markdown/
  period aggregation/privacy transformations stay unchanged, including NULL.

## 4. Ordinal Chart Policy

Both TrendPanel charts keep original arrays/counts/order/layout/colors/animation.
Use categorical XAxis without local_day dataKey: each input row has an ordinal
slot. Map the numeric category back to that same array for both tickFormatter and
Tooltip labelFormatter. A small local helper may accept unknown, require a
nonnegative integer and existing row, else return ''. Never infer from callback's
second argument, coerce strings, use payload:any, copy rows or invent data IDs.

NULL alone displays 日期缺失; nonnull strings retain tick.slice(5) and raw full
Tooltip labels, including empty/malformed strings. This display label never
enters SQL/DTO/JSON. A real string equal to the label keeps a distinct ordinal.
No range, loader, error/loading, chart type/size or generic widget redesign.
This intentionally fixes existing coordinate/Tooltip misassociation, not full
old-UI equivalence. Null-guarding slice alone is insufficient in Recharts3.10.1.

## 5. Validation / Error Matrix

| Case | Required behavior |
| --- | --- |
| Two NULL cache keys | Preserve two rows/counts and two distinct chart slots |
| Mixed NULL and valid days | Every count remains attached to its own tick/Tooltip |
| Empty/malformed/future string | Preserve SQL/raw string and existing label format |
| Native LIMIT invalid/fraction/negative | Original rows/native synchronous error |
| Truthy bad days + broken SELECT | Prepare fails before cutoff/clock |
| Falsy all-time argument | No cutoff/clock, all rows ASC |
| Readonly/close/reinit/transaction | No writes/events; current-handle behavior |
| Finite window | Existing canonical fill unchanged |

## 6. Required Tests

Independent frozen four-function SQL/oracle with raw rows/keys/order, LIMIT and
if(days)/prepare-clock traces, UTC/Shanghai/NewYork/calendar boundaries, readonly/
lifecycle/errors and no writes/events. Native representative limits and nullable
baseline. Shared schema null/string versus numeric rejection, strict request and
instant guards. AI JSON/version/privacy, snapshot roundtrip, period/Markdown,
loader All reference and finite fills. Real component and Electron UI assertions
for both charts' coordinates/count/Tooltip mapping with mixed/allNULL/empty/raw
strings and range transitions; inspect narrow/wide screenshots. Both typechecks,
strict lint, parent serial native/full/build/CI with unchanged schema/030.

## 7. Good / Base / Bad

Good: original raw arrays, ordinal display positions, same-array labels. Base:
valid-day inputs and unchanged calendar writers. Bad: filtering NULL, fabricated
dates, shared fallback category strings, or only guarding tick.slice.

```ts
// Wrong: XAxis dataKey="local_day" plus null-tolerant formatter loses NULL slots.
// Correct: category axis without dataKey; tick/Tooltip map category to same array.
// Wrong: .limit(days) drops NaN/negative in pinned Drizzle.
// Correct: .limit(sql.placeholder('days')).all({ days }).
// Wrong: calculate cutoff before constructing the query.
// Correct: prepare first, then evaluate localDateDaysAgo in bound arguments.
```

## 8. Native Pointer Test Boundary

Real Electron CDP pointer events can retain fractional coordinates while the
corresponding MouseEvent truncates them. At a chart with fractional viewport
left260.666687, first dot cx37 has viewport center297.666687; mouse clientX297
becomes rounded chartX36, outside Recharts' plot minimum37. The actual DOM hit
can still be the dot while the Tooltip is correctly inactive. Captured trusted
mouse/pointer events and installed range checks, not sleeps, establish this case.

For synthetic native hover tests, choose an integer viewport pixel toward the
chart interior, verify it stays inside the actual dot bounds, then perform one
real mouse move and retain visibility/full-label/count assertions. Cover both
ends and zero values. Do not alter production margins/animation, dispatch fake
React events, remove hover assertions or increase retries/timeouts to mask it.
Full Electron tests and screenshots still determine acceptance.

## 9. Separate Streak Slice (A4b2)

After A4b1 acceptance, getStreakDays retains numeric current/longest and original
loops, exact qualifying OR thresholds, DESC nullable local_day, tombstones,
longest-before-one-now/current loop and today-only anchor. No eager validation,
filtering, new grace period, fallback or changed calendar helper.

Only stats-local dayDiff widens two parameters to string|null. Check later NULL
before its existing localDayBounds, then earlier NULL before its existing bounds.
Throw TypeError('Invalid local day') at those positions. A combined upfront guard
incorrectly replaces later9999-12-31 RangeError with earlierNULL TypeError.
Singleton NULL/bad still yields current0/longest1 after one clock; empty yields0/0
without clock; twoNULL fail before clock. Preserve Date.parse calendar ordinals,
not elapsed local milliseconds across23/25h DST. Shared time API stays string.

Freeze original streak loop AND original dayDiff behavior separately for oracle.
Test actual baseline multipleNULL, thresholds/metrics/tombstones, bad/single/pair,
clock injection/error priority, today/yesterday/future, UTC/Shanghai/NewYork/Apia
range/DST/skipped-day cases, no write/event and native lifecycle/errors. Only
insights.ts streak and stats/date.ts helper production change; no A4b1 overwrite.

## 10. Router Lifecycle Blocker Exception

Actual A4b1 native UI diagnostics also expose an existing ShellRouter rapid-tab
flushSync inside useEffect. The approved prerequisite is deliberately narrow:
burst/no-native-API updates call setRenderTab directly; only actual asynchronous
View Transition snapshot callbacks use flushSync. Private maybeTransition passes
nativeSnapshot:boolean (false synchronous fallback, true native callback). Check
transitionVersion before choosing the update; stale callbacks must never flush.
Keep200ms threshold/clock calls, skip/version order, promise handling and identity
settlement; do not add scheduler timing, fallback cancellation or router redesign.

Regression assertions must fail against original source for burst/fallback
console errors. Queued native-like mocks deliver skipped callbacks, verify newest
route and commit-before-callback-return, and retain old-settlement/rejection tests.
Exact native daily tests keep zero-console/hover/label/count/range assertions.
Good: direct effect state update and bounded native flush. Bad: flush around stale
callbacks, console filtering, sleeps or removing the native snapshot flush.
