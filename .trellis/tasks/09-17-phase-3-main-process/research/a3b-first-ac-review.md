# A3b2 First-AC Writes: Independent Design Precheck

Date: 2026-11-20. Design only; A3b1 implementation and gates remain separate.
Read the completed A3b research, unchanged firstAc.ts, raw-time/day helpers,
notification owner, import/batch callers, current task/specs and pinned Drizzle
source. This reviewer writes only this review artifact in the C worktree.

## Verdict

**Approve A3b2 as the two-function firstAc.ts slice**, after A3b1 acceptance and
parent recording of this boundary. No new product decision or ORM escape is
needed. This approves a design, not current A3b1 code or an A3b2 implementation.

Preserve existing raw results, SQL state transitions, error propagation and
caller-owned transactions on the current baseline. Unlike A3b1 INSERT, these
UPDATEs target the same three original columns and do not acquire extra default
columns. Keep the already accepted damaged-schema diagnostic limitation:
qualified/quoted identifiers can change error wording outside the supported
schema. Do not weaken migration validators or claim arbitrary DDL/view parity.

## Required Construction And Ordering

### updateFirstAc

- Preserve getDb then one nowMillis before any query. Wrap the same native handle;
  no global cache/new connection. Query parent first_solved_at first, then earliest
  exact-uppercase AC submission even when the parent is absent.
- Raw `sql<number | null>` parent instant and `sql<number>` submitted_at projections
  bypass Date decoding. AC query remains exact problem equality, fixed AC literal,
  submitted_at ASC and one row only; no tombstone/parent filter or tie-break.
  `.limit(1)` emits a fixed bound1 in this pinned ORM, which does not change this
  single-row query's result contract. Do not invent dynamic limits/batch changes.
- No AC means no UPDATE construction/preparation/execution. Return the prior valid
  day if present; no database change/event. A missing parent is not an AC shortcut:
  an orphan AC still attempts the real UPDATE and contributes its valid day.
- With AC, execute an actual UPDATE of status='solved', first_solved_at and
  updated_at WHERE id matches AND (old instant IS NULL OR old instant > AC).
  Do not skip it because JS predicts0 changes, missing parent, or equal/earlier
  stored time. Readonly/native preparation/run failures are observable.
- Prefer explicit conditional `.prepare().run({...})` with raw SQL-wrapped time
  placeholders. This preserves the original UPDATE prepare before reading run
  arguments. Use separate firstAc/compareAc run keys if pinning the original two
  submitted_at reads. Native query rows are plain objects, not arbitrary getter
  DTOs; do not introduce a new input contract just for mocks.
- Preserve the original four UPDATE bindings/order: AC, captured now, problemId,
  AC. SQL-wrapped RHS of the `>` comparison also avoids timestamp encoding.
  Fixed solved/AC literals do not need new parameters. No Date/Number conversion.
- Only result.changes>0 emits problems/stats; zero-change success does not notify.
  In particular an UPDATE IGNORE is NOT the A3b1 INSERT true/event exception.
- Keep the existing affected-day block after successful SQL and optional event.
  Old valid day then earliest AC valid day, first occurrence dedup; keep dates
  even when the UPDATE changes0. Do not return dates early or sort/recompute them
  from the changed row after a reentrant event listener.

### recomputeProblemSubmissionState

- Preserve getDb/one now, then three explicit synchronous prepares in this order:
  parent SELECT, submission aggregate SELECT, UPDATE. All happen before the
  caller's Symbol.iterator property is accessed, even for empty input.
- Only after all prepares succeed, eagerly construct `new Set(problemIds)`.
  Preserve first occurrence order and full iterator consumption before any per-ID
  query/write. A throwing iterator may have its own effects, but the repository
  must not have processed earlier yielded IDs. Do not stream the iterable.
- Parent SELECT includes only status/raw first_solved_at. Skip missing parents
  before aggregate/run, not empty/null-ID submissions. No active-row filters.
- Aggregate is COUNT(*) and raw MIN(CASE WHEN verdict='AC' THEN submitted_at END),
  no GROUP BY. COUNT(id) loses nullable IDs; Drizzle min(column)/min(SQL) decodes
  Date/String. Use raw SQL expressions and native result scalars instead.
