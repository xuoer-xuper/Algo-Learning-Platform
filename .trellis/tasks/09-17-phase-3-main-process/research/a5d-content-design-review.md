# A5d Content UPDATE Design Precheck

- Date: 2026-11-28 (Asia/Shanghai).
- Status: FUTURE / NOT GO. Recommend the scalar-CTE candidate only; parent must
  accept governing artifacts and exact observer exceptions before implementation.
- Base: 48ba2c04f2f13940b10da513b403d3e0990187db, after A5c integration/handoff.
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform.
- Sole reviewer write: this report. No product/test/spec/runner/Git changes or
  additional native execution. Core owns actual-native feasibility evidence.

Parent subsequently persisted acceptance in PRD/design/implement and the new
drizzle-notes-content.md contract, including both exact observer additions and
the data-refresh exception. Reviewer crosschecked that contract against this
precheck with no discrepancy. This design recommendation is not implementation
acceptance. Core's narrative report was still pending at reviewer handoff;
parent will crosscheck it. The evidence reviewed here is the final raw source,
JSON and exit logs, not an assumed approval of a later report.

## Recommendation And Boundary

Approve one content UPDATE conversion, NoteService bare-SQL budget5 -> 4. The
public scalar-CTE builder preserves the original four native arguments without
reordering shared schema, inventing a table facade, using private APIs or moving
raw UPDATE text. No blocking design flaw remains in this bounded candidate.
The simpler public UPDATE-FROM alternative was actually compared, not dismissed
on construction alone; its materialized update payload makes it less suitable
for this content path despite shorter syntax.

```ts
// algo-electron/electron/db/repositories/notes/content.ts
updateNoteContentRow(
  db: Database.Database,
  noteId: string,
  content: string,
  wordCount: number,
  now: number,
): Database.RunResult
```

Use the existing client factory on the supplied handle. Public `$with` and
`select` construct `note_write_values` with raw SQL-wrapped named placeholders
in content, wordCount, now, noteId order, aliased content, word_count, updated_at,
note_id. Its only source is `(select 1)`. Public `with(...).update(notes).set(...)`
uses scalar SELECT references to those fields; WHERE compares notes.id to the
note_id scalar. Call prepare/run once with all four run-object keys, including
diagnostic undefined. Return the original native result untouched. The one CTE
statement binds exactly [content, wordCount, now, noteId], with no extra driver
SELECT. No input coercion, Date encoder, fallback, RETURNING, filter, lifecycle,
cache, catch, clock, event, filesystem or transaction belongs in the helper.

Only replace NoteService's final native prepare/run expression and add its import.
Keep create, three full-row reads, previous notes helpers, public types/IPC/UI,
schema/history, storage and directory layout unchanged. Malformed helper inputs
are native diagnostics, not an expansion of the supported public string API.

## Required Service Contract

- getDb and findNoteFilePath stay OUTSIDE try. Lookup errors propagate; missing
  rows return false before file/clock/count/UPDATE. Found empty paths stay found.
- INSIDE try, preserve file write -> one clock -> countWords -> UPDATE prepare/
  run -> notes event -> true. All inner failures return false with previous
  effects retained. Do not move preparation before files, clock or count.
- Ignore the run result entirely. Successful IGNORE0, or disappearance after
  lookup, still emits notes and returns true. No changes read/destructure/cache.
  Parent must add this narrow preservation exception to data-refresh.md before
  GO, not change the general notification policy or fix false-save UI behavior.
- Caller transactions/savepoints and notification scopes still encompass actual
  COMMIT. Database rollback does not restore Markdown. FAIL may retain trigger
  audit; ABORT does not restore a file already written. No compensation, new
  transaction, buffering or listener/reentrancy change.
- Supported physical schema stays frozen030. Preserve native error class/code/
  stage and injected identity; existing damaged-DDL wording qualification stays.
  Do not imply compatibility with arbitrary views/schema changes or relax startup
  validation. Known DB/file divergence and renderer false handling remain open.

## Evidence Independently Inspected

Inspected current service/storage/count/event code, actual IPC/preload/renderer
callers, A5a/B/C contracts and original oracles. Installed Drizzle0.45.4 public
builder/types retain SELECT field insertion order but order UPDATE assignments
by schema. Better-sqlite3 binds arguments left-to-right and returns the native
run result. SQLite constraint generation checks physical columns, not textual
SET order; actual-driver comparisons, not that source inference, support parity.

Core's final ignored scratch source/log/JSON under `algo-electron/tmp/` were
read directly: a5d-feasibility-candidate.ts, a5d-feasibility-native.ts,
a5d-feasibility-run.mjs, a5d-feasibility-evidence.json and native/types logs and
exit files. The actual Electron43.4.0/better-sqlite3 process exits0; 92 grouped
checks have zero CTE/FROM differences. Candidate-only strict TypeScript exits0.
Fixtures use baseline notes DDL, updated_at index and diagnostic audit/FK tables,
not the full application lifecycle. This is feasibility, not A5d acceptance.

