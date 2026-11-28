# Drizzle Runtime Recompute Contracts

Parent accepted2026-11-27 after A4c integration at
aacbff0c2c1afe9df4fa2bda5698450f0d76e608 and independent design/reconciliation
review. This contract does not authorize later historical relocation.

## 1. Scope / Trigger

A4d replaces only the live daily/all-days recompute SQL. Add
electron/db/repositories/stats/recompute-runtime.ts and switch only the import
in recompute.ts. Its three wrapper bodies remain unchanged. Historical
recompute-core.ts and migration030 retain exact paths, bytes and their direct
execution branch throughout A4d/R1. No shim or shared algorithm extraction.

This freeze is not a perpetual location waiver: R2/R5 still requires removal of
electron/. Before any historical-island move, a separate approved relocation
plan must preserve its algorithm and dependency semantics under an explicit
path mapping. Exit evidence must account for exact import/path changes, history,
upgrade/recovery equivalence and final layout; new hashes cannot be described as
unchanged old hashes. A4d grants no migration move or guard relaxation. If later
proof fails, R2 remains unfinished rather than silently weakening either goal.

## 2. Signatures

```ts
// New runtime helper: explicit native handle, no global connection ownership.
recomputeDailyStatsAt(db: Database.Database, day: string, now: number): void
recomputeAllDailyStatsAt(db: Database.Database, now: number): number
// Existing public wrapper signatures and bodies stay unchanged.
recomputeDailyStats(date?: string): void
recomputeDailyStatsForDates(dates: Iterable<string>): number
recomputeAllDailyStats(): number
```

No public nullable day, schema, input/output, event or clock API change.

## 3. Contracts

- Daily validates localDayBounds before any SQL, then executes visits aggregate,
  submissions aggregate, solved aggregate, platforms query and prepared UPSERT
  in that order. Ranges stay raw numeric >=start/<end, including DST23/25h.
- Preserve raw COALESCE SUM, COUNT(DISTINCT visit.problem_id), COUNT(*) and exact
  AC case. Only solved parents filter deleted_at; other facts retain tombstones
  and orphans. No Date/String/Number decoders, SQL date conversion, combined
  reads, fabricated aggregate defaults or INTEGER-overflow suppression.
- The explicit handle may use defaultSafeIntegers(true). Public count helpers
  attach Number decoding, unlike raw sql aggregates. Preserve native BigInt
  bindings on empty platforms and the original nonempty-platform BigInt JSON
  failure after INSERT preparation. This is a diagnostic handle-mode contract,
  not a BigInt IPC type or permission to change the global connection mode.
- Platforms retain GROUP BY without new ORDER BY and {platform,count} property
  order. Serialize after INSERT preparation; empty platforms store NULL. No
  eager JSON evaluation, statement preparation or cached adapters/statements.
- Public INSERT/ON CONFLICT may name12 columns versus legacy11 only on frozen030
  physical columns/defaults: omitted deleted_at has no default and yields NULL.
  DEFAULT7 is an explicit excluded counterexample. Do not apply this boundary
  to030, weaken startup validation or claim per-write validation. Re-review
  compatibility before a later schema migration changes those assumptions.
- Preserve11 binding occurrences in original order and raw now values. The
  sole conflict target is local_day; update exactly active_seconds,
  duration_seconds, visited_problem_count, solved_problem_count,
  submission_count, ac_submission_count, platform_distribution_json,
  recomputed_at and updated_at from their own excluded values. Retain created_at
  and deleted_at, including tombstone0. Execute real writes even on no-op/IGNORE.
- All-days materializes cache keys without ordering, then the original four-arm
  distinct UNION of visit/submission/activity/nonnull parent-solved instants.
  Convert every fact through unchanged toLocalDay before any daily write. Keep
  insertion-ordered Set and one shared now. No UNION ALL, sorting or cleanup.
