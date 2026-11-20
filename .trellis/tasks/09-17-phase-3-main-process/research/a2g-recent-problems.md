# Research: A2g Recent Problems And Unaddressable IDs

- Query: Complete getRecentProblems with Drizzle and define nullable/unaddressable-ID caller policy without dropping records or weakening routes.
- Scope: internal; installed dependency/source inspection and synthetic in-memory SQLite probes only.
- Date: 2026-11-20

## Findings

### Recommended Bounded Decision

Approve one cross-layer A2g slice, following independent design review:

1. Convert the complete getRecentProblems SELECT to a real Drizzle select builder, preserving every row, nullable ID, timestamp, order, and error.
2. Keep canonical-URL website navigation for every record. Disable only sidebar notes/detail actions whose IDs fail the existing internal-page ID rule, with a clear explanation for keyboard, screen-reader, and pointer users.
3. Widen the recent output contract honestly; explicitly retain string-only detail parent ID and all input/route contracts. Do not repair/drop IDs, fabricate fallback IDs, normalize strings, or silently repair data.
4. Extract the existing pure ID predicate unchanged to a shared kebab-case utility, used by main validation and sidebar action availability.
5. Use the existing unique (platform, platform_problem_id) tuple for sidebar/home React keys. This is display identity, not a database ID.

Disabled-action affordance and nullable output-schema acceptance are deliberate contract/UI corrections, NOT purely runtime-equivalent refactoring. SQL behavior, read-only execution, and connection ownership must remain equivalent. A2f explicitly left this decision open.

### Files Found And Minimal Production Boundary

Paths are relative to the supplied release worktree. Line references describe the inspected pre-implementation sources.

| File | Role and proposed boundary |
| --- | --- |
| `algo-electron/electron/db/repositories/problem/queries.ts:7` | Native recent SELECT; convert only this function, borrowing detail query correlated-expression patterns. |
| `algo-electron/electron/db/repositories/problem/types.ts:20` | Handwritten RecentProblem falsely excludes null ID/time; derive stored fields from ProblemRow plus numeric count. |
| `algo-electron/src/main/db/schema.ts:268` | Source of physical nullable ID/time and NOT NULL unique platform/key. Read only; no schema edits. |
| `algo-electron/src/main/db/client.ts` | Existing-connection adapter; construct at call site and execute synchronously. |
| `algo-electron/src/shared/types/problem.ts:15` | Widen list ID to nullable; detail extension at line30 must explicitly override id with z.string(). |
| `algo-electron/electron/browser/tabManagerTypes.ts:22` | Existing pure ID rule and strict route-object validator; extract only the rule/helper, not object validation. |
| `algo-electron/src/shared/internal-page-id.ts` | Suggested NEW pure utility, no Node/Electron/DB imports, exported isInternalPageId predicate. |
| `algo-electron/src/features/problems/ProblemSidebar.tsx:144` | Preserve rows/URL action; shared predicate, guarded callbacks, explanation, disabled actions, tuple keys. |
| `algo-electron/src/features/home/HomePage.tsx:205` | URL-only recent cards; use tuple keys rather than nullable ID. |
| `algo-electron/src/styles/app-shell.css:522` | Minimal wrapping/secondary text for invalid-row explanation; preserve normal-row visuals. |
| `algo-electron/src/shared/README.md` | Maintainer-owned follow-up: document process-neutral pure route-ID utility. |

Read-through files needing no behavioral edit:

- `algo-electron/electron/ipc/registerProblemIpc.ts`: existing handler forwards to repository; preserve wire shape.
- `algo-electron/src/preload/index.ts:233`: recent/detail return shared output types; do not add output parsing here.
- `algo-electron/src/features/problems/problemsApi.ts:12`: returns ProblemRecord[]; widening propagates without duplicate DTO.
- `algo-electron/src/features/home/homeTypes.ts:7`: derives fields with Pick<ProblemRecord>; no parallel nullable type.
- `algo-electron/src/components/ui/Button.tsx:46`: IconButton already forwards disabled/ARIA props and makes title its accessible name.
- `algo-electron/src/components/ui/ListRow.tsx:3`: accepts label/title/children but NOT arbitrary native or ARIA props.
- `algo-electron/src/shared/types/browser.ts:14`: route schema stays string-only.
- `algo-electron/src/shared/types/ipc/problem.ts:19`: input identifier/listRecent validation unchanged.

