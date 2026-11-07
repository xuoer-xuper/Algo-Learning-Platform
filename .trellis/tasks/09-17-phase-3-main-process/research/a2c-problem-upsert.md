# Research: A2c Problem Upsert Without A Null-ID Policy Change

- Date: 2026-11-07.
- Scope: planning only after A2b implementation; parent owns delivery and authorizes any next implementation.
- Paths below are relative to `algo-electron/` unless explicitly prefixed `.trellis/`.
- Only this research file was written. No application/test edits, databases, native/UI/build suites, commits or pushes.

## 1. Conclusion

**Yes: retain the existing null-ID UPDATE no-op and notification through a typed bound SQL parameter, without tightening the schema or changing ID policy.**

Use:

```ts
.where(eq(problems.id, sql.param(existing.id)))
```

The ORM SELECT infers `existing.id` as `string | null`. Installed `eq` accepts a `SQLWrapper` RHS, and `sql.param` returns a `Param` implementing `SQLWrapper`; this avoids the direct nullable-RHS type restriction without a cast. It generates `"problems"."id" = ?` with a null driver parameter, preserving SQL's unknown/false predicate. It does **not** produce `IS NULL` or substitute an empty ID.

Keep the real UPDATE invocation even when ID is null, and emit `['problems', 'stats']` after it returns just as today. Do not switch notification to `result.changes > 0`: this specific preexisting no-op notification is part of the requested parity contract, not a new recommended convention.

This replaces three statements in `electron/db/repositories/problem/mutations.ts:15`: the existence/title SELECT, existing-row UPDATE and fresh-row INSERT. At runtime it remains SELECT plus one write, not three executions. `deleteProblem` and all other queries remain untouched.

### Why a checked early-return branch is weaker

`if (existing.id === null) { emitDataChanged(...); return }` preserves successful data/event outcomes but skips preparing/running the original UPDATE. That can hide an existing read-only/locked/schema error and emit an event where old code would throw. `.where(isNull(problems.id))` is worse: it can update every null-ID row. Changing the UPDATE to platform/key, using conflict-upsert, repairing the ID, or filtering the lookup likewise changes behavior.

An explicit null branch retaining a real `WHERE id = NULL` UPDATE could work, but duplicates a query path unnecessarily. A bound `sql.param(existing.id)` is smaller and preserves null, empty and ordinary IDs uniformly.

## 2. Installed API Evidence And Safe Probes

- `node_modules/drizzle-orm/sql/expressions/conditions.d.ts:4`: column overload accepts raw column data **or SQLWrapper**. Nullable column data is only included in the query result type, not the raw parameter type (`column.d.ts:65`). This explains why direct `eq(problems.id, existing.id)` is rejected while the bound wrapper is accepted.
- `node_modules/drizzle-orm/sql/sql.d.ts:124` and `sql/sql.d.ts:180`: `Param<TData,...>` implements `SQLWrapper`; `sql.param(value)` is generic and needs no column encoder for a plain nullable TEXT value.
- `node_modules/drizzle-orm/sql/expressions/conditions.js:14`: `bindIfParam` leaves an existing Param/SQLWrapper unchanged; `eq` emits `=`. It never converts null equality to `IS NULL`.
- `node_modules/drizzle-orm/sql/sql.js:137`: null Param values bypass the encoder and enter the driver parameter list as null. Strings remain bound, including quotes and empty strings; no `sql.raw` is needed.
- `node_modules/drizzle-orm/sqlite-core/columns/integer.js:65`: timestamp_ms Date input is encoded with `.getTime()`. Use a Date for direct ORM timestamp values, retaining numeric SQLite storage and epoch zero.
- `node_modules/drizzle-orm/better-sqlite3/session.js:22` and `better-sqlite3/session.js:69`: `.run()` prepares on the supplied native connection and delegates to native `stmt.run`; it does not swallow errors or implicitly wrap the write in another transaction.

Two read-only probes were run without opening SQLite or writing/emitting any file:

1. `drizzle.mock()` plus an in-memory sqliteTable and `.toSQL()` confirmed UPDATE generates `id = ?` for IDs null, `''` and `"id'quoted"`. Null remained the final bound null parameter; Date(0) and Date(1768443630123) encoded as integers 0 and 1768443630123. CASE/COALESCE values were parameter-bound.
2. A TypeScript compiler-host source override (virtual file only, `noEmit: true`, strict mode) checked the proposed UPDATE against the **actual** `src/main/db/client.ts` and `schema.ts`, including `sql.param(existing.id)`, typed CASE/COALESCE and Date fields. It passed with no diagnostics.

