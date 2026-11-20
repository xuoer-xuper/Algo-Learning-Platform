# Research: A3 Submission Query Conversion

- Query: Recommend the next coherent submission-domain Drizzle slice after A2g, preserving legacy behavior and truthful row contracts.
- Scope: internal code/spec/installed-library inspection plus synthetic in-memory probes.
- Date: 2026-11-20

## Findings

### Recommendation

A3a should include all three full-row reads AND getFirstAcByProblemIds in submission/queries.ts. No mutations: keep upsertSubmission, updateFirstAc and recomputeProblemSubmissionState for A3b. No migrations, directory moves, collection changes, transaction changes or new validators.

For the aggregate, retain schema-inferred problem_id:string|null and widen only CoachOrchestrator's internal Map key. Outward metrics still derive non-null IDs from the existing string input list. This conservative type correction needs no false non-null SQL generic and changes neither SQL behavior nor public metrics output. If this typing decision is not accepted, explicitly defer only the aggregate rather than forcing an assertion.

Critical API finding: use `.limit(sql.placeholder('limit')).all({ limit })`, NOT numeric `.limit(limit)` or `.limit(sql`${limit}`)`. Named-placeholder typing and generated SQL were verified; native acceptance remains required.

### Query contracts

Paths in the findings are relative to algo-electron/ unless stated otherwise.

- electron/db/repositories/submission/queries.ts:4: full-row exact problem_id equality, submitted_at DESC only, no cap.
- electron/db/repositories/submission/queries.ts:19: same full row/equality, submitted_at ASC only, no cap.
- electron/db/repositories/submission/queries.ts:30: exact platform equality, submitted_at DESC only, default50 and bound LIMIT.
- electron/db/repositories/submission/queries.ts:49: empty input returns [] BEFORE getDb; otherwise one bound IN parameter per original input, exact uppercase AC, GROUP BY problem_id, raw MIN(submitted_at), no explicit order.

None filters deleted_at, joins active parents, normalizes identifiers, validates times, starts a transaction, catches database errors or emits notifications. Preserve tombstones, orphan rows where the predicate permits them, NULL problem_id in platform reads, native text binding/decoding and direction-only sorting with no tie-break.

Use createDrizzleClient(getDb()) per operation, synchronous all(), no retained adapter or new connection (src/main/db/client.ts:10; electron/db/connection.ts:120). Empty aggregate remains usable before init/after close/broken schema because it acquires/prepares nothing. Do not deduplicate/chunk nonempty aggregate parameters: GROUP BY already collapses result keys, while original parameter counts/native excessive-variable errors remain observable.

### Schema-derived types and caller policy

Current SubmissionRow manually declares14 fields, claims id:string and omits is_first_ac/deleted_at (electron/db/repositories/submission/types.ts:1). Actual schema has16 columns and permits NULL id/problem_id (src/main/db/schema.ts:446). Derive SubmissionRow from typeof submissions.$inferSelect, overriding only submitted_at/created_at/updated_at to number and deleted_at to number|null. Prefer making this the authoritative submission-domain type and preserving ProblemSubmissionRow as a type-only alias (electron/db/repositories/problem/types.ts:31), not duplicating the derivation or moving runtime modules.

The accepted raw full-row projection exists at electron/db/repositories/problem/queries.ts:75: spread getTableColumns(submissions), override all four timestamps with raw sql<number>/sql<number|null> expressions without Date/Number decoders. Diagnostic invalid storage remains raw; this does not promise it satisfies shared schemas. Do not filter nullable IDs, coerce fields, drop baseline fields or use sql<string> to hide nullable columns.

Timeline: electron/coach/CoachOrchestrator.ts:782 maps s.id to TimelineSubmissionPoint.submission_id. Make only this read-only shared output nullable at src/shared/types/coach.ts:233. Keep non-null request/problem IDs and integer-time validation. No mapping or renderer action change: src/features/coach/SessionTimelineView.tsx:122 never uses submission_id, and list keys use kind/index at line397.

Privacy: electron/coach/llm/ContextGatherer.ts:99 takes last10 ascending rows and forwards only verdict/language/runtime_ms/submitted_at. Preserve that allowlist; raw_json/source_url/platform_submission_id must not leak. tests/coach/contextGatherer.test.ts:61 fixture needs is_first_ac/deleted_at after correction; privacy tests start at line187 and last10/order at line304.

Aggregate: select problem_id directly and expose its inferred string|null type; a named return type can derive the key through Pick<SubmissionRow,'problem_id'>. WHERE IN excludes SQL NULL results but Drizzle does not infer non-nullability. Do not fake it with sql<string>, non-null assertions, sentinel COALESCE, extra joins, JS substitution or filtering.

