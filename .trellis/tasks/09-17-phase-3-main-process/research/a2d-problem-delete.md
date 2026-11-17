# Research: A2d exact-equivalence problem deletion

- Query: What is the smallest Drizzle rewrite of deleteProblem that preserves affected dates, raw timestamp validation, deletion order, transaction/events and derived-stat failure behavior?
- Scope: internal source/specs/tests plus pinned local dependency implementation; preparation only.
- Date: 2026-11-17
- Active task: `.trellis/tasks/09-17-phase-3-main-process`.
- Workspace: `C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform`.
- Prerequisite: implementation waits until release-hardening synchronization is accepted.

## Findings

### Reused research and decision

This narrows `research/a2-problem-queries.md`, sections 3, 5 and 8, rather than reopening the problem domain. A2a overview, A2b lookup and A2c upsert are converted. Task `implement.md:82` scopes A2d to the four-branch affected-date UNION and four DELETE statements.

Keep the existing native `db.transaction(() => ...)()` and outer `withDataChangeTransaction`. The older broad research mentioned an ORM transaction as an option; the current narrow plan does not need that extra change. Use a local adapter over the same native connection, one typed UNION, and four synchronous Drizzle deletes. Preserve the rest of the control flow.

### Files found

Unless prefixed with `.trellis/`, source paths and dependency references below are relative to `algo-electron/`.

| File | Responsibility |
| --- | --- |
| `electron/db/repositories/problem/mutations.ts` | Converted upsert plus current native deletion; only production edit target. |
| `electron/db/repositories/problemRepository.ts` | Compatibility export used by tests/IPC; signature remains unchanged. |
| `src/main/db/client.ts` | Adapter over supplied native connection; no open/migrate/cache behavior. |
| `src/main/db/schema.ts` | Existing nullable legacy primary keys and timestamp_ms mappings. |
| `electron/shared/dataEvents.ts` | Synchronous nested topic scopes; success merges/releases, failure discards. |
| `src/shared/time.ts` | Integer-millisecond validation and local calendar conversion. |
| `electron/db/repositories/stats/recompute.ts` | Sorted unique day iteration and one stats event per success. |
| `electron/db/repositories/stats/recompute-core.ts` | Existing aggregates and per-day upsert; outside this slice. |
| `tests/db/deleteProblem.test.ts` | Existing date, child-delete rollback and stats-warning cases. |
| `tests/db/problemUpsert.test.ts`, `tests/db/problem-upsert-oracle.ts` | Original-SQL differential pattern and actual transaction/event tests. |
| `tests/db/dataChangeNotifications.test.ts` | R4 no-op, commit, savepoint and partial-autocommit guards. |
| `tests/db/repositories.test.ts` | Real Electron/native ABI harness; currently no direct deletion case. |
| `tests/verify.mjs`, `vitest.config.ts` | Focused DB allowlist and separate native execution. |
| `electron/ipc/registerProblemIpc.ts`, `src/features/problems/ProblemDetail.tsx` | Boolean delete API and separately optional note deletion; do not edit. |

### Exact behavior

1. Before the transaction, collect matching visits.entered_at, submissions.submitted_at, activity_events.occurred_at and non-null problems.first_solved_at (`mutations.ts:83`). Every predicate binds exact problemId. No join, tombstone filter, parent-existence guard or input normalization exists.
2. UNION deduplicates raw instants; the Set deduplicates local days (`mutations.ts:100`). Activity dates come from occurred_at, not stored local_day. Tombstoned facts contribute dates. A non-null invalid instant throws before any deletion or event.
3. Delete submissions, visits, activity events, then parent in one native transaction (`mutations.ts:104`). Return only final DELETE `.changes > 0`. A missing parent still permits orphan-child deletion, returns false, and neither notifies nor recomputes. Do not add an early parent-existence return.
4. Only parent removal enqueues `['problems', 'submissions', 'stats']` (`mutations.ts:109`). The outer notification scope includes actual transaction invocation/commit, not just its callback.
5. After successful invocation return, recompute collected days (`mutations.ts:114`). A stats failure logs `problem.delete-stats-recompute-failed` with problemId, full sorted affectedDates and error, but deletion still returns true. No retry or rollback of the successful delete.
6. Do not delete notes or expand table scope. The UI handles optional notes separately; notes.problem_id has no FK (`schema.ts:220`, `ProblemDetail.tsx:49`). Keep the synchronous boolean API and IPC notification behavior (`registerProblemIpc.ts:28`).

