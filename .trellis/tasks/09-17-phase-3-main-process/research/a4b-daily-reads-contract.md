# Research: A4b daily-read nullable day and date contract

- Query: What is the smallest truthful, backward-compatible Drizzle conversion of the four daily trend readers and streak reader, including nullable local_day, exact date/error behavior, and all downstream consumers?
- Scope: mixed; repository/schema/callers/specs and installed library source, with read-only virtual TypeScript and in-memory SQLite/selector probes. No implementation or acceptance suite.
- Date: 2026-11-20
- Active task: .trellis/tasks/09-17-phase-3-main-process
- Checkout: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform
- Path convention: code paths below are relative to algo-electron/ unless prefixed .trellis/.

## Findings

### Decision in brief

A4b is possible without changing physical schema, valid-day writers, input validators, migrations, snapshot versions, or database contents. It is NOT just a mechanical SQL rewrite: the real baseline permits multiple NULL daily keys, while declared output types hide them, and the all-time chart misassigns their counts to real dates.

Recommended reviewed split:

1. A4b1: four trend SELECTs plus truthful nullable read-output types, the matching AI context type, and a narrowly approved chart-only category/label correction. Keep runtime rows, order, limits, lexical cutoff, finite-window filling, and AI JSON unchanged.
2. A4b2: streak SELECT plus a stats-local nullable dayDiff signature with ordered null guards. Keep the loop, validation timing, clock calls and failures exactly as they are.

The chart correction needs an explicit plan/review decision. It corrects already-broken NULL display rather than preserving that display bug; do not hide it in a claim of complete UI parity. If that scope is not approved, defer the trend slice rather than cast NULL away, remove its rows, or claim widening types alone completes consumer safety. Streak can be reviewed independently because its result stays numeric.

Supplement to research/a4-stats-queries.md; A4a/A4c/recompute remain separate.

### 1. NULL is permitted by the actual baseline

- src/main/db/schema.ts:504 defines userDailyStats; local_day at :507 is text without .notNull(), and the table-level primaryKey is at :533.
- drizzle/0000_baseline.sql:335 creates the actual table with local_day text PRIMARY KEY, not NOT NULL. All six selected metric columns are NOT NULL/default 0; created_at and updated_at must be supplied when creating fixtures.
- In-memory execution of the entire saved baseline SQL reports PRAGMA table_xinfo(local_day): type TEXT, notnull 0, pk 1. Two NULL keys insert successfully; duplicate ordinary text keys do not.
- NULL, empty text, malformed calendar text and future text are genuine readable baseline values, not a replacement-table/nullability drift fixture. The schema does not promise a canonical day on this read surface.
- SELECT local_day should stay the schema column with inferred string | null. No sql<string>, non-null assertion, String(null), COALESCE sentinel, IS NOT NULL, date parser or cache repair is justified to satisfy the existing false string-only declaration.
- Do not broaden to arbitrary scalar/BLOB DTOs: SQLite affinity corruption is a separate diagnostic contract, not a reason to make every day unknown. The relevant schema contract is string | null.

### 2. Four readers: exact SQL, mapping and evaluation order

Source: electron/db/repositories/stats/trends.ts:6, :27, :53, :78.

| Reader | Existing contract to retain |
| --- | --- |
| getDailyActiveStats(days=30) | Select local_day, active_seconds, duration_seconds, visited_problem_count as visited, solved_problem_count as solved, submission_count as submissions, ac_submission_count as ac; DESC local_day; native LIMIT days. Last N rows, not last N valid/calendar days. |
| getVisitedTrend(days?) | local_day and visited_problem_count as count; truthy days adds local_day >= cutoff; ASC; no LIMIT. Otherwise all rows ASC. |
| getAcTrend(days?) | Same branching/order, but count is solved_problem_count, NOT ac_submission_count. |
| getSubmissionTrend(days=30) | local_day, submission_count as total, ac_submission_count as ac; DESC local_day; native LIMIT days. |

All four include tombstones and all qualifying cache rows. No recompute, transaction, notification, filtering invalid days, application-side sorting, catch-to-empty, or date filling is performed here. NULL ASC comes first and DESC last; ties between NULL keys do not acquire a new ordering guarantee. Preserve the one orderBy; do not add a tie-breaker just to stabilize tests.

