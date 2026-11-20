# Drizzle Statistics Read Contracts

## 1. Scope / Trigger

A4a converts only three basic stats reads after independently reviewed A3
acceptance. It does not consolidate them with problem overview, modify daily
trends/streak/lists, or change historical migration-coupled recomputation.
General Drizzle connection, schema and error ownership rules still apply.

## 2. Signatures

```ts
getPlatformDistribution(): PlatformDistributionRow[]
getProblemVisitStats(problemId: string): ProblemVisitStat
getLastActiveTime(): number | null
```

Keep current shared/types, request validation, privacy projections and callers.
These three outputs need no nullable policy correction. Diagnostic raw SQLite
storage cases do not broaden the supported public input format.

## 3. Contracts

- Create a local adapter around current getDb for each call. No cached adapter,
  second connection, import-time work, writes/events/transaction or clock call.
- Distribution is active parents, COUNT(*), GROUP BY platform, count DESC only.
  Nullable IDs count; tombstones including deleted_at0 do not. Preserve native
  text grouping/order ties, two output keys and empty[]. No cap/zero-fill/sort.
- Visits are exact bound problem_id with COUNT(*) and raw SQL COALESCE(SUM
  duration,0), COALESCE(SUM active,0), COALESCE(AVG duration,0), no GROUP BY.
  Include nullable IDs/tombstones/orphans; AVG ignores NULL durations. Use the
  native numeric aggregates, not Drizzle sum/avg String decoders or JS reduction.
- Aggregate get has an optional type. A successful SQLite no-GROUP aggregate
  always returns one row; explicitly throw for impossible undefined instead of
  assertion/cast/fabricated defaults. Integer SUM overflow propagates natively.
- Latest time selects raw sql<number> occurred_at ORDER BY column DESC LIMIT1;
  return row?.occurred_at ?? null. No MAX, Date/String/Number decoding, overview
  redirection, filter, tie-break or fallback clock. Fixed .limit(1) is supported.
- Preserve synchronous native errors and current-handle/transaction visibility.
  Broken-column qualified spelling may differ outside supported schema; preserve
  failure stage and do not weaken guards/rewrite errors to claim arbitrary DDL
  equivalence. Startup validation is not per-read validation.

## 4. Validation / Error Matrix

| Case | Required behavior |
| --- | --- |
| Active parent NULL ID | Count in distribution |
| Visits10,NULL,20 durations | total_visits3, total_duration30, avg_duration15 |
| Missing parent/no facts/all NULL aggregates | SQL-defined zeros, one row |
| Tombstone/orphan visit | Included in exact-ID aggregate |
| Exact INTEGER SUM overflow | Native step error, not0/floating success |
| Latest empty/epoch0/fraction/extreme | null/0/exact raw scalar |
| Readonly/uncommitted/rollback/close/reinit | Read without writes; use current handle |

## 5. Good / Base / Bad

Good: genuine typed SELECT with narrowly scoped raw aggregate expressions.
Base: native counts and SQL affinity determine results, with unchanged callers.
Bad: helper sum/avg changes numbers into strings, or Date decoding truncates
fractions/rejects raw instants while appearing to be a harmless refactor.

## 6. Required Evidence

Freeze all three original bodies/SQL separately. Compare exact ordered keys,
scalar types, native outcomes, full state/ledger/schema and no events/writes.
Cover nullable IDs/durations, ties, tombstones/orphans, literals/Unicode/NUL keys,
empty/all-null, negative/fraction/raw times, query_only, lifecycle and transaction
visibility. Native Electron tests must repeat decisive aggregates, true INTEGER
SUM overflow (exact SQL literals plus typeof assertion), and raw latest times.
Both typechecks/scoped lint/focused tests and parent serial native/full/build/CI.

## 7. Wrong vs Correct

```ts
// Wrong: avg(problemVisits.duration_seconds) returns a String-decoded value.
// Correct: sql<number>`COALESCE(AVG(${problemVisits.duration_seconds}), 0)`.
// Wrong: sum(duration) / count(*) includes NULL durations in the denominator.
// Correct: preserve AVG and its native NULL semantics.
// Wrong: max(activityEvents.occurred_at) invokes Date decoding.
// Correct: select raw occurred_at, order DESC, limit1, then use ?? null.
```

## Native Differential Fixture Clocks

Two separately migrated native databases need not share schema_migrations.applied_at.
Frozen legacy clocks may construct new Date directly, so replacing Date.now alone
is not full clock control (unlike Vitest fake Date). For read-only verification,
compare every table/schema/ledger field before and after EACH read on its own DB.
Only the cross-fixture equivalence snapshot may omit initialization-only applied_at,
retaining version/name/order and all other fields. Never remove ledger immutability
checks, alter historical clocks, normalize production rows, or mistake different
fixture creation times for a query regression. Re-run the native suite after fixes.