### Minimal rewrite

Add `const orm = createDrizzleClient(db)` after the existing native `const db = getDb()`. Existing imports already provide and/eq/sql; add isNotNull and existing problemVisits/submissions/activityEvents schema objects. Keep upsert unchanged.

Every branch uses the same selected key and raw SQL alias:

```ts
const rows = orm
  .select({ instant: sql<number | null>`${problemVisits.entered_at}`.as('instant') })
  .from(problemVisits)
  .where(eq(problemVisits.problem_id, problemId))
  .union(
    orm.select({ instant: sql<number | null>`${submissions.submitted_at}`.as('instant') })
      .from(submissions)
      .where(eq(submissions.problem_id, problemId)),
  )
  .union(
    orm.select({ instant: sql<number | null>`${activityEvents.occurred_at}`.as('instant') })
      .from(activityEvents)
      .where(eq(activityEvents.problem_id, problemId)),
  )
  .union(
    orm.select({ instant: sql<number | null>`${problems.first_solved_at}`.as('instant') })
      .from(problems)
      .where(and(eq(problems.id, problemId), isNotNull(problems.first_solved_at))),
  )
  .all()
```

Leave `row.instant !== null` and `toLocalDay(row.instant)` untouched. This is a narrow raw scalar projection, not a whole query hidden behind sql.raw. Avoid CAST, mapWith(Number), Date conversion or a generic projection helper.

Inside the existing native callback:

```ts
orm.delete(submissions).where(eq(submissions.problem_id, problemId)).run()
orm.delete(problemVisits).where(eq(problemVisits.problem_id, problemId)).run()
orm.delete(activityEvents).where(eq(activityEvents.problem_id, problemId)).run()
const removed = orm.delete(problems).where(eq(problems.id, problemId)).run().changes > 0
```

Do not introduce returning(), execute(), await, ORM transaction nesting, four independent SELECT executions, or a cached adapter. Preserve the compound preflight read and statement order.

### Raw timestamp and nullable-ID boundaries

Direct timestamp-column selection invokes `new Date(value)` (`node_modules/drizzle-orm/sqlite-core/columns/integer.js:65`). In contrast, `src/shared/time.ts:5` requires a safe integer before Date conversion and rejects invalid Date range. SQLite INTEGER affinity can still contain REAL or nonnumeric TEXT without a type CHECK. Date decoding first can truncate fractional milliseconds or reinterpret malformed text; a TypeScript annotation is not runtime validation.

SQL projections default to a no-op decoder (`node_modules/drizzle-orm/sql/sql.js:52`, `node_modules/drizzle-orm/sql/sql.js:255`). The sql<number | null> generic does not coerce values. `node_modules/drizzle-orm/utils.js:7` selects this decoder and separately preserves null. Thus malformed storage reaches the existing validator unchanged; no first-branch Date decoder may leak into UNION mapping.

Epoch 0 is real input, not absence. first_solved_at null is intentionally excluded. The other three timestamp columns are NOT NULL in valid schema; do not weaken required-column constraints solely to test impossible null fixtures. Use optional null and malformed non-null values for this contract.

`schema.ts:268` deliberately retains nullable TEXT primary keys. The delete input remains string; no nullable input or public DTO policy is required:

- A stored null parent ID matches no string, including empty string; leave it alone.
- Empty and quoted/SQL-looking input IDs are literal bound values, not false/no-op or SQL syntax.
- Match child problem_id, not child primary key. Matching children with nullable own IDs still delete.
- Null submissions.problem_id/activity_events.problem_id rows do not match and remain; visits.problem_id is NOT NULL.
- For deliberate orphan fixtures, disable FK enforcement only during setup and re-enable before calling deletion. Preserve false/no-event/no-recompute despite child removal.

### Commit, savepoint and stats precision

`electron/shared/dataEvents.ts:33` buffers around synchronous invocation and discards on error. `node_modules/better-sqlite3/lib/methods/transaction.js:52` uses BEGIN/COMMIT at top level and SAVEPOINT/RELEASE when already in a transaction, including rollback on COMMIT failure. Preserve this controller.

