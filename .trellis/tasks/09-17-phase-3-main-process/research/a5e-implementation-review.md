# A5e Creation Implementation Review

2026-11-28 (Asia/Shanghai). Independent trellis-check review in the explicit C
worktree, branch codex/drizzle-notes-create, base
4fe73b30b7a12def3838c034b4806011d5aaa95d. Reviewed the frozen create-only slice
against project/drizzle-notes-create.md and its accepted design/native evidence.
No delegation, original D worktree operation, state-changing Git command,
native/global/DB/build rerun, runner/budget edit or rebaselining by reviewer.

## Findings (fixed)

- File: algo-electron/tests/db/notes-create-writes.test.ts:323.
- Issue: the first independent full tests typecheck failed with TS2322 because
  trackedInput's note_type getter inferred string, not NoteType or undefined.
- Fix: annotate that getter with service.NoteType. Runtime code, getter order,
  literal value and every assertion are unchanged. This is the only reviewer
  source/test edit, made after core freeze and acknowledged by parent.
- Initial main typecheck passed; initial tests typecheck failed exit2. Retained
  tmp/drizzle-a5e-review-testtypes.log/.exit without overwriting. Both complete
  typechecks then passed, followed by scoped lint/format and the full focused
  caller matrix. No other source change was needed.

## Findings (not fixed)

No remaining implementation defect or scope violation found in this slice.
The following accepted limits remain explicit, rather than being repaired or
claimed equivalent:

- Frozen030 equivalence only: old INSERT omits deleted_at, new INSERT names
  literal NULL. Altered defaults, omitted-column changes or arbitrary views are
  not universally equivalent; existing startup/recovery guards are untouched.
- Successful IGNORE0 still emits notes and constructs the result; third input
  getters can throw after the DB write/event. File-first effects, collision
  overwrite and files surviving SQL rollback are preserved, not made atomic.
- The accepted constant CTE INSERT SELECT has measured construction overhead
  and a trigger-dependent ten-column ephemeral spool. No unproved performance,
  peak-memory, alternate-query or custom-schema guarantee is introduced.
- Final parent serial DB/full/build, source freeze verification, normal hooks
  and CI remain acceptance gates. This reviewer did not execute or pre-certify
  them. Three full-row notes reads and their public nullability/UI decisions
  remain outside A5e; phase3 is not complete and no release is authorized here.

## Actual Code Review

The helper uses only the public CTE/select/insert/prepare/run API, wraps the
supplied native handle and eagerly prepares once. The typed facade forwards its
complete payload and returns the native object unchanged. Nine raw arguments
retain original order id/parent/title/path/type/content/count/now/now, including
explicit undefined and repeated reference identity. Outer projection uses the
physical schema order and aliased literal deleted_at NULL; no schema encoder,
Date conversion, extra native query, RETURNING, conflict handler, lifecycle,
cache, event or filesystem ownership is added.

The service diff is exactly one import and one receiver/run expression. File
creation and count stay before preparation; factory receiver evaluation stays
before parent/title second reads. The native result stays unread. Event emission
stays before parent/title third reads and the original constructed object with
file_path/created_at. All other functions and top-level statements are intact.

The create-only service oracle preserves the original function body, normalizing
only the injected crypto.randomUUID dependency name for AST comparison. Its
independent old INSERT names the original nine columns. It reuses the unchanged
original countWords oracle rather than the new helper. Focused tests exercise
all getter/error stages, clock/UUID work, late file failure, native result/error
identity, defaults/output order, listener errors/mutation/reentrancy, collision,
raw diagnostic inputs, readonly/lifecycle and caller commit/rollback behavior.

Permanent native additions use actual frozen030 DDL and both indexes. They pin
raw binding order with a failing ordinary-values negative control, distinguish
first-invalid TypeError/RangeError, cover126 NULL/undefined masks plus uniqueness,
NEW fields/deleted_at/rowids, BEFORE/AFTER IGNORE/FAIL/ABORT, bigint results and
4MiB multibyte content. Actual readonly/closed/independent handles, caught inner
rollback and deferred-FK failure after callback completion remain native tests.
The helper alone is imported under RUN_AS_NODE; real service/storage work remains
in the app suite after isolation.

