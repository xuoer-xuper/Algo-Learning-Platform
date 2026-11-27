# A4d Runtime Recompute: Independent Implementation Review

Date: 2026-11-27. Accepted base:
aacbff0c2c1afe9df4fa2bda5698450f0d76e608. Review in the C worktree against the
adopted PRD/design/implementation plan and drizzle-stats-recompute.md, not an
earlier candidate. Code/log paths below are relative to algo-electron/.

## Verdict / Findings

No production or test issue found; no source edits made. The frozen runtime
helper, import-only wrapper change, independent oracle, focused/native tests,
runner registrations and previously reviewed historical guard meet the accepted
A4d boundary. Source is frozen for the parent serial gates. This review does not
approve historical relocation, merge, release or whole-phase completion.

Only a documentation chronology issue was reported: early pending/not-yet-run
paragraphs in a4d-verification-2026-11-27.md lag its later pass sections. Parent
acknowledged and owns final reconciliation; no governing-contract contradiction
or production blocker was found. Reviewer added only this artifact.

## Implementation And Oracle Proof

- Daily validates the original local-day bounds before SQL, then reads visits,
  submissions, solved parents and platforms in order. Raw aggregate expressions
  preserve SUM/COUNT storage behavior, INTEGER overflow, exact AC case and
  existing tombstone/orphan policies. Optional aggregate results use explicit
  impossible-row guards following the accepted A4a precedent, not fabricated
  defaults or assertions.
- All four aggregate counts bypass Number decoders. With an explicit
  defaultSafeIntegers(true) handle, empty-platform writes retain BigInt bindings;
  nonempty platform JSON retains its native failure after INSERT preparation.
  This does not change public types or the global connection mode.
- UPSERT preparation precedes platform JSON evaluation. Eleven ordered native
  binding occurrences, raw now values, the sole local_day conflict target and
  exactly nine UPDATE targets remain. Metadata and tombstone0 survive conflicts.
  Generated twelve-column INSERT compatibility stays limited to frozen030
  defaults; the explicit DEFAULT7 counterexample still demonstrates exclusion.
- All-days materializes cache keys without new order, executes the four-arm
  distinct UNION and converts every fact before any daily write. The Set order
  remains unchanged. NULL narrowing happens only at its original per-day failure
  point; earlier autocommit effects and the all-days no-event failure behavior
  remain. No repair, eager validation, sorting or new transaction is introduced.
- TypeScript AST comparison against aacbff0 proves both frozen core bodies and
  all three wrappers retain exact SQL, ordered calls/bindings and control flow
  after only documented seams: function renames, erased typing, three impossible
  missing-aggregate guards and Reflect.apply for old nullable dispatch. Oracle
  code never calls the production historical or runtime core. Shared time is
  separately pinned. The live wrapper file differs by its import source only.
- All 135 accepted-base native top-level statements remain intact; the native
  file has only added imports/helpers/groups. Runner changes only register the
  two new focused suites. Historical guard SHA256 matches its earlier review.

## Behavioral And Caller Coverage

The differential harness compares full cache/fact/audit/schema/ledger state,
storage types, platform JSON bytes, changes, returns, ordered clocks/SQL/bindings,
events and native error name/message/code. Injected prepare/serialization errors
also verify object identity and prefix ordering. Earlier visit SUM overflow wins
over a broken INSERT, and a broken INSERT wins over throwing serialization.

Fresh/conflict IGNORE/FAIL/ABORT fixtures preserve statement effects and events;
UPDATE OF triggers cover all nine intended targets and unrelated metadata.
Whole-fact conversion, NULL and malformed cache order, reversed unordered reads,
extreme calendar labels, eager/throwing iterables, default-day midnight clocks,
readonly/closed/reinitialized/standalone handles and DST23/25h are exercised.

Real savepoints/rollback and deferred-FK COMMIT tests wrap the actual transaction
invocation in the notification scope. Both focused and native fixtures assert
callbackFinished before COMMIT failure, rollback of cache and trigger writes,
empty notifications and cleared transaction state. These are not mocked callback
failures. Explicit cores acquire no global DB/clock/transaction/event ownership.