Visited/AC branch is if (days), not days !== undefined. Direct calls with undefined, 0, -0 or NaN take the all-time branch and do not read the clock. Negative integers compute a future cutoff. For positive d the lower bound is today minus d, inclusive; do not rewrite it to today minus (d-1) even though the UI separately fills d days.

Date-filtered readers currently getDb -> native prepare -> evaluate localDateDaysAgo(days) -> all(cutoff). localDateDaysAgo (stats/date.ts:3) performs shiftLocalDay(toLocalDay(nowMillis()), -days). Therefore prepare/SQL errors win over clock/date errors. Do not evaluate cutoff while constructing a where expression before prepare.

Supported builder form, strict-compiled virtually against installed Drizzle:

```ts
const statement = db
  .select({ local_day: daily.local_day, count: daily.visited_problem_count })
  .from(daily)
  .where(gte(daily.local_day, sql.placeholder('cutoff')))
  .orderBy(asc(daily.local_day))
  .prepare()
return statement.all({ cutoff: localDateDaysAgo(days) })
```

Create the adapter from the current lifecycle-owned getDb() for each call; do not retain it across close/reinitialize. Unfiltered queries can simply .all(). For the two parameterized caps, retain native LIMIT through .limit(sql.placeholder('limit')).all({ limit: days }). Drizzle numeric .limit(days) omits negative and NaN values in dialect.cjs:232; a placeholder delegates their actual binding/SQL behavior to the existing driver rather than adding ORM policy. Do not compare node:sqlite diagnostic messages with better-sqlite3 as if they were interchangeable.

Probe rows (real baseline, no schema alteration): NULL twice, empty string, 2026-02-30, 2026-11-19, tombstoned 2026-11-20, future 2026-11-21, zzz. Unfiltered ASC retains all eight. With fixed local today 2026-11-20, days=1 retains 19/20/21/zzz, naturally excluding NULL; days=-1 retains 21/zzz. Daily/submission LIMIT3 returns zzz/21/20 including the tombstone. AC count tracks solved counts, deliberately distinct from AC submission counts.

### 3. Date semantics are host-local and strict, not fixed Beijing

Authoritative helpers: src/shared/time.ts:13 toLocalDay, :34 calendarDate, :51 shiftLocalDay, :62 localMidnight, :71 localDayBounds. electron/shared/time reexports shared helpers. Stats-local wrappers live in electron/db/repositories/stats/date.ts.

- nowMillis produces an instant; toLocalDay uses host-local getFullYear/getMonth/getDate. Do not substitute UTC ISO slicing or force Asia/Shanghai.
- shiftLocalDay requires a safe integer shift and validates YYYY-MM-DD as an actual calendar date; malformed and impossible dates fail with TypeError('Invalid local day'). Year movement outside 0000..9999 fails with RangeError.
- localDayBounds verifies local midnight and the next day. Skipped civil dates can fail with RangeError('Local calendar day does not exist'); bounds for 9999-12-31 fail when advancing to the next year.
- dayDiff validates later bounds, then earlier bounds, then compares UTC calendar ordinals / 86400000. It does NOT divide local-midnight milliseconds, so DST does not break adjacency.
- With fixed valid now, fractional days and Infinity in the truthy trend branch throw TypeError('Day shift must be an integer') after prepare and one clock read. Missing-table prepare failure prevents that clock read and wins over the invalid shift. IPC does not expose these diagnostic inputs; repository behavior is still relevant for differential tests.

In-process zone probes of existing helpers: America/New_York 2026-03-08 has 23 hours, 2026-11-01 has 25; respective adjacent dayDiff is 1 in both cases. Pacific/Apia 2011-12-30 fails as a nonexistent local calendar day. These are helper experiments, not packaged Electron timezone acceptance.

Stale comments to clarify only if included in the reviewed contract: trends.ts:30 and shared/types/ipc/stats.ts describe Beijing and the old NaN-NaN-NaN fallback. The current implementation is host-local and throws for invalid shifts. Correct documentation, not runtime timezone policy.

### 4. Streak preserves surprising existing behavior and ordered failures

Source: electron/db/repositories/stats/insights.ts:95. SELECT local_day WHERE active_seconds >= 300 OR submission_count > 0 OR solved_problem_count > 0 ORDER BY local_day DESC. No deleted_at filter. Counts of visits, duration, or AC submissions alone do not qualify. The NULL day does not prevent a row qualifying through its metrics.

