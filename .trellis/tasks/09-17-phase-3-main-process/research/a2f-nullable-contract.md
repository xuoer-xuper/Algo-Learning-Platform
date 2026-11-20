# Research: A2f Nullable Problem Read Contracts

- Query: Resolve truthful nullable outputs for the remaining problem queries without filtering rows, changing schema, or hiding nullability behind casts.
- Scope: internal; source/caller inspection, frozen-baseline in-memory SQLite probe, virtual TypeScript probes.
- Date: 2026-11-20

## Findings

Early recommendation: migrate the remaining omnibox problem-candidate pipeline plus detail and visit reads, with explicit output-contract widening only for reachable nullable IDs. The recent-list read cannot become truthful end-to-end with only type changes: its sidebar actions feed string-only internal-page routes. Preserve that read until the UI policy is explicitly approved; do not merely move its lie to the preload cast.

- In-memory TypeScript 6.0.3 compiler-host substitutions (no file writes) widening all IDs exposed exactly three errors: CoachOrchestrator.ts:824 for detail parent ID, ProblemSidebar.tsx:174 and :181 for notes/detail actions. The narrower substitution (nullable visit/submission IDs, nullable omnibox problemId, truthful nullable last_visited_at, equivalent null-aware comparator; keep detail parent ID string) passed the full production program with zero diagnostics.
- Detail's parent WHERE p.id = supplied string proves the returned ID equals the input; project the bound input string only for this equality-filtered row. This avoids both nullable broadening of ProblemTimelineData.problem_id and invented identity. Preserve all original row columns and native raw numeric time scalars.
- Nullable visit ID flows through CoachOrchestrator.ts:773 into problemVisitPointSchema.visit_id. The renderer does not read visit_id at all; it uses ordered points and index keys. Widen that output schema and repository type together, with no runtime mapper/renderer changes.
- Nullable submission ID from detail is only used as a React key. Either widen submissionRecordSchema.id (its only production consumer is detail), or explicitly specialize detail's embedded schema and remove the old narrower explicit callback annotation in ProblemDetail.tsx. The latter avoids broadening a generic submission contract.
- Omnibox ID is used for Set dedup, tie comparator and string-template React key, never a route/delete action. Widen its output schema/local ID/Set type; preserve the original JS abstract relational comparison using the already proven null-aware oracle comparator (do not introduce null-last sorting).
- RecentProblem alone widened while ProblemRecord/preload stays string would compile but perpetuate the exact cross-layer false claim being resolved. Do not call that resolved.

## Caveats / Not Found

No product code changed. Detailed evidence and implementation checklist follow in this file. Probes are not implementation or Electron/native verification. Recent-list UI policy still needs explicit review; no schema/route/input guard changes are recommended in A2f.


## Concrete Boundaries And Contract Decision

Recommended A2f owns three complete read boundaries: `getProblemDetail`, `listProblemVisitsByProblem`, and `listProblemCandidates` (which completes `getOmniboxSuggestions`). It does NOT claim the whole problem domain is finished: `getRecentProblems` stays deferred for a deliberate sidebar action policy.

This is an output-contract correction, not merely a private annotation change. Zod schemas become able to represent null IDs already returned today. Current IPC only validates arguments and returns `unknown`; preload uses Promise assertions, not output parsing. Therefore changing these selected output schemas changes exported validation acceptance, but does not introduce new nulls, remove rows, alter current IPC runtime validation, or change valid-ID actions. Do not describe the shared schema change as nonexistent.

### Parent Detail ID Proof

`getProblemDetail(problemId: string)` uses `WHERE p.id = ? AND p.deleted_at IS NULL` (queries.ts:51). SQLite TEXT equality for the supported string argument means a matching row's ID equals the supplied string, including the empty string. A NULL ID never matches. Project the bound input string, NOT a falsely generic nullable column; it is valid only alongside that unchanged equality predicate. The query must still execute; do not synthesize a row from the input. The independent review refines the initial probe: do not assign `id: problemId` in JavaScript afterward, because driver UTF-8 round trips can normalize lone-surrogate/NUL text. SQL-bound projection must pass through the same native representation as the stored ID. Record the proof beside the conversion. No fallback, null replacement or ID generation is involved.

`ProblemRow` is otherwise only exported and used to define `ProblemDetail`; it has no other imported production consumer. A truthful full-row type may therefore use `typeof problems.$inferSelect` with explicit raw numeric time overrides, and `ProblemDetail = Omit<ProblemRow, 'id' | 'status'> & { id: string; status: string; submission_count: number; ac_count: number; submissions: ProblemSubmissionRow[] }`. This keeps the general row ID nullable and the equality-selected detail ID string. The current optional timestamps and omitted-column declarations can become the exact selected shape rather than perpetual hand-written lies. Do not globally force numeric timestamps to Date or strip previously returned extra columns.

