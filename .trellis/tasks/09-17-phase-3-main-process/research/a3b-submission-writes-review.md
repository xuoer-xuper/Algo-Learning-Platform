# A3b Submission Writes: Independent Design Precheck

Date: 2026-11-20. Design only, following completed A3a review. Inspected the
original writes, physical baseline, migration validation entry points, event
owner and pinned Drizzle0.45.4 source in the C worktree. A3a product/Git/gates
remain owned by the parent. No implementation or first-AC migration is authorized
by this record alone.

## Verdict

**Approve the bounded A3b1 design for parent acceptance, with two required
refinements below.** The16-versus14 INSERT distinction is real, but need not
block a conversion whose supported physical schema is explicitly frozen030.
Ordinary table audit/IGNORE/FAIL/ABORT trigger fixtures can remain in the
regression matrix without claiming production support for installed triggers.

The parent must record this scope in the acceptance/design before dispatching
implementation. If the intended contract instead means exact output/error
parity under every arbitrary table/default/view replacement, A3b1 INSERT is
**not approved**: preserve the legacy INSERT and separately review first-AC
writes. Do not hide the mismatch with a14-column shadow schema, private dialect
APIs, column mutation, error rewriting or a whole raw INSERT presented as ORM.

### Required Refinement 1: Prepare The Duplicate Lookup Too

The research correctly delays INSERT preparation/UUID/insert getters, but the
lookup must also be explicitly prepared with placeholders before reading input.
Original `db.prepare(...).get(data.platform, data.platformSubmissionId)` prepares
first. A normal builder `.where(eq(column, data.platform)).get()` reads the
getter first; a throwing getter can replace a preparation error or have effects
when the original never reads it.

Required shape, without hoisting/deduplicating input property reads:

```ts
const native = getDb()
const now = nowMillis()
const orm = createDrizzleClient(native)
const findExisting = orm
  .select({ id: submissions.id })
  .from(submissions)
  .where(and(
    eq(submissions.platform, sql.placeholder('platform')),
    eq(submissions.platform_submission_id, sql.placeholder('platformSubmissionId')),
  ))
  .prepare()
const existing = findExisting.get({
  platform: data.platform,
  platformSubmissionId: data.platformSubmissionId,
})
if (existing) return false
```

Select only id, with no tombstone filter. The returned object is truthy even
with id:null or id:''; do not test `existing.id`. Do not use findFirst/select-all,
which would acquire unused columns and destroy duplicate short-circuit behavior.

Then prepare the research's full typed INSERT with14 supplied placeholders,
three timestamp placeholders wrapped in SQL, and only afterward evaluate run
arguments. Preserve this order: UUID, problemId, platform, platformSubmissionId,
verdict, rawVerdict, language, submittedAt, runtimeMs, memoryKb, sourceUrl, rawJson,
then the already captured now for created_at/updated_at. Platform/key must be
read again on insertion, just as before; caching them changes accessor behavior.
No input spreading or pre-evaluated `.values({ id: randomUUID(), ... })`.

Independent tracing adapter observed:

- Legacy/prepared lookup: prepare -> platform getter -> key getter -> get.
- Direct builder: platform getter -> key getter -> prepare -> get.
- With both a throwing getter and prepare failure, legacy/prepared exposes the
  original prepare error; direct builder instead exposes the getter error.
- Null-ID duplicate reads only lookup getters and never prepares INSERT/uses UUID.
- INSERT prepare failure reads no insertion getters and consumes no UUID.
- Prepared INSERT binds14 values, retains raw1.75/epoch0, and preserves the
  original thrown object on prepare/run failure.

### Required Refinement 2: State Which Error Parity Is Promised

Native exception passthrough is not universal identical error text for different
SQL strings. The research's broad 'broken lookup columns ... exact snapshots'
phrasing needs this qualification in the acceptance matrix.

Independent Node22.23.2 SQLite feasibility probe with a renamed lookup column:

- Original: `no such column: platform`.
- Generated WHERE: `no such column: submissions.platform`.
- Renaming id also changes the quoted-column diagnostic. Installed native
  dependency is compiled with SQLITE_DQS=0; native results still need acceptance.

These are unsupported schema-drift diagnostics, not normal frozen030 behavior.
Preserve synchronous propagation and preparation-before-getters/UUID, but do not
claim identical message text for every broken lookup column. The new test must
record the intended diagnostic scope instead of silently weakening an exact
comparison after it fails. Missing-table, closed lifecycle, selected original
INSERT-target failures, and supported native constraint/readonly/trigger errors
still get exact old/new comparisons wherever the approved fixture promises it.
The original-target raw_verdict rename produced the same INSERT preparation
message in the synthetic probe and is a useful UUID-order regression.

