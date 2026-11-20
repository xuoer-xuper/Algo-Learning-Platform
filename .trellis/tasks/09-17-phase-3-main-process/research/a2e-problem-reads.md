# Research: A2e Problem Reads And Policy-Neutral Next Slice

- Query: Find the smallest behavior-preserving problem query migration after A2d, without hiding nullable IDs or changing schema/DTOs.
- Scope: internal; installed Drizzle 0.45.4 and local SQLite construction probes.
- Date: 2026-11-19

## Findings

### Preliminary Recommendation

The whole omnibox function is NOT policy-neutral: its problem-candidate branch can return schema-valid NULL problem IDs into the string-only OmniboxSuggestion contract. However, its entire recent-visit candidate pipeline (`listRecentVisitCandidates`, omnibox.ts:136-174) is a natural, independently bounded query and CAN migrate without that policy decision. Select the existing NOT NULL `recent_visits.problem_id` after the unchanged INNER JOIN `problems.id = recent_visits.problem_id`; every returned value equals the old selected `p.id`, while Drizzle truthfully infers `string`. Do not filter, coerce, assert, or declare nullable p.id as sql<string>. Leave the first problem-candidate pipeline and existing final ranking/dedup mapper byte-for-byte unchanged.

This is one complete existing CTE/INNER JOIN query, not half-building SQL and handing it to native prepare. It removes one native prepare/cast boundary. Schema, DTO, public signature, list/detail/visit queries, first candidate pipeline and mutation paths stay unchanged. The final public omnibox null-ID bug remains documented, not fixed or claimed resolved.

A local no-write probe generated the proposed CTE/INNER JOIN with installed Drizzle and ran it against the frozen old SQL in Node22.23.2 built-in SQLite3.51.3. Empty/abc/literal100%/backslash/SQL-looking input/test queries matched selected scalar arrays, including NULL visit ID, empty problem ID, deleted visit/parent and fractional -0.5 instant. This is feasibility evidence only, NOT native better-sqlite3/Electron implementation verification. Python SQLite3.50.4 independently confirmed the old first pipeline returns NULL problem IDs and that the recent pipeline returns only joined NOT NULL FK values.

### Concrete Alternative If Parent Rejects The Two-Pipeline Split

Migrate `getProblemVisitStats` alone in `electron/db/repositories/stats/insights.ts:26-41`: one aggregate over all visits where `problem_id = ?`; preserves COUNT(*) including NULL visit IDs, COALESCE(SUM(duration_seconds),0), COALESCE(SUM(active_seconds),0), COALESCE(AVG(duration_seconds),0), all tombstones and empty-ID literal. No DTO IDs/timestamps returned, only existing numeric aggregate contract. Native SUM overflow must remain an error, not JS reduction/coercion; nullable durations contribute to COUNT but not SUM/AVG; do not add parent join or active-row filter. Use genuine Drizzle SELECT/WHERE with raw SQL aggregate expressions where Drizzle sum/avg default string decoding would change runtime. This is independently safe but changes next-domain order; the existing recent-visit CTE is the preferred no-order-change slice.

## Caveats / Not Found

No production or test file has been changed. Full DTO reads remain blocked on an explicit nullable-ID policy; do not cast around this blocker. Research followed role isolation and did not load implement.jsonl/check.jsonl.
## Files Found

Paths below are relative to `algo-electron/` unless prefixed `.trellis/`.