Preserve the algorithm rather than replacing it with a valid-date set, SQL date math, gap-and-island window, early today check, or reverse traversal:

1. Read rows; empty => {current:0,longest:0} before reading now.
2. Walk every adjacent pair with dayDiff to determine longest. This validates keys only when a pair is visited.
3. Compare the first raw day with toLocalDay(nowMillis()). If not today => current0, calculated longest.
4. Otherwise walk the leading consecutive run again for current.

Observed existing-source behavior using actual baseline SQL and fixed local today 2026-11-20:

| Qualifying rows in DESC order | Result | Clock/validation consequence |
| --- | --- | --- |
| none | current0, longest0 | No clock call. |
| NULL only | current0, longest1 | No dayDiff; exactly one now call. |
| bad only | current0, longest1 | Same; no prevalidation. |
| yesterday only | current0, longest1 | No grace period for yesterday. |
| today, yesterday | current2, longest2 | dayDiff then one now; current loop repeats dayDiff. |
| NULL, NULL | TypeError Invalid local day | Before any now call. |
| 9999-12-31, NULL | RangeError Local day is outside the supported calendar range | Later-day validation wins over earlier NULL, before now. |
| tombstoned today with active_seconds=300 | current1, longest1 | Tombstone retained. |
| today active_seconds=299, other qualifying metrics0 | current0, longest0 | Row absent from SELECT, no now. |

Nonqualifying NULLs do not affect streak. With a failing clock, singleton NULL/bad fails at now; two NULLs fail earlier. Future top day makes current0 even if today is present. Preserve these behaviors.

The SELECT can directly infer nullable local_day and retain the existing loops. A cast-free minimal helper change is to widen ONLY stats/date.ts dayDiff parameters and guard each NULL immediately before its existing bound validation:

```ts
export function dayDiff(laterDay: string | null, earlierDay: string | null): number {
  if (laterDay === null) throw new TypeError('Invalid local day')
  localDayBounds(laterDay)
  if (earlierDay === null) throw new TypeError('Invalid local day')
  localDayBounds(earlierDay)
  return (Date.parse(`${laterDay}T00:00:00Z`) - Date.parse(`${earlierDay}T00:00:00Z`)) / 86_400_000
}
```

Do not put a combined if (laterDay === null || earlierDay === null) before both validations: that changes RangeError precedence for [9999-12-31,NULL]. Do not check whole rows before the loops: that changes singleton/empty behavior. Do not widen the shared calendar API or return zero/NaN for invalid days.

Search found dayDiff used only by the two streak loops; no other production callsite needs its new union. The proposed helper and typed streak SELECT compile under strict TypeScript without assertions. Direct comparison against old helper for NULL pairs, malformed dates, 9999-12-31 precedence and valid adjacency preserved value/error name/message. Exact stack traces are not claimed.

### 5. Output type policy and all production consumers

Only read DTOs that actually carry this column should become nullable:

| Surface | Location | Minimum policy |
| --- | --- | --- |
| DailyActiveStats | src/shared/types/stats.ts:28 | local_day: z.string().nullable(); keep all metrics/names. |
| TrendPoint | src/shared/types/stats.ts:41 | Same nullable field; no regex/calendar restriction. |
| SubmissionTrendPoint | src/shared/types/stats.ts:49 | Same nullable field; keep total/ac names. |
| Repository DailyActiveStat | electron/db/repositories/stats/types.ts:1 | Alias the shared DailyActiveStats or equivalent schema-derived projection; remove the false hand-written string-only promise. |
| AI daily_stats projection | electron/ai/contextTypes.ts:15 | local_day becomes string | null, preferably reuse the already identical shared daily-read shape; no value mapping/version change. |
| StreakDays | stats/types.ts:28 | Unchanged current/longest numbers. |

The shared stats header at :5 currently describes repository declarations as authoritative and local_day as YYYY-MM-DD string. Narrowly update it to distinguish valid-day input/writer contracts from raw cached read output. Do not add a universal nullable LocalDay type and spread it into write requests, event rows, snapshot keys or migration helpers.

Main IPC: electron/ipc/registerStatsIpc.ts:42/:46/:50/:54 passes the four query results through; :91 registers streak. The existing input wrapper validates requests, not these response schemas. Do not insert a new response parser or change channel names/argument order to compensate for nullable output.