Delete, tracking, submission batch, learning-data import and stats IPC caller
paths remain unchanged. Their existing scoped versus partial-autocommit behavior
matches the accepted legacy notification exceptions. Focused caller tests cover
real DB deletion/tracking/import plus event and submission-batch contracts.

Native final cross-fixture snapshots omit only setup migration clocks via the
existing helper; the original connection's full ledgers are separately compared
before/after. Focused snapshots retain complete ledger fields and storage types.
No fixture, schema, migration or benchmark changes hide a regression.

## Independent Verification

Supported Node 22.23.2 and package pnpm 12.8.1:

- Lint: PASS, strict scoped ESLint on all seven changed/new source/test/runner
  files, with zero warnings.
- TypeCheck: PASS, both application and test TypeScript programs.
- Format: PASS, scoped Prettier check on the same seven files.
- Tests: PASS, UTC six files/250 focused tests plus five files/60 caller tests;
  America/New_York recompute suite one file/53 tests including DST assertions.
- Static proofs: PASS, five oracle function bodies/SQL/binding sequences, exact
  import-only wrapper change, unchanged protected callers/core/time/schema and
  benchmark/history evidence, all old native declarations and final hashes.

Own logs: tmp/drizzle-a4d-review-format.log, tmp/drizzle-a4d-review-lint.log,
tmp/drizzle-a4d-review-typecheck.log, tmp/drizzle-a4d-review-typecheck-tests.log,
tmp/drizzle-a4d-review-focused-utc.log, tmp/drizzle-a4d-review-callers-utc.log,
tmp/drizzle-a4d-review-focused-new-york.log, tmp/drizzle-a4d-review-ast.log and
tmp/drizzle-a4d-review-freeze.log. Historical guard evidence remains separately
recorded in research/a4d-history-implementation-review.md.

## Attributed Parent Evidence / Remaining Gates

Parent's authoritative standalone Electron run passes60/60, including all eight
new recompute groups. Reviewer inspected tmp/drizzle-a4d-initial-native.log/.exit
for the actual result and exit0; Node spawnSync captures the real process output.
Parent also reports819 source hashes unchanged and50 protected files identical
to aacbff0, including all001-030, baseline/meta, fixtures and guard budgets.

Parent subsequently reports complete test:db exit0/native60 and starts serial
test:all. Final full/build/performance/recovery/source-freeze/hooks/CI outcomes
remain parent-owned and belong in a4d-verification-2026-11-27.md. The unchanged
warmed benchmark must still meet its original <50ms budget; no timing claim is
inferred from static inspection. No reviewer native/global/build/Git mutation,
original D-worktree edit, user-DB access or extra agent delegation occurred.

## Final Source Freeze

| File | SHA256 |
| --- | --- |
| electron/db/repositories/stats/recompute-runtime.ts | f64415faf923baa89d61c7db5410c68108a7ddc051415cf8a8e17bf9ab483164 |
| electron/db/repositories/stats/recompute.ts | 8a3455524059f0c053583dd6c907bf83672c4c848380f91d6a49943d8230fb31 |
| tests/db/stats-recompute-oracle.ts | 441e59d947c27694518c8e2c6ef65cce5f3ae16536515342a3f11a7230d78dce |
| tests/db/stats-recompute.test.ts | 8ef06d028dedeb1fc10914ac54be177b4578504e41044b3b215ff57150f2d73a |
| tests/db/stats-recompute-history.test.ts | 032c697720e212b9d814d2fa70dc3f363594a03ca664ee025d37c9c375d7d344 |
| tests/db/repositories.test.ts | f319816d011e50ba2061d5c6ee718e4c090325566691d3be18d2bb914303e4b8 |
| tests/verify.mjs | 4686fa68d620a2feb4d739d97ffc674e31647e27a58a43d422c9eba74b4cb9d4 |
