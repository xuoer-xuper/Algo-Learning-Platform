# A2e Recent-Visit Candidate Review

## Independent Design Precheck (2026-11-19)

Verdict: approved for the bounded second pipeline only. No design blocker found.
Implementation and full validation remain pending; this is not a completed code review.

- The existing INNER JOIN uses equality on two TEXT/BINARY ID columns. A returned
  parent ID equals the existing NOT NULL `recent_visits.problem_id`, so selecting
  that FK is truthful and preserves empty IDs. NULL parent IDs cannot join; NULL
  visit primary keys do not invalidate their non-null FK. No filter/assertion or
  public DTO/schema change is needed.
- Keep the 64-row CTE limit before parent/tombstone/match filtering, with only
  `entered_at DESC` ordering. Do not add an ID tie-break, join inside the limit,
  or turn either query into global search. Outer ranking/dedup and first-pipeline
  nullable-parent behavior remain untouched.
- Drizzle raw `entered_at` needs an explicit CTE alias. Its SQL identity decoder
  preserves integer/zero and legacy diagnostic scalar values; a Date decoder
  would change fractional values. Final output must remain number/null for valid
  supported rows. The generic does not repair corrupt storage.
- Escape character must be exactly one backslash. Bound parameters for contains
  and escape are valid; literal templates require JS escaping as well as SQL
  quoting. All five fields and COALESCE(title) stay as before.
- Expected runtime error propagation remains synchronous: installed Drizzle
  better-sqlite3 `.all()` prepares and executes without an added catch/fallback.
- Differential oracle must freeze both original SQL pipelines and final ordering
  independently, with truthful nullable oracle typing and actual error comparison.
  Include 24/64 horizons, null/empty IDs, ties, tombstones, URL-only matches,
  wildcard literals, fractional/zero instants, read-only/no-write/no-event,
  transaction reads, reinitialization and native Electron ABI evidence.

## Precheck Evidence

- Inspected current repository implementation, baseline schema and installed
  Drizzle selection proxy/result decoder/native session.
- In-memory Node SQLite probe confirmed generated CTE INNER JOIN and bound
  ESCAPE retain a NULL visit ID with empty parent ID and epoch zero; nullable
  parent does not join. This is feasibility, not better-sqlite3/Electron proof.
- Initial ad-hoc probe used an incorrectly escaped JS template (empty escape
  string) and failed as expected; corrected bound single-character escape passed.
  Production was not modified and this is not a reported production defect.
- Pre-implementation `pnpm typecheck`, `pnpm typecheck:tests` and scoped ESLint
  for omnibox.ts/omniboxSuggestions.test.ts passed. Logs are ignored
  `tmp/drizzle-a2e-precheck-{typecheck,test-types,lint}.log`.
  No implementation test, full gate or installer claim is made.

## Findings Not Fixed

- Existing first-pipeline NULL problem IDs can reach the string-only suggestion
  DTO. This is pre-existing, outside A2e and requires an explicit ID policy.
  Do not skip/coerce those rows or widen public interfaces in this refactor.

## Implementation Review (2026-11-19)

Read-only review finds no actionable production/test issue. No source or test edits
are needed; the code is frozen for the parent full/native/build gates.

- Verified the constants/types, complete public function, first candidate pipeline,
  and all final helper functions are unchanged from HEAD85b95dc (normalized LF).
  Production diff is imports plus the intended complete second query only.
- All SQL/template literals in the independent oracle match pre-A2e source
  verbatim. Changes are explicit database injection, truthful nullable oracle ID
  types and the equivalent nullable relational comparator. Its null cases implement
  the original JS ToNumber rule, not null-last sorting; 324 representative pair
  probes agreed, including numeric text, empty text, whitespace and NaN inputs.
- The query uses the same native connection, exact limit placement, equality join,
  five escaped match expressions and scalar CTE alias. The selected visit FK is
  truthfully non-null without hiding the untouched parent-null behavior.
- The 38-case omnibox file includes the original five cases plus differential
  horizon/tie/null/escape/raw-time/lifecycle coverage. Original current-schema
  fixtures now store numeric milliseconds and retain explicit title/time nulls.
- Native additions isolate a 65th URL-only visit, parent-versus-visit tombstones,
  zero/precise milliseconds, NULL visit PK, empty parent ID, read-only data/event
  equality and absence of a newly created Drizzle ledger.
- Actual error test injects a native prepare failure only for the second query;
  it compares the thrown name/message/code directly without stripping causes.
- README/specs and A2e task boundaries correctly keep full omnibox/DTO policy,
  migrations, release, directory work and phase completion outside this slice.
  A2d bookkeeping only records its already-completed PR16/PR8 integration.

### Independent verification

- Focused tests passed: 3 files / 60 tests (omnibox38, lookup14, overview8), log
  `algo-electron/tmp/drizzle-a2e-review-focused.log`.
- Final `pnpm typecheck`, `pnpm typecheck:tests` and zero-warning scoped ESLint
  over production query, oracle, Vitest and native repository files all passed.
- `git diff --check` passed. Inspected parent `drizzle-a2e-db.log`: the actual
  Electron repository runner reports 19/19 passed, including both new A2e cases;
  existing legacy/Drizzle forced-kill matrix output also reports passes. Parent
  owns the final composite exit status and remaining full/build gate execution.
- No actionable findings or mechanical fixes remain in the reviewed code/tests.
  Final metadata should be updated with actual gate/commit/CI results by the parent;
  current pending checkboxes do not overclaim completion.