Preload: src/preload/index.ts:296/:298 returns Promise<TrendPoint[]> for visited/AC; :311 returns numeric streak. Shared type changes propagate. No renderer/preload callable methods for daily-active or submission-trend were found, despite registered main IPC and constants; do not add API surface in this slice. statsRepository.ts:20 keeps exports stable.

Dashboard: src/features/analytics/types.ts:64 refers to shared TrendPoint arrays; analyticsApi.ts:10 creates Map<raw local_day,count>, then :16 generates canonical local day keys for finite windows. With truthy range, unmatched NULL/malformed/future rows already do not appear in the generated d-day result. With undefined All, :35 returns the original arrays unchanged. Do not add loader filtering or canonicalization. Probe of actual loader retained reference identity and all raw rows for All; ranges1/2/7 emitted only the intended canonical days and zero fills. Data/clock injection, no mounted UI, was used.

Dashboard core loading (analyticsApi.ts:40) includes getStreakDays in Promise.all, so its existing failure can fail that core load. Trends use a separate load. Do not claim a streak failure always prevents the all-time chart from receiving NULL rows.

### 6. Material chart caveat: type widening does not make All safe

src/features/analytics/TrendPanel.tsx:59/:91 passes raw arrays to LineChart. XAxis at :62/:94 uses dataKey="local_day" and :64/:96 uses d.slice(5). A tolerant tick formatter alone is insufficient.

Installed Recharts 3.10.1 evidence:

- lib/state/selectors/axisSelectors.js:359 applies the dataKey; :689 filters null category-domain values.
- :1226 builds a duplicate domain only when nonnull values duplicate; multiple NULL values alone do not trigger index categories.
- :847 uses row-index domain when the categorical axis has no dataKey.
- :1278 builds ticks; lib/util/ChartUtils.js:399 uses ticks[index] for line coordinates with default allowDuplicatedCategory=true.
- lib/cartesian/CartesianAxis.js:378 invokes the tick formatter; formatter typing is broad enough that nullable shared types do not flag its d.slice call.

Pure selector reproduction, actual installed functions with a simple deterministic scale:

```text
input: (NULL,10), (NULL,20), (2026-11-19,30), (2026-11-20,40)
current domain/ticks: 2026-11-19, 2026-11-20
current line coordinates: NULL10 at first real-day x; NULL20 at second real-day x;
                          actual Nov19/Nov20 points have x=null
```

Thus real-baseline All data can mislabel counts and omit valid-day points. All-NULL input yields no domain/ticks. The often-suspected .slice(null) crash can occur with NULL plus duplicate NONNULL categories in the selector experiment, but duplicate text keys are forbidden by this baseline PK: do not report that particular crash fixture as ordinary baseline data. The baseline-reachable issue is loss/misassignment.

Smallest promising explicit UI policy: keep original chart data and switch the X axis to row-index categories (omit local_day dataKey, keep categorical type), then map the numeric category back to that array's raw local_day for both tickFormatter and Tooltip labelFormatter. This preserves two NULL rows as two slots without creating a sentinel day, merging unknowns, changing count/order, or colliding with a malformed string that resembles a sentinel. Tick text can retain the existing .slice(5) for nonnull strings; a NULL gets an explicit display-only missing-date label (for example the existing UI-language equivalent of Unknown date). Tooltip text should retain the full original string or the NULL label. Do not write that display label into local_day, output JSON or the database.

A separate chart-only ordinal property also works, but copying every row is unnecessary if Recharts' no-dataKey categorical contract passes component tests. Do not set allowDuplicatedCategory=false as a workaround: its unmatched NULL path still falls back to ticks[index]. Do not use the same fallback string as every NULL category with dataKey-based tooltip lookup, because the installed axis tooltip combiner can pick the first matching duplicate row.

Pure selectors confirmed no-dataKey domain [0,1,2,3], all four point coordinates preserved, and existing all-valid spacing preserved. The installed combineTooltipPayload with no axis dataKey chose NULL count10, NULL count20, real count30 at their respective indexes. Its labelFormatter should map the numeric label through the corresponding input array with runtime narrowing, not use any casts through Tooltip payload:any.

These are source/selector findings, not a mounted chart test or visual acceptance. Required follow-up: test both charts, All/finite range, two NULLs plus real dates, all-NULL, empty data and malformed strings; assert both point-to-date and tooltip association. Review the exact empty/malformed-string label policy instead of expanding this slice into calendar sanitization or chart redesign.

### 7. AI, snapshots, summaries and backup stay separate contracts

