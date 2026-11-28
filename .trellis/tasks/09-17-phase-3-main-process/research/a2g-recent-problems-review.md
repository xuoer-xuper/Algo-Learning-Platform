# A2g Recent Problems: Independent Design Precheck

Date: 2026-11-20. Scope: design only; no product code or user data changed.

## Early Verdict

Approved to implement the proposed bounded query/type/sidebar policy with the
following conditions. No further product decision blocks the change. The disabled
sidebar action behavior is intentional and must not be described as SQL-only
runtime equivalence. Detailed research integration follows when available.

- Use `.limit(sql.placeholder('limit')).all({ limit })`, not an SQL expression
  cast into `.limit()`. Installed 0.45.4 accepts number or Placeholder only.
  Independent generated SQL inspection confirms placeholders keep `LIMIT ?`
  whereas numeric NaN and negatives omit it. Native parity still needs testing.
- Extract existing `isNonEmptyId` behavior unchanged into a pure
  `src/shared/internal-page-id.ts` export `isInternalPageId(unknown): value is
  string`. Both existing main branches (problem/notes and script-install) and
  sidebar must call it. Keep strict shape/type validation and shared route/input
  schemas unchanged. Preserve UTF-16 length, exact whitespace/control/trim rules,
  including edge values accepted today; do not invent stricter Unicode repair.
- Keep all records visible and site-URL navigation active. For rejected IDs use
  disabled notes/detail buttons plus a visible row-level explanation (for
  example: ID unavailable, notes/details cannot open; original site remains
  available). A title on a disabled/pointer-events-none button is insufficient.
  Existing ListRow has no aria-describedby prop. Keep its API unchanged: include
  the same reason in its accessible label and show persistent ordinary text for
  sighted users. Buttons may additionally reference that text with describedby,
  but do not rely on disabled controls being focusable or hoverable.
  Do not use alert/live-region semantics for ordinary persistent record state.
- Preserve the existing sibling-button structure. Add a minimal local warning
  row/style only; no generic Button/ListRow redesign or route widening. Callbacks
  must narrow the captured ID through the shared predicate, not assertions or
  nullable widened callback/route types. Valid IDs retain exact callbacks.
- Use collision-free JSON serialization of the real unique `(platform,
  platform_problem_id)` tuple for React keys in both sidebar and home recent
  list. Colon concatenation can collide; nullable ID and array index are not
  stable identities. This is rendering identity only, never a replacement DB ID.
- Widen recent ProblemRecord.id and repository ID/last-visited output honestly;
  explicitly override detail schema ID back to string so existing getDetail and
  timeline parent guarantees do not regress. Keep input and time schemas strict.
- Query must retain platform truthiness plus bound equality, original status
  CASE and COUNT(*) including tombstones/NULL IDs, only descending last visit,
  raw nullable time, and SQL LIMIT before the existing JS status filter. No new
  sort key, status pushdown, active-child filter, count(id), fallback or decoder.

## Provisional File Boundary

Production: problem queries/types; shared problem output schema; new shared pure
ID predicate and the existing main predicate consumer; sidebar and home recent
list; minimal sidebar CSS. Documentation: shared helper README, affected domain
READMEs, spec/task/design/architecture contract notes. Existing input/route schema,
preload, App route dispatch, generic UI widgets, schema/migrations and other
queries do not need changes.

Tests must cover independent frozen SQL rows/errors for defaults, zero/negative/
fractional/NaN/infinite LIMITs; filter/order/status horizon/tombstones/null fields;
read-only/no-notification/transaction/lifecycle; native Electron parameter
forwarding; exact old-vs-shared predicate parity including script-install;
nullable list vs string detail schemas; multiple invalid rows with retained URL
navigation; disabled action suppression and visible accessible explanations;
valid action callbacks; tuple-key collision/reorder cases in both list consumers.

## Frozen Implementation Review (2026-11-20)

Both A2g implementers were frozen before review. Completed research, task/spec
contracts, tracked diff against32cd84d and untracked helper/tests were reviewed.
No actionable production or test finding was identified. No product/test fix was
necessary or made by this reviewer. A3 files remain design research only, not
approval to include any submission-domain implementation in A2g.

### Code And Oracle Audit

- Independent text comparison confirms all original recent-query SQL template
  bodies are preserved in the frozen test-only oracle. The oracle uses no
  production projection/query helpers. Other problem queries are byte-for-byte
  unchanged after the new recent implementation.
- Typed named LIMIT placeholder preserves native parameter forwarding. Raw
  nullable time, all eight projected fields, platform truthiness/equality,
  tombstones/COUNT(*), CASE priority, descending-time-only order and limit-before-
  JS-status filtering match original behavior. No added writes/transaction,
  lifecycle cache, decoder, catch or schema change was found.
- New shared predicate is an exact textual extraction of the old helper except
  its export/name. Both main parameterized route branches call it, including
  script-install; strict shape rules and route/input acceptance are unchanged.
- Recent output derives truthful nullable ID/time from ProblemRow; shared list
  ID is nullable and detail explicitly overrides ID as string. Existing seeded-
  ID tests assert/narrow their known fixtures rather than casting or weakening
  mutation inputs. Screenshot mock substitutes its input only after JS strict
  equality .find(), so it preserves that mock's exact matched value (unlike a
  forbidden native DB-result replacement).
- Sidebar retains every row, count, original URL action and sibling-button
  structure. Invalid notes/detail controls are disabled and handlers also check
  the shared predicate; visible persistent paragraph and focusable row accessible
  name carry the same explanation. No new route, generic widget change or alert
  semantics. CSS is limited to wrapping explanation and displaying disabled state.
- Sidebar/home JSON tuple keys avoid delimiter/null-ID collisions; reorder tests
  verify DOM identity, focus retention and callback updates, not only absence of
  console warnings. Predicate matrix retains odd accepted Unicode/code-unit
  behavior, and main route shape guards remain covered.
- Domain/shared/architecture documentation explicitly describes the intentional
  invalid-action policy, unchanged route acceptance and preserved database data.
  DB suite registers the new tests; UI spec uses isolated synthetic fixtures and
  retains existing renderer harness behavior outside its test-owned replacement.

### Reviewer Verification

- Production TypeScript: pass.
- Test TypeScript: pass.
- Scoped ESLint across changed and new TS/TSX/MJS files: pass, zero warnings.
- Independent focused Vitest:9 files /161 tests pass, including recent41,
  detail27, schema37, shared predicate3, browser guards/routes, notifications,
  invalid-action/tuple-key component8 and existing async surfaces11.
- git diff --check: pass; line-ending conversion notices only.
- Logs: ignored algo-electron/tmp/drizzle-a2g-review-{typecheck,typecheck-tests,
  eslint,focused}.log. Expected async error-fixture logging is not a test failure.

Parent separately reported serial test:db32 files474 plus native repositories23
and safety/crash matrices green, and actual Electron UI3 plus visual inspection.
Those were not rerun by reviewer. Parent full test:all/build/hooks/remote CI are
still separate gates. This acceptance is bounded A2g code review, not a release,
installer acceptance, whole-phase completion or A3 implementation approval.
