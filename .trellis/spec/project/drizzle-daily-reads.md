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