These are type/query-generation evidence, **not execution parity proof**. The real-SQLite characterization matrix below is still required during implementation.

## 3. Minimal Implementation Shape

Keep current native lifecycle ownership and function shape:

1. Inside `upsertProblem`, wrap `getDb()` with `createDrizzleClient`. Keep no module-level ORM instance, cache, new connection, transaction, async return or DTO layer.
2. Call `nowMillis()` once in the existing position before SELECT; represent that instant as one Date for writes. Do not call `new Date()` repeatedly or use timestamp seconds.
3. Select only `{ id: problems.id, title: problems.title }` by exact platform/key equality, with **no deleted-at filter**. Inferred row type replaces `ExistingProblemTitleRow` and its assertion.
4. Retain current title validation/trimming and `shouldReplaceScrapedTitle` call unchanged.
5. For an existing row, use a normal UPDATE with all six existing SET targets and bound expressions:

```ts
db.update(problems)
  .set({
    canonical_url: identity.canonicalUrl,
    contest_id: sql<
      string | null
    >`coalesce(${identity.contestId ?? null}, ${problems.contest_id})`,
    problem_index: sql<
      string | null
    >`coalesce(${identity.problemIndex ?? null}, ${problems.problem_index})`,
    title: sql<
      string | null
    >`case when ${shouldUpdateTitle ? 1 : 0} then ${title} else ${problems.title} end`,
    last_visited_at: timestamp,
    updated_at: timestamp,
  })
  // SQL equality with a bound null must remain a no-op, not IS NULL.
  .where(eq(problems.id, sql.param(existing.id)))
  .run();
emitDataChanged(["problems", "stats"]);
return;
```

Here `timestamp` is `new Date(nowMillis())` captured once, and `title` / `shouldUpdateTitle` retain existing logic. A `sql<string | null>` expression states its write expression type; it is not a cast or Date-to-number assertion.

6. For a new row, `.insert(problems).values(...).run()` supplies the same 14 original columns: fresh `crypto.randomUUID()`, platform/key/canonical URL, validated title, explicit `'visited'`, contest/index/source values with `?? null`, and the same Date for first-seen/last-visited/created/updated. Keep source fields insert-only. Emit unchanged topics after success and return void.

Drizzle emits INSERT values in schema order and fills omitted nullable columns with null / mapped defaults (`sqlite-core/dialect.js:336`). The current `problems` schema has no custom runtime defaults/on-update functions; its only relevant default is status `'unknown'`, which this insert explicitly overrides with `'visited'`. Do not add defaults or modify schema to simplify the mapping.

### Why not omit unchanged SET fields?

Using `.set({ contest_id: incoming ?? undefined, title: shouldUpdate ? title : undefined })` is row-value-equivalent for ordinary data but changes the UPDATE's target-column set. SQLite `UPDATE OF title` / `UPDATE OF contest_id` triggers are sensitive to presence in SET, even if the value is unchanged. Retaining the SQL CASE/COALESCE expressions preserves that observable contract and the current single UPDATE.

`sql` fragments must contain static SQL with bound inputs and schema column references. Do not hand-build SQL strings, wrap an entire native query in `sql.raw`, or generalize this into a repository abstraction.

## 4. Exact Compatibility Checklist

### Existing-row path

- Lookup includes active and deleted rows; matching key is globally unique regardless of tombstone. Preserve case-sensitive exact platform/key equality.
- Null ID: SELECT finds row; UPDATE `id = NULL` changes no row; row data remains byte-for-byte unchanged; no new UUID is generated or inserted; one ordinary post-statement problems/stats notification is still emitted if UPDATE succeeds.
- Empty-string ID: UPDATE matches it. Never use `if (!existing.id)` or `existing.id || ...`.
- Normal ID: only canonical URL, contest ID, problem index, title, last-visit and updated-at are SET. Keep first-seen/created/first-solved/status/source/difficulty/tags/extra/deleted columns unchanged.
- Missing/null contest/index retain stored values; `''` overwrites; string values replace. `ProblemIdentity` types optional strings, not null, but the existing runtime `?? null` behavior can be characterized with a JSON-decoded legacy input in the test only, without weakening production types.
- Valid incoming titles are trimmed. Invalid/placeholder/overlong incoming title never erases valid text. Empty/bad existing title is replaceable; valid CJK incoming can replace non-CJK; valid English cannot replace existing valid CJK. Both-English valid titles generally retain the existing one.
- Tombstone updates do not clear `deleted_at`, including timestamp zero. Source fields are not backfilled on update.
- Return stays undefined/void. Emit after native statement success, even when a null ID or identical field values cause no meaningful change. Prepare/run failure propagates and emits nothing.