### Exact Per-Output Null Policy

| Read/output | Reachable nullable fields | Correct A2f behavior |
| --- | --- | --- |
| Detail parent | Nullable schema fields including last_visited_at, first_solved_at, deleted_at; parent ID not null after equality | Preserve raw milliseconds/null, all 19 columns and computed aggregates |
| Detail submissions | Nullable submission ID; nullable schema fields; selected problem_id is non-null by equality but declared nullable row type remains safe | Preserve all 16 columns, null ID, tombstones, ordering, LIMIT 100; widen embedded output ID |
| Visit list | Nullable visit ID; NOT NULL problem_id and entered_at; nullable left_at/durations/session/leave_reason | Preserve exactly ten selected columns, all visits including tombstones, ascending entered_at, no limit |
| Omnibox first pipeline | Nullable problem ID and last visited instant | Preserve candidate selection, NULL Set key dedup, old relational ordering, URL fallback and final cap |
| Recent list (deferred) | Nullable problem ID and last_visited_at | No truthful UI action policy yet; old false declarations must not be described as fixed |

### Why Recent-List Widening Is Not Merely Type-Only

- `ProblemSidebar.tsx:174,181` sends `p.id` to string-only callbacks.
- `App.tsx:129,370-371` calls `openInternal({type:'problem-detail'/'notes', problemId})`; these are not nullable React state setters.
- `src/shared/types/browser.ts:20-21` requires a string route ID. `src/components/tabApi.ts:49` and preload keep `InternalPage` as the input type.
- At runtime `electron/browser/tabManagerTypes.ts:39-45` already rejects NULL/empty/whitespace IDs through `isNonEmptyId`; `registerBrowserShellIpc.ts:138-140` returns an empty string without opening a tab.
- Simply widening callbacks pushes type errors to App. Widening the stored route schema would be wrong because NULL is not an accepted internal page. A new UI no-op/disabled state or a separate nullable *request* type could model the existing rejected action, but either is a cross-layer design choice outside a strict query-only parity slice. Recommend a later explicit invalid-ID action design, not renderer casts or leaving preload's lie as the solution.

### Proposed Product File Boundary

Six product files for the detail-specialized alternative:

1. `electron/db/repositories/problem/queries.ts`: replace complete detail and visit queries; recent list and lookup unchanged.
2. `electron/db/repositories/problem/types.ts`: truthful schema-derived/raw-time detail and visit types; RecentProblem unchanged and explicitly deferred.
3. `electron/db/repositories/problem/omnibox.ts`: migrate remaining first pipeline; nullable ID/Set types; equivalent null-aware comparator.
4. `src/shared/types/problem.ts`: nullable omnibox ID and detail-local `submissionRecordSchema.extend({ id: submissionRecordSchema.shape.id.nullable() })`; general ProblemRecord remains unchanged until recent-list design.
5. `src/shared/types/coach.ts`: `problemVisitPointSchema.visit_id` nullable; no change to timeline parent/problem/submission IDs.
6. `src/features/problems/ProblemDetail.tsx`: remove the explicit narrower `SubmissionRecord` callback annotation/import so detail-specific type flows naturally; emitted rendering is unchanged.
README/spec/task updates and tests are additional documentation/verification files, not runtime product changes.

The independent review selected the existing `submissionRecordSchema.id` widening instead of specialization: this schema is documented as the embedded detail row and has no unrelated production consumer. This alternative also uses six product files: the five non-renderer paths above plus `src/shared/types/submission.ts`, with no renderer edit. Both alternatives were virtually typechecked; the approved one avoids a needless specialized schema.

CoachOrchestrator need not change: its visited ID assignment becomes honest when the destination schema widens. Its parent problem ID remains string via the equality-selected detail type. SessionTimelineView does not access visit_id anywhere; it builds points from time/duration/URL and uses kind/index keys.

## Probe Evidence (No Source Writes)