AI export is a consumer of the daily read shape, not a date validator. electron/ai/contextExporter.ts:18 keeps AI_CONTEXT_VERSION=2; :59 explicitly copies all seven daily fields; :82 calls getStreakDays before returning trends at :85. No new daily field or data leaves the app merely by making its type truthful.

- With a qualifying NULL plus another qualifying day, the existing streak loop may already throw, failing export. Do not catch it, repair the key or fabricate a streak in A4b.
- Nonqualifying NULL daily rows can export; a single qualifying NULL can also export with current0/longest1. Thus streak failure does not make AI nullable-day typing unnecessary.
- contextMarkdown.ts:4 renders overview/streak/platforms and tag/wrong/unreviewed sections. It does not render daily_stats or trends at all. No new missing-date text, daily rows, URLs or other private data should be added to Markdown/prompts.
- electron/ipc/registerAiIpc.ts:35/:39 exposes raw context/Markdown. electron/coach/llm/ContextGatherer.ts:148 exports then renders; :150 catches export failure to an empty learner profile. Preserve that established behavior and its allowlist.
- aiContextSnapshot/serialization.ts:15 uses JSON.stringify, which preserves NULL keys. :21 attaches parsed context through normalizeLegacyAIContext. electron/db/legacy-ai-context.ts:11 normalizes only version/exported_at and owned instant fields in wrong/unreviewed/activity arrays, while retaining other content; it does not validate or heal daily_stats.local_day.
- aiContextSnapshot/mutations.ts:19 captures exportAIContext in the existing snapshot. snapshot_date remains a string from toLocalDay; do not widen it or bump snapshot/context schema versions.
- electron/ai/summary/periodSummaryAggregation.ts:34 sums a daily row only on strict local_day === snapshot.snapshot_date. NULL already does not match; no mapper/filter change is needed. periodSummary.ts:26 separately reads streak and retains its existing failure behavior.

A source-execution probe used real exporter overview SQL against an in-memory baseline and stubbed only downstream repository/tag results. It exported [NULL,sentinel-not-a-day,2026-11-20] unchanged at version2. Actual snapshot serialization, actual legacy-context normalization and actual parsing preserved those same keys. Actual Markdown omitted the sentinel daily string. Actual period aggregation, with a matching Nov20 snapshot, included only the Nov20 row's counts and ignored NULL/malformed rows; its average-day denominator stayed unchanged. This validates the transformation path, not a complete application AI integration.

Backup is NOT the same as AIContextExport or a new strict-day schema:

- electron/backup/types.ts:1 retains LEARNING_DATA_EXPORT_VERSION=2 and :4 ExportRow=Record<string,string|number|null>.
- learningDataExport.ts:120 exports cache rows; :160 sanitizes local filesystem paths but otherwise retains NULL/scalars. :177 parsing validates generic scalar types and owned timestamp columns/required instants, not every local_day as a valid date.
- Its import path marks affected keys at :1052: strings go through shiftLocalDay(day,0); NULL is skipped. Therefore saying "all backup keys are already strict" would be inaccurate. Preserve current parser, timestamp validation, import behavior and format version; do not weaken or redesign them as a side effect of read DTO nullability.

### 8. Hard exclusions and spec clarification

No schema.ts/baseline changes, new migration, backfill, cache cleanup, replay or new default is required. No new connection/transactions/events, no auto-recompute on read, no changed request validators, and no broad main-process directory move belongs in A4b.

Recompute remains separately deferred. electron/db/migrations/030_timestamps_to_unix_ms.ts:7 imports the live stats/recompute-core; :228 calls it during historical migration. Editing that helper to fix NULL handling or move to Drizzle here would alter old migration behavior. stats/recompute.ts:6 currently accepts a valid day string/default today and emits events; do not widen this write API to nullable simply because a cache read is nullable.

src/shared/types/ipc/stats.ts:17 requires days integer1..3650 or undefined, :18 limits1..1000 or undefined; recompute date at :21/:33 is a string regex and optional, not nullable. A regex permits impossible calendar strings until a deeper helper validates them; do not call it full calendar validation. Keep all these inputs unchanged, including null rejection. Timestamp fields stay integer milliseconds and Date handling stays separate from day labels.