### New-row path

- Exactly one new UUID; same platform/key uniqueness and explicit visited status; absent optional fields become null.
- All four written instants have identical integer-millisecond values; epoch 0 and subsecond values survive.
- No conflict-upsert, OR IGNORE, title overwrite shortcut, schema tightening or ID repair. Native constraint/trigger failure remains failure.

### Transactions and R4

- Keep the same underlying connection so `startProblemVisit` can call upsert inside its native transaction (`problemVisitRepository.ts:29`). Do not introduce an independent inner transaction.
- `emitDataChanged` already buffers when an outer `withDataChangeTransaction` scope exists (`electron/shared/dataEvents.ts:8`). Preserve actual-commit scope around the outer transaction, not only the callback (`dataEvents.ts:33`).
- Null-ID no-op notification also buffers/discards with that scope. An outer rollback or deferred FK COMMIT failure publishes nothing; a caught inner savepoint rollback discards only the inner topics.
- Do not wrap autocommit SubmissionBatchWriter execution in a new whole-batch transaction or notification scope. Earlier committed writes must retain their events even if a later item fails (`SubmissionBatchWriter.ts:39`, `dataChangeNotifications.test.ts:280`).
- Standalone upsert emits once after successful INSERT/UPDATE. Preserve subscriber-error isolation; do not catch and reinterpret database errors.

## 5. Real Characterization Tests To Add Before/With Conversion

Recommend `tests/db/problemUpsert.test.ts`, temporary/in-memory actual post-030 SQLite, a frozen millisecond clock and scoped deterministic `crypto.randomUUID` spy for reproducible fresh IDs. Use raw SQL reads for assertions, not ORM reads that could repeat the same mapping bug. No users' databases or frozen migration changes.

For strongest parity, run the copied **original three-statement function** as a test-only oracle on a separate equally seeded temporary database, using the same input/clock/UUID and independently captured notifications; compare full stored rows and notification order. Restore spies/subscriptions in teardown. Do not leave a second production implementation or permanent feature switch.

| Case                               | Required assertion                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh minimal identity             | Undefined return; one UUID row, visited status, optional nulls, four equal INTEGER timestamps; exactly problems/stats topics.                                                                                                                                                    |
| Clock 0 and millisecond value      | Raw `typeof(...)='integer'`; exact 0 or chosen millisecond across all written columns, no seconds/ISO conversion.                                                                                                                                                                |
| Full optional identity             | All insert-only source fields and contest/index persisted; title trimmed.                                                                                                                                                                                                        |
| Duplicate key normal ID            | One row only; canonical URL/visit/update change; UUID generator not called again; preserved original first-seen/created/status/first-solved/source/extra values.                                                                                                                 |
| Title matrix                       | Null/bad old title replaced; bad or overlong new title ignored; Chinese replaces English; English does not replace Chinese; ordinary valid English does not overwrite another valid English. Existing title-validation unit tests remain unchanged.                              |
| Contest/index retention            | Omitted values retain, `''` explicitly clears to empty, provided string replaces; if covering runtime null, construct it only as test data without assertions/production type widening.                                                                                          |
| Soft-deleted key (0 and positive)  | Original row updated but tombstone survives; no insert/resurrection; notification behavior unchanged.                                                                                                                                                                            |
| Null-ID key                        | Seed at least two unrelated null-ID rows; full snapshots unchanged after call, no UUID generation/insertion, exactly one ordinary notification; changing WHERE to IS NULL must make the test fail.                                                                               |
| Empty and quoted IDs               | Empty ID updates normally; quote-bearing ID stays bound and updates only that row.                                                                                                                                                                                               |
| All-six SET list                   | Install test-only UPDATE OF title/contest_id/problem_index audit triggers; a title-retain/absent-contest update must still fire the same triggers as the original SQL. Do not assert statement text alone.                                                                       |
| Null-ID read-only failure          | Set `PRAGMA query_only=ON` after seeding the null-ID match; original UPDATE and new UPDATE both reject, no event. This distinguishes actual bound-null UPDATE from an early-return no-op. Confirm with the oracle on the installed SQLite rather than assuming the error timing. |
| Insert/update failure              | Abort via synthetic BEFORE INSERT/UPDATE trigger; exception propagates, no event and no unintended row changes. Add a real missing-SET-column/schema error if needed to pin no-op preparation.                                                                                   |
| Outer commit success               | Within real `withDataChangeTransaction(() => native.transaction(... )())`, observe no callbacks inside, exactly one combined event after native `inTransaction` is false.                                                                                                        |
| Outer callback/COMMIT failure      | Upsert then throw or violate a DEFERRABLE FK: data rolls back and no events; distinguish callback success followed by COMMIT failure.                                                                                                                                            |
| Nested savepoint and null-ID no-op | Caught inner rollback discards its problems/stats topics; outer committed unrelated topic survives. Null-ID no-op topics must obey the same buffering.                                                                                                                           |
| Lifecycle                          | Close/reinitialize and upsert again uses current connection; no module-level cached adapter or new database/ledger.                                                                                                                                                              |

