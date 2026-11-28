# Research: A3b Submission Writes

- Query: Executable Drizzle design for upsertSubmission, updateFirstAc and recomputeProblemSubmissionState; explicit native behavior and bounded acceptance.
- Scope: internal code/spec/installed-library inspection plus synthetic in-memory SQL, tracing-adapter and virtual TypeScript probes.
- Date: 2026-11-20

## Findings

### Recommended bounded split

Do not combine all three writes into one broad conversion. **A3b1: upsertSubmission only**, with independent oracle covering duplicate/read-only control flow, delayed UUID, raw times, insert triggers/errors and external transaction notifications. **A3b2: updateFirstAc + recomputeProblemSubmissionState**, which share problem-state semantics and import transaction coverage. Neither slice changes A3a queries/types/shared schemas, SubmissionBatchWriter/import orchestration, schema/migrations, transactions, time validators, directory layout or release behavior.

A3b1 is implementable with supported public Drizzle builders, but its acceptance boundary must be stated honestly: equivalent rows/events/native errors on the validated physical post-030 tables and supported diagnostic fixtures, NOT universal equivalence for altered defaults, renamed omitted columns or INSTEAD OF INSERT views. Drizzle always names16 insert columns whereas legacy names14. Synthetic counterexamples prove that distinction cannot be hidden by testing only happy paths. Production baseline validation rejects default/column drift and views/triggers; test-only ordinary table triggers remain useful behavior observers.

If strict equivalence on every arbitrary schema replacement is required, keep the legacy INSERT and label its conversion deferred. Do not fake a partial schema, mutate schema columns, use private dialect/session internals or disguise full raw SQL as an ORM migration. A supported builder has no public insert-column-subset method.

### Important new findings

1. **Prepare INSERT before UUID generation.** Original `db.prepare(sql).run(crypto.randomUUID(), ...)` prepares before evaluating run arguments. `.values({id:crypto.randomUUID(),...}).run()` changes that ordering on prepare failures. Use all14 named placeholders, call `.prepare()` only after duplicate miss, then `.run({...})` whose first value is the UUID. Missing target column should produce UUID count0; run-time trigger/FK/readonly failure should produce count1 where native preparation succeeds.
2. **Successful run is not changes>0 for insertion.** A BEFORE INSERT RAISE(IGNORE), or an INSTEAD OF INSERT view, can return changes0. Legacy still returns true and emits submissions/problems/stats after successful run. Do not gate upsert notification/boolean on changes.
3. **UPDATE .set does not accept a bare Placeholder in its TS type.** Use SQL-wrapped placeholders for ALL dynamic SET values, including status: `sql`${sql.placeholder('status')}``. Bare timestamp placeholders also invoke Date encoding at bind time and fail for numbers/null. SQL wrappers preserve raw numbers/null without fake casts.
4. **Generic orm.run(sql) wraps native failures in DrizzleError.** Installed typed insert/update `.prepare().run()` preserve native errors. Using whole-query raw SQL via orm.run to recover14 columns changes error name/message/code unless adding an unwanted unwrapping layer.
5. **Recompute needs three explicit .prepare() calls before Set/input iteration.** A lazy builder alone loses original empty-input schema failures. Empty read-only recompute should prepare successfully but perform no write; a no-match UPDATE run is still a write and can fail readonly.
6. **Aggregate .get is optional in the public TS API.** Even COUNT(*) without GROUP BY is typed as possibly undefined. Use an explicit impossible-state throw after .get if needed; no non-null assertion, cast or fallback zero/null that silently invents state. SQLite guarantees one aggregate row on successful real execution.

### Executable A3b1 construction

Preserve getDb then nowMillis ordering; wrapping that same handle has no lifecycle side effects. Select ONLY submissions.id using two exact bound predicates, no deleted_at filter. Return false on row presence, not ID truthiness. A NULL/empty-ID duplicate must skip UUID, all INSERT preparation and notifications, even if unused INSERT columns are missing or query_only is enabled. A lookup error throws before UUID.

On a miss, prepare one typed INSERT with placeholders for exactly the14 original supplied values; Drizzle itself will add default0/NULL for the other two. A schematic supported form is:

```ts
const insert = orm.insert(submissions).values({
  id: sql.placeholder('id'),
  problem_id: sql.placeholder('problemId'),
  platform: sql.placeholder('platform'),
  platform_submission_id: sql.placeholder('platformSubmissionId'),
  verdict: sql.placeholder('verdict'),
  raw_verdict: sql.placeholder('rawVerdict'),
  language: sql.placeholder('language'),
  submitted_at: sql`${sql.placeholder('submittedAt')}`,
  runtime_ms: sql.placeholder('runtimeMs'),
  memory_kb: sql.placeholder('memoryKb'),
  source_url: sql.placeholder('sourceUrl'),
  raw_json: sql.placeholder('rawJson'),
  created_at: sql`${sql.placeholder('now')}`,
  updated_at: sql`${sql.placeholder('now')}`,
}).prepare()
insert.run({
  id: crypto.randomUUID(),
  problemId: data.problemId ?? null,
  platform: data.platform,
  platformSubmissionId: data.platformSubmissionId,
  verdict: data.verdict,
  rawVerdict: data.rawVerdict ?? null,
  language: data.language ?? null,
  submittedAt: data.submittedAt,
  runtimeMs: data.runtimeMs ?? null,
  memoryKb: data.memoryKb ?? null,
  sourceUrl: data.sourceUrl ?? null,
  rawJson: data.rawJson ?? null,
  now,
})
emitDataChanged(['submissions', 'problems', 'stats'])
return true
```

Virtual strict compilation against actual schema/pinned package accepts this without any/non-null assertion/type casts. Text/number placeholders are accepted by INSERT.values; timestamp placeholders need raw SQL wrapping to bypass column encoders. No Date conversion, validation, conflict clause, RETURNING, generated-key inspection, cache or new transaction. Time capture remains before lookup; both write times use it. Original property evaluation follows native prepare; delaying every dynamic insert value to run preserves that boundary as well as UUID timing.

Do not generalize this into a new helper/framework. Preserve optional values with ?? null, including0/empty strings. Under a failed statement no event occurs, but a FAIL trigger can retain earlier trigger-side effects; do not promise rollback of all effects absent an owning transaction. A RAISE(IGNORE) trigger may retain effects and yields successful run/true/event even with no inserted row. Existing data-refresh generic no-op guidance needs an explicit narrow legacy exception if this diagnostic behavior is accepted, not a behavioral fix hidden in conversion.

### INSERT14 versus generated16: evidence and boundary

Real schema/default evidence: src/main/db/schema.ts:446 and drizzle/0000_baseline.sql:297. is_first_ac is NOT NULL DEFAULT0; deleted_at is nullable without a default. sqlite-core/dialect.js:344 iterates all enabled schema columns, ignoring the caller's omission as a column-list restriction. No dynamic default/onUpdate functions exist on these submission columns.

Synthetic node:sqlite comparisons, identical fresh :memory: databases:

| Fixture | Original14 vs generated16 |
| --- | --- |
| Exact baseline; submittedAt1.75/now0 | Identical full rows/default0/NULL/raw numeric time. |
| BEFORE INSERT audit trigger on ordinary baseline table | Identical NEW.is_first_ac=0, NEW.deleted_at=null, NEW.submitted_at=1.75 and UUID. |
| RAISE(IGNORE) | Both run with changes0; no row. Legacy caller still returns true/emits. |
| RAISE(ABORT,'rejected insert') | Same synthetic run-time error; UUID consumed once. |
| Rename raw_verdict, an original explicit target | Both fail preparation before UUID. |
| Rename is_first_ac, an omitted original target | Original still inserts using renamed column default; generated16 fails preparation. NOT equivalent. |
| Change physical is_first_ac DEFAULT7/deleted_at DEFAULT9 | Original gets7/9; generated16 forces0/null. NOT equivalent. |
| Replace table with full-column view plus INSTEAD OF INSERT audit | Original NEW.is_first_ac is null; generated16 is0. NOT equivalent. |

There is no INSERT OF column-list trigger syntax analogous to UPDATE OF. Ordinary baseline row triggers see equivalent NEW values; they do not inherently see a supplied-column mask. Views differ because omitted view columns have NULL, not the underlying table's default.

