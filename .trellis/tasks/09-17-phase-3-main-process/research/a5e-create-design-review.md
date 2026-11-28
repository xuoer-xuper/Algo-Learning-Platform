# A5e Create INSERT Design Review

2026-11-28 (Asia/Shanghai). Base4fe73b3, branch codex/drizzle-notes-create,
explicit C worktree. Sole reviewer write is this report. No production/spec/test
edit, native/type/global/build execution, Git operation or delegation. A5d is
integrated; this report supersedes only the earlier construction-only NOTGO gate.

## Recommendation

Recommend bounded implementation GO once parent persists the factory, frozen030
qualification, create-specific notification exception and test boundaries below.
No remaining native-feasibility blocker was found. This is design approval, NOT
implementation/application acceptance. Convert only create's INSERT, ratcheting
4 -> 3; full reads, public types/IPC/UI, storage repair, schema/history and layout
remain excluded.

Use the actually proven public nine-parameter CTE plus ten-column INSERT SELECT,
not normal values() with reordered bindings. Expose an eager
`prepareCreateNoteInsert(db: Database.Database)` returning only typed synchronous
`run(values): Database.RunResult`. Payload requires id, problemId, title, filePath,
noteType, content, wordCount and now; use string/null/number fields and schema-
derived noteType, not service imports or generic Record-only public bindings.

The ordered raw CTE fields are id/problemId/title/filePath/noteType/content/
wordCount/createdAt/updatedAt, with the last two both using placeholder now. Outer
SELECT follows schema order and uses `sql\`null\`.as('deleted_at')`. Prepare once
inside the factory, then forward the payload to that prepared query, returning
the native object unchanged. No Date encoder, defaults substitution, omission,
extra driver SELECT, RETURNING, conflict handling, lifecycle/cache or service work.

## Actual Evidence Reviewed

Read core's final `algo-electron/tmp/a5e-candidate.ts`, native.ts, native-evidence.json,
run.mjs and native/type logs/exit files, plus current service/callers and installed
public builder/session sources. Core owns execution; reviewer did not rerun it.
Actual Electron43.4.0/better-sqlite3 13.0.3 reports SQLite3.53.4 via sqlite_version(),
not merely Electron's bundled process version. Native process exits0 with197
grouped checks and zero old/CTE differences; fixtures use frozen030 notes DDL,
both indexes and synthetic audit/FK tables.

Initial strict candidate typecheck FAILED with TS2769: unaliased deleted_at SQL
could not be referenced as an INSERT SELECT field. Core corrected it using the
public `.as('deleted_at')` alias; corrected strict candidate-only check exits0.
Original failure is retained in a5e-types.log/.exit; corrected evidence is
a5e-types-aliased.log/.exit. No cast, fake field type or runtime coercion is used.

| Proof | Observed result |
| --- | --- |
| Eager preparation | One native prepare before payload parent/title getters, zero run until invoked; prepare/getter/run sentinel identity and exact stopping stages preserved |
| Nine raw bindings | [id,parent,title,path,type,content,count,now,now], including arrays/undefined and identical repeated-now references; exact native result identity |
| Native inputs | Scalars/storage affinities, nullable/repeated IDs, containers, invalid types and distinguishable Symbol TypeError vs oversized-bigint RangeError match |
| Constraints |126 null/undefined masks over six inputs, with now governing both times; duplicate plus invalid-value priority matches physical column checks |
| Triggers/results | BEFORE/AFTER NEW columns/deleted_at, NEW.rowid/last_insert_rowid across two inserts, IGNORE/FAIL/ABORT, bigint result and unread result-getter/undefined seams match |
| Transactions/handles | Commit, rollback, caught inner rollback, real deferred-FK COMMIT failure after callback, retained earlier autocommit, query_only/readonly and closed/independent handles match |
| Payload | Exact4MiB multibyte roundtrip; separate ASCII/CJK cost samples and actual opcode inspection |

The array-order negative control is conclusive: content=['body','count-injected',41],
count=7, now=[] gives old/CTE content=body, count=count-injected, created=41,
updated=7. Normal values() instead stores created=body, updated=count-injected,
content=41.0 text and count=7. Do not relax the old argument-order contract.

These are query/factory probes, not service/file/event/IPC acceptance tests.
Permanent regression tests and real-app execution remain required after coding.

## Explicit Compatibility Qualifications

- Original INSERT omits deleted_at; candidate explicitly inserts NULL. Probe with
  altered DEFAULT73 yields old73 versus CTE NULL. This is a demonstrated limit,
  not an unexplained failure to hide. Parent must limit equivalence to frozen030
  physical/default semantics. Renamed/dropped omitted columns, altered defaults,
  arbitrary views/intermediate histories are not universally compatible.
