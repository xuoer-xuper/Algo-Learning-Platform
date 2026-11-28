# A2f Nullable Read Contract: Independent Design Precheck

Date: 2026-11-20. Review scope: design only; implementation has not been accepted.

## Verdict

Approved to implement the three bounded read boundaries, subject to the explicit
constraints below. No blocker requires a new product behavior decision for this
slice. The recent-list nullable-ID action policy is not approved or resolved here.
No product source, migration, schema, Git state or user database was changed by
this review.

## Contract Decisions

- Migrate complete `getProblemDetail`, `listProblemVisitsByProblem`, and the first
  omnibox candidate pipeline. Keep `getRecentProblems` byte-for-byte unchanged;
  its current string-only UI action contract needs a separate reviewed decision.
- Prefer widening `submissionRecordSchema.id` to nullable rather than inventing a
  detail-only duplicate schema. Its documentation calls it the embedded detail
  row; source search finds only the detail output schema and detail renderer as
  production consumers. This makes their existing nullable runtime ID honest
  without touching renderer behavior. The shared schema acceptance does change;
  describe it as an output-contract correction, not no contract change.
- Widen the omnibox output/local candidate/Set ID and the visit row/timeline visit
  ID together. Neither ID feeds an identity mutation or route in these paths:
  omnibox submits a URL, visits are rendered as ordered points, and submission ID
  is only a React key. Do not widen input schemas, general recent-list IDs,
  timeline parent IDs, or unrelated submission-query types in this slice.

## Required Design Refinement: Detail Identity

The equality predicate `problems.id = bound string` on baseline TEXT/BINARY IDs
proves the selected database text equals the *SQLite-bound* parameter. Use a real
bound SQL projection using the string parameter (not the column), with unchanged
predicate, not a falsely narrowed nullable column and not a JavaScript fallback.
The generic describes a bound string expression, not the schema's nullable ID.
The query must still execute and return null when no active parent matches.

Do NOT replace the returned ID in JavaScript with the original input string.
Driver UTF-8 encode/decode can normalize lone surrogate strings (and the built-in
Node SQLite probe also normalized NUL-containing result text). The SQL projection
passes through the same native binding/result representation as the stored ID;
a post-query `id: problemId` assignment does not. This refines the research's
claim that both approaches are always equivalent. Add native literal/Unicode/NUL
parity tests and retain empty-string ID behavior. The proof is specific to the
unchanged equality and supported string argument; it is not a general ORM cast.

## Query Invariants

- Detail still has two synchronous SELECTs, and no submission query runs when the
  active parent is missing. Keep all post-030 columns from `p.*` and submission
  `*`, including difficulty, tags_json, extra_json, is_first_ac and deleted_at.
  `getTableColumns` spread plus explicit raw timestamp overrides is appropriate.
  Avoid added output parsing, projection stripping, transaction, exception wrapper
  or catch-to-null. Counts include NULL submission IDs and tombstones; use row
  counts, and retain AC/attempted CASE precedence and limit 100 before returning.
- All outward timestamps remain raw SQLite scalars, with proper declared
  nullability and no Date/Number decoder. Date round trips truncate fractions and
  can invalidate extreme values; the old reads do not perform that conversion.
  Visit selection remains its exact ten fields, all tombstones, ascending entered
  time without new tie-break or cap. Missing/deleted parent does not filter visits.
- First omnibox CTE selects 24 before its latest-visit LEFT JOIN. Retain query vs
  empty-query predicates, rank/recency/ID ordering and literal LIKE escaping.
  Alias recent and latest visits distinctly. The correlated subquery is by
  problem ID, but the LEFT JOIN is on the selected latest *visit ID*. A selected
  NULL visit ID deliberately fails the join and uses the old canonical/source
  fallback. A problem-ID join or direct top-one projection would change this.
  Preserve second-pipeline limit 64 and final sorting/dedup/limit eight.
- Keep null-aware comparator exactly equivalent to JavaScript abstract relational
  comparison, including numeric and nonnumeric strings. Null-first/null-last is
  not equivalent. `Set<string | null>` retains one null dedup key.
- All three migrated boundaries have fixed limits or no limit, so Drizzle's
  omission of negative/NaN numeric limits does not affect this slice. Do not
  opportunistically migrate recent-list's caller-supplied limit; future work must
  preserve native LIMIT errors rather than silently dropping malformed limits.

## Evidence And Required Verification

Independent source inspection covered current SQL, all schema columns, native
Drizzle mapping and call sites. Installed dialect `buildLimit` drops negative/NaN
numbers. Installed better-sqlite3 session returns undefined for a missing row,
decodes selected fields and does not itself validate output schemas.

A no-file, in-memory Node 22.23.2 / SQLite 3.51.3 probe checked 17 string inputs
(empty, numeric-looking, case, whitespace, Unicode, NUL and lone surrogate) using
`SELECT id, ? AS bound WHERE id = ?`: all database-returned projections matched.
Three inputs differed from the original JS value after driver conversion; hence
SQL-bound projection is required. An initial single-table fixture hit a UNIQUE
collision between differently malformed surrogate inputs; the isolated-row probe
preserved each input case without conflating that encoding behavior.

