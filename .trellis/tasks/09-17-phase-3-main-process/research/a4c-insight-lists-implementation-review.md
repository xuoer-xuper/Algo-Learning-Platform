# A4c Insight Lists: Independent Implementation Review

Date: 2026-11-27. Base: 93c0df29655492fcb9182aa073a8d68e6c537a23.
Review uses the C worktree and the parent-approved A4c contract only. This is
independent implementation acceptance, not whole-phase, merge or release approval.

## Verdict

All twelve changed/new product, test and verification-runner files were reviewed,
along with the affected documentation and DB-to-renderer/AI caller paths. No
production defect or unapproved scope expansion was found. Two local assertions
in the new native LIMIT test were fixed after the parent paused its gates. No
production file was changed by this reviewer.

The four reads, truthful nullable outputs and bounded Dashboard key correction
match the accepted precheck. Parent-owned serial full DB, full verification,
build, source-freeze and remote CI gates remain separate acceptance requirements.

## Findings (Fixed)

- File: algo-electron/tests/db/repositories.test.ts, new insight LIMIT group.
  Issue: the reused submissionReadOutcome helper returns rows, but the added
  success assertion checked value. The first successful query therefore failed
  before any edge-limit behavior could be evaluated. Fix: check the rows
  discriminant, assert its array shape and inspect its length. Add query/limit/
  outcome diagnostics to the success assertion. Original failure evidence is
  tmp/drizzle-a4c-db.log and its exit file; this was a test-harness failure, not
  evidence of a product LIMIT regression.
- File: algo-electron/tests/db/repositories.test.ts, same group.
  Issue: Math.min(-0, 55) produced expected -0; Node strict equality uses
  Object.is, whereas an empty array length is +0. Fix: normalize only the
  expected length for zero to +0. Preserve the actual -0 query input and the
  explicit all:[-0] native binding-trace assertion. Second failure evidence is
  tmp/drizzle-a4c-db-final.log and its exit file. Parent recorded both lessons in
  .trellis/spec/project/drizzle-insight-lists.md section 6.

## Findings (Not Fixed)

No unresolved A4c product finding. The historical A4b2 prepush Tooltip incident
has no proven root cause and is outside this slice. Its evidence and no-blind-
retry rule remain in research/a4b2-prepush-ui-review.md. A passing focused
component suite does not replace the parent real-Electron/global UI gate.

Anonymous timeline identity intentionally remains positional inside a distinct
key domain. Stable identity for indistinguishable anonymous events would require
a separate data-model decision; it is neither promised nor fabricated here.

## Contract And Cross-Layer Inspection

- All four reads obtain the current connection without cached handles, new
  lifecycle ownership, writes, transactions, repair or notifications. Named
  LIMIT placeholders preserve original native binding behavior and errors.
- Timeline retains its exact six columns, raw timestamp, tombstones and sole
  descending timestamp order. Revisit still groups by parent ID, counts nullable
  child IDs rather than rows, and includes anonymous/deleted visits in raw MAX.
  Its string identity comes from the joined NOT NULL visit foreign key.
- Wrong-problem rows retain count(child ID), raw MAX, fixed exact-AC SQL literals,
  public alias and the correlated anti-AC predicate including tombstones. The
  nullable parent output type is conservative; its equality join cannot produce
  a NULL parent ID. No assertion or new filter disguises this distinction.
- Unreviewed prepares before its first clock; the unchanged localDateDaysAgo
  helper supplies the second clock. Ordered bindings remain now/cutoff/limit,
  elapsed days retain SQL integer CAST, and Date encoders are bypassed. Boundary,
  validation/error precedence and raw scalar cases have differential coverage.
- Only timeline/wrong/unreviewed read IDs become nullable. Revisit remains
  string; input IDs, request limits, integer instant validators and IPC signatures
  remain unchanged. Dashboard models index authoritative shared ID types.
- Problem-list keys serialize the platform tuple; timeline keys explicitly tag
  anonymous positions versus real IDs, including empty strings. No rows or URL
  actions disappear. Component tests inspect DOM identity and retained focus,
  click/Enter/Space navigation, loading-null versus empty arrays and epoch zero.
- IPC, preload and analytics loader still pass arrays through. AI context keeps
  its existing field projection and privacy boundary; period counts and export
  version are unchanged. Tests use positive count/projection anchors as well as
  absent private sentinels.

## Independent Verification

Environment: supported Node 22.23.2 and package pnpm 12.8.1. Paths in this section
are relative to algo-electron/.

- Lint: PASS. Strict scoped ESLint for all twelve changed/new source/test/runner
  files; the native test file was linted again after the second local correction.
- TypeCheck: PASS. Both pnpm run typecheck and pnpm run typecheck:tests, rerun
  after the final native assertion correction.
- Format: PASS. Prettier check on all twelve files, then Prettier write on the
  sole corrected test file after its final assertion edit.
- Tests: PASS for the independently run focused gates: UTC twelve files/409
  tests covering the new lists and adjacent stats/schema/component/AI contracts;
  America/New_York insight differential suite one file/131 tests. The final
  assertion-only correction affects the native runner, not these Vitest suites.
- Static oracle proof: PASS. TypeScript AST extraction confirms all four frozen
  original SQL texts and ordered all-call arguments against the base. The four
  neighboring unmodified insight/streak functions retain exact function text.
- Protected-file proof: PASS. Base bytes remain unchanged for stats date and
  recompute files, migration030, shared time, Drizzle schema, stats IPC, preload,
  analytics loader, runtime AI exporter and period-summary implementation.

Own logs: tmp/drizzle-a4c-independent-format.log,
tmp/drizzle-a4c-independent-lint.log, tmp/drizzle-a4c-independent-types.log,
tmp/drizzle-a4c-independent-native-fix.log,
tmp/drizzle-a4c-independent-focused-utc.log,
tmp/drizzle-a4c-independent-focused-new-york.log and
tmp/drizzle-a4c-independent-ast.log.

The frozen oracle is independent of replacement query builders. Its unchanged
calendar helper is also pinned by explicit clock/cutoff/error assertions.
Per-read snapshots compare complete ledgers/schema/state/change counters.
Only the separate native fixture final comparison omits the setup migration
clock; per-read ledger assertions do not omit it.

## Parent And Worker Evidence

Parent standalone Electron repository gate: PASS, all 52 native groups after
both corrections, including all four new insight groups. Reviewer inspected the
complete-count footer and exit0 in tmp/drizzle-a4c-native-verified.log/.exit.
Parent used an authoritative Node spawnSync capture; an earlier direct GUI-exe
PowerShell invocation produced no test output and is not counted as a pass.
Parent reports its 815-file source snapshot was refreshed after the correction.

DB implementer reports 131 differential cases in each of UTC, Shanghai, New York
and Apia. Consumer implementer reports seven focused files/56 tests and isolated
old-key mutation proofs (two failures for old problem keys, one for the old
timeline key) with unchanged source hashes. These additional runs are attributed
evidence, not independent reviewer executions.

Parent is repeating the complete DB gate, then full verification and build.
Their final outcomes, final source snapshot comparison, hooks and remote CI
belong in a4c-verification-2026-11-27.md. No native/global/build command, Git
mutation, release action, original D-worktree edit or user-DB access was performed
by this reviewer. Reviewer edits for A4c are limited to the two native assertion
corrections in repositories.test.ts and this review artifact.