1. Loaded the frozen `drizzle/0000_baseline.sql` into Node 22.23.2 built-in SQLite 3.51.3 `:memory:` and enabled foreign keys. Inserted NULL/empty/nonempty parent IDs, NULL submission and visit IDs, NULL/zero/fractional instants and a tombstoned visit. `PRAGMA foreign_key_check` was empty. Original SQL returned NULL visit/submission IDs unchanged; full detail/submission rows retained omitted interface fields (`difficulty`, `tags_json`, `extra_json`, `is_first_ac`, `deleted_at`). `WHERE id = NULL` returned no parent; `WHERE id = ''` returned the empty ID. This is concrete schema-valid evidence, not hypothetical corrupt DB coercion.
2. Used the TypeScript 6.0.3 Compiler API with an in-memory `CompilerHost.readFile` override, `noEmit`, and the project's tsconfig to model output type changes without editing files. Broad all-ID widening produced exactly three diagnostics: CoachOrchestrator parent ID and the two sidebar action calls. Widening only omnibox, visit and submission IDs plus last_visited_at, keeping detail parent ID equality-narrowed, produced zero production diagnostics.
3. A third virtual compiler probe specialized only detail's submission schema, removed the redundant renderer callback annotation/import, widened visit/omnibox output IDs and used the exact oracle nullable comparator. Zero production diagnostics. This establishes the six-file type-surface feasibility; it does not verify the yet-unwritten Drizzle query implementation or test fixture program.
4. Installed Drizzle better-sqlite3 `.get()` returns undefined for no row and invokes `mapResultRow` otherwise (`node_modules/drizzle-orm/better-sqlite3/session.cjs:109-123`). Preserve `null` only at the repository's existing no-parent boundary. Timestamp columns decode through `new Date(value)` (`sqlite-core/columns/integer.cjs`); fractional or extreme raw values would be changed. Use explicit raw scalar projections for all externally returned timestamp columns, consistent with A2d/A2e.

## Implementation Constraints And Parity Matrix

### Detail And Visits

- Derive selected column names from schema or enumerate all current columns carefully. Detail currently selects `p.*` plus computed status/counts, submissions selects `*`. A projection omitting `difficulty`, `tags_json`, `extra_json`, `is_first_ac`, deletion metadata etc. is a runtime regression even when the old interface omitted them.
- Preserve CASE priority solved -> attempted -> stored status; correlated EXISTS/counts include deleted submissions and NULL-ID submissions. COUNT(*) is not COUNT(id). Match whole rows and property presence against frozen SQL, not only the public subset.
- Execute parent first; when absent return null without preparing/executing the submissions query. When present execute the second query normally, without adding a transaction or snapshot boundary (the old function has two ordinary statements).
- Submission LIMIT 100 applies after ORDER BY submitted_at DESC with no new tie breaker. Visit ordering is entered_at ASC with no new tie breaker. Preserve index-planner tie behavior as feasible and test same-timestamp fixtures against the same baseline connection.
- Query parameter equality must remain bound, case-sensitive and untrimmed; include empty/quoted/SQL-looking IDs and missing rows. Do not add parent joins to visit reads: orphan behavior with FK disabled is existing behavior.
- Preserve tombstones and all visit rows. Explicitly cover parent tombstone vs submission tombstone vs visit tombstone and zero deletion instant.
- Raw time projection types must truthfully include nullable fields; raw number generics are appropriate scalar declarations, not evidence of data validation. Do not route fractional instants through Date and getTime.

### First Omnibox Pipeline

- Keep the 24-candidate horizon BEFORE correlated latest-visit join; preserve its query/non-query predicates and rank ordering.
- The latest-visit correlated subquery orders entered_at DESC then id ASC and limits 1. The outer LEFT JOIN is on latest_visit.id equality, NOT a direct problem-ID join. A newest visit with NULL ID fails that join and causes existing canonical URL/source fallback; do not replace with a join that starts returning that visit.
- Preserve COALESCE(latest_visit.url, candidate.canonical_url), COALESCE(latest_visit.entered_at, candidate.last_visited_at), and CASE based on latest_visit.id nullness.
- Select nullable parent ID truthfully. Widen local ID and Set types. NULL remains one Set key; multiple NULL-ID candidates still dedup as before.
- Existing compareText performs JS abstract relational `<`. Null is coerced to numeric zero when compared with text; adding null-first or null-last is wrong. The frozen oracle already implements exact null branches with Number(other), preserving odd cases like numeric text, empty/whitespace text, nonnumeric strings and equal NULLs. Copy no oracle query helpers into production; small equivalent comparator logic may be independently implemented and differential-tested.
- Keep wildcard escaping, exact/prefix rank, trim/256 truncation, 64-visit second pipeline, canonical URL dedup and final limit eight.

### Required Verification

- New independent frozen legacy-detail/visit SQL oracle; do not call production helpers or reconstruct expected answers with the new Drizzle expression. Prefer typed native `.prepare<Params, Row>()` with truthful nullable oracle declarations rather than assertions.
- Differential full-object tests: empty DB, missing/deleted parent, empty/quoted/case-sensitive IDs, all nullable fields, NULL/empty child IDs, all extra row columns, tombstoned children, 101+ submissions, ties, NULL/zero/fractional time, query-only, no writes/events, transaction visibility/rollback, close/reinitialize.
- Error parity: native prepare/step errors at parent and child stages propagate unchanged; missing parent does not trigger child-query errors. No fallback swallowing.
- Extend existing frozen full omnibox oracle comparison for first-pipeline NULL parent and NULL latest-visit IDs; existing 38 tests already cover broad null/tie/horizon/escape behavior, but add first-pipeline injected-error coverage and explicit 24th/25th boundaries if needed.
- End-to-end schema tests: omnibox result with null problemId accepted by its schema; detail result with null embedded submission ID accepted by detail schema; null visit point accepted by ProblemTimelineData without modifying parent IDs. Schemas still reject wrong ID types; do not weaken string inputs or timestamp integer requirements.
- Add real-Electron repository cases for the three read boundaries. Existing Node SQLite probe is not native better-sqlite3 evidence. Parent owns serial test:db, full tests, UI/native/build and release-unchanged checks.