- Keep the truthful `.get()` optional type. An explicit `row === undefined` throw
  is an acceptable internal invariant guard. Successful real SQLite aggregate
  execution returns one row even with no submissions: total0/first_ac:null.
  No non-null assertion, cast, fallback0/null or silent skip. This guard is not a
  new database validation/recovery path or a claim of normal no-row behavior.
- Derive status exactly: nonnull first_ac -> solved; else total>0 -> attempted;
  else existing unknown remains unknown, every other status becomes visited.
  Epoch0 is nonnull; a stored earlier/later first solve can be replaced/cleared.
- SQL-wrap every dynamic SET placeholder, including status, first_solved_at and
  updated_at. UPDATE.set's public type does not accept bare Placeholder; a bare
  timestamp value would invoke Date encoding. Preserve raw null/numeric values.
- Execute UPDATE for every existing parent, including apparent no-op. Let the
  original null-safe `status IS NOT ? OR first_solved_at IS NOT ?` determine
  changes, not JS equality, `!=`, COALESCE, filtering or early return. Generated
  bind order must remain status,firstAc,now,problemId,status,firstAc. There are no
  onUpdate defaults on these schema columns adding another target.
- Emit problems/stats only for changes>0, then add old/new valid days in that
  order to the shared first-occurrence Set. No-op existing parents still
  contribute dates. Missing parents contribute nothing; no sorting/caps.

## Raw Time, Error And Event Boundary

- Keep localDayFromTimestamp unchanged: it catches safe-integer/Date-range
  conversion failures and omits invalid days. Epoch0/negative valid instants work;
  fractional, unsafe/out-of-Date-range and diagnostic TEXT storage remain raw in
  SQL but do not become fabricated valid days. No input/time schema is relaxed.
- All query/write errors remain synchronous and native; no catch/retry/partial
  date return. Missing lookup/aggregate columns can change quoted/qualified error
  spelling with generated SQL. Assert the original stage and lack of later
  work, and record that explicit damaged-schema scope; never rewrite errors to
  manufacture universal exact messages. Supported constraints/readonly/triggers
  get exact name/message/code comparisons under the actual native driver.
- No transaction is added. SubmissionBatchWriter's earlier autocommit insert and
  notification survive a later updateFirstAc error. Recompute may commit/notify
  earlier IDs before a later failure. FAIL triggers may retain prior statement
  audit effects despite throwing; ABORT rolls them back. No repository event on
  throw; successful IGNORE changes0 produces no first-AC event.
- The unchanged import owns its transaction and wraps the invocation (including
  COMMIT) with withDataChangeTransaction. Preserve savepoints, successful topic
  merging and suppression after rollback/actual COMMIT failure. Unwrapped outer
  transactions keep existing early notifications; no post-commit scheduler.
- Subscribers remain synchronous and guarded. Preserve event-before-day and
  per-ID event timing; listeners may reenter/change later facts. Do not batch all
  reads first, recalculate earlier snapshots, move day conversion before events
  or introduce a general notification buffer around an autocommit batch.

## Independent Design Evidence

No probe wrote production/test files or opened a user database. Node22.23.2
built-in SQLite plus a minimal Drizzle statement adapter is feasibility evidence,
not native Electron/better-sqlite3 acceptance.

- Generated-query inspection: original three SET targets; append four bindings;
  recompute six bindings; raw1.75/null/epoch0; genuine SELECT/UPDATE builders.
- In-memory source transpilation used the actual original firstAc.ts bodies,
  with only DB/clock/event/day dependencies supplied by the probe. Compared two
  fresh databases initialized with the actual baseline, not new-query expected
  values. All46 comparisons matched exact full outcome/parent state/audit rows,
  one clock count, events, normalized prepare/get/run trace and day-call order.
- Cases included absent parent/no AC/orphan AC, old earlier/equal first solve,
  wrong-case verdict/WA-only, nullable submission IDs, tombstones, epoch0,
  negative/fractional/extreme/TEXT instants, clearing solved state, IGNORE/FAIL/
  ABORT audit effects, readonly no-op UPDATE, empty readonly recompute, throwing
  iterable after a yield, multi-ID partial failure and ordered affected dates.
