# Research: Independent A4d recompute design review

- Query: Independently check the proposed frozen historical recompute helper plus runtime-only Drizzle split, including INSERT12 scope, exact execution/failure/event behavior and acceptance evidence.
- Scope: internal and installed-library review; bounded in-memory feasibility experiments. This is a design review, not implementation or native acceptance.
- Date: 2026-11-20
- Active task: .trellis/tasks/09-17-phase-3-main-process
- Checkout: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform
- Reviewed proposal: research/a4d-stats-recompute-design.md (26,933 bytes).
- Path convention: code paths below are relative to algo-electron/ unless prefixed .trellis/.

## Findings

### Verdict: conditionally approvable, not authorization to implement

The recommended split is technically sound and safer than rewriting or relocating the live historical helper. I found no additional algorithmic blocker within the unchanged post030 runtime schema. Independent source inspection, public-builder generation, strict virtual compilation, original-source failure probes and a real in-memory deferred-FK COMMIT failure support its feasibility.

Approval must explicitly include all of these conditions before execution:

1. Keep electron/db/repositories/stats/recompute-core.ts at its exact path/content and keep migration030's import/call unchanged. It becomes a named historical exception, not an unconverted runtime repository or forwarding shim.
2. Limit the new runtime INSERT12 claim to unchanged frozen030 physical columns/defaults; do not claim arbitrary historical/default-drift parity. The omitted deleted_at distinction is real, reproduced independently.
3. Accept a late internal NULL-cache-key guard that preserves the old failure stage; do not widen public day inputs, repair cache rows, or use that guard before fact conversion.
4. Record two legacy notification exceptions in the governing contract rather than accidentally fixing them or declaring generic R4 compliance. This is the main spec gap identified below.
5. Preserve the A4a-first ordering and parent-scheduled acceptance gates. A4d remains pending, and this review neither starts it nor approves A4b/c policy.

If any condition is rejected, keep runtime recompute native for now. Do not achieve a nominal all-Drizzle count by changing released migration behavior or using a whole-query SQL escape hatch.

### Review finding 1: notification parity needs an explicit spec exception

Severity: medium design/acceptance gap, not a new code regression.

Existing .trellis/spec/project/data-refresh.md:40 says skip successful operations that change no rows, and :56 says already committed partial-autocommit writes must notify even when a later statement fails. Existing wrappers do NOT fully satisfy those general statements:

- stats/recompute.ts:6 always emits stats after successful single-day core return, including an ordinary diagnostic RAISE(IGNORE) that changes no cache row.
- stats/recompute.ts:17 emits only after the all-days core completes and returns a positive count. A later cached invalid day can throw after an earlier cache row committed, with no stats event for that earlier commit.
- Selected-day recompute at :11 is different: it calls the single-day wrapper for each sorted unique day, so earlier successful dates already emitted before a later failure.

The design correctly preserves these behaviors, but the refresh spec currently names only problem-upsert and submission-insert legacy exceptions, not recompute. Parent should explicitly record a narrow recompute exception: success-based single-day emission, all-days all-or-error emission, no new buffering around autocommit, unchanged caller-owned transaction scopes. Do not broaden it into permission for new unnotified partial mutations. Fixing the asymmetry is a separate behavior task, not a hidden ORM change.

Independent original-source probe: with PRAGMA reverse_unordered_selects=ON, cache rows were read as [2026-11-19,NULL]. All-days zeroed/committed the valid row, then threw TypeError('Invalid local day'), emitted no events and used one clock. The selected-date wrapper on [not-a-day,2026-11-19] sorted first, committed the valid row, emitted one stats event, then failed and consumed a second clock. These are executable differences, not theoretical interpretations.

### Review finding 2: original-path freeze conflicts with a later layout goal

Severity: medium planning dependency, already anticipated by the design but not yet a recorded parent decision.

The task PRD at :25 plans moving legacy migrations to src/main/db/legacy-migrations, while :112 currently requires electron/ to disappear. Freezing this helper AND030 at their present paths through later directory work cannot simultaneously satisfy that literal zero-electron-directory criterion. PRD:113 already permits frozen legacy SQL exceptions, but that alone does not settle location/relative-import exceptions.