.trellis/spec/project/unix-millisecond-time.md:35 says local_day/snapshot/period keys stay YYYY-MM-DD strings. Add a narrowly reviewed clarification for legacy cached daily READ outputs: the persisted schema permits null and unvalidated text and these reads preserve it; valid-day creation/input contracts remain strings. This is not permission to broaden instant fields, all day columns, migration inputs or write request types. The researcher did not edit specs.

### 9. Acceptance matrix for the implement/check agents

Freeze an independent legacy oracle for the four original SELECTs and the streak algorithm/date validation. For streak, importing the same newly modified helper into the oracle would hide helper regressions; freeze its original behavior or separately pin it with independent outcomes/errors.

| Area | Required regression evidence |
| --- | --- |
| Real schema | Start with actual baseline/migrated schema; NULL twice, normal duplicate rejection, mandatory created/updated values; no hand-altered NOT NULL schema used as the sole proof. |
| Trend output | Exact field names/count source/types; empty table, NULL/empty/malformed/future days, tombstones, all-time ASC and limited DESC; stable non-tied sequence without inventing NULL tie guarantees. |
| Arguments | default30; LIMIT0/1/-1, fractions/NaN/infinities under native better-sqlite3; falsey trend inputs vs truthy1/negative/fraction/Infinity; no input validation added at repository. |
| Clock and prepare | Trace getDb/prepare/cutoff/all; broken prepare wins over invalid shift/clock; all-time branch never touches clock; correct host-local cutoff across UTC/Shanghai/NewYork midnight. |
| Streak | Empty, singleton NULL/bad, two NULL, malformed paired day, later9999/earlierNULL precedence, thresholds299/300, visit/duration/AC-only rows, submission/solve qualification, tombstone, gap, yesterday-only, future top day, today-prefix run. |
| Calendar | Leap/year boundary, impossible day TypeError, 23/25h DST adjacency, supported-range and skipped-local-day errors; preserve validation/clock order. |
| Read lifecycle | query_only, caller transaction visibility/rollback, close/reinitialize, synchronous SQL errors, no writes/data-change notifications/new transactions. |
| DTO / IPC | Three read schemas accept null AND existing empty/malformed strings; numeric day rejected; all metrics retained; request null/invalid count and timestamp-number guards unchanged. |
| Dashboard loader | All returns original arrays with NULLs; 7/30-day canonical fill unchanged; future/unmatched keys absent only through existing fill behavior, not new repository filters. |
| Chart policy | Real component/browser regression for both series with two NULLs + distinct real days; every count retains its row's tick/tooltip; all-NULL, empty, malformed, All-to-finite changes; no sentinel mutation or collapsing unknown rows. |
| AI / snapshots | JSON contains NULL unchanged/version2; Markdown/privacy projection unchanged; snapshot roundtrip preserves NULL; period strict-match excludes it; preexisting streak failure and Coach catch behavior retained. |

Existing tests found: tests/db/statsDate.test.ts tests nextLocalDay and timestamp conversion, not the streak-null ordering. tests/ipc/timestampSchemas.test.ts:93 checks trend string acceptance/numeric rejection but not NULL. tests/db/repositories.test.ts:975 tests recompute; it is not a substitute for all four daily read oracles. No dedicated TrendPanel/loadDashboardTrends regression was found by source search; do not treat passing unrelated suites or TypeScript's broad Recharts formatters as UI verification.

## Files Found

All paths below are relative to algo-electron/; detailed line citations appear with the findings.

| Path | Description |
| --- | --- |
| src/main/db/schema.ts:504 | Nullable daily key and six nonnull counters. |
| drizzle/0000_baseline.sql:335 | Real executable PK/NULL contract. |
| electron/db/repositories/stats/trends.ts:6 | Four daily SELECTs. |
| electron/db/repositories/stats/insights.ts:95 | Streak SELECT and loops. |
| electron/db/repositories/stats/date.ts:23 | Paired validation and error order. |
| src/shared/time.ts:34 | Strict host-local calendar helpers. |
| src/shared/types/stats.ts:28 | Three output schemas needing truthful nullability. |
| src/shared/types/ipc/stats.ts:17 | Separate request limits/day validation. |
| src/features/analytics/analyticsApi.ts:10 | Finite fill versus raw All data. |
| src/features/analytics/TrendPanel.tsx:59 | Chart category and tooltip risk. |
| electron/ai/contextExporter.ts:59 | Daily projection/version2; contextTypes.ts:15 types it. |
| electron/db/repositories/aiContextSnapshot/serialization.ts:15 | JSON preservation and normalization path. |
| electron/ai/summary/periodSummaryAggregation.ts:34 | Strict day/snapshot matching. |
| electron/backup/learningDataExport.ts:177 | Separate scalar/timestamp parsing and import semantics. |
| electron/db/migrations/030_timestamps_to_unix_ms.ts:7 | Historical recompute dependency, excluded. |