| Evidence | Observed result / limit |
| --- | --- |
| One prepare/run, four args, result identity | Original order, untouched result, no changes getter read; injected prepare/run identities retained |
| Native values/containers | Null/undefined, text/numeric/BLOB/bigint, arrays/objects, fractions/invalid times match old SQL |
| Reordering negative control | Plain builder stores content=injected and updated_at=body for the array-container diagnostic; old/CTE/FROM retain content=body and word_count=injected |
| Combined NULL/undefined | All28 matched/missing cases match; multiple failing targets report physical updated_at/content/word_count constraint order |
| ID affinity | Ten numeric/string/leading-zero/BLOB comparisons match native equality; no affinity cast introduced |
| Triggers | IGNORE/FAIL/ABORT, all-column UPDATE OF membership and BEFORE/AFTER NEW values match; unrelated row retained |
| Errors/lifecycle | query_only including no-match, actual readonly, closed/new independent handles and damaged-column prepare errors checked |
| Transactions | Commit, rollback, caught inner rollback, deferred-FK actual COMMIT failure and partial autocommit match |
| Content/scale | Exact4MiB UTF-8 mixed content retained; 10,000-row target changes only one row |

Proxy/Symbol multi-invalid probes return the same TypeError and empty trace;
they do NOT experimentally prove which invalid argument failed first or a Proxy
trap order. Exact argument capture plus the array negative control is sufficient
to justify retaining bind order. Most scratch checks summarize parity rather
than retaining every individual result. Permanent implementation tests remain
required; do not count 92 as the number of application acceptance tests.

## Alternative And Cost

Both candidates use public APIs and pass the same native comparisons. Original
SQL has40 opcodes, scalar CTE99, UPDATE-FROM63 on the measured fixture. CTE keeps
the notes ID index plus four constant scalar coroutines with no ephemeral update
row; FROM adds ephemeral update-payload storage. Neither is a driver-side extra
query or a full notes scan in the measured plan.

Final local construct/prepare/run samples, old / CTE / FROM:

- Small content,1500 iterations: approximately7.2 / 110.6 / 80.8 microseconds.
- 4MiB ASCII,12 iterations: approximately2.11 / 2.18 / 5.60 milliseconds.
- 4,194,304 CJK code units (12MiB UTF-8),6 iterations: approximately18.43 /
  18.26 / 27.07 milliseconds.

The channel limit is JS string length, not UTF-8 bytes. These sequential,
same-process, in-memory samples are bounded feasibility observations, not a
latency/peak-memory guarantee or an end-to-end application benchmark. Preserve
per-call preparation; do not introduce a cache to hide the small-input overhead.
A short helper comment should explain the otherwise surprising carrier.

## Exact Observer Exceptions Required

Only these two existing SQL classifiers need accommodation for a WITH statement:

1. `algo-electron/tests/db/notes-file-path-reads.test.ts:214` statementKind.
2. `algo-electron/tests/electron/notes-file-path-storage.test.ts:158` statementKind.

In each, retain all existing branches and add only this branch after the current
direct UPDATE recognizer, using its existing normalized string:

```ts
if (
  normalized.startsWith(
    'with note_write_values as (select ? as content, ? as word_count, ? as updated_at, ? as note_id from (select 1)) update notes set ',
  )
)
  return 'update'
```

The complete fixed carrier/target prefix is intentional. Do not recognize all
WITH statements or arbitrary embedded UPDATE text. Keep original expected traces,
four ordered binds, failure injection, test bodies and assertions. Preserve the
already approved DELETE qualifier exception. Parent records these exact new
exceptions against the original protected hashes; no silent rebaseline. No other
content observer or production SQL-text dependency was found.

## Minimal Verification And Ownership

- Reuse UNCHANGED notes-file-path-oracle.ts and existing focused/app content
  cases for lookup/catch/FS-clock-count ordering, missing/empty/tombstone rows,
  late SQL errors, IGNORE/FAIL/ABORT, readonly and caller rollback/COMMIT. Add a
  tiny independent old UPDATE oracle plus focused helper tests, not another
  full-service copy or a production-dependent oracle.
- Permanent helper matrix preserves four raw args/result/error identity, native
  containers and affinity, combined NULL constraints, trigger targets, lifecycle,
  query_only/readonly and transaction behavior. Reuse existing test infrastructure.
- Add only uncovered service seams: throwing changes getter/undefined run result
  ignored, disappearance after lookup still succeeds/notifies, and real-file
  FAIL+audit evidence. Use actual app for storage, safe contained IDs only; never
  import real NoteService under RUN_AS_NODE. Existing deferred imports/root checks/
  parent-after-exit cleanup and runner remain unchanged.
- Worker1 owns helper/single service replacement/tiny oracle/new focused suite
  plus its explicitly approved focused classifier branch. Worker2 owns append-only
  native repository groups and bounded real-app additions/classifier branch.
  Parent owns docs/spec/context, one DB-list registration, exact5-to4 budget,
  protected accounting, serial gates and Git. Cap3 includes parent; no recursion.
- Before GO, parent persists explicit-handle/content/raw-binding/catch/event
  contracts and observer exceptions. After writer freeze, independently verify
  old native/app statements remain AST subsequences except authorized classifier
  additions; both typechecks/lint, old regressions, actual-native DB/app, full/
  build gates and normal hooks/CI must pass. No release/phase-archive approval.

## Verification Status

- Lint: not run in this design-only turn; required after implementation.
- TypeCheck: core candidate-only strict check passes, independently inspected;
  full application/tests checks are not an A5d result yet.
- Tests: core actual-native feasibility92 grouped checks pass, independently
  inspected; no reviewer native rerun or application acceptance claimed.
- Findings fixed: none in product/tests; this report records the safe design.
- Findings not fixed: no remaining design blocker after parent's contract/observer
  approval. Implementation, permanent regressions and full acceptance gates remain
  future work; this reviewer does not edit those files in the design-only turn.