For A4d, exact-path freeze is the correct low-risk choice. Parent must record its scope and reconcile the later R2/R5 acceptance criteria explicitly. Do not leave an unstated assumption that a later agent may move030, insert an old-path shim, or rewrite its relative import while still claiming the same freeze. A future separately reviewed relocation is not approval granted here. Do not edit architecture budgets or historical sources simply to make a checker pass.

The existing architecture guard at tests/architecture/check-architecture.mjs:392 only limits bare SQL outside database directories. It does not prove that030 still uses the frozen helper or enforce an exact historical path. A specific small protection test/evidence is needed; a general green architecture suite is insufficient.

### 1. Historical boundary independently verified

Original runtime core imports:

- stats/recompute-core.ts:1 imports better-sqlite3 as a TYPE only.
- :2 imports localDayBounds/toLocalDay directly from src/shared/time, with no stats facade, global connection, event bus, schema, or Drizzle runtime import.
- The TypeScript-transpiled core has just its shared-time relative require. No dynamic dispatch or environment switch exists.

A static relative runtime-import graph walk starting at migration030 found seven files:030 itself, legacyTimestamp, logger, src/shared/time, timestampColumns, legacy-ai-context, recompute-core. The core's only runtime edge is to src/shared/time. Neither stats/recompute.ts nor the proposed recompute-runtime.ts/client/schema is in that branch. External imports from the existing logger were not reclassified as new dependencies.

Important qualification: this is the030 execution dependency branch, not a claim that the whole modern connection/main bundle has no Drizzle imports. connection.ts already imports the current migration orchestrator. The required invariant is that030 never starts depending on the new runtime recompute branch or its query/schema policy.

Independently calculated SHA256 values match the proposal:

| File | SHA256 |
| --- | --- |
| electron/db/repositories/stats/recompute-core.ts | d816c3ee693563e3a84e5333396eac4ab83eefb042cd33118158be1ea78bc508 |
| electron/db/migrations/030_timestamps_to_unix_ms.ts | 0dd5967628e9074a0315933e6bf96f0efd404fe9463455e4c95d8a23b250c395 |
| src/shared/time.ts | 9ca11982850f6b13d082e60e34b1ed56aed4d7d0c28c68bdef756d32aa8435cf |

Hash case is insignificant; current files are LF-only. These hashes verify this working snapshot against the proposal, not release provenance or a Git-base comparison. Parent must compare its accepted base independently; this research ran no Git command.

Migration ordering matters:

-030:120/:122 requires a controlled FK-disabled transaction and an explicit DB, before ordinary getDb ownership is necessarily established.
-030:57 rebuildDdl preserves original definition text except the owned timestamp affinity. Thus original defaults/constraints can survive into the intermediate recompute stage; do not treat it as necessarily the modern Drizzle baseline.
-030:197 removes original tables after creating shadows; restores indexes/views, then repairs owned local labels; :225 deletes only known ten-digit pseudo-day cache keys; :228 runs the ORIGINAL core; :229 restores triggers.
- The native runner at electron/db/migrate.ts:78 owns the transaction, prepares the ledger INSERT after migration up, checks FK/integrity and restores FK state on all exits. Do not add a transaction/event/global connection inside either explicit-DB helper.
- src/main/db/migrate.ts:109 validates exact post030 physical schema only AFTER all legacy migrations, and only while recorded Drizzle prefix <=1. schema-validation.ts:200 rejects adopted-schema views/triggers; :233 compares columns/default metadata. This does not guarantee arbitrary intermediate030 or session-mutated runtime DDL.

Therefore copying/moving the core and editing030 is needless risk; an old-path delegate also changes the executed branch even if030's import text survives. Keep core/time untouched and direct. A new runtime helper may import shared time and schema/client, but must not import the old core as a reusable algorithm dependency or cause it to import the new branch.

### 2. INSERT12 scope is necessary, real, and limited to runtime