## External References and Installed Versions

Inspected local installed sources rather than assuming current online examples match this lockfile:

- drizzle-orm 0.45.4; drizzle-kit 0.31.11. sqlite-core/dialect.cjs:232 shows numeric LIMIT omission; better-sqlite3 public SELECT/.prepare/.all placeholder signatures were strict-compiled. General references: https://orm.drizzle.team/docs/select and https://orm.drizzle.team/docs/perf-queries (not fetched during this follow-up).
- SQLite PRIMARY KEY NULL exception: https://www.sqlite.org/lang_createtable.html#the_primary_key . Local executable baseline is the decisive evidence here; in-memory engine reports SQLite 3.54.0. Ordering reference: https://www.sqlite.org/lang_select.html#orderby (not fetched during this follow-up).
- Recharts 3.10.1: node_modules/recharts/lib/state/selectors/axisSelectors.js:359/:689/:847/:1226/:1278; lib/util/ChartUtils.js:399; lib/state/selectors/combiners/combineTooltipPayload.js:76; types/component/DefaultTooltipContent.d.ts:45. Reference APIs: https://recharts.github.io/en-US/api/XAxis/ and https://recharts.github.io/en-US/api/Tooltip/ (installed source, not remotely fetched docs, supports this report).
- TypeScript 6.0.3 and Zod 4.6.7 installed. Virtual compiler host supplied an in-memory file only: typed cutoff/LIMIT/streak SELECT and nullable ordered helper produced zero strict diagnostics, with writeFile guarded against emission.
- Probe runtime was PATH Node v26.13.0, outside the package's declared >=22.18.0 <25 range. Node's node:sqlite experiments support semantics/design only; they do not replace the project's supported Node/Electron better-sqlite3 acceptance.

## Related Specs and Task Context

- .trellis/workflow.md:363: research must persist in the assigned task research directory; no implementation claimed here.
- .trellis/spec/project/drizzle-adoption.md:53: physical schema parity, nullable legacy TEXT PKs, current connection ownership, synchronous/native behavior and no casts to hide nullable values.
- .trellis/spec/project/drizzle-submission-reads.md:24: accepted named LIMIT placeholders, truthful output-only nullable keys, no added filtering, raw/native differential acceptance.
- .trellis/spec/project/drizzle-submission-writes.md:35: established prepare-before-evaluation and native-failure ordering discipline.
- .trellis/spec/project/unix-millisecond-time.md:35: day keys versus instant fields; requires narrow cached-read clarification, not a new date policy.
- .trellis/spec/shared/timestamp.md: timestamp_ms/Date-to-number rules do not convert day labels to timestamps.
- .trellis/spec/backend/type-safety.md and .trellis/spec/frontend/type-safety.md: shared source-of-truth types, no any/non-null assertions; .trellis/spec/frontend/quality.md requires actual regression verification.
- Task prd.md/design.md/implement.md and research/a4-stats-queries.md: A4a is a separate basic-read boundary; A4b/day policy is unresolved, A4c other insight IDs and recompute remain separate. No role-isolated implement.jsonl/check.jsonl loaded.

## Caveats / Not Found

- This is a researched proposal, not approval to implement or proof of finished A4b. The all-time chart defect materially invalidates a type-only consumer-safety assumption; parent must explicitly choose/record its bounded display correction.
- Exact native better-sqlite3 error identity, parameter edge behavior and Electron lifecycle must still be tested with the existing supported harness. No native/global/UI/build suite, user database, original D checkout, Git operation or repository code/spec/task-metadata write was performed.
- Selector/virtual-source probes are not component rendering. The ordinal chart policy needs point/tick/tooltip integration tests; do not report it visually accepted.
- Multiple NULL key ordering is not a promised SQL tie-break. Keep existing ORDER BY and do not introduce deterministic reordering as an unrelated fix.
- Read NULLs do not permit null write dates, weaker instant validation or a format-version bump.
- All durable work from this follow-up is this research file. Other agents' files were only read as context; no other slice ownership was changed.