- `electron/db/repositories/problem/omnibox.ts:136`: one independently bounded recent-visit CTE + parent INNER JOIN candidate query, recommended implementation target.
- `electron/db/repositories/problem/omnibox.ts:82`: first problem-candidate CTE + correlated latest-visit query; preserve unconverted because NULL problem IDs are reachable.
- `electron/db/repositories/problem/omnibox.ts:48`: public trim/truncate, concatenation, sort, dedup and final eight-result cap; preserve unchanged.
- `electron/db/repositories/problem/queries.ts:7`: recent/detail/visit DTO reads still masked by old casts and awaiting ID policy.
- `src/main/db/schema.ts:268`: nullable problem PK, NOT NULL canonical/platform keys; no schema edits allowed.
- `src/main/db/schema.ts:302`: visit PK is nullable, but `problem_id` is NOT NULL TEXT; this supports the safe recent-visit projection.
- `src/main/db/client.ts:10`: wraps current native connection without owning lifecycle.
- `src/shared/types/problem.ts:40`: OmniboxSuggestion requires string problemId and numeric/null lastVisitedAt.
- `electron/ipc/registerBrowserShellIpc.ts:171`: returns repository output without runtime output parsing; does not make legacy NULL IDs impossible.
- `src/preload/index.ts:174`: casts invoke output rather than validating IDs; unchanged in this slice.
- `tests/db/omniboxSuggestions.test.ts:23`: stale string timestamp fixture types and null-coalescing fixture defaults must be repaired while retaining test intent.
- `tests/db/repositories.test.ts`: authoritative real-Electron ABI repository suite; add focused recent-visit/omnibox read case here.
- `tests/verify.mjs:38`: omniboxSuggestions.test.ts already included in focused DB runner; no runner edit needed if tests remain there.
- `electron/db/repositories/problem/README.md:34`: bounded candidate/index/read-only contract.
- `electron/db/repositories/stats/insights.ts:26`: optional aggregate-only next-domain alternative, not needed if recommended pipeline is accepted.

## Why Whole Omnibox Is Still Blocked

`problems.id` is truly nullable (`schema.ts:271`, table-level PK at294). The first pipeline selects it without an inner equality exclusion (`omnibox.ts:100`); its last-visit LEFT JOIN does not reject NULL parents. The previous `as OmniboxCandidateRow[]` merely lies about runtime nullability. `toCandidate` forwards NULL unchanged, Set dedup collapses multiple NULL IDs, and the final wire output can contain a NULL `problemId`. A0 deliberately preserved this schema behavior. Rejecting/skipping/coercing/fabricating an ID would be behavior change. Widening public OmniboxSuggestion is cross-layer policy work. Do not make either change in A2e.

The recent pipeline is different: its existing INNER JOIN excludes NULL p.id under SQL equality, and its selected NOT NULL FK has identical TEXT/BINARY comparison semantics to the joined parent ID (both columns are TEXT, no custom collation). Selecting `recent_visits.problem_id` is an equality-preserving projection, not narrowing via assertion or new filter. Empty IDs remain empty and valid joined rows. NULL visit IDs do not matter: their non-null FK still identifies the parent. This proof assumes the validated baseline schema; do not promise compatibility with a tampered custom-collation schema.

## Proposed Implementation Boundary

1. Only replace the body/query of `listRecentVisitCandidates` in `omnibox.ts`, plus imports needed by it. Use `createDrizzleClient(getDb())` inside the call; no global client, new connection or changed function invocation order.
2. Build `$with('recent_visits').as(db.select(...).from(problemVisits).where(isNull(problemVisits.deleted_at)).orderBy(desc(problemVisits.entered_at)).limit(RECENT_VISIT_CANDIDATE_LIMIT))`.
3. Preserve selected CTE columns `id`, `problem_id`, `url`, `entered_at`; no extra ordering/tie breaker. Use a raw `sql<number>` projection of the entered-at column with an explicit `entered_at` alias for scalar preservation, NOT `sql<string>` on nullable IDs and NOT a Date decoder. The existing read passes stored scalar instants through unchanged; in particular Date would truncate fractional storage even though that storage violates the application integer-time contract. No new normalization/rejection in this query refactor. Valid post030 rows remain numeric, including 0; no test production fallback for obsolete TEXT fixtures.
4. Select `problem_id: recentVisits.problem_id`, the parent title/platform/platform-key/canonical URL, recent URL/raw instant and literal `sql<'history'>` history value. The source expression is a literal, so its narrow type is truthful. The result is structurally assignable to the existing candidate row type with no row assertion.
5. INNER JOIN the existing `problems.id = recentVisits.problem_id`; parent `deleted_at IS NULL` remains AFTER the CTE limit. Both visit and parent epoch-zero tombstones are excluded.
6. For a nonempty query, use `or()` of the same five `COLLATE NOCASE LIKE boundContains ESCAPE backslash` expressions. Keep COALESCE only on title. Use SQL templates around specific expressions, not one giant raw query. Keep existing `createMatchParams`/escape algorithm and parameters. For empty query omit match predicates entirely.
7. Keep `.all()` synchronous. Do not introduce transaction, output schema parsing, catch/fallback, logging, notifications, query cache, grouping, window functions or global data loading.
8. Preserve the first query, FIELD_MATCH_SQL/FIELD_RANK_SQL (still used there), `toCandidate`, comparator, URL normalization and dedup order. Do not export private query helpers just for tests.