Do not catch/rewrite errors or replace column expressions with hand-written
unqualified SQL just to manufacture a universal parity claim. If even the
unsupported-column message difference cannot be accepted, defer that SQL
conversion rather than claiming it is transparent.

## Supported Physical Schema Decision

The following acceptance wording is recommended:

> A3b1 preserves raw rows, successful return values, event/transaction timing,
> input evaluation order and native failure behavior for the exact frozen030
> submissions table and unchanged constraints/indexes/defaults. is_first_ac is
> NOT NULL DEFAULT0 and deleted_at is nullable without a default. The diagnostic
> test set additionally observes ordinary row triggers, IGNORE/FAIL/ABORT,
> query_only/deferred-FK operation and explicitly listed broken-schema ordering
> cases. This is not a claim of parity for arbitrary DDL after initialization,
> changed omitted columns/defaults, view replacement or later migration schemas.

Evidence and limits verified against actual source:

- `src/main/db/schema.ts:446` and `drizzle/0000_baseline.sql:297` agree on all16
  columns. There is no dynamic default/onUpdate function on submissions.
- Installed `sqlite-core/dialect.js:344` enumerates all enabled schema columns.
  Legacy supplies14; the builder names16 with literal0 and NULL. There is no
  supported public insert-column-subset API. No new bind is needed for those
  literals; the generated INSERT still binds14 values.
- `schema-validation.ts:126` reads full table_xinfo including default/hidden
  metadata;200 rejects main-schema views/triggers;219 compares all baseline
  layouts/columns/defaults/FKs/CHECKs/indexes. The guard rejects the documented
  renamed omitted-column/default7/default9/view counterexamples.
- `migrate.ts:98` invokes physical baseline comparison only when legacy history
  is complete and recorded Drizzle count<=1. For greater counts it checks
  integrity, not equality to030. The current journal contains only baseline.
- `connection.ts:127/188` production startup uses the backed-up async initializer;
  its default resources trigger inspection before exposing the database. The
  synchronous legacy test helper and explicit migration overrides are not proof
  this guard ran. Current open connections return directly, not revalidated on
  every getDb/write. This is startup/adoption validation, not a DDL lock.
- Test-installed ordinary triggers are diagnostics added after initialization;
  they are not a supported persisted application schema or a reason to weaken
  schema validation. Do not add per-write schema introspection/fallback either.
- Future migrations (especially recorded count>1) require reconsidering omitted
  defaults and compatible schema contracts. Current startup behavior cannot be
  cited as blanket protection for future schemas or arbitrary live DDL.

Independent synthetic comparisons used the actual baseline SQL in disposable
Node SQLite memory databases and generated SQL from the actual Drizzle schema:

| Fixture | Observed old14/new16 |
| --- | --- |
| Exact030/raw1.75/now0 | Identical full16 rows, default0/NULL and raw values |
| Ordinary BEFORE audit | Identical NEW values and audit rows |
| BEFORE RAISE(IGNORE) | Both changes0, no submission, prior audit retained |
| BEFORE RAISE(FAIL) | Both throw; prior audit retained |
| BEFORE RAISE(ABORT) | Both throw; statement audit rolled back |
| Changed omitted defaults7/9 | Different inserted values: legacy7/9 vs builder0/null |
| Renamed omitted is_first_ac | Legacy succeeds; builder cannot prepare |
| INSTEAD OF INSERT view | Audit sees legacy null vs builder0 |

The last three are concrete exclusions, not supported equivalence tests. No
native gate was run and these Node SQLite errors are not native acceptance.

## Original Success And Transaction Semantics

- upsert still means duplicate-presence check followed by ordinary INSERT, not
  conflict-ignore/upsert SQL. No update, RETURNING, new transaction, cache,
  connection, validator, Date conversion or error fallback.
- Preserve getDb -> one nowMillis -> lookup prepare/get -> duplicate false OR
  INSERT prepare -> UUID/getters -> native run -> topics -> true.
- Use SQL-wrapped submitted_at/created_at/updated_at placeholders to bypass
  Date encoders. Text/integer placeholders use their identity encoders. Preserve
  all `?? null` expressions and0/empty values. Public time/input contracts do not
  broaden because diagnostic raw-binding tests exist.
- A successfully completed INSERT returns true/emits submissions,problems,stats
  even when changes0 (ordinary BEFORE RAISE(IGNORE)). Do not inspect result.changes
  to gate either. Add only this narrow legacy exception to the parent's eventual
  data-refresh documentation; it is not a new general no-op notification policy.
- A thrown run produces no repository notification. FAIL may already have kept
  trigger audit side effects; ABORT and a caller-owned transaction differ. Do not
  add rollback/retry or claim that every error implies zero side effects.