Real-app additions call actual create, not the old seed helper. They compare
contained standalone/orphan files, headers and bodies, all three note types,
full rows/returned keys, all parent/title reads and precise failure boundaries.
They retain collision overwrite/assets, trigger audit effects, unread result
properties/undefined results, reentrant writes and caller rollback/savepoint/
actual failed COMMIT. Path components used for real files are bounded; malformed
path diagnostics are confined to synthetic/query fixtures. Existing startup,
protocol registration, shutdown and parent-after-exit cleanup are unchanged.

The existing IPC handler still maps input, calls create, then calls optional
legacy notifyProblemsUpdated before returning the exact service object. New12
IPC tests pin payload rejection, nullable-content mapping, optional callback,
service-error suppression of callback and callback-error propagation after
service completion. Preload, problemsApi and NotePanelModal still forward/use
the existing result without new output parsing, ID/type changes or UI repairs.

## Protected Boundaries

Independent TypeScript AST comparison against4fe73b3 ignores comments/formatting
only; it does not normalize SQL or remove assertions:

- Native suite: all197 old top-level statements remain an ordered subsequence
  of209 current statements, including complete old test bodies.
- App suite: all50 old top-level statements excluding runTests remain in54;
  all43 old runTests statements remain in53. Prior observers, classifiers,
  assertions and lifecycle statements are intact. New create observer is local
  to the new cases; no A5e observer exception was needed or granted.
- NoteService: precisely one create statement and one import differ; every
  other top-level/body statement matches. Final hashes confirm this and the
  native/app sources stayed unchanged after the AST check.
- Protected checker retains60 original hashes at26be448 plus3 at48ba2c0 plus3
  at4fe73b3. Result:65 exact files plus1 file with its two previously authorized
  historical observer edits. A5e approved-edit set remains empty.
- Parent runner change is only one focused DB registration; bare-SQL budget is
  exactly4 -> 3 with no scanner change. Parent spec/task/README changes record
  the eager factory, explicit-NULL qualification and separate create IGNORE0
  preservation exception. No template/platform detection change is implicated.

## Verification

Node22.23.2, package cwd, independent reviewer commands after core freeze:

| Check | Result | Evidence under algo-electron/tmp/ |
| --- | --- | --- |
| Full main tsc --noEmit | Pass0 initially and after fix | drizzle-a5e-review-typecheck[-fixed].log/.exit |
| Full tests tsc --noEmit | Initial TS2322 exit2; fixed pass0 | drizzle-a5e-review-testtypes[-fixed].log/.exit |
| Scoped ESLint, nine changed code/runner files, max warnings0 | Pass0 | drizzle-a5e-review-lint.log/.exit |
| Scoped Prettier check, same nine files | Pass0 | drizzle-a5e-review-format.log/.exit |
| UTC focused/caller matrix | Pass11files439tests, exit0 | drizzle-a5e-review-focused-utc.log/.exit |
| Baseline AST, formatted oracle and final source hashes | Pass0 | drizzle-a5e-review-ast[-final].log/.exit |
| Original66 protected hashes and exact exceptions | Pass0 | drizzle-a5e-review-protected[-final].log/.exit |

The11 suites are the five notes suites (63/97/48/43/75), dataChangeNotifications11,
notes-create IPC12, ipcSchemas38, timestampSchemas39, noteTabIsolation6 and
dataRefreshSurfaces7. No prior suite/assertion was relaxed. Focused execution is
the Node compatibility-driver boundary, not substituted native acceptance.

Separately inspected parent first-run actual native88/88 and real-app44/44,
both exit0, in drizzle-a5e-initial-native.log/.exit and
drizzle-a5e-initial-app.log/.exit. Native/app files match worker frozen hashes:

- repositories.test.ts:
  0A24241438E4EF9C35F4BD6E0ED92C2E8662642F092BF98A61284B01AAE36F18
- notes-file-path-storage.test.ts:
  3977D135C124613AE1A06C7C1E75E9DC4001409A91048A6CB20B67144A4613DE

Final focused source hash after the type-only fix:
2F1D9F79BAE4F5B8C951E6585DAC512C31A9DD9F9DC7925A8F06DF3A424A8245.
Native197 feasibility remains research evidence, not an additional permanent
test count. Reviewer notified parent source/test freeze and safe serial-gate
handoff after focused439 passed; no reviewer test/native process remains.