A separate no-write JS probe checked the proposed explicit-null comparator
against the old operator for 324 pairs, including null, empty/whitespace,
numeric-looking/nonnumeric strings, NUL and Unicode: all matched.
These probes are design evidence only, NOT native Electron implementation gates.

Required before acceptance:

1. Frozen independent original detail/visit SQL oracle and unchanged full omnibox
   oracle. Compare full objects, keys, errors and notification absence, not only
   selected happy-path fields. Retain all existing tests.
2. Empty/missing/deleted/empty-ID parents; NULL/empty child IDs; tombstones; all
   optional/full-row fields; 101+ submissions; time ties, null/zero/fractional and
   non-Date-range values. Native driver failures at each query stage propagate.
3. Query-only, caller transaction visibility/rollback, closed/reopened connection,
   no writes and no notifications. No cached adapter or new connection.
4. First-pipeline 24/25 candidate horizon; NULL parent/latest visit IDs; ranking
   ties and literal escaping; public null ID schema acceptance with wrong-number
   ID rejection. Detail/visit output schema tests must keep integer-time checks.
5. Both TypeScript programs, lint, focused tests, real Electron repository cases,
   then serial parent-owned test:db/test:all/build:check and normal hooks/CI.

No lint/typecheck/test pass is claimed for yet-unwritten implementation. This
precheck did not run global/native/UI/build suites per the dispatch boundary.

## Code Review In Progress

Initial production review (before implementation freeze): no actionable behavior
regression found in the three conversions. The recent list, platform lookup,
second omnibox pipeline and frozen full omnibox oracle are unchanged. Extracted
legacy detail/visit SQL template bodies exactly match the new independent oracle.
Bound detail ID, full baseline fields, raw time overrides, correlated aliases,
NULL-visit fallback and null-aware comparator follow the approved design.

Production typecheck and scoped zero-warning ESLint passed. An initial test
program check observed an incomplete ContextGatherer fixture while the implement
worker was still filling its required whole-row fields; those fields appeared
before this note. Recheck after freeze rather than treating this transient
concurrent edit as a completed-code failure. Final code acceptance, focused tests
and parent full/native gates are still pending.

Follow-up: test-program typecheck now passes after the implement worker completed
its full-row mock fixture. Omnibox implementation/tests have been frozen by the
parent; no actionable issue found. The 70 DB plus 9 component worker results were
inspected; this reviewer has not yet run its own focused tests. Full slice freeze
and parent native gates remain pending.

## Frozen Implementation Review

Implementation freeze confirmed by parent on 2026-11-20. No actionable production
or test finding remains, and this reviewer made no product/test edits. Approved
for parent full/native/build gates; this is not a claim those gates or CI passed.

- Verified exact legacy detail/visit SQL template text against the independent
  oracle. No production schema/query helper is imported there. The established
  full omnibox oracle is unchanged from HEAD.
- Verified recent-list and lookup function text and the entire second omnibox
  candidate pipeline are unchanged. The first pipeline uses genuine CTE/select/
  LEFT JOIN query builders with distinct correlated aliases, raw timestamps,
  fixed limits and unchanged fallback/rank/match/dedup behavior.
- Schema-derived parent/submission rows preserve all baseline keys; full-object
  oracle comparisons and PRAGMA-derived key checks cover the extra legacy fields.
  Detail ID is SQL-bound, and native cases include Unicode/NUL/lone surrogate,
  nullable child IDs, fractional/out-of-Date-range instants and query-only mode.
- Shared nullable output changes are limited to omnibox, embedded submission and
  timeline visit IDs. Addressable parent/list/input types remain strict, integer
  timestamp validation remains strict, and URL-only UI actions are covered for
  nullable suggestions with both keyboard and pointer interaction.
- ContextGatherer fixture changes supply actual complete row fields; they do not
  weaken production types or redact-test assertions. DB runner explicitly adds
  the new focused suite. README/spec/architecture text records output acceptance
  changes and deferred recent-list policy rather than claiming phase completion.

Reviewer-executed verification:

- Production TypeScript: pass.
- Test TypeScript after fixture completion: pass.
- Scoped ESLint across all changed TS/TSX/MJS: pass, zero warnings.
- Focused Vitest: 5 files / 156 tests pass (detail/visits27, omnibox70,
  timestamp/output schemas36, omnibox component9, ContextGatherer14).
- `git diff --check`: pass (only existing CRLF conversion notices).
- Logs under ignored `algo-electron/tmp/drizzle-a2f-review-*` retain executed
  checks, including the transient initial test-type failure during worker edits.

Parent owns serial actual-Electron/native crash suites, full coverage/UI/build,
normal hooks and remote CI. No installer/release acceptance, whole-phase finish
or recent-list nullable-action policy is inferred from this review.