At top level, the base deletion event follows native COMMIT. Stats events then follow separately, one per successful sorted day (`stats/recompute.ts:6`, `stats/recompute.ts:11`). Do not move stats into the deletion transaction or coalesce that event sequence.

Important: recompute is after this function's transaction invocation, not after every possible outer commit. Inside a correctly paired outer notification/native transaction, the inner invocation releases a savepoint; recompute then runs inside the caller's outer transaction and rolls back with it. Topics stay buffered until the outer wrapper succeeds. Preserve this distinction; do not invent an after-commit scheduler.

The helper does not detect arbitrary unwrapped external transactions. Nested tests must use the supported `withDataChangeTransaction(() => db.transaction(... )())` pairing. Fixing all unwrapped callers or adding connection-global hooks is outside this slice.

At top level, stats recomputation is not one all-days transaction. Dates are sorted; first thrown day stops iteration. If day two fails, day one is already persisted/notified, day two remains unchanged and day three is not attempted. Delete stays committed/true; one warning contains the full affected date set.

### Regression plan

Retain existing `tests/db/deleteProblem.test.ts:148`, `tests/db/deleteProblem.test.ts:203` and `tests/db/deleteProblem.test.ts:231`. Add differential cases using the A2c harness pattern (`tests/db/problemUpsert.test.ts:87`). An optional `tests/db/problem-delete-oracle.ts` can preserve original SQL and surrounding behavior without retaining a raw production alternative.

Run old/new implementations on separately initialized identical real SQLite databases. Freeze Date for comparable stats timestamps. Compare boolean or thrown error, deterministically ordered raw rows, warnings, event order and subscriber-observed inTransaction. Unsubscribe/close in finally; do not mock the ORM as proof of equivalence.

| Case | Required outcome |
| --- | --- |
| Four sources on separate days | Recompute every affected day from retained facts, reset stale activity-only day, preserve unrelated dates. |
| Duplicate instants and same-day different instants | Preserve UNION and day Set behavior; one stats event per unique sorted day. |
| Local midnight, epoch 0, negative valid ms | Derive boundaries with localDayBounds/toLocalDay; no UTC or fixed-24h assumptions. |
| Activity local_day disagrees with occurred_at | Recompute by instant, not stored date label. |
| Tombstones, optional solved timestamp null | No new filters; null adds no date; parent with zero affected dates still deletes/notifies. |
| Fractional, nonnumeric TEXT, unsafe integer, out-of-Date-range instant | Both implementations reject before any delete/event; seed raw SQL rather than Date encoder. |
| Nullable/empty/quoted IDs | Preserve literal equality and null distinctions; matching children delete regardless of own nullable ID. |
| Missing parent and matching orphans | Children delete but return false, no notification/recompute/warning; malformed child time still fails preflight. |
| Notes and unrelated relations | No new cascade or deletion scope. |
| Child failure and final-parent failure | Earlier DELETEs all roll back; no stats/base events or recompute; original errors propagate. |
| Real COMMIT failure | Callback reaches parent deletion, deferred FK fails commit, all rows retained, no events, transaction closed. |
| Successful top-level call | Base topics observed with inTransaction=false, then separate sorted-day stats events; synchronous boolean. |
| Successful nested call | No event before outer commit; outer merges base/stats topics; stats visible inside outer transaction. |
| Outer callback rollback/outer COMMIT failure | Both deletion and stats roll back; no buffered events escape. |
| Caught inner savepoint failure with outer work | Failed delete changes/topics vanish; unrelated outer work/topics commit. Also test successful delete followed by rollback of caller savepoint. |
| Second sorted-day stats failure | Delete true; first-day stats/event survive; failed/later days unchanged; full sorted dates in one warning. |
| Close/reinitialize | Next call follows new connection, with no cached adapter or created Drizzle ledger. |

For a direct delete COMMIT failure, create a test-only table with `problem_id TEXT REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED`, seed a valid reference to target, then delete. An AFTER DELETE observation function/trigger can prove statement completion before commit failure. Do not just mock transaction() to throw. Existing actual deferred-FK patterns: `dataChangeNotifications.test.ts:244`, `problemUpsert.test.ts:429`.

### Files to touch and verification