Independent query generation using installed Drizzle0.45.4 and the actual schema produced:

-12 named INSERT columns, in schema order;
-11 input bindings and literal NULL for omitted deleted_at;
-ON CONFLICT(local_day), exactly9 UPDATE targets;
-no created_at/deleted_at/local_day UPDATE target, no extra conflict bindings.

The original stats/recompute-core.ts:45 names11 columns and omits deleted_at. Baseline user_daily_stats at drizzle/0000_baseline.sql:335 has deleted_at nullable with no default, so a new row is NULL either way. Independently executing original daily source and generated builder against separate baseline memory databases produced identical complete empty-day rows. SQL-wrapped timestamp placeholders retained raw now=1.75 as REAL in both, confirming no hidden Date truncation. This is a diagnostic preservation test, not permission for fractional public timestamps.

Controlled counterexample: changing only that table's omitted deleted_at default to7 in disposable DDL produced original7 versus builderNULL on new rows. This is not fixed by unchanged column selection or conflict clauses. Restrict the runtime contract after parent approval; do not retroactively apply it to030.

Required implementation details:

- Use the real schema, public insert(...).values(...).onConflictDoUpdate(...).prepare().run(...).
- Bind all11 supplied values in original order; raw SQL-wrap now placeholders so timestamp_ms columns do not encode via Date.getTime(). A shared named now placeholder may appear three times and still yields11 native bindings.
- Prepare AFTER four completed aggregate/group queries but BEFORE evaluating JSON.stringify(platforms) and constructing run arguments. No eager upsert preparation, JSON precomputation, RETURNING, replacing INSERT with REPLACE, preliminary SELECT, WHERE no-op guard or query suppression.
- Exactly the9 original SET targets read their own excluded fields. Preserve cache created_at and deleted_at, including tombstone0; recompute must not resurrect or reset metadata.
- Diagnostic BEFORE INSERT/UPDATE IGNORE/FAIL/ABORT and UPDATE OF observers remain useful for state/error-order proof. Their presence in a test is not expansion of the supported adopted schema to arbitrary triggers or views.
- No shadow partial table, private dialect/session use, changed defaults/validator, or full raw statement wrapped as an ORM conversion.

Native driver detail verified in installed better-sqlite3/session.js:22 and :69: builder prepare calls client.prepare synchronously; typed run calls stmt.run directly after filling placeholders. Generic session raw-run error wrapping is not equivalent. Exact native error identity remains a later acceptance requirement.

### 3. Query, date and wrapper risks checked

The proposal accurately captures the original algorithms. These are the traps worth emphasizing rather than repeating its full inventory:

- Keep four separate reads then INSERT preparation; localDayBounds precedes SQL. No combined CTE, early later-statement preparation, extra snapshot or SQL date conversion. Numeric indexed ranges remain >=start/<end, not fixed24h.
- Raw SQLite aggregates are necessary: nullable seconds, COUNT(DISTINCT problem_id), COUNT(*) including NULL IDs, exact uppercase AC and INTEGER overflow must not be normalized through generic String/Date decoders, TOTAL or JS reductions. Only solved parents have deleted_at IS NULL; visits/submissions/platforms retain tombstones/orphans.
- Platform selection/property order stays platform then count, GROUP BY without ORDER BY; preserve exact JSON bytes/native row order and NULL for empty platforms. Do not sort it for determinism.
- All-days uses one real four-arm UNION, not UNION ALL/JS dedup. Independent generated SQL retained visit entered_at, submission submitted_at, event occurred_at, then parent first_solved_at WHERE IS NOT NULL, with raw instant aliases/no binds. Do not source event local_day or add active filters.
- Materialize cache, then complete facts, convert every fact before any daily write; only then iterate the insertion-ordered Set. No ordering/cleanup/prevalidation of cache keys. NULL guard at per-day entry preserves error stage and narrows to string without a public nullable API.
- Distinguish invalid fact instant from invalid derived day: 1.75/TEXT/unsafe/out-of-Date-range fails before writes; maximum valid Date can become a non-four-digit label and fail after earlier dates commit. A forgiving helper or extra early calendar validation changes observable behavior.

