# Drizzle Notes Content Update

## 1. Scope / Trigger

A5d replaces only the remaining content UPDATE after A5c integration. Parent
accepts the actual-native feasibility and independent content design precheck.
Use a public scalar CTE to retain native argument order without changing shared
schema order. Create and three full-row reads remain native. No public type,
IPC/UI, schema/history, storage repair, directory or transaction-policy change.

## 2. Signatures

```ts
// electron/db/repositories/notes/content.ts
updateNoteContentRow(db: Database.Database, noteId: string, content: string,
  wordCount: number, now: number): Database.RunResult
// Existing service signature stays unchanged.
updateNoteContent(noteId: string, content: string): boolean
```

The helper wraps only its supplied handle. It returns the exact native result;
the service ignores that result entirely. Invalid helper values are diagnostic
test inputs, not new supported IPC inputs.

## 3. Contracts

- Use public `$with('note_write_values').as(...)` and a SELECT from the constant
  SQL source `(select 1)`, with SQL-wrapped named placeholders in content,
  wordCount, now, noteId order,
  aliased content, word_count, updated_at, note_id. Public with/update/set uses
  scalar SELECTs from that carrier; WHERE compares notes.id to its note_id.
  Prepare/run exactly once, passing all four keys even for diagnostic undefined.
- Keep exactly four native bindings [content, wordCount, now, noteId]. Direct
  `.set` uses schema order and changes native array-container outcomes; ordering
  object keys cannot fix it. No Date encoder, normalization, target omission,
  private dialect, fabricated table, schema reorder or disguised raw UPDATE.
- Update exactly content, word_count and updated_at, with raw values and native
  equality. No filter, RETURNING, prelookup, validation, cache, connection/clock/
  event/filesystem ownership, catch or transaction in the helper. A brief comment
  explains why the constant carrier exists. No extra driver-side SELECT occurs.
- Service retains getDb and file-path lookup OUTSIDE try. Missing returns false
  before file/clock/count/UPDATE; read errors propagate. Found empty path stays
  found. INSIDE try keep writeNoteContent -> nowMillis -> countWords -> helper ->
  emitDataChanged(['notes']) -> true; any inner failure returns false. Do not
  move preparation ahead of files or read the native result/changes at all.
- Narrow preservation exception: successful run emits/returns true even for
  IGNORE0 or a row removed after lookup. Do not generalize to new mutations.
  SQL rollback/late failure never implies restoration of the previously written
  Markdown. FAIL audit effects, ABORT, partial autocommit, real COMMIT scopes,
  guarded listeners and synchronous reentrancy retain existing behavior.
- Frozen030 is the supported physical schema. Preserve native class/code/stage
  and injected identity; quoted damaged-DDL wording may differ. No arbitrary
  view/schema equivalence or weaker startup validation. The native probe finds
  physical-column constraint order unchanged despite schema-order SET text.
- CTE retains indexed equality/constant scalar coroutines in the measured plan;
  public UPDATE-FROM was rejected because of materialized update-payload cost.
  Per-call construction has measured small-input overhead; do not add caching.
  4MiB ASCII and 4,194,304 CJK code-unit samples are bounded evidence, not latency
  or peak-memory promises. IPC length counts JS code units, not UTF-8 bytes.
- Reuse the existing split/deferred real-app runner, contained synthetic paths
  and parent cleanup after child exit. No ABI rebuild, new runner or live-root
  deletion. Prior test cases, original oracles and service tails remain intact.
- Two test-only classifiers may add the exact fixed carrier prefix below, after
  their unchanged direct UPDATE branches. Keep all prior traces, four-binding
  expectations, failure injections and bodies. Preserve original protected
  hashes and both prior/current explicit exceptions, never silently rebaseline:

```ts
if (
  normalized.startsWith(
    'with note_write_values as (select ? as content, ? as word_count, ? as updated_at, ? as note_id from (select 1)) update notes set ',
  )
)
  return 'update'
```

Only statementKind in tests/db/notes-file-path-reads.test.ts and
tests/electron/notes-file-path-storage.test.ts receives this addition. A generic
WITH recognizer is not approved. Existing DELETE qualifier acceptance remains.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Missing service row / lookup failure | False before files / original error propagates |
| File, clock or count failure | False; no later SQL/event; earlier file effect may remain |
| Successful UPDATE / IGNORE0 / row disappears after lookup | Event then true; result never read |
| Native prepare/run failure | Helper throws unchanged; service catches false, file remains |
| Helper missing/NULL ID, query_only/readonly | Actual UPDATE/native behavior, no shortcut |
| Undefined/container/raw instant values | Original native four-argument semantics |
| FAIL / ABORT | Native audit/statement distinction; no file compensation |
| Caller rollback/savepoint/deferred-FK COMMIT | Existing DB/events scope; files not restored |
| Closed/reinitialized/alternate handle | No hidden or cached connection |

## 5. Good / Base / Bad Cases

- Good: one explicit helper and service substitution preserve raw argument order.
- Base: native ignored updates and file/cache divergence retain legacy outcomes.
- Bad: silently accept changed bind order, read changes to fix save behavior, move
  lookup into catch, weaken a trace assertion or copy the full original service.

## 6. Tests Required

- Tiny independent old UPDATE oracle plus unchanged A5a service oracle; focused
  comparisons of full rows/storage types/events/native results/errors and order.
- Four raw args/one prepare/run, exact three SET targets, undefined/NULL/container
  and numeric/string/BLOB equality diagnostics; combined constraints, readonly/
  query_only, trigger modes, explicit handle lifecycle and actual COMMIT failure.
- Reuse old orchestration cases; add result getter/undefined-result ignored and
  disappearance-after-lookup behavior. Real app adds only uncovered FAIL+audit
  and storage/result cases, preserving safe containment and all older groups.
- Native repository tests import helper only, not NoteService under RUN_AS_NODE.
  Candidate-only feasibility92 is not permanent application acceptance. Preserve
  the native array negative control; Proxy/Symbol parity does not establish
  distinguishable first-invalid provenance when both return the same TypeError.
- Register one focused DB suite, ratchet NoteService5 to4 only. Independent review
  verifies prior native/app ASTs except approved classifiers; both typechecks,
  lint, old focused regressions, serial DB/native/app/full/build and CI required.

## 7. Wrong vs Correct

```ts
// Wrong: schema-order SET changes original native binding order.
.set({ content: sql`${sql.placeholder('content')}`,
  word_count: sql`${sql.placeholder('wordCount')}`,
  updated_at: sql`${sql.placeholder('now')}` })
// Correct: declare raw placeholders in original order in the single-row CTE;
// SET and WHERE read its aliased scalar fields without introducing more binds.
.set({ content: sql`(select ${values.content} from ${values})`,
  word_count: sql`(select ${values.wordCount} from ${values})`,
  updated_at: sql`(select ${values.now} from ${values})` })
```