At electron/coach/CoachOrchestrator.ts:875 widen only Map<string, number> to Map<string | null, number> (or an equivalent derived key type). Public ProblemAcStatus still maps the already-filtered string problemIds at line877. Virtual strict compilation of this conservative policy passed. No shared metrics-schema/renderer widening is needed.

Use raw sql<number> MIN(submitted_at), without a decoder. Each returned group is nonempty and submitted_at is NOT NULL on baseline. Drizzle min(timestampColumn) decodes to Date; min(raw SQL expression) decodes to String. Neither preserves raw results.

No production consumers of getSubmissionsByProblem/getSubmissionsByPlatform were found beyond compatibility exports; tests call them at tests/db/repositories.test.ts:924/929. Preserve exported API anyway.

### Installed API probes

Probes emitted no project files. TypeScript CompilerHost supplied virtual source in memory; SQL used Node built-in SQLite :memory: plus drizzle.mock(), not Electron acceptance/user databases.

- Strict TypeScript against actual schema: `.limit(sql.placeholder('limit')).all({limit})` has zero diagnostics. `.limit(sql`${limit}`)` gives TS2345 because installed select.d.ts:428 accepts number|Placeholder, not SQL. Do not cast around it.
- dialect.js:212 drops negative/NaN numeric limits. Generated placeholder query retains `limit ?` and binds the raw limit. Synthetic raw/placeholder results agree for50,1,0,-0,-1,-2. Negative integers remain unlimited.
- Raw and placeholder limits -0.5,1.5,NaN,Infinity,-Infinity both throw datatype mismatch in the synthetic driver. Numeric .limit(limit) incorrectly returns all rows for -0.5,NaN,-Infinity. Do not clamp/validate in JS.
- Raw grouped MIN fixture excluded NULL keys, collapsed duplicate inputs and omitted missing keys; selected minima remained numbers (-1 and100). Excessive-variable/native binding acceptance still needs testing.
- aggregate.js:25 chooses Date-column or String decoder. For1.75, min(timestampColumn) yielded Date with milliseconds1; min(raw SQL expression) yielded string '1.75'. Raw sql MIN bypasses both.
- INSERT probe: dialect.js:344 enumerates all16 schema columns, supplying default0/NULL for omitted is_first_ac/deleted_at. With raw SQL timestamp parameter1.75, stored time stayed1.75, is_first_ac=0 and deleted_at=null. This does not prove native trigger/schema-drift equivalence.

An initial read containing integer9007199254740992 raised Node SQLite ERR_OUT_OF_RANGE for every query form because this driver rejects unsafe INTEGER-to-number conversion. A second ordinary-range probe isolated LIMIT behavior. No better-sqlite3/Electron unsafe-number equivalence is claimed.

### Deferred A3b write contracts

upsertSubmission at electron/db/repositories/submission/mutations.ts:8:

1. Acquire getDb/capture nowMillis before duplicate lookup. Lookup exact platform/platform_submission_id including tombstones. Any row object, including NULL/empty id, returns false; do not test id truthiness. Duplicate read-only invocation does not INSERT/generate UUID/notify.
2. Generate one UUID only on a miss; INSERT14 explicit columns. Optional data uses ?? null, retaining zero/empty strings. submittedAt binds raw; created_at/updated_at share captured now. is_first_ac/deleted_at rely on default0/NULL.
3. Emit submissions/problems/stats after successful run, then return true. No conflict-upsert, RETURNING, last_insert_rowid, catch or transaction. Native unique/FK/trigger failure throws without notification. onConflictDoNothing changes behavior.

Drizzle enumerates all16 insert columns rather than14 omitted-column syntax. Baseline default values match the probe, but native trigger/error timing and altered-schema/view cases need independent acceptance; do not claim parity merely from row values.

updateFirstAc at electron/db/repositories/submission/firstAc.ts:7:

- Capture now, read prior parent first_solved_at, then earliest exact-AC submitted_at ASC LIMIT1; both include tombstones.
- If AC exists, run the real UPDATE even if parent absent or no improvement: SET status='solved', first_solved_at=raw AC, updated_at=now; WHERE id=? AND (first_solved_at IS NULL OR first_solved_at>raw AC). No AC means no UPDATE prepared/run. No-match writes still have native write/error behavior.
- Notify problems/stats only changes>0, no transaction. Affected-day Set includes old parent time then earliest AC time even without a changed row; orphan AC can yield a date.
- stats/date.ts:15 catches invalid toLocalDay input and returns null. Fractional/extreme/TEXT diagnostic times can reach SQL assignment but contribute no day. Do not Date-truncate or validate earlier.

recomputeProblemSubmissionState at electron/db/repositories/submission/firstAc.ts:50:

- Acquire DB/time and eagerly prepare THREE statements before inspecting even an empty iterable: parent lookup, COUNT(*)/MIN(CASE verdict='AC'...), UPDATE. Drizzle builder construction alone is lazy and would change preparation failure timing.
- Iterate new Set(problemIds) in first-occurrence order. Missing parent skips aggregate/write. COUNT(*) includes nullable IDs/tombstones; COUNT(id) is wrong.
- Nonnull first_ac => solved; any submission otherwise => attempted; no submissions retains unknown only, else visited. First AC can move later/clear, unlike append-only updateFirstAc.
- Execute actual UPDATE with both NULL-safe IS NOT predicates. Do not replace with !=, skip a no-op in JS or change SET columns. Notify only changes>0. Collect old/new dates for every existing parent including no-op, with invalid-time omission and one captured now. No new transaction/event buffer.

Transaction ownership: electron/submissions/SubmissionBatchWriter.ts:60 is an autocommit sequence (attach, insert, collect inserted date, update first AC for new AC with truthy problemId). Stats recompute only if inserted>0 and catches failure at line77. Earlier committed writes/events survive later failure; do not add batch atomicity. In contrast electron/backup/learningDataExport.ts:327 owns the native transaction, calls recompute at381, and wraps transaction invocation in withDataChangeTransaction at389. Preserve its actual commit/rollback notification boundary; test real deferred-FK COMMIT failure in A3b, not a mocked throw.

### Proposed A3a edit and acceptance set

Implementation owner must plan/review; this is not approval:

- submission/queries.ts: four SELECTs, raw time/MIN, named LIMIT placeholder, unchanged empty guard.
- submission/types.ts: schema-derived row and conservative aggregate key; retain FirstAcRow for deferred writes. Optional problem/types.ts type-only alias reuse.
- src/shared/types/coach.ts: nullable output submission_id only. CoachOrchestrator.ts: aggregate Map key type only.
- tests/coach/contextGatherer.test.ts: complete fixture/privacy/order; tests/ipc/timestampSchemas.test.ts:98: add nullable submission timeline ID without relaxing other contracts.
- Focused disposable native oracle tests in tests/db/repositories.test.ts or dedicated suite. README/task/spec updates belong to implementation/update-spec workflow; none performed here.

Compare frozen original SQL/new queries on identical disposable native databases:

| Area | Required cases |
| --- | --- |
| Shape/raw values | All16 keys, NULL/empty IDs, nonzero is_first_ac, deleted_at including0, nullable fields, epoch0/negative/fractional/out-of-Date-range times, no Date/coercion. |
| Membership/order | Literal case-sensitive IDs/platforms with quotes/wildcards/backslash/unusual Unicode; deleted parent/child; NULL problem_id in platform reads; both sort directions/ties, no tie-break. |
| LIMIT | Default50 with >50 matches;1,0,-0,negative integers, positive/negative fractions,NaN,infinities; compare native failures too. |
| Aggregate | Empty before init/after close/broken schema; duplicate/missing/empty-string input, NULL stored key, exact AC, multiple/no AC, tombstones, fractional/extreme raw MIN, excessive-variable failure without batching. |
| Lifecycle/errors | New connection after reinit, readonly/query_only reads, closed/missing table/column errors, no writes/events/migrations. |
| Cross-layer | Timeline null/empty/string IDs accepted, number/object/undefined rejected; nonnull problem/request IDs/integer-time contracts unchanged; LLM allowlist/last10 ordering unchanged. |

A3b additionally requires duplicate/read-only behavior, null-ID presence, UUID/time capture, defaults/triggers, raw time writes, zero-change UPDATE execution, eager empty-recompute preparation, notification ordering, autocommit partial failure, import rollback/native COMMIT failure. Existing repository happy path at880 and backupImport tests at521/564/612 are anchors, not complete write parity.

## Files Found