### SQL And Type Patterns

Frozen original query: `algo-electron/electron/db/repositories/problem/queries.ts:7`.

- Select exactly eight existing properties: ID, platform, platform problem ID, canonical URL, title, last visit time, effective status, submission count.
- Filter active parents only with deleted_at IS NULL; deleted_at=0 is still deleted. Do not drop NULL/blank/unaddressable IDs.
- Any matching AC makes status solved; otherwise any submission makes attempted; otherwise stored status. Submission tombstones count. Use count()/COUNT(*), not count(submission ID), because child IDs can be NULL.
- Correlated equality stays submissions.problem_id = problems.id. NULL parent IDs do not match NULL child keys; do not rewrite equality as IS NULL.
- Only truthy platform adds exact case-sensitive equality. Empty string means no filter for direct repository calls; quote/wildcard characters remain bound data.
- Order only by last_visited_at DESC, preserving NULL placement and ties; no new ID tie-breaker.
- LIMIT happens in SQL, then the existing truthy status filter runs in JS. Pushing status down changes results.
- Select raw numeric milliseconds with sql<number | null> around last_visited_at, as detail already does at queries.ts:46. Do not decode through Date. Test zero, null, fractional and out-of-Date-range SQLite numeric values at repository level.
- Synchronous createDrizzleClient(getDb()) read; no global adapter, second connection, transaction, cache, notifications, migration changes, or catch/default fallback.

Detail at queries.ts:38 already supplies eq/exists/count()/CASE patterns. Do not replace a complete query with sql.raw; no additional generic repository abstraction is required.

ProblemRow at types.ts:3 derives physical nullable IDs from $inferSelect and restores numeric timestamps. Suggested recent type:

```ts
type RecentProblem = Pick<
  ProblemRow,
  | 'id'
  | 'platform'
  | 'platform_problem_id'
  | 'canonical_url'
  | 'title'
  | 'last_visited_at'
  | 'status'
> & { submission_count: number }
```

problemRecordSchema.last_visited_at is already nullable integer; widen only ID there. Explicitly override detail ID with z.string() or the list change unintentionally permits NULL detail parent ID. Preserve the existing detail equality/projection proof and string input.

### Critical LIMIT API Finding

Drizzle0.45.4 SQLite `.limit()` accepts number | Placeholder, NOT SQL:
`algo-electron/node_modules/drizzle-orm/sqlite-core/query-builders/select.d.ts:428`.
`.limit(sql`${limit}`)` works in JavaScript but fails the typed API; a cast is wrong.

Use the supported placeholder:

```ts
// Preserve native LIMIT ? value/error semantics, including NaN.
.limit(sql.placeholder('limit'))
.all({ limit })
```

Installed dependency evidence:

- `sqlite-core/dialect.js:212`: buildLimit emits an object, or a number only if >=0. Direct .limit(NaN) silently omits LIMIT; negative numbers also omit it. Placeholder objects always emit LIMIT ?.
- `sql/sql.js:361`: fillPlaceholders forwards an ordinary placeholder value unchanged, without clamping/sanitizing/omitting NaN.
- `sqlite-core/query-builders/select.js:641`: all(placeholderValues) forwards values to the prepared query.
- `better-sqlite3/session.js:74`: mapped select fills placeholders and forwards values to the native raw-row statement path.

A no-file TypeScript compiler probe accepted placeholder syntax and rejected SQL-expression syntax with TS2345. A generated-query / Node22.23.2 SQLite3.51.3 synthetic in-memory probe matched old LIMIT ? result/error semantics in 17/17 cases:

| Inputs | Result on small fixture |
| --- | --- |
| -3, -1 | All rows |
| -0, 0 | No rows |
| 1, 2, 3, 50 | Normal cap |
| NaN, Infinity, -Infinity, 1.5, -1.5 | datatype mismatch |
| Number.MAX_SAFE_INTEGER, 2**63 - 1024 | All fixture rows |
| 2**63, Number.MAX_VALUE | datatype mismatch |