Independent old-source probes reproduced cache[NULL,valid] failing without daily SQL; reversed cache[valid,NULL] committing/zeroing valid first; fractional fact preserving existing cache; fact8640000000000000 failing only after valid cached day committed; and selected[not-a-day,valid] sorting and emitting for the valid date before failure. The late NULL guard matches the primitive schema-value error name/message/stage, not necessarily its stack frame.

Wrapper bodies should remain byte-identical except import:

- Single: getDb first; explicit day skips derivation clock; default/nullish diagnostic input uses a derivation clock THEN separate write clock; core validation follows argument evaluation. Do not merge clocks across midnight.
- Selected: eagerly consume all iterable into Set/default sort; iterator failure has no earlier writes, empty needs no DB, each date gets its own wrapper/event/clock.
- All: one now shared across dates, returns Set size only after success;0/throw has no event, count is dates attempted not rows changed. Notification exceptions are finding1, not a redesign opportunity.

sql<number> is justified for specific raw aggregates/NOT NULL fact projections, including first_solved_at only under IS NOT NULL; it is not license to cast nullable local_day. Successful no-GROUP-BY aggregate always has a row, so a TypeScript impossible-state throw is acceptable but fabricated defaults or mock-row absence are not native parity.

### 4. Caller/COMMIT boundary checked

Existing callers support an import-only wrapper change:

- tracking/TrackingService.ts:111/:155 catches/logs single-day failure after visit changes.
- submissions/createDefaultSubmissionBatchWriter.ts:20 supplies selected recompute; SubmissionBatchWriter catches its failure after facts, retaining earlier autocommits.
- db/repositories/problem/mutations.ts:129 recomputes after its delete transaction; under an outer transaction this may still be savepoint-owned. No invented after-commit scheduler.
- backup/learningDataExport.ts:381 combines first-AC affected dates and selected recompute inside import transaction; withDataChangeTransaction covers its INVOCATION, including COMMIT. Keep atomic import and topic merging.
- IPC daily/all stay true/number with unchanged facade/strict day input.

Neither core gains clocks/events/transaction ownership/global DB. Per-call adapter is over the explicit handle, never retained across close/reinit. Event scopes are not inferred from db.inTransaction: existing unwrapped native transactions may notify early, and A4d must not hide or repair that diagnostic behavior.

Independent real-COMMIT fixture: actual dataEvents module/original wrapper, baseline memory DB, cache AFTER INSERT trigger writes missing-parent submission under foreign_keys=ON/defer_foreign_keys=ON. Callback finished with a visible cache row and no event; SQL COMMIT failed; explicit probe rollback removed cache/submission and released no topic. This validates the fixture stage, NOT better-sqlite3 helper auto-rollback/error class/code/Electron ABI. Native acceptance must repeat it with the project's harness and callback-completed assertion.

### 5. Performance needs measurement

Independent EXPLAIN QUERY PLAN on baseline/public builders showed visits and platforms use idx_pv_entered ranges, submissions uses idx_submissions_submitted_at, and solved count SCANs problems. COUNT(DISTINCT)/GROUP BY retain temp B-trees. No dedicated first_solved_at index exists; do not claim every query is indexed or add an index in this slice.

The comparisons stay sargable where original indexes exist, but Drizzle schema-extraction/query-build cost is not measured. Per-call adapters preserve lifecycle; their overhead must pass the same benchmark, not motivate a global cache.

tests/db/dailyStatsPerformance.test.ts seeds730 days x20 visits/submissions, warms at :67, times another call and requires <50ms at :85 with exact counts. Keep it unchanged and run parent-scheduled native acceptance. No relaxed threshold, reduced fixture, batching redesign or globally retained statements. Existing fixture covers warmed daily work, not all-days throughput; no new hard budget is invented here.

### 6. Acceptance delta and narrow file boundary

The design's checklist is strong. Treat these as hard evidence gates:

1. Independent frozen oracle for both old cores AND three wrappers, not the production historical core reused as a mutable expectation. Freeze calendar outcomes/relevant helper behavior too. Document only injection and optional-row typing seams.
2. Compare full cache/fact/audit/metadata state, platform JSON bytes, storage types, returned counts, clock calls, query/prepare/run order, native error name/message/code and injected thrown-object identity. Check prepare-before-serialization and earlier-read-error-before-INSERT-error. Inspect state after failure, not just thrown text.
3. Mixed NULL IDs/seconds, actual NOT NULL visit FK not weakened, empty keys, tombstone/orphan facts in disposable fixtures only, exact AC, deleted parents, inclusive/exclusive bounds, DST, zero/negative/fraction/TEXT metrics, SQL-integer overflow. No Number/Date normalization hiding raw results.
4. Cache-only dates, UNION duplicates, invalid fact-before-cache validation, NULL/malformed late effects, reverse_unordered_selects and extreme Date labels. Selected iterable consumption/throw/dedup/sort/empty; stepping clocks across midnight.
5. Baseline INSERT12/old11 equality plus explicit altered-default counterexample; nine UPDATE OF targets and unrelated target non-firing; created_at/deleted_at0 preserved; fresh/conflict IGNORE/FAIL/ABORT state/events.
6. Native callback rollback, savepoints/inner rollback, outer rollback, real deferred-FK COMMIT failure with callback-completed assertion; no leaked queued topics. Guarded/reentrant subscribers and unwrapped diagnostic behavior remain.
7. Historical source AND route protection: core030/time unchanged,030 resolves directly to old core, no old-core imports of runtime/schema/client/connection, migration-only use needs no initialized global DB. A grep of030 import alone misses forwarding shims. Preserve historical fixture/provenance bytes.
8. Existing030 preservation/malformed-key/late-recovery and pinned21/24/29 reconstruction through safe init; verify FK/integrity/ledger/cache metadata, rowid/BLOB/view/trigger semantics and backups/markers. No fixture regeneration to make changes pass.
9. Parent registers focused tests in verify.mjs and schedules both TS programs, scoped lint, focused/native DB, performance, caller/import/event tests, full/UI/build/packaging/recovery/CI. These experiments satisfy none of those acceptance gates.

Conditional production boundary: add stats/recompute-runtime.ts with two explicit-DB builder functions; change only the existing wrapper's import source. Parent owns README/spec/task and architecture exception documentation. Tests/oracle/runner registration need explicit ownership. No schema/baseline/migration/time/public-type/caller/read-query/release edits.

Historical algorithm duplication is intentional. Do not factor shared aggregation out of the old helper to satisfy duplication tooling; if a checker rejects the narrow exception, return for review rather than relaxing global thresholds or silently moving code.

## Files Found

Code/spec files and line citations are identified at each finding. Key navigation:

| Path | Review role |
| --- | --- |
| electron/db/repositories/stats/recompute-core.ts | Frozen historical native core. |
| electron/db/repositories/stats/recompute.ts | Import-only wrapper boundary. |
| electron/db/migrations/030_timestamps_to_unix_ms.ts | Direct historical dependency/call. |
| src/main/db/schema.ts and drizzle/0000_baseline.sql | Runtime physical INSERT12 scope. |
| src/main/db/migrate.ts and schema-validation.ts | Validation occurs after legacy migration. |
| electron/shared/dataEvents.ts | Actual invocation/COMMIT event scoping. |
| tests/db/dailyStatsPerformance.test.ts | Existing native performance gate. |
| tests/db/migration030.test.ts | Preservation and malformed-key rollback. |
| tests/db/historicalUpgradePath.test.ts | Pinned21/24/29 safe upgrade evidence. |
| tests/db/submission-first-ac.test.ts | Reusable real deferred-FK fixture pattern. |

## Code Patterns and Independent Evidence

All probes were stdin/in-memory, no emitted source/test/probe file:

- TypeScript AST graph excluded type-only imports and found seven relative030 dependency files. Three SHA256 values matched the proposal.
- Installed public builder emitted12 columns/11 binds/9 UPDATE fields, literalNULL deleted_at; baseline result matched old source, changed DEFAULT7 diverged as predicted.
- SQL-wrapped now1.75 retained REAL diagnostic storage without timestamp Date encoding. This does not make fractional timestamps valid DTO input.
- Independent full daily/all virtual TypeScript shape used public schema/client types, raw aggregates, UNION and late NULL guard: zero strict diagnostics; writeFile prohibited.
- Original core/wrapper executions reproduced native key order/reverse order, fractional fact pre-write failure, extreme Date late failure and selected-date earlier events.
- Actual dataEvents plus original wrapper and real deferred-FK SQL COMMIT validated fixture stage and no event escape; explicit probe rollback was not native helper acceptance.
- EXPLAIN confirmed original range-index accessibility and solved table scan; no benchmark run/timing claim.

## External References and Versions

- Installed drizzle-orm0.45.4, drizzle-kit0.31.11, TypeScript6.0.3. better-sqlite3/session.js:22 prepares synchronously; :69 delegates run, :94/:106 raw-array reads then mapping. sqlite-core/dialect.js:344 includes all enabled INSERT columns; :65 chooses UPDATE targets in schema order.
- Reference pointers: https://orm.drizzle.team/docs/insert and https://orm.drizzle.team/docs/select . Installed pinned source, not assumed current web examples, supports this review; no remote fetch performed.
- SQLite references: https://www.sqlite.org/lang_upsert.html , https://www.sqlite.org/lang_conflict.html , https://www.sqlite.org/foreignkeys.html#fk_deferred . Links are pointers, not freshly fetched sources.
- This review used PATH Node26.13.0/node:sqlite3.54.0, outside package engines >=22.18.0 <25. Proposal reports Node22.23.2 probes. Neither substitutes for supported Electron/better-sqlite3 acceptance; no dependencies/runtimes changed.

## Related Specs

- .trellis/workflow.md:363: persist assigned research, do not confuse review with implementation approval.
- .trellis/spec/project/drizzle-adoption.md:53/:70: physical mapping, owned connection, bounded slices, transaction semantics and historical exceptions.
- .trellis/spec/project/unix-millisecond-time.md:48/:54: guarded030/explicit DB recomputation and unchanged calendar rules.
- .trellis/spec/project/drizzle-submission-writes.md:6/:12/:35: precedent for explicitly approved INSERT/default scope and prepare/evaluation order, not automatic A4d approval.
- .trellis/spec/project/data-refresh.md:40/:52/:56: no-op/COMMIT/partial-autocommit rules need the narrow existing recompute exception in finding1.
- .trellis/spec/project/drizzle-stats-reads.md:26/:29: raw aggregate/count preservation; other slices remain independent.
- .trellis/spec/backend/type-safety.md:7: explicit narrowing/invariant guards, no casts/non-null assertion to hide nullable cache data.
- Task PRD:25/:112/:113: freeze aligns with historical SQL exception; exact path versus later electron-directory removal needs parent reconciliation.

## Caveats / Not Found

- Conditional design verdict only. No proposed runtime product file exists yet; native errors/helper transactions/performance/packaged migration remain unverified.
- Parent must explicitly approve bounded INSERT12, historical freeze and late NULL policy, and reconcile notification/future-layout criteria before execution; do not silently reinterpret them.
- No new runtime recompute connection/schema/event dependency was found in030's relative execution branch. The entire modern app already contains Drizzle; no ORM-free-process claim is made.
- No native/global/UI/build suite, user database, original D checkout, other task output, product/test/spec/taskmetadata edit or Git operation. Only this research file was written.
- ORDER BY absence gives no cross-engine order guarantee. Preserve original queries and test same-driver differential behavior, not added sorting for convenient failure tests.
- Existing benchmark covers warmed single-day work, not all-days throughput. EXPLAIN does not prove runtime performance.
- Hashes describe this checkout snapshot, not accepted-base/release provenance. Parent owns provenance and release verification. A hash-only check without a route check can miss an unsafe forwarding arrangement elsewhere.