Production schema-validation.ts:200 inspects tables/views/triggers and rejects unsupported views/triggers; at232 it compares physical column defaults/layout/etc to baseline. Thus altered defaults, renamed omitted columns and view replacements are outside the declared production schema. Keep those counterexamples documented, not silently excluded while claiming unrestricted native parity. Do not relax production schema validation or add runtime per-write introspection/fallback just to broaden this slice.

If the implementation owner rejects this bounded baseline policy, do not migrate INSERT yet. Keeping raw INSERT temporarily is preferable to a shadow14-column sqliteTable, private API surgery, or generic orm.run wrapping errors.

### Executable A3b2: updateFirstAc

Keep control flow in electron/db/repositories/submission/firstAc.ts:7: current native handle, one nowMillis, parent lookup, AC lookup, conditional actual UPDATE, then dates. Raw projections are `sql<number | null>`${problems.first_solved_at}`` and `sql<number>`${submissions.submitted_at}``; no Date/Number decoder. Preserve exactly AC literal, submitted_at ASC LIMIT1, tombstones, no parent-absence shortcut and no tie-break.

If an AC row exists, use an actual synchronous update builder with the same three SET targets:

```ts
const result = orm.update(problems).set({
  status: sql`'solved'`,
  first_solved_at: sql`${firstAc.submitted_at}`,
  updated_at: sql`${now}`,
}).where(and(
  eq(problems.id, problemId),
  or(isNull(problems.first_solved_at),
    gt(problems.first_solved_at, sql`${firstAc.submitted_at}`)),
)).run()
if (result.changes > 0) emitDataChanged(['problems', 'stats'])
```

The SQL fragment on the timestamp RHS prevents Date encoding while retaining SQLite INTEGER affinity/comparison rules. NULL/empty parent IDs are not fabricated; bound problemId equality stays unchanged. Missing parent still queries submissions and, if an orphan AC exists, attempts UPDATE and can return its day despite no parent row. Do not skip no-match writes: readonly/schema errors can occur. With no AC, do not prepare UPDATE at all (including missing updated_at diagnostics).

The previousDay/nextDay Set logic stays outside and after the SQL block exactly as before. It reports both old first-solve date and earliest AC date even if stored first_solved_at is earlier and unchanged. No-AC still returns old parent date. Date conversion failures are caught by localDayFromTimestamp; fractional, TEXT, out-of-Date-range or unsafe stored values can be used raw in SQL but contribute no affected day. Public input validation is not being relaxed. No new transaction, rollback or error catch.

### Executable A3b2: recomputeProblemSubmissionState

Preserve getDb/now then eager preparation order at firstAc.ts:50. Build/prepare parent SELECT, aggregate SELECT and UPDATE in that order BEFORE `new Set(problemIds)`. Named placeholders are local per invocation, not a global cache. A tracing adapter verified three immediate native prepare calls with no run/get. Empty input still prepares all three; a throwing iterator runs only after successful preparation and before any per-ID lookup/write because Set is eagerly constructed.

```ts
const findProblem = orm.select({
  status: problems.status,
  first_solved_at: sql<number | null>`${problems.first_solved_at}`,
}).from(problems)
  .where(eq(problems.id, sql.placeholder('problemId'))).prepare()
const aggregate = orm.select({
  total: sql<number>`COUNT(*)`,
  first_ac: sql<number | null>`MIN(CASE WHEN ${submissions.verdict} = 'AC'
    THEN ${submissions.submitted_at} END)`,
}).from(submissions)
  .where(eq(submissions.problem_id, sql.placeholder('problemId'))).prepare()
const update = orm.update(problems).set({
  status: sql`${sql.placeholder('status')}`,
  first_solved_at: sql`${sql.placeholder('firstAc')}`,
  updated_at: sql`${sql.placeholder('now')}`,
}).where(and(
  eq(problems.id, sql.placeholder('problemId')),
  or(sql`${problems.status} IS NOT ${sql.placeholder('status')}`,
    sql`${problems.first_solved_at} IS NOT ${sql.placeholder('firstAc')}`),
)).prepare()
```