Expected production touched file: only `electron/db/repositories/problem/omnibox.ts`. Expected test files: `tests/db/omniboxSuggestions.test.ts`, new frozen `tests/db/omnibox-suggestions-oracle.ts`, and `tests/db/repositories.test.ts` for native ABI. Parent may update README/spec/task evidence. No schema/baseline/migration/IPC/shared DTO/renderer/queries.ts/version changes.

## Compatibility And Differential Test Plan

Freeze original full two-query SQL and final JS control flow in a test-only oracle, independent of production query helpers. Use truthful nullable ID typing or unknown for oracle-only observations rather than duplicating the old type lie. Compare full ordered public results against this oracle and snapshot raw DB/notifications, not only generated SQL. SQL tracing can additionally prove exactly two statements and no writes. Do not change public visibility to test a private function.

### Required Scenarios

- Empty DB; empty/whitespace query; exact trim then slice256 behavior for direct calls; input literals quotes, percent, underscore, backslash and SQL-looking text. Match title/platform/key/canonical and history-URL-only terms. Include ASCII case, non-ASCII case distinction because SQLite NOCASE and JS lowercase are different algorithms; preserve them, do not replace with locale-aware matching.
- Current five tests retained with numeric fixture instants. Change `timestamp()` to return parsed integer milliseconds; fixture lastVisitedAt/deletedAt/enteredAt become numbers. Preserve explicit NULL title and lastVisitedAt with `=== undefined` checks rather than `??`. Keep required first_seen/created/updated instants non-null independently of optional last visit. Add `typeof(column) = 'integer'` assertions for valid non-null fixture times, 0 and nullable last visit cases.
- 65+ active visits with a URL-only match just outside the64 horizon. Filtering happens AFTER limit, so it remains absent. Deleted visits do not consume the64 slots; visits for tombstoned/missing parent DO consume slots before the parent INNER JOIN/filter. Preserve exact behavior even if product behavior seems suboptimal. Orphan fixture can be seeded using controlled FK-off insertion; restore pragma immediately.
- More than24 problem candidates, 64 recent visits and8 final suggestions with duplicate URLs/problem IDs. First24 limit still happens before join/latest-URL ranking and is unchanged. Do not increase horizons to make assertions pass.
- Distinct positive/negative/epoch-zero millisecond values, fractional raw instant in isolated compatibility fixture, NULL problem last visit, NULL title, explicit empty title/URL/string ID. The recent query should not introduce Date/Number conversion. No new guarantee for arbitrary malformed scalar storage; any deliberate hostile-data behavior change belongs in separate validation work.
- Tie visits at the64 cutoff and equal millisecond time. CTE currently orders only entered_at DESC; no ID tie breaker permitted. Pin same-run legacy differential results rather than declaring a new total-order public guarantee. Latest visit in the untouched first pipeline DOES have entered_at DESC/id ASC; include a case that distinguishes it from recent query order.
- Active parent with NULL visit ID; nullable parent rows; empty parent ID with visit; source priority history over problem on otherwise equal comparator values; same problem repeated visits; normalized URL duplicates and invalid URL trim fallback. Null parent rows must remain the same final output from the untouched first pipeline, not be filtered to make typed recent rows look globally valid.
- Fractional/out-of-range instants are diagnostic oracle fixtures, not a request to change production validation. For normal supported rows assert every output lastVisitedAt is number/null, never Date.
- Read-only connection/query_only succeeds; no R4 notifications, schema/ledger mutations or writes; close/reinitialize does not reuse closed client; active transaction sees uncommitted inserts and rollback still works; missing-table/read errors propagate synchronously (do not catch and return[]).
- Native Electron suite: seed actual post030 database with >64 horizon boundary, null visit ID/empty parent ID and integer/zero times, compare frozen oracle output. Native ABI test is additional evidence, not substituted by node:sqlite feasibility probes or Vitest.