- Autocommit notifies synchronously after the statement. Subscriber exceptions
  remain guarded; a later batch stage failure does not undo earlier writes/events.
- The repository does not acquire transaction ownership. Existing callers may
  use withDataChangeTransaction around the native transaction invocation, so
  successful commit merges topics and rollback/actual COMMIT failure discards
  them. An unwrapped external transaction retains its existing early notification
  behavior; the refactor must not invent universal post-commit scheduling.

## Smallest Implementation Boundary

1. Product: `electron/db/repositories/submission/mutations.ts` upsertSubmission
   only. Use the existing client/schema/types; preserve compatibility exports and
   public signature. No firstAc/query/type/DTO/caller/renderer changes.
2. Tests: independent `tests/db/submission-writes-oracle.ts` containing only the
   frozen upsert body for A3b1; a focused upsert differential test; decisive native
   cases in existing repositories suite; focused DB runner registration. Freeze
   statement text/control flow and use independent typed return snapshots.
3. Parent-owned documents: active acceptance/design/implementation boundary,
   context manifests, narrow Drizzle/data-refresh contract and local READMEs.
   Preserve migration validator/tests and released migrations; adding focused
   guard assertions is acceptable, weakening existing assertions is not.

No schema, migration resources, validators, event bus, SubmissionBatchWriter,
learningDataExport, A3a product or unrelated repository changes belong here.
No extra general-purpose helper, shadow schema or prepared-statement cache.

## Required Independent Acceptance Matrix

- Dual-run original/new on separately initialized identical disposable databases;
  deterministic UUID sequence/clock; full raw rows, storage typeof, returned
  boolean, error name/message/code, input access trace, event order/topic array,
  listener transaction state and audit side effects. Restore listeners/spies and
  DB lifecycle between sides. No shared production builders in expected values.
- Required/optional/nullish/zero/empty values; raw epoch0,negative,fractional,
  out-of-Date-range/nonfinite native behavior; exact literal/Unicode/NUL keys.
- Existing normal/null-ID/empty-ID/tombstoned duplicate is false/no UUID/no event
  even under query_only or a missing unused INSERT target. Lookup prepares and
  accesses only two input getters; inserted path reads them again in order.
- Lookup prepare failure beats throwing getter; INSERT prepare failure beats UUID
  and all insertion getters; throwing UUID/getter prevents run/events. Test both
  native preparation fixtures and a small trace where precise access order is
  the assertion. Avoid fabricated mocks as the sole native failure evidence.
- Default0/NULL and BEFORE/AFTER audit equivalence; native IGNORE returns true
  and event despite changes0; FAIL/ABORT retained versus rolled-back effects.
- Native readonly/FK/NOT NULL/UUID-PK collision failures; unchanged native error
  objects, no error wrapper, no repository event. Use actual driver behavior for
  nonfinite/unsafe values, not Node SQLite expected errors.
- Autocommit partial success, listener reentrancy/guarding where meaningful,
  caller-owned wrapped commit/rollback/savepoints and actual deferred-FK COMMIT
  failure. Use PRAGMA defer_foreign_keys on the baseline instead of rebuilding
  its foreign-key definition just to provoke commit failure.
- Close/reinit/current handle, no ledger/schema/write-side migration effects.
  Preserve startup guard regressions; explicitly document14/16 drift/view
  counterexamples and broken lookup-message scope rather than hiding them.
- Both TypeScript programs, scoped lint, focused differential/caller tests and
  parent-owned native/full/build gates must pass before accepting implementation.
  A3b1 does not require eager empty-recompute tests until the separate A3b2 slice.

## A3b2 Readiness Only

The research identifies the right risks: conditional real UPDATE even for no
match, no-AC skips UPDATE, raw SQL times, COUNT(*)/raw MIN, three eager prepares
before Set iteration, nullable aggregate output and real commit/savepoint/event
ownership. A3b2 needs its own approved boundary and original-body/native tests.
This precheck is not implementation approval for firstAc.ts and does not mark
the submission domain or phase3 complete.

## Verification And Review Ownership

- Source/contract inspection: completed as listed above.
- Pinned-library generated SQL and tracing adapter probes: pass for the required
  prepared lookup/INSERT design and show why the direct lookup is not equivalent.
- Synthetic Node22.23.2 SQLite matrix: matches supported ordinary-table cases and
  independently reproduces all three excluded14/16 schema-drift cases.
- Virtual strict TypeScript check of the complete proposed upsert plus the current
  project:0 diagnostics, no file emitted, no cast/non-null assertion introduced.
- Lint/current-code tests: not rerun for this design-only artifact. A3a gates are
  separate evidence and not A3b1 acceptance. No native/UI/build/global suite run.