Inside unchanged first-occurrence Set iteration: findProblem.get({problemId}); skip only missing parent. Then aggregate.get({problemId}). Drizzle types this possibly undefined despite SQL's guaranteed aggregate row: an explicit `if (row === undefined) throw new Error(...)` is the honest internal invariant guard if required. Do not return0/null, skip the parent or use `!`/casts. The guard is unreachable after a successful real COUNT/MIN query, including empty submission sets; test that fact rather than inventing a missing-row behavior.

Derive status exactly: nonnull first_ac -> solved; total>0 -> attempted; no submissions -> unknown only if prior unknown, else visited. Execute `update.run({status, firstAc: row.first_ac, now, problemId})` even if values appear unchanged in JS. Its generated bind order was verified as status,firstAc,now,problemId,status,firstAc. The unchanged null-safe IS NOT conditions determine changes. Emit problems/stats only changes>0. Keep old/new date Set insertions for every existing parent including no-op and invalid-date omission. No active/deleted filters, COUNT(id), Date/Number decoder, new transaction or per-ID now capture.

Virtual TS probes: bare `status: sql.placeholder('status')` in UPDATE.set fails TS2322; wrapping it in SQL succeeds. Bare timestamp Placeholder wrapped by the timestamp column fails `value.getTime is not a function` with numeric input; SQL wrapper succeeds and binds null/1.75 verbatim. The complete builder shape plus explicit aggregate invariant check passed strict virtual compilation without casts.

Synthetic generated UPDATE versus original SQL matched row/change counts and all three UPDATE OF trigger audits for unchanged null, clearing epoch0, negative time,1.75,8640000000000001, diagnostic TEXT time, repeated TEXT no-op and a diagnostic nullable status. These are feasibility probes, not native acceptance.

### Failure ordering and transaction ownership

- upsert: getDb/now -> duplicate prepare/get -> duplicate return OR insert prepare -> UUID/argument evaluation -> native run -> event/true. No UUID on prepare failure; no event on throw. Duplicate short-circuit must not inspect unrelated missing columns.
- updateFirstAc: parent prepare/get -> AC prepare/get -> only-if-AC update prepare/run -> optional event -> date conversion. Missing parent does not short-circuit AC. Failure at any stage prevents later steps and day return. No-AC avoids write failures.
- recompute: three prepares -> entire Set construction -> per-ID parent lookup -> existing-only aggregate -> UPDATE -> optional event -> dates. A missing second/third statement column errors even on empty input before iterator evaluation. Empty query_only input can prepare successfully; readonly zero-match UPDATE run still errors.
- No function adds a transaction. SubmissionBatchWriter.ts:60 intentionally has autocommit partial success. If insertion commits then updateFirstAc fails, the inserted row/event remain; stats step may never run. recompute outside import can commit/notify earlier IDs before a later error.
- learningDataExport.ts:327 owns the real import transaction, recompute call at381, then withDataChangeTransaction around invocation at389. Keep that owner and native savepoints. Inside a correctly wrapped outer transaction, topics combine after successful COMMIT and disappear on rollback/COMMIT failure. An unwrapped external transaction does not gain post-commit semantics from this refactor.
- emitDataChanged synchronously calls guarded listeners (dataEvents.ts:8/17). Listener failures log and do not turn a committed write into failure. Listener reentrancy may observe/modify committed facts between stages; do not defer, merge or move autocommit event points. No record data enters event payloads.
- Trigger FAIL can preserve its preceding side effects while throwing; ABORT rolls back statement side effects; IGNORE can succeed with changes0 and retain side effects. Do not introduce rollback/retry/notification behavior to 'fix' these during conversion. Differential oracle compares actual state and event sequence.

### Exact validation-guard boundary

All following paths are relative to algo-electron/:

- src/main/db/schema-validation.ts:5 SchemaColumn includes name/type/notnull/dflt_value/pk/hidden. readTableSchema at126 reads full table_xinfo and preserves dflt_value, not a names-only approximation.
- schema-validation.ts:200 tables() reads main sqlite_schema table/view/trigger objects; at206 any non-table object throws 'Post-030 schema contains unsupported views or triggers'.
- schema-validation.ts:219 assertPost030Schema creates a separate expected memory DB from hash-verified baseline; at225 compares the object set;234/235 compare table layout/all column metadata;236/237 compare FK/CHECK, then indexes. These checks reject changed default7/default9, renamed omitted fields, generated-column/layout drift and view/trigger replacements.
- src/main/db/migrate.ts:98 inspectMigrationState reads known histories;109/110 invokes assertPost030Schema only after legacy baseline completion and while recorded Drizzle count<=1. With later migrations it currently checks integrity instead. Do not generalize this guard to future schemas without their own contracts.
- electron/db/connection.ts:127 production initDb uses safe async initialization at142. initDbAtPathWithMigrationSafety:188 loads default application resources at198 unless explicit test migrations override is supplied, validates legacy history at206 and inspects migration state at207. Synchronous initDbAtPath/test overrides do not prove the production guard ran.
- tests/db/drizzleMigrationValidation.test.ts:219 exercises unexpected column/generated metadata;230/231 view/trigger rejection;252 altered default;321 revalidation after baseline already recorded.

This is a startup/adoption validation boundary, not a per-write lock against arbitrary DDL on an already open handle. Tests deliberately install audit/abort triggers after initialization; this does not make application trigger support a production feature. A session mutated after validation can exhibit the documented14-vs16 differences. Research does not waive them: adoption must explicitly choose baseline-table scope, or retain the original INSERT. Do not alter validator/tests to hide the difference.

### Exact oracle and native test boundary

Freeze complete original function bodies independently in a new `tests/db/submission-writes-oracle.ts`, including prepare timing, getter/Set order, old SQL text, now capture, RAISE(IGNORE) success semantics and event/day control flow. Do not share new builder helpers/projections/state derivation with the oracle. Reuse only unchanged public time/event helpers if needed; never rewrite the oracle to match a new policy. Preserve native test database lifecycle ownership and clean listener/mocked-clock/UUID restoration.

For each implementation run against an independently initialized identical disposable baseline DB. Freeze now and deterministic UUID sequence. Capture:

- Return boolean/date array (including order), whole raw submissions/problems rows, typeof storage probes where useful, trigger audit rows and remaining inTransaction state.
- Each failure's native name/message/code, prepare-versus-run stage, UUID call count, now count and input iterator observations. No broad merely-throws check for a supposed exact error contract.
- Topic array/event order and inTransaction at listener time; events visible inside/outside wrapped transaction; no unrelated table/ledger/schema changes. Keep actual trace details diagnostic, not payload data.
- Lookups/events before a later failure, plus committed row/audit state after it. Error does not automatically imply no side effects (FAIL/IGNORE diagnostic triggers).

Suggested A3b1 differential cases:

| Area | Cases and expected baseline contract |
| --- | --- |
| Defaults/input values | Only required input; all optionals; nullish vs0/empty strings; raw submittedAt0,negative,1.75,Date-boundary+1,NaN/Infinity according to actual native bind/constraints; one captured now and UUID. |
| Key/duplicate | Case-sensitive literal platform/key with quotes/wildcards/backslash/Unicode; existing normal,NULL-ID,empty-ID,tombstoned rows return false without modification/event/UUID. |
| Short circuit | Duplicate with query_only and missing unused INSERT target still returns false. Broken lookup columns/table/closed connection throws before UUID. |
| Preparation | Nonduplicate renamed original target (raw_verdict or language) errors before UUID; malformed trigger body that fails prepare likewise. Use prepared placeholders to match this. |
| Run failure | query_only/FK violation/PK UUID collision/baseline unique constraint/BEFORE trigger ABORT throw with original identity/details and no repository event. Differentiate prepare-stage readonly if native driver reports it there. |
| Trigger observations | BEFORE/AFTER INSERT audit sees all16 identical values; RAISE(IGNORE) returns true/event despite changes0; FAIL/ABORT compare retained/rolled-back audit side effects. |
| Transaction | Single autocommit event after success; duplicate no event; two-call first succeeds second fails retains first row/event; wrapped outer commit combines topics; rollback and actual deferred-FK COMMIT failure suppress topics/restore owned changes. |
| Lifecycle | Close/reinit uses current connection; no extra adapter connection/cache; no migration ledger/query-side schema changes. |
| Boundary proof | Independent assertPost030Schema rejects default/omitted-column/view drift before production exposure. Record14-vs16 counterexamples rather than asserting equivalence for those fixtures. |