### Ordering And Deferred Queries

The final comparator remains exact/prefix/substring rank, then `(lastVisitedAt ??0)` descending, history priority, problem ID and URL. Neither SQL candidate query substitutes for this JS ordering. Candidate concatenation remains problem pipeline then recent pipeline, and stable equal-comparator ordering is preserved. No new tie guarantees in query construction.

No pagination/status changes are allowed in this slice. `queries.ts:28` applies SQL LIMIT before optional JS status filter; derived status counts all submissions, including tombstones; detail limits100 before returning full submission rows; visit reads preserve tombstones and ascending entered_at. All remain untouched and still require their own DTO-policy step.

## Verification Plan

Implement/check agent: both typechecks, targeted ESLint and `pnpm vitest run tests/db/omniboxSuggestions.test.ts tests/db/problemLookup.test.ts tests/db/problemOverview.test.ts`. Parent serializes `pnpm test:db`, full `pnpm test:all`, `pnpm build:check`, normal hooks, immediate push, PR CI and integration CI. New fixture data must use the existing current schema (numeric time), not legacy ISO rows. `test:db` already includes omnibox file; retain native case under repositories.test.ts which is excluded from Vitest and run by verify.mjs. No new installer/release claim is required for this bounded read-only slice.

## Related Specs

- `.trellis/spec/project/drizzle-adoption.md`: same lifecycle-owned connection, truthful nullable PKs, bounded slices, numeric output and migration exclusion.
- `.trellis/spec/project/unix-millisecond-time.md`: supported current storage is integer milliseconds; keep historical migration fixtures untouched.
- `.trellis/spec/project/data-refresh.md`: reads emit no committed-write notifications.
- `.trellis/spec/backend/database.md`: query-builder usage with locally bounded SQL expressions.
- `.trellis/spec/shared/code-quality.md`: no non-null assertions/any or unchecked row casts.
- `.trellis/spec/backend/type-safety.md`: truthful inferred projections and public boundary types.
- `.trellis/tasks/09-17-phase-3-main-process/research/a2-problem-queries.md`: prior full-domain audit, unresolved DTO policy and omnibox horizons.

## External References And Probe Limits

No web research was required. Inspected installed drizzle-orm0.45.4 SQLite SELECT/CTE builder and scalar alias generation; generated query via `drizzle.mock().toSQL()` and ran old/new selected scalar arrays on Node22.23.2 built-in SQLite3.51.3. A separate PythonSQLite3.50.4 probe confirmed nullable candidate behavior. Both are in-memory and did not write files or use user DBs. The first two ad-hoc matching probe attempts had harness-only backslash escape transcription errors; corrected probe decoded source template backslashes exactly and bound the single-character escape. This is not evidence of a production escaping defect. No full test suite, Electron process, native better-sqlite3 replacement, git operation or production edit occurred.

## Final Caveats

The complete omnibox migration and recent/detail/visit DTO migrations are NOT complete or policy-approved. A2e only removes the existing recent-visit pipeline's native-query cast by projecting its equality-proven NOT NULL FK; the nullable first pipeline remains visible technical debt. If this granularity is rejected, the documented getProblemVisitStats aggregate is the concrete policy-neutral alternative, not permission to redesign ID handling silently.