Synthetic UPDATE triggers belong only to temporary characterization DBs; production A1 baseline validation continues rejecting unknown persistent triggers. Tests use the synchronous existing test helper, not a relaxation of production migration validation.

Add the new file explicitly to `tests/verify.mjs` `dbVitestFiles`. Its focused list does not implicitly cover every `tests/db` file. Add a narrow real-Electron case in `tests/db/repositories.test.ts` for null-ID UPDATE/no-op+event and a Date-backed normal write; parent serializes native execution.

## 6. Existing Tests And Mocks Impact

No existing test found that drives the real `upsertProblem` through a fake native `prepare()` implementation. Do not add such a mock to make the ORM conversion pass.

- `tests/tracking/problemTitleTrackingPageEvents.test.ts:11` mocks the **facade function** `upsertProblem`; signature stays void and its replacement is unchanged.
- `tests/integration/problemTitleExtractionWiring.test.ts:40` also replaces the facade function to observe parsed identity. It should not need any Drizzle mock or expectation change.
- `tests/submissions/submissionBatchWriter.test.ts:18` injects an upsert callback into writer dependencies; no real repository SQL is executed. Preserve the injected API and leave these mocks unchanged.
- `tests/coach/contextGatherer.test.ts:41` and `tests/coach/llmHintService.test.ts:131` mock other facade reads, not this write. No expected edits.
- `tests/db/databaseInitialization.test.ts:12` has a FakeDatabase lacking Drizzle `.raw()`, but only drives connection initialization with explicit legacy migrations and does not call upsert. Do not expand that fake or change safe-initializer seams for this slice.
- `tests/db/dataChangeNotifications.test.ts` uses actual SQLite; retain the entire suite, especially visit creation/rollback (line 143), failed native COMMIT (line 244), caught inner rollback (line 262), and partial batch failure (line 280). It currently does not specifically pin null-ID upsert; new tests must.
- `tests/db/repositories.test.ts:482` covers duplicate/title/contest behavior under real Electron. `tests/integration/learningDataTimestampCompatibility.test.ts` seeds via real upsert; `tests/db/backupImport.test.ts`, `tests/ai/traceability.test.ts`, `tests/coach/coachOrchestratorLifecycle.test.ts` and `tests/ui/dataRefreshMain.ts:54` exercise real paths transitively. Keep them as integration coverage, not replacement targets.
- `tests/parsers/titleValidation.test.ts` already pins placeholder and CJK quality rules; reuse those functions, do not duplicate or rewrite their production policy.

## 7. Proposed Scope And Gate

If approved after A2b/diagnostic delivery:

- Edit only `upsertProblem` and imports in `problem/mutations.ts`; remove the now-unused `ExistingProblemTitleRow` interface. Do not touch `deleteProblem`.
- Add new upsert characterization tests, one narrow native ABI case, focused-runner entry and problem README notes. Parent owns task/spec/docs.
- No generic DTO conversion, nullable-ID policy migration, query cache, schema change, transaction redesign or directory move.
- Run both typechecks, targeted/full lint as assigned, new tests plus `dataChangeNotifications`, `titleValidation`, `learningDataTimestampCompatibility`, and existing lookup/overview/client regressions. Parent owns `test:db`, native tests, `test:all`, build and CI.
- This plan preserves the specified behavioral contract on the accepted schema, including the awkward null-ID no-op notification. It does not claim byte-identical generated SQL, identical query plans, compatibility with arbitrary future schema/default changes, or completed runtime verification. Real characterization and native gates remain mandatory.