Suggested A3b2 differential cases:

| Area | Cases and expected contract |
| --- | --- |
| updateFirstAc branching | No parent/no AC; parent/no AC returns prior day; absent parent/orphan AC attempts UPDATE; wrong-case verdict does not count; tombstones count; stored earlier/equal/later/null first-solve; no status correction when existing time is already earlier/equal. |
| Raw times/dates | Epoch0/negative, DST local-day boundaries, same/different days, fractional,Date-range overflow,unsafe integer and TEXT storage; raw compare/write unchanged, invalid date contributes nothing; returned order is old then new. |
| No-op execution | query_only plus AC with missing/non-improvable parent still throws; no AC avoids UPDATE even if updated_at column missing. Audit UPDATE OF all three SET targets only when row matches. |
| Eager recompute | Empty iterable prepares all3; missing aggregate column errors before iterator; missing updated_at errors third before iterator; read-only empty succeeds; throwing iterable has no per-ID writes; duplicates dedup in first occurrence order. |
| Recompute state | Missing parent skip; NULL submission IDs count; AC earliest can move earlier/later/clear; WA-only attempted; no facts keeps unknown else visited; existing no-op still contributes dates; NULL-safe IS NOT and no Date conversion. |
| Failure order | Parent read failure before AC read; AC read failure before UPDATE; per-ID later failure preserves earlier autocommit effects/events; no dates returned after throw. |
| Ownership | Correct outer native transaction+notification scope, nested savepoint rollback caught by outer, outer rollback, real deferred-FK COMMIT failure; no implicit transactions. |
| Integration | SubmissionBatchWriter inserted-new-AC flow/partial failure and unique affected dates; import overwritten/moved/revoked AC and rollback after stats failure. |

Use a new Vitest focused suite for differential control-flow coverage, modeled on problemUpsert.test.ts:88 but with exact error snapshots. Add decisive real Electron ABI cases in repositories.test.ts or a new node:test suite wired through tests/verify.mjs:86 (`ELECTRON_RUN_AS_NODE=1`, external better-sqlite3/electron/electron-log). Required native cases are16-column defaults, nullable-ID duplicate/read-only, UUID timing on prepare error, IGNORE/ABORT/FK/readonly, fractional/extreme raw times, eager empty-recompute failure and real deferred COMMIT rollback. A mock/tracing adapter or Node built-in SQLite is never the native acceptance gate.

Existing tests/verify.mjs:184 runs repositories.test.ts and170 backupImport.test.ts on Electron. A new focused Vitest file must be registered in the DB list, and both product/test TypeScript configurations must pass (verify.mjs:117/123). Run all gates serially under the owner's scheduling; this researcher ran none of them and must not change runner registrations while A3a is frozen.

Existing import anchors: backupImport.test.ts:521 first AC movement,564 moved/overwritten facts,612 rollback after real stats trigger failure. SubmissionBatchWriter tests:311 unique days. Existing problemUpsert.test.ts:367 missing-column no-op preparation,378 abort triggers,393 external transaction provide reusable harness patterns, not submission equivalence evidence.

## Files Found

All paths below are workspace-relative; citations describe the inspected snapshot, not ownership/permission to edit.