- Nullable cache keys narrow only at the per-day loop point after fact conversion:
  NULL throws TypeError('Invalid local day'). Earlier day effects remain. No
  eager cache validation, filtered NULLs, repair or new public nullable signature.
- Single-day wrapper obtains DB before clocks; a default day uses separate day
  and write clocks. Selected dates consume the complete iterable, deduplicate
  and default-sort before any DB/clock/write, then invoke single-day separately.
- Preserve caller-owned transactions/savepoints and notification scopes around
  actual invocation/COMMIT. No new transaction, after-commit scheduler or catch.
  Narrow existing refresh exceptions: successful single-day emits even IGNORE0;
  all-days emits once only after complete positive-count success, so late failure
  may leave earlier autocommit rows without an event. Selected dates already emit
  per successful day. Scope rollback/COMMIT failure still discards queued topics.

## 4. Validation / Error Matrix

| Case | Required outcome |
| --- | --- |
| Invalid explicit day | Wrapper captures write clock, core fails before SQL |
| Fractional/TEXT/out-of-range fact | Conversion fails before any day write |
| Valid extreme instant producing invalid calendar label | May fail after earlier cached day writes |
| NULL cache key after valid day | Late TypeError; earlier autocommits retained |
| SUM INTEGER overflow and broken INSERT | Earlier visit aggregate failure wins |
| INSERT prepare and throwing serialization | Prepare error wins; no early JSON |
| Conflict on tombstoned cache row | Refresh nine targets, preserve metadata |
| Single success with IGNORE0 | One stats event |
| Selected later failure | Earlier successful dates retain their events/effects |
| All-days positive count / zero / late error | One event / none / none |
| Actual native COMMIT failure | Rollback and no scoped event escape |
| Historical030 invocation | Original explicit-DB helper; no runtime ORM branch |

## 5. Good / Base / Bad

Good: runtime-only public builders plus a protected historical branch and
independent old-source oracle. Base: exact post030 schema/defaults, existing
clocks/events/native failures. Bad: forwarding the frozen helper to new code,
using full-query raw SQL to claim conversion, altering defaults, widening days,
sorting cache keys, or silently correcting existing notification asymmetry.

## 6. Tests Required

Freeze both old cores and all three wrappers independently, not by importing the
production historical core as the expectation. Compare full cache/fact/audit/
schema/ledger state, storage types/JSON bytes, returns, events, clock/query/bind
order, error name/message/code and injected error identity. Test NULL/empty IDs,
raw metrics, true INTEGER overflow, bounds, DST and prepare-before-serialization.

Cover all9 UPDATE OF targets and unrelated targets, fresh/conflict IGNORE/FAIL/
ABORT, metadata, selected eager iterators, no-DB empty input, reversed unordered
cache reads, malformed/NULL cache and extreme fact stages. Native savepoint,
rollback and deferred-FK COMMIT fixtures must prove callback completion before
COMMIT failure, rather than mock a thrown transaction.

Pin aacbff0 accepted-base hashes and030 runtime import graph; source text alone cannot
detect a forwarding dependency. Run unchanged030 preservation/late-failure and
pinned21/24/29 safe upgrade/recovery fixtures. Keep existing warmed daily native
benchmark <50ms unchanged; EXPLAIN is not timing evidence. Both types/lint,
focused/caller/native/full/build/CI remain required. Historical helper duplication
is intentional; do not silently weaken global duplication or architecture gates.

## 7. Wrong vs Correct

```ts
// Wrong: validate all cached days before converting facts or starting work.
// Correct: materialize/convert all facts, then narrow NULL at each original day.
// Wrong: db.transaction(() => withDataChangeTransaction(operation))()
// Correct when the caller already owns a transaction:
withDataChangeTransaction(() => db.transaction(operation)())
// Wrong: old recompute-core export forwards to the runtime Drizzle helper.
// Correct: only live recompute.ts changes its import;030 keeps its original branch.
```