- `algo-electron/electron/db/repositories/problem/mutations.ts`: delete query construction and imports only, preserving upsert/control flow.
- `algo-electron/tests/db/deleteProblem.test.ts`: differential/behavioral regressions; optional narrowly named original-SQL helper.
- `algo-electron/tests/db/repositories.test.ts`: add deleteProblem import and small native success plus rollback/commit-failure cases in the existing harness.
- `algo-electron/tests/verify.mjs`: add deleteProblem.test.ts to dbVitestFiles; include dataChangeNotifications.test.ts as the focused R4 guard. Coordinate this shared file with parent after safety sync.
- `algo-electron/electron/db/repositories/problem/README.md` and task/spec follow-up: record only the verified bounded slice. Spec edits belong to coordinator/implement workflow, not this researcher.

At inspection, `tests/verify.mjs:21` includes A2a/b/c but omits deletion and dataChangeNotifications. `tests/verify.mjs:164` already runs repositories.test.ts in Electron Node mode; `vitest.config.ts:20` excludes it from Vitest. Plain vitest run tests/db does not validate native ABI. test:db must select the focused cases and run its native harness.

Later verification, not performed here: focused deletion/upsert/notification cases; application and test TypeScript checks; lint/architecture; test:db including native; then existing full task quality/build/UI gates. No release version/build is required specifically by A2d.

Do not edit schema/client, frozen migrations, safety synchronization modules, DTO/types, IPC/preload/renderer behavior, repository layout, package version or release assets. Existing DB-layer SQL is already inside the architectural boundary (`tests/architecture/check-architecture.mjs:393`); no budget increase or exemption is needed.

### External references and versions

- `algo-electron/package.json:68`: better-sqlite3 13.0.3; `algo-electron/package.json:69`: drizzle-orm 0.45.4; drizzle-kit remains 0.31.11 and is not used for this rewrite.
- `node_modules/drizzle-orm/sqlite-core/query-builders/select.d.ts:233`: compatible typed union result fields. `select.js:295` checks matching selected key order; `select.js:332` is UNION, not UNION ALL; `select.js:640` is synchronous all().
- `node_modules/drizzle-orm/sqlite-core/query-builders/delete.js:101`: run() delegates to prepared query; `node_modules/drizzle-orm/better-sqlite3/session.js:69` returns native stmt.run result with changes.
- `node_modules/drizzle-orm/sql/expressions/conditions.js:14`: eq binds through the column encoder; no SQL string interpolation.
- `node_modules/better-sqlite3/lib/methods/transaction.js:52`: existing actual COMMIT and savepoint behavior.
- Official background: https://orm.drizzle.team/docs/set-operations#union and https://orm.drizzle.team/docs/delete . These pages were not fetched; API behavior was inspected in pinned local source.

### Related specs

- `.trellis/spec/project/drizzle-adoption.md`: bounded slices, supplied connection, nullable legacy keys and timestamp/event equivalence.
- `.trellis/spec/project/data-refresh.md:36`: scope includes actual commit; nested success merges, failure discards; topics contain no row data.
- `.trellis/spec/project/unix-millisecond-time.md`: integer milliseconds, zero and local bounds; reject invalid values, do not normalize them.
- `.trellis/spec/project/regression-checks.md`: main-only database boundary and native runner verification.
- `.trellis/spec/backend/database.md`, `.trellis/spec/backend/quality.md`, `.trellis/spec/shared/typescript.md`, `.trellis/spec/shared/code-quality.md`: typed synchronous repository and quality rules. Specific exact-equivalence rules override generic examples suggesting added filters/defaults.
- `.trellis/workflow.md`, task prd/design/implement: safety synchronization first, then independently checked A2d; no premature phase completion.

## Caveats / Not Found

- Preparation only: no application/test/spec edits, tests, database opens, builds, Git operations or release actions. Only this research file was written.
- Core/parent are concurrently changing safety code and metadata. Anchors are snapshot references; recheck ownership and registration after that gate, never overwrite concurrent work.
- The query sketch is source-inspected, not typechecked/executed. Generated compound SQL, raw decoder behavior and native outcomes require differential tests.
- Nullable stored IDs do not require a public nullable-ID policy here. DTO-returning query slices remain separate.
- Top-level stats work is post-COMMIT; nested stats is post-inner-savepoint and still inside its caller's outer transaction. Do not promise a universal after-commit hook.