## Files Found / Code Patterns

Paths relative to `algo-electron/` unless prefixed `.trellis/`.

- `electron/db/repositories/problem/queries.ts:7`: recent list LIMIT precedes JS status filter; deferred.
- `electron/db/repositories/problem/queries.ts:36`: complete two-statement detail read and equality proof.
- `electron/db/repositories/problem/queries.ts:73`: ten-column all-visit read.
- `electron/db/repositories/problem/types.ts:1,31,48,59`: current manual false/partial row contracts.
- `electron/db/repositories/problem/omnibox.ts:13,61,85,248`: nullable candidate/Set, first pipeline, old comparator.
- `src/main/db/schema.ts:268,302,446`: truthful problems/visits/submissions schemas.
- `src/shared/types/problem.ts:15,30,40`: list/detail/omnibox shared output contracts.
- `src/shared/types/coach.ts:220,269`: visit-point and problem-timeline output schemas.
- `src/shared/types/submission.ts:10`: generic submission output; specialize only inside detail if desired.
- `electron/ipc/registerProblemIpc.ts:19-25`: no output parse/projection.
- `electron/ipc/trustedSender.ts:32-36`: handler return deliberately unknown; validates input only.
- `src/preload/index.ts:233-240`: unchecked IPC result assertions.
- `electron/coach/CoachOrchestrator.ts:769-780,824`: detail parent and visit-ID propagation.
- `electron/coach/llm/ContextGatherer.ts:79-88`: reads only detail title/canonical URL, not child IDs.
- `src/features/problems/ProblemDetail.tsx:11,196-197`: redundant generic submission annotation; ID only React key.
- `src/features/coach/SessionTimelineView.tsx:106,397`: visit ID unused; points use kind/index keys.
- `src/components/Omnibox.tsx:59`: nullable problemId only string-template key; URL is navigation action.
- `src/components/useOmnibox.ts:86-89`: suggestion action uses URL, not problemId.
- `tests/db/omnibox-suggestions-oracle.ts:1,227`: existing frozen oracle with truthful ID and equivalent null comparator.
- `tests/db/repositories.test.ts:873,946`: existing native basic recent/detail coverage, not sufficient for this contract.
- `tests/coach/coachOrchestratorLifecycle.test.ts:1690-1801`: real timeline integration fixture suitable for null-visit coverage.
- `tests/ipc/timestampSchemas.test.ts`: existing shared-schema tests, timestamp requirements must stay strict.

## External References / Versions

- No web research required; behavior is established from installed code and current repository, not guessed from newer online API versions.
- `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11 from package.json; TypeScript 6.0.3; Node 22.23.2; probe SQLite 3.51.3.
- Installed `better-sqlite3/session.cjs:96-128` and `sqlite-core/columns/integer.cjs` provide decoder/execution evidence; tests must use the project's actual Electron ABI before acceptance.

## Related Specs

- `.trellis/spec/project/drizzle-adoption.md`: truthful nullable legacy PKs, current-connection lifecycle, raw scalar parity, no false sql<string> ID casts; A2e policy requires a separately reviewed output-contract change, which this research proposes explicitly.
- `.trellis/spec/project/unix-millisecond-time.md`: raw millisecond IPC and nullable-field preservation; frozen migrations remain untouched.
- `.trellis/spec/backend/database.md`: database query and repository ownership.
- `.trellis/workflow.md`: review before implement/check; independent check and full gates before commit.
- Active task `prd.md`, `design.md`, `implement.md`: incremental problem-domain conversion, no directory/main split or release in this slice.

## Final Caveats

- This recommendation deliberately changes selected output type/Zod acceptance, not application-returned row data. It needs explicit design review/spec update by the parent before implementation; the researcher does not authorize itself to amend the existing no-shared-DTO-change A2e boundary.
- No real user DB was read. Synthetic schema-valid rows prove reachability, not prevalence.
- No code/spec/task metadata/Git operation performed. Only this research file was written. Virtual typechecking is feasibility evidence, not the production test gate.
- `getRecentProblems` remains a real outstanding query and type-policy issue. Do not mark phase3 or the problem domain complete. A later UI decision must say how invalid/unaddressable rows behave; filtering them or inventing IDs is not an acceptable implicit Drizzle refactor.