Node reported Error / ERR_SQLITE_ERROR / datatype mismatch. This is feasibility evidence, NOT the actual Electron better-sqlite3 gate. Native wrapper/name/code details need that driver's oracle comparison.

### Exact ID Policy And Caller Safety

The main predicate at `algo-electron/electron/browser/tabManagerTypes.ts:29` requires:

- String length1..200 UTF-16 code units (value.length, not code-point count).
- value.trim() === value.
- No ECMAScript /\s/u character anywhere.
- No code point <32 or DEL127.

Do not replace it with Boolean(id?.trim()) or length>0. No Unicode normalization, sanitization, UUID requirement, or expanded control blacklist: currently accepted edge strings stay accepted. Extract pure logic unchanged; do not import the Electron-dependent tab-manager module into renderer. Preserve main object-key checks at tabManagerTypes.ts:39.

`algo-electron/electron/ipc/registerBrowserShellIpc.ts:139` already rejects invalid internal pages by returning ''. Existing invalid actions look clickable but do not open a page. The disabled affordance makes that restriction explicit; main remains the trust boundary.

Sidebar callbacks stay `(id: string) => void`. Compute availability using the shared predicate and guard callback bodies with it as well. disabled={!canOpen} alone does not narrow a nullable captured property in TypeScript. No as string, id!, empty fallback, or synthetic platform-based route ID.

### Accessible Explanation And Stable Keys

IconButton supports native disabled today. Title alone is insufficient: disabled buttons are not keyboard-focusable, and sidebar action CSS begins at opacity0 (`app-shell.css:593`, `app-shell.css:616`).

Recommended minimal affordance:

- Show a visible short secondary reason on an unaddressable row: its identifier cannot be used for local notes/detail, but the original problem remains openable. Let the explanation wrap at narrow sidebar widths.
- Add the same reason to the existing URL ListRow label; its always-focusable action exposes it to assistive technology.
- Set both icon buttons disabled; translated title/accessibility name includes the reason. Preserve valid-row titles.
- Keep URL ListRow and buttons as siblings, never nested interactive roles; preserve Enter/Space URL activation.

This uses existing ListRow props and needs no common primitive API change. If choosing aria-describedby instead, add an explicit optional description prop and tests to ListRow: it currently cannot receive/forward that attribute. Visible text plus extended accessible name is the smaller option. Do not call a title-only tooltip keyboard-accessible.

Use `JSON.stringify([p.platform, p.platform_problem_id])` for both surfaces' keys. Schema lines272/273 make both fields NOT NULL and line296 enforces the composite unique index. JSON encoding avoids delimiter collisions such as ['a:b','c'] versus ['a','b:c']. Multiple NULL IDs remain distinct through their keys. Do not use index/random/p.id ?? ''. This is display identity, not a substituted database ID.

### Required Verification Matrix

Use a frozen original SQL query as an independent oracle, not a wrapper around converted implementation:

- Empty DB; active/deleted-at-zero/nonzero parents; multiple NULL IDs, empty/whitespace/control/Unicode IDs; canonical URL and title nullability.
- Zero/NULL/fractional/raw numeric timestamps; ties; all selected values/property names/counts and exact result order against oracle.
- AC wins, tombstoned AC still counts, non-AC, no submissions, NULL child IDs counted by COUNT(*), NULL parent equality does not join NULL keys.
- Undefined/empty/exact/case-mismatch/quote/wildcard platform filters; status-after-LIMIT fixture where SQL-pushed filter changes rows.
- Default/positive/zero/negative/fractional/NaN/infinite/numeric-boundary limits; compare results or errors under actual native Electron better-sqlite3 as well as synthetic feasibility probes.
- query_only, no writes/notifications/schema/ledger drift, close/reopen, transaction visibility/rollback, propagation of SQL failures.

Likely test boundaries:

- New `algo-electron/tests/db/problemRecent.test.ts` (or isolated recent section) plus frozen SQL helper; register at `algo-electron/tests/verify.mjs:21`.
- `algo-electron/tests/db/repositories.test.ts`: actual native query/limit/null cases.
- `algo-electron/tests/ipc/timestampSchemas.test.ts:109`: detail null ID still rejected; line111 intentionally changes to accept list null ID. Numeric IDs remain rejected; timestamp integer and input-schema guards unchanged.
- `algo-electron/tests/browser/tabManagerTypes.test.ts`: full unchanged page validation after extraction; predicate matrix for 200/201 code units, whitespace/control/DEL, quoted/accepted Unicode, and wrong types.
- `algo-electron/tests/components/asyncStateSurfaces.test.tsx` or focused sidebar suite: invalid rows visible; canonical URL works with click/Enter/Space; notes/detail disabled with explanation, callbacks never invoked; valid boundary IDs pass through exactly. Homepage remains URL-only.
- Multiple NULL rows and tuple delimiter-collision fixtures: no duplicate-key warning, refresh/reorder retains distinct keyed elements. Compact-width/focus visibility check and no nested interactive controls.

Potential test-only type fallout: existing tests obtain recent[0].id then pass it to string-only mutations, including `algo-electron/tests/db/dataChangeNotifications.test.ts:121` / near282, `algo-electron/tests/db/auditDataIntegrity.repro.ts:272`, `algo-electron/tests/coach/coachOrchestratorLifecycle.test.ts:1709` / near2335. Assert/narrow known seeded IDs rather than casting or widening mutation inputs. Full test typechecking may find more sites. Native recent usage at repositories.test.ts:875 should also be checked.

### External Dependency References And Versions

Evidence is version-matched installed package source, not inferred from latest web examples:

- `algo-electron/package.json:68`: better-sqlite3 13.0.3, drizzle-orm 0.45.4; drizzle-kit 0.31.11 at97 and Electron43.4.0 at98.
- `algo-electron/node_modules/drizzle-orm/package.json:3`: installed ORM0.45.4.
- Installed sqlite-core/query-builders/select.d.ts:428, sqlite-core/dialect.js:212, sql/sql.js:361, better-sqlite3/session.js:74 establish supported API and binding.
- Installed Zod4.6.7; nullable()/extend() already used in shared schemas.
- Synthetic runtime Node22.23.2 / built-in SQLite3.51.3 is NOT the app driver.

No web fetch was necessary for this installed-version API question.

### Related Specs And Prior Decisions

- `.trellis/workflow.md`: persisted bounded research, review behavior changes, independent quality verification.
- `.trellis/spec/project/drizzle-adoption.md`: nullable legacy IDs, raw numeric reads, existing connection, real builders, notification preservation; direct numeric LIMIT warning.
- `.trellis/spec/backend/database.md` and `.trellis/spec/backend/type-safety.md`: schema-derived typed DB contracts without assertions.
- `.trellis/spec/frontend/type-safety.md`: shared types instead of duplicate DTOs.
- `.trellis/spec/frontend/components.md` and `.trellis/spec/frontend/css-design.md`: keyboard/accessibility and existing visual patterns.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` and `.trellis/spec/guides/semantic-change-checklist.md`: follow output contract through repository/shared/preload/UI/action boundaries.
- This task's research/a2f-nullable-contract.md, research/a2f-nullable-contract-review.md, design.md, and implement.md: A2f left getRecentProblems and nullable-ID action policy explicitly deferred.

## Caveats / Not Found

- This report is not implementation, design approval, or a quality-gate pass. Independent approval of disabled-action/output-contract changes is still required.
- Only synthetic in-memory probes were used. No user DB, native/global/UI/build suite, or Git operation was run by this researcher; only this task research file was written.
- Shared README still describes renderer-oriented utilities but already documents shared main/renderer time.ts. Document the new process-neutral route-ID helper; do not import Electron runtime into renderer.
- listRecent input-schema comment claims empty platform means unmatched equality, but executable repository uses truthiness/no filter. Preserve executable behavior; stale comment correction must not change wire validation.
- Composite display-key uniqueness relies on the supported NOT NULL unique text tuple. Exhaustive malformed-Unicode/NUL driver normalization of platform/key was not proved; add native evidence if broader storage cases enter scope, without inventing IDs.
- No existing shared ID validator or arbitrary-ARIA ListRow API found. No generic routing framework, schema/migration change, or directory move is needed.