- `.trellis/workflow.md`: phase gates/persistence requirement.
- `.trellis/tasks/09-17-phase-3-main-process/prd.md:84`: problem -> submission -> stats before restructuring.
- `.trellis/tasks/09-17-phase-3-main-process/implement.md:176`: remaining domain checklist; not edited here.
- `algo-electron/electron/db/repositories/submission/queries.ts:4`: four legacy read functions.
- `algo-electron/electron/db/repositories/submission/types.ts:1`: incomplete/over-narrow full-row contract.
- `algo-electron/electron/db/repositories/submission/mutations.ts:8`: duplicate lookup/insert/event sequence.
- `algo-electron/electron/db/repositories/submission/firstAc.ts:7`: append-only/import first-AC state changes.
- `algo-electron/electron/db/repositories/submission/README.md:13`: boundary document; inventory omits ascending/aggregate APIs.
- `algo-electron/electron/db/repositories/submissionRepository.ts:1`: compatibility exports to retain.
- `algo-electron/src/main/db/schema.ts:446`:16-column schema/nullability/time encoders/indexes.
- `algo-electron/electron/db/repositories/problem/queries.ts:75`: accepted raw full-row projection.
- `algo-electron/electron/db/repositories/problem/types.ts:31`: schema-derived ProblemSubmissionRow.
- `algo-electron/src/shared/types/coach.ts:233`: timeline submission output needs nullable correction.
- `algo-electron/src/shared/types/submission.ts:10`: distinct embedded-detail DTO already permits null id.
- `algo-electron/electron/coach/CoachOrchestrator.ts:782`: timeline/metrics read consumers.
- `algo-electron/electron/coach/llm/ContextGatherer.ts:99`: allowlist/last10 projection.
- `algo-electron/src/features/coach/SessionTimelineView.tsx:122`: read-only timeline, no submission-ID action.
- `algo-electron/electron/db/repositories/stats/date.ts:15`: invalid instant becomes no affected day.
- `algo-electron/electron/submissions/SubmissionBatchWriter.ts:60`: autocommit orchestration.
- `algo-electron/electron/backup/learningDataExport.ts:327`: import transaction owner.
- `algo-electron/tests/db/repositories.test.ts:880`: submission happy path;1292 analogous raw-row native evidence.
- `algo-electron/tests/db/backupImport.test.ts:521`: first-AC move/rebuild/rollback tests.
- `algo-electron/tests/submissions/submissionBatchWriter.test.ts:311`: affected-day orchestration test.
- `algo-electron/tests/coach/contextGatherer.test.ts:61`: fixture/privacy/order regression surface.
- `algo-electron/tests/ipc/timestampSchemas.test.ts:98`: nullable output ID test entry.

## External References / Versions

Installed versions inspected2026-11-20: drizzle-orm0.45.4, drizzle-kit0.31.11, better-sqlite3 13.0.3, Electron43.4.0, TypeScript6.0.3 (`algo-electron/package.json:68`). Actual `node --version` during these probes was v26.13.0, not Electron or the earlier handoff's Node22.

Installed third-party evidence (all under algo-electron/node_modules/drizzle-orm/):

- sqlite-core/query-builders/select.d.ts:428: limit accepts number|Placeholder, not SQL.
- sqlite-core/dialect.js:212: negative/NaN numeric limit omission.
- better-sqlite3/session.js:22: native prepare;69/74/103 fill placeholders/call native run/all/raw.all.
- sql/functions/aggregate.js:25: MIN decoder selection.
- sqlite-core/columns/integer.js:65: timestamp Date encoder/decoder.
- sqlite-core/dialect.js:344: all-column INSERT/default generation.

Official reference pointers, not fetched during this internal research: https://orm.drizzle.team/docs/select ; https://orm.drizzle.team/docs/sql ; https://www.sqlite.org/lang_select.html ; https://www.sqlite.org/lang_expr.html . Pinned local source/probes take precedence over assumptions from current website examples.

## Related Specs

- `.trellis/spec/project/drizzle-adoption.md:75`: lifecycle-owned sync adapter; A2f at146 requires truthful nullable output/full fields/raw times. LIMIT hazard at174; named-placeholder solution is research, not a spec edit.
- `.trellis/spec/project/unix-millisecond-time.md:33`: valid safe-integer milliseconds including0; raw legacy equivalence does not relax public input or authorize corrupt-data coercion.
- `.trellis/spec/project/data-refresh.md:36`: post-statement/commit notifications; no fake transaction around autocommit batches or private record payloads.
- `.trellis/spec/backend/database.md:103`: typed sync patterns; adoption-specific equivalence overrides generic redesign examples.
- `.trellis/spec/backend/type-safety.md:7` and `.trellis/spec/shared/code-quality.md:7`: no non-null/any workaround; authoritative derived contracts.

## Caveats / Not Found

Research only, not implementation approval or a completed native gate. Only this research file was written. No product/spec/task metadata/Git operations, real user database, original D: checkout, global/native/UI suites, build, release or new agent operations.

Synthetic Node SQLite evidence covers SQL construction/selected SQLite behavior, not better-sqlite3/Electron binding/error identity, trigger/transaction parity or unsafe-number acceptance. Implementation owner must run actual disposable native harness plus type/lint/focused caller checks. Raw diagnostic values are preserved without claiming shared-schema validity.

Parent owns A2g/task/spec updates. This report records inspected snapshot, does not approve modifying another agent's files and does not mark remaining Phase3 complete. No other production descending/platform reader or ID-based timeline submission action was found in electron/src/tests search.