- Preserve startup/recovery/schema guards unchanged. Existing handles and test
  overrides do not validate every write; future migrations must reassess this
  explicit-NULL assumption. Diagnostic ordinary triggers are semantic probes,
  not a supported arbitrary custom-schema guarantee.
- Create's successful native run still emits notes then constructs its object,
  including BEFORE IGNORE0. Parent must separately record this preservation-only
  data-refresh exception; content's A5d exception is not authorization. Never
  read changes, infer success from row count or add compensation.

## Plan And Cost Decision

Old/CTE opcode counts are43/64 without triggers,66/104 BEFORE,63/101 AFTER and
86/124 with both. CTE has a ten-column OpenEphemeral spool for ANY tested trigger;
EXPLAIN QUERY PLAN lacks a MATERIALIZE label, so that output alone is misleading.
Without triggers there is no observed spool. Frozen030 has no notes triggers.

Measured uncached construction/prepare/run costs, old -> CTE:

- Small input: about0.010 -> 0.151ms without triggers.
- 4MiB ASCII:2.27 -> 2.43ms without triggers;2.32 -> 5.34ms with AFTER trigger.
- 4,194,304 CJK code units (12MiB UTF-8):18.15 -> 18.52ms without triggers;
  19.15 -> 30.35ms with AFTER trigger.

These sequential in-memory samples (400/8/4 iterations) exclude file writes and
do not establish peak memory, latency guarantees or performance equality. Parent
explicitly accepts this bounded overhead; trigger semantic parity remains required.
Do not carry A5d UPDATE's non-materialization claim into this INSERT design.

A public VALUES form with nine scalar subqueries referencing the same CTE is a
conceivable alternative, but is unproven and adds projection/SQL complexity. No
clear baseline benefit warrants expanding scope solely to optimize diagnostic
trigger workloads. Keep the proven INSERT SELECT; no cache/schema/private tricks.

## Service And Implementation Acceptance

Replace only the old INSERT receiver/run expression and import, preserving the
eager factory receiver before the object containing input.problem_id/title#2.
Leave getDb -> clock -> UUID -> parent#1/type/content/title#1 -> file -> count ->
prepare -> parent#2/title#2 -> run -> notes event -> parent#3/title#3 -> return.
No getter collapse, return-row mapping or movement across the event. Exceptions
propagate. File-first partial effects, collision overwrite and SQL rollback not
restoring files remain; listeners can reenter or mutate input before #3 getters.

Implementation acceptance must add a small independent old INSERT plus frozen
create-only service oracle (A5a oracle lacks create). Reuse existing infrastructure:

- Focused tests pin every getter/failure stage, generated ID/output keys, one
  clock/UUID, nine raw arguments, ignored result, native errors and event order.
  Include return-getter failure after an autocommit/event and scoped rollback.
- Permanent native helper tests retain representative197-probe evidence: actual
  containers/negative control, combined constraints, trigger audit/rowid/result,
  readonly/closed handles and real COMMIT. Missing referenced-table/column errors
  must preserve native class/code/stage, not claim arbitrary-DDL text equivalence.
- Real-app tests exercise actual create, not existing raw seed: standalone and
  problem paths/header/empty body, late failure/IGNORE/FAIL, safe UUID collision,
  result/output/getter/event and caller rollback behavior. All paths contained;
  adversarial path diagnostics remain intercepted/query-only. Existing split/
  deferred imports and parent-after-exit cleanup remain unchanged.
- Keep create IPC mapping and legacy notifyProblemsUpdated AFTER service return;
  return-stage error skips it, callback error can fail IPC after write/event.
  Preload/API/UI continue forwarding/using existing unparsed output, including
  extra file_path/created_at. No public schema/output parser or UI repair.
- Core owns helper, one substitution/import, new oracle/focused tests. Native
  worker owns append-only native/app additions. Parent owns spec/task/context/
  docs, one DB entry, exact4-to3 guard, protected accounting, serial gates/Git.
  Cap3; no recursive delegation or shared-file ownership drift.

There is NO new old-observer exception for A5e. Retain66 historical protected
hashes and their accepted earlier differences. Compare old native/app statements
as AST subsequences against4fe73b3 without altering existing classifiers/bodies.
After writer freeze, independent implementation review, both full typechecks,
lint/focused/caller regressions, serial native/DB/app/full/build and normal CI are
still mandatory. This report does not finish phase3 or authorize a release.

## Verification Status

- Findings fixed by core research: public alias resolves initial TS2769; actual
  candidate proof uses only the corrected typed SQL.
- Findings not fixed: no design blocker after explicit qualifications; service/
  filesystem integration and permanent/full acceptance remain future gates.
- Lint: not run in design-only review.
- TypeCheck: corrected strict candidate-only pass inspected; initial fail retained.
- Tests: actual-native197/zero differences inspected; no reviewer native rerun or
  application acceptance claim.