- Reviewer wrote only this research review file. No product/test/spec/Git/user
  database/original D-worktree changes, and no subagents were spawned.

## A3b1 Implementation Review

Date: 2026-11-20. Independently reviewed the frozen A3b1 diff and new test files
on codex/drizzle-submission-upsert, base001e23a. The parent accepted the bounded
schema policy before implementation. Earlier sections are design evidence;
this section records implementation verification, not A3b2 acceptance.

### Findings (fixed)

None. No product/test correction was necessary. This reviewer only appends this
implementation evidence and leaves all frozen product/test files untouched.

### Findings (not fixed)

None within the accepted A3b1 scope. No actionable correctness, timing, native
behavior, privacy or scope regression was found. First-AC writes remain separate;
whole-domain/phase completion and release are not implied by this approval.

### Independent Evidence

- Only submission/mutations.ts changes production behavior. Both lookup and
  INSERT use supported typed builders and explicit prepare before parameters.
  getDb precedes one nowMillis; lookup selects only id and returns false on row
  presence, preserving null/empty IDs, tombstones, read-only duplicate behavior
  and unused-column short circuit. No eager INSERT/UUID on duplicate/failure.
- Insert run evaluates UUID and original getter order, including the second
  platform/key reads. Fourteen supplied values remain bound; raw submitted_at/
  created_at/updated_at placeholders bypass Date conversion. Schema literal0/
  NULL is correct only for the explicitly accepted frozen030 default boundary.
- Successful INSERT always emits original topics and returns true, including
  diagnostic IGNORE changes0. FAIL/ABORT state effects, no event on throw,
  autocommit partial success, synchronous guarded/reentrant subscribers and
  existing caller-owned notification/transaction scopes remain unchanged.
- Mechanically compared transpiled function ASTs against base001e23a. The oracle
  exactly matches the original body after removing only lifecycle acquisition
  in favor of its explicit DB parameter and erasing TypeScript annotations.
  Checked the original INSERT template byte content after newline normalization.
  Getter, UUID, SQL argument, return and event ordering are independently frozen;
  the oracle does not import production builders or derived row projections.
- The40 focused cases assert full16 stored fields, default/raw values, property
  traces and prepare counts, duplicate IDs, native error details, trigger audit
  effects, savepoints/real deferred-FK commit failure, lifecycle and the explicit
  unsupported-schema boundary. No arbitrary DDL equivalence is falsely claimed.
- Inspected all four new native test groups and their isolated dual-run harness:
  literal/NUL/Unicode bindings, null-ID/query_only short circuit, prepare-before-
  UUID/getters, raw defaults, IGNORE/FAIL/ABORT, constraints/readonly and real
  wrapped COMMIT/rollback are covered. Native runtime execution belongs to parent.
- Verified firstAc.ts, read queries/types/facade, database schema/resources/
  validation, event bus, batch writer and import orchestration are unchanged.
  Existing validator tests still reject drift; no runtime introspection/fallback,
  transaction/cache, conflict-upsert or error rewriting was added.
- New write spec is indexed, linked and registered in both context manifests.
  PRD/design/README/architecture and the narrow data-refresh IGNORE exception
  match accepted physical-schema limits, prepare order and legacy notifications.

### Verification

Independent commands with Node22.23.2 from algo-electron/:

- Lint: PASS, all5 changed/new TS/MJS files, zero warnings with
  --report-unused-disable-directives --max-warnings 0.
- TypeCheck: PASS, pnpm typecheck and pnpm typecheck:tests.
- Tests: PASS,6 focused files178 tests: submission-upsert40, submission-reads43,
  dataChangeNotifications11, submissionBatchWriter2, drizzleMigrationValidation47,
  problemUpsert35. Ran Vitest with --maxWorkers 2; no global/native/UI/build gate.
- Product/test git diff --check: PASS.
- Independent oracle AST/INSERT-template comparison: PASS.
- Logs in ignored algo-electron/tmp/: drizzle-a3b1-review-typecheck.log,
  drizzle-a3b1-review-typecheck-tests.log, drizzle-a3b1-review-lint.log,
  drizzle-a3b1-review-lint-files.log and drizzle-a3b1-review-focused.log.

Parent separately reported test:db34files557tests and30 native repository tests
passing, including actual COMMIT and trigger/prepare behavior. This reviewer did
not rerun those gates; backupImport is native-only and remains in parent-owned
DB/full verification. Full-suite/build/Git/CI evidence is also parent-owned.

A3b1 is approved from the independent review side subject to remaining parent
gates. No production/test/spec/Git/original D-worktree edits were made here;
A3b2 has only its separate design-precheck artifact and no implementation claim.