- Independent eager-preparation trace: success is prepare1,prepare2,prepare3,
  iterator getter,start. Injected errors at any prepare propagate the same
  error object and prevent iterator access. Real in-memory missing aggregate
  column fails at prepare2; missing updated_at at prepare3; readonly empty input
  prepares successfully and performs no get/run.
- Complete two-function candidate with supported builder APIs and explicit
  aggregate invariant guard passes virtual strict project TypeScript checking:
  zero diagnostics, no file emitted and no cast/non-null assertion.

## Required Implementation Verification

1. Freeze both original function bodies in a separate first-AC test oracle (or
   deliberately extend the accepted A3b1 oracle only after its integration).
   Preserve raw SQL, now/prepare/Set/branch/event/day order; never share new query
   projections or status derivation with expected values. Dual isolated DB runs
   compare all raw facts, storage types, return/date order and error snapshots.
2. Trace eager empty/throwing iterables including Symbol.iterator getter and
   next() effects; first/second/third prepare failures; parent -> AC -> conditional
   UPDATE order. Confirm noAC avoids broken unused UPDATE targets, missing parent
   does not skip AC, and apparent no-op UPDATE still runs under query_only.
3. Cover status transitions, first-solve earlier/later/clear, wrong-case AC,
   null/empty/literal IDs, COUNT(*) over NULL submission IDs, tombstones/orphans,
   all raw time classes, valid local-day/DST boundaries, unchanged-state dates
   and first-occurrence dedup across IDs. Raw values do not broaden public input.
4. Native ordinary BEFORE/AFTER and UPDATE OF status/first_solved_at/updated_at
   audit triggers, IGNORE/FAIL/ABORT, real readonly errors and exact native error
   passthrough. Snapshot effects after errors, not merely a throws assertion.
5. Real native transaction commit, rollback, nested savepoint rollback/success,
   and deferred-FK COMMIT failure with buffered notifications. For example use
   baseline PRAGMA defer_foreign_keys and a synthetic UPDATE audit trigger that
   inserts a missing-parent FK row, allowing UPDATE then failing actual COMMIT.
   Do not change production constraints or replace commit failure with a mock.
6. Caller regressions: unchanged SubmissionBatchWriter partial success and import
   first-solve movement/replacement/rollback scenarios, data-change notifications,
   listener guarding/reentrancy, close/reinit and no cached adapter. Both type
   programs, scoped lint, focused tests and parent-owned serial native/full/build
   gates are required. Preserve existing migration validation tests.

## Smallest Boundary / Handoff

- Product edits only the two functions/imports in
  `electron/db/repositories/submission/firstAc.ts`. Preserve exported signatures,
  compatibility facade and existing FirstAcRow type export even if no longer
  locally needed; do not widen this slice for cleanup.
- Independent oracle/differential tests, decisive cases in the native repository
  suite and focused DB runner registration. Parent owns task/spec/README and
  full gates/Git. No concurrent writes to the in-flight A3b1 product/test files.
- No upsert/read-query/DTO/schema/migration/validator/day-helper/event-bus/import/
  batch-orchestrator/renderer or layout changes. No new transaction or framework.
- No unresolved design blocker was found. Parent must accept this explicit
  scope before implementation; A3b1 approval and the rest of phase3 remain
  separate. Do not mark the whole submission domain/phase complete from precheck.

## Verification Status

- Source/spec review, generated SQL and in-memory feasibility probes: pass.
- Virtual candidate TypeCheck: pass, zero diagnostics, no emitted files.
- Lint/tests/native/UI/build/global gates: not run for this design-only artifact.
- Reviewer changed only this research review file; no production/spec/task
  metadata/Git/native-runtime/original D-worktree changes and no subagents.

## A3b2 Implementation Review (2026-11-20)

Independent complete-diff review against integration HEAD1a39af0, after the
parent froze all five A3b2 product/test paths. This section is implementation
review evidence; the earlier precheck above is not used as acceptance evidence.
No reviewer product/test fix, task/spec edit, Git action, D-worktree access,
native/global/UI/build suite or recursive agent was performed.