- `algo-electron/electron/db/repositories/submission/mutations.ts:8`: unchanged duplicate lookup, prepare-before-UUID INSERT14, successful-run boolean/event contract.
- `algo-electron/electron/db/repositories/submission/firstAc.ts:7`: append-only first-solve update; at50 eager import recomputation.
- `algo-electron/electron/shared/types.ts:18`: SubmissionData input shape, raw submittedAt:number and optional nullish fields.
- `algo-electron/src/main/db/schema.ts:268`: parent state/time columns;446 submission schema/defaults/nullability.
- `algo-electron/drizzle/0000_baseline.sql:297`: exact physical16-column submissions definition and default0/NULL.
- `algo-electron/src/main/db/schema-validation.ts:126`: physical table_xinfo/default metadata;200 object guard;219 baseline equality.
- `algo-electron/src/main/db/migrate.ts:98`: baseline validation activation and count<=1 condition at110.
- `algo-electron/electron/db/connection.ts:127`: production init;188 safe initializer/test override boundary.
- `algo-electron/src/main/db/client.ts:10`: adapter wraps existing connection only.
- `algo-electron/electron/db/repositories/problem/mutations.ts:23`: existing typed mutation/native statement/event patterns, not a substitute for submission-specific ordering.
- `algo-electron/src/shared/time.ts:1`: raw Date.now capture;5 safe-integer/Date-range validation.
- `algo-electron/electron/db/repositories/stats/date.ts:15`: invalid timestamp -> null affected day.
- `algo-electron/electron/shared/dataEvents.ts:8`: buffered vs synchronous events;17 guarded subscriber;33 commit-scope lifecycle.
- `algo-electron/electron/submissions/SubmissionBatchWriter.ts:60`: nontransactional orchestration/partial commit behavior.
- `algo-electron/electron/backup/learningDataExport.ts:327`: owning import transaction, recompute381, scope389.
- `algo-electron/tests/db/problem-upsert-oracle.ts:12`: frozen legacy SQL oracle style.
- `algo-electron/tests/db/problemUpsert.test.ts:88`: isolated dual-run UUID/event/raw-row harness;367/378 native preparation/trigger patterns.
- `algo-electron/tests/db/drizzleMigrationValidation.test.ts:219`: physical mismatch/view/trigger tests;252 default;321 baseline reopen.
- `algo-electron/tests/db/repositories.test.ts:880`: existing submission/native happy path.
- `algo-electron/tests/db/backupImport.test.ts:612`: actual import rollback after stats-trigger failure.
- `algo-electron/tests/submissions/submissionBatchWriter.test.ts:311`: existing unique affected-day behavior.
- `algo-electron/tests/verify.mjs:86`: Electron native runner;117 both TS checks;169 DB native registrations.
- `.trellis/tasks/09-17-phase-3-main-process/research/a3-submission-queries.md`: earlier A3a/read inventory; read only and not modified this turn.

## Code / API Probe Evidence

Installed third-party sources under `algo-electron/node_modules/drizzle-orm/`:

- `sqlite-core/query-builders/insert.d.ts:26` explicitly permits SQL/Placeholder for INSERT values;39 values() creates the builder and165 prepare() is public.
- `sqlite-core/query-builders/insert.js:145` builder preparation calls the session directly;158 prepare() prepares before run arguments;161 run() invokes a fresh prepared statement.
- `sqlite-core/dialect.js:344` enumerates enabled table columns;364 fills schema defaults/null. The INSERT16 distinction is a generated-SQL fact, not conjecture.
- `sqlite-core/query-builders/update.d.ts:27` UPDATE SET allows data/SQL/column, not Placeholder. SQL wrapper is the supported no-cast route.
- `utils.js:83` mapUpdateSet leaves SQL expressions intact; otherwise attaches the column encoder.
- `sql/sql.js:361` bare placeholder binds raw, Param-wrapped placeholder calls its encoder; timestamp wrapper distinction is observable.
- `sqlite-core/columns/integer.js:65` Date decode and71 getTime encode lose raw fractional/out-of-range semantics.
- `sqlite-core/dialect.js:65` selects SET columns in schema order; the three parent targets keep status,first_solved_at,updated_at.
- `better-sqlite3/session.js:22` native client.prepare;69 synchronous prepared run directly returns native result, no wrapper.
- `sqlite-core/session.js:151` generic session.run catches and wraps DrizzleError; contrast typed builder direct path.
- `sql/functions/aggregate.js:25` MIN picks column/String decoder, hence raw sql MIN needed.

Probes used virtual in-memory TS CompilerHost, drizzle.mock()/a tracing adapter, and fresh Node SQLite :memory: objects. No emitted script or DB files. Observed:

- Complete proposed INSERT placeholders and UPDATE SQL-wrapped placeholders compile in strict mode. Bare UPDATE status Placeholder produces TS2322. Unguarded aggregate.get use produces TS18048; explicit invariant guard removes it.
- Tracing adapter sees all3 recompute prepares immediately and no execution. Update run binds status,null,1.75,problemId,status,null without timestamp conversion.
- Generic orm.run wraps a synthetic native failure as DrizzleError/cause; insert.prepare preserves exact thrown-object identity.
- node:sqlite empty readonly recompute succeeds after3 prepares. Missing submitted_at fails after1 successful prepare, missing updated_at after2, in both cases before input iterator begins. Readonly no-match UPDATE errors. Raw1.75 assignment remains1.75.
- Original/new UPDATE comparisons match changes/whole rows/three UPDATE OF audits for null,negative,fractional,out-of-Date-range and TEXT data. These are diagnostic compatibility tests, not permission to create invalid timestamps.
- INSERT baseline/audit equivalence and drift/view counterexamples are recorded in the matrix; IGNORE and FAIL retain prior audit side effects, ABORT removes them in the synthetic driver. Actual native harness must reconfirm.

## External References / Versions

Inspected pinned packages: drizzle-orm0.45.4, drizzle-kit0.31.11, better-sqlite3 13.0.3, Electron43.4.0, TypeScript6.0.3 (`algo-electron/package.json:68`). Probe host `node --version` was v26.13.0. No claim that Node built-in SQLite matches the app's native SQLite build/error codes.

Official references for implementation review (not fetched this turn): https://orm.drizzle.team/docs/insert ; https://orm.drizzle.team/docs/update ; https://orm.drizzle.team/docs/sql ; https://www.sqlite.org/lang_insert.html ; https://www.sqlite.org/lang_createtrigger.html ; https://www.sqlite.org/lang_expr.html . Pinned installed sources/probes are the version-specific evidence.

## Related Specs

- `.trellis/workflow.md:223`: execute only after scoped planning/review; researcher persists output without implementing.
- `.trellis/tasks/09-17-phase-3-main-process/prd.md:84`: domain conversion order; design A3a explicitly defers writes to A3b.
- `.trellis/spec/project/drizzle-adoption.md:49`: unchanged physical baseline, lifecycle-owned adapter, synchronous API/native behavior; later raw-projection clauses preserve diagnostic times. This research proposes a scoped raw-write exception rather than blindly applying generic Date input advice.
- `.trellis/spec/project/unix-millisecond-time.md:33`: valid public timestamps remain safe-integer ms; raw legacy writes/reads do not broaden input contracts.
- `.trellis/spec/project/data-refresh.md:36`: statement/commit event ownership, partial autocommit behavior, no payload leaks. Upsert IGNORE success needs its own explicit legacy exception if carried forward, not a broad no-op emission policy.
- `.trellis/spec/backend/database.md:103`: public typed builders and synchronous native semantics.
- `.trellis/spec/backend/type-safety.md:7` and `.trellis/spec/shared/code-quality.md:7`: no non-null/any/type-cast escape, explicit conservative contracts.

## Caveats / Not Found

Research only. A3a implementers/parent own the active code/gates; this turn writes ONLY `research/a3b-submission-writes.md`. No A3a/product/task metadata/spec changes, Git operations, user DB access, original D: checkout, native/global/UI/build suites or delegation. No native acceptance or design approval is claimed.

The hard decision is baseline-scope INSERT parity. Ordinary baseline/default behavior and ordinary audit triggers match in synthetic probes; arbitrary altered omitted columns/defaults/views provably do not. The existing production guard is documented precisely, including its startup-only/count<=1 limits. The parent must explicitly accept this bounded scope before A3b1, or leave INSERT deferred. Do not silently waive counterexamples or call the full submission domain complete.

No public supported Drizzle INSERT builder option to preserve only14 supplied columns was found; INSERT SELECT also emits the table column list. Raw orm.run changes native error identity. A more invasive escape would need a separately approved design, not hidden private APIs/shadow schema in this slice.

All failure identity, readonly/prepare timing, native unsafe-number binding, trigger and transaction assertions require real better-sqlite3/Electron verification. Synthetic probes are feasibility evidence only. For future schema migrations beyond baseline, re-evaluate defaults and validation scope rather than relying on this report indefinitely.