### Verdict

No implementation issue found in the accepted two-function A3b2 scope. Approve
this code/test diff for the parent's remaining normal commit/remote CI and
integration gates. This does not mark A4a/A4b/A4c/recompute, all domain conversion,
phase3, PR8 or release work complete. A4c research was saved separately and its
public nullable-output/key policy remains unapproved pending a later decision.

### Reviewed Surface And Contract Evidence

Read the active check.jsonl/task PRD/design/implementation boundaries, full
A3b-submission-writes research including its native/error-scope caveats, this
precheck, relevant quality/database/raw-time/event/adoption specifications, actual
pinned public APIs, and the complete implementation/oracle/test/native diffs.
Also checked the parent-owned submission README, architecture contract and
A4a planning-only/spec/task changes for consistency with the current boundary.
The only product implementation changed is firstAc.ts; the remaining four owned
paths are its independent oracle, focused test suite, native repositories suite
and one DB runner registration. Existing facade/types/upsert/reads/DTO/schema/
validators/date helper/event bus/import/batch/migration030 are unchanged.

- updateFirstAc acquires the current native DB and captures one clock value,
  then uses genuine synchronous SELECT builders for old parent time and earliest
  exact AC. Parent absence does not skip the AC lookup. Raw SQL projections avoid
  timestamp decoding; fixed AC literal/order/LIMIT1 and tombstone behavior remain.
- No-AC skips UPDATE construction/preparation/execution. AC always constructs and
  executes the real three-target conditional UPDATE, including missing-parent or
  apparent-no-op cases; query_only errors therefore remain observable. The public
  prepared builder and raw placeholders bind AC,now,problemId,AC in that order.
  The two firstAc.submitted_at reads occur only after UPDATE prepare as before.
- Recompute explicitly prepares parent SELECT, aggregate SELECT and UPDATE before
  Symbol.iterator access, including empty/throwing iterables. It then fully
  consumes new Set(problemIds) before any per-ID read/write and preserves first
  occurrence order. Missing parents alone skip aggregate/write. No streaming or
  prefetching changes synchronous reentrant behavior.
- Aggregate uses COUNT(*) and raw MIN(CASE WHEN exact AC THEN submitted_at END),
  no grouping/Date/String decoder. Nullable child IDs and tombstones count. The
  optional .get() result has an explicit undefined invariant guard, not fabricated
  defaults/assertions. Successful SQLite aggregate always returns one row,
  including total0/first_ac:null for no submissions.
- Status derivation exactly retains solved/attempted/unknown/visited semantics.
  Real UPDATE uses SQL null-safe IS NOT comparisons; no JS no-op shortcut. The
  six binds remain status,firstAc,now,problemId,status,firstAc, with raw null/numeric
  values and no accidental extra SET/default. Both mutations emit only changes>0
  and only before ordered old/new valid-day collection from captured snapshots.
- Raw epoch0/negative/fractional/out-of-range/TEXT diagnostics stay raw in SQL;
  the unchanged helper alone drops invalid affected days. No input validator was
  loosened. No transaction/cache/connection/error wrapper/retry/notification owner
  was added. IGNORE0 has no first-AC event, FAIL/ABORT effects remain distinct,
  and earlier autocommit results remain after later failure.
- Caller-owned native transactions and withDataChangeTransaction still span real
  COMMIT. Nested rollback/success and deferred-FK COMMIT failure remain caller
  behavior, not new repository buffering. Throwing/reentrant listeners retain
  original synchronous observation, snapshot and error-guard semantics.
- Exact native throw-object passthrough is tested directly. Deliberately damaged
  qualified/quoted identifiers may have different message spelling, as explicitly
  accepted; tests isolate only that diagnostic wording, retaining stage/code/no
  later work. No production errors or guards were rewritten to manufacture parity.

### Oracle Independence And Test Strength

Programmatically compared the two test-oracle function bodies with git show
1a39af0's original firstAc.ts using TypeScript transpilation/AST printing:

- After type erasure, rename/explicit DB parameter injection and removing the two
  original getDb acquisition statements, both bodies match exactly except the
  documented oracle-only undefined aggregate guard.
- Removed only that precise oracle guard for AST equality. It narrows the native
  .get optional type and throws 'Original aggregate returned no row'; production
  throws its own invariant error. Neither is reachable for a successful real
  COUNT/MIN query without GROUP BY. Normal empty aggregates are exercised with
  all five prior statuses rather than faking a missing aggregate row.
- All SIX original prepare SQL string literals are byte-for-byte identical in
  the oracle. Status/Set/date/branch/event derivation is independently frozen,
  not copied from production builders or shared derivation helpers.

Read all77 differential cases and all6 added native groups. Their dual isolated
runs compare whole problem/submission rows, ordered dates, raw storage where
relevant, native errors, clock counts, event payload/order/transaction state and
preparation/iteration traces; cases also assert positive semantic anchors.

Coverage is meaningful: missing/noAC/orphan/earlier/equal/later/clearing state;
empty/literal/NUL/lone-surrogate IDs; nullable IDs and tombstones; wrong-case AC;
COUNT(*) versus ID counts; raw instants; no-op real readonly writes; all three
prepare failures before iterator; getter/after-yield iterator failure; explicit
four/six UPDATE binds; noAC unused broken column; ordinary BEFORE/AFTER and UPDATE
OF all three targets versus unrelated title; IGNORE/FAIL/ABORT audit effects;
partial autocommit failure; per-ID and event reentrancy; wrapped/unwrapped/nested
transactions; close/reinitialize/current connection; insertion remaining committed
when first-AC fails; actual deferred-FK COMMIT failure after callback completion.

Native COMMIT cases assert callbackFinished, exact foreign-key error, rolled-back
parent/trigger-created child rows, empty notifications and inTransaction false.
They are not merely a callback-thrown mock. Empty/throwing iterators assert no
get/run calls; no-op readonly cases assert UPDATE preparation and run, not only
an error. Trace normalization removes only Drizzle's fixed LIMIT1 bind from AC
lookup traces; original SQL literal and generated bound LIMIT1 remain semantically
fixed, and UPDATE bind lists are compared in full.

### Reviewer Verification

All checks used Node22.23.2 and the explicit release worktree. Independently ran:

- Main TypeCheck: node node_modules/typescript/bin/tsc --noEmit; PASS.
- Test TypeCheck: same compiler -p tsconfig.tests.json --noEmit; PASS.
- Scoped ESLint for all5 A3b2 product/test paths with unused-disable checks and
  max-warnings0; PASS (zero warnings/errors).
- Focused Vitest4files130tests: first-ac77, upsert40, submissionBatchWriter2,
  dataEvents11; PASS.
- Additional focused Vitest2files45tests: submission-reads43, statsDate2; PASS.
- Total reviewer focused coverage:6files175tests passed. No native/global/UI/build
  runner was started by this reviewer and no native dependencies were rebuilt.
- AST body comparison2/2 and exact SQL literal comparison6/6; PASS.
- git diff --check: PASS, only normal Windows CRLF informational warnings.

Parent reports separate serial acceptance evidence (not rerun/independently
claimed here): DB35files634 + actual Electron native repositories36/36 including
6new groups, backupImport11 and migration/safety/interruption/performance gates;
full213files2321 with UI14; build:check/native-external; UTC and NewYork77 each;
source800hashes unchanged. Those parent gate records, not this design artifact,
remain the authoritative complete-gate evidence. Remote CI/merge still belongs
to the parent; no premature release or integration acceptance claim.

### Findings

Fixed: none. Not fixed: none in the accepted A3b2 implementation boundary.
No mechanical or design blocker found after lint, both typechecks and focused
regressions passed. The accepted damaged-DDL diagnostic limitation and unreachable
aggregate guard normalization are documented scope facts, not unresolved bugs.
Only this implementation-review appendix was written for A3b2; no source/test fix
or freeze invalidation was needed. Spec/README/architecture sync already reflects
the reviewed contracts; A4a remains planned and later phase work stays open.
