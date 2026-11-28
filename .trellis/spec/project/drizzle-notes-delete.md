# Drizzle Notes Deletion

## 1. Scope / Trigger

A5c converts only deleteNote's final native DELETE after A5b integration.
Parent accepts the independent delete-only precheck, not the combined content/
delete proposal. Content SET binding order requires a separate decision; create
and three full-row reads also remain unchanged. No schema/history, public type,
IPC/UI, storage repair, directory migration or notification-policy change.

## 2. Signatures

```ts
// electron/db/repositories/notes/delete.ts
deleteNoteRow(db: Database.Database, noteId: string): Database.RunResult
// Existing service APIs remain unchanged.
deleteNote(noteId: string): boolean
deleteNotesByProblem(problemId: string): number
```

The helper extends the narrow explicit-handle repository exception. It returns
the original native result, not a copied result/count/boolean, and owns no DB
lifecycle. Public IDs remain string; malformed-input diagnostics do not widen IPC.

## 3. Contracts

- Public Drizzle delete(notes)/where(eq(notes.id, sql.placeholder('noteId')))/
  prepare/run({noteId}); one prepare/run and one raw equality bind. Keep the
  key for undefined diagnostics. No RETURNING/LIMIT/filter/prelookup/cache,
  clock/event/filesystem/validation/catch/transaction inside the helper.
- Service keeps getDb -> existing findNoteFilePath -> missing?false -> existing
  deleteNoteFiles -> DELETE prepare/run -> changes -> conditional notes event
  -> changes. Replace only the final expression and import. Do not cache either
  changes read or move preparation ahead of files. Empty found paths stay found.
- Direct helper calls always execute DELETE, including missing/NULL IDs that
  can expose readonly/schema errors. Service missing lookup still stops before
  files/DELETE. A NULL batch row still executes its lookup: no skip, IS NULL,
  bulk deletion or changed count/list order.
- Deletion includes tombstones and literal equality. Files disappear first.
  IGNORE0 can retain a DB row without files and returns false/no event. FAIL can
  retain trigger effects; ABORT rolls back the statement, not files. Native SQL
  errors propagate. Existing swallowed file cleanup errors still permit DELETE;
  a deliberately throwing storage seam stops before it.
- Caller savepoints/transactions and existing notification scope cover actual
  COMMIT. SQL rollback never restores files. Earlier autocommit batch success
  and events survive later failure. Preserve topic-only payload, guarded listener
  failure and synchronous reentrant visibility. No compensation or new buffer.
- Supported physical schema is frozen030. Retain native class/code/stage and
  thrown identity; damaged-DDL quoted wording is qualified as in A5a/B. No error
  translation, new view/DDL guarantee or weaker startup validation.
- Actual better-sqlite3 determines undefined/null/array/object behavior. Reuse
  its original SQL oracle; alternate-driver or capture-object probes establish
  construction only. Preserve untouched bigint result fields on explicit handles.
- Existing isolated real-app notes lifecycle, split/deferred imports, contained
  fixtures and parent-after-exit cleanup stay unchanged. Reuse prior cases before
  adding uncovered ones; no new runner, live-root removal or unsafe real-FS IDs.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Missing service row / runtime NULL batch ID | Execute lookup; false/no files/DELETE |
| Direct helper missing/NULL ID | Real DELETE attempt; native no-match or failure |
| Found empty path or tombstone | Existing cleanup branch then native deletion |
| Native IGNORE / FAIL / ABORT | False/no event / throw with audit / statement rollback |
| File cleanup swallowed error | Existing DB deletion still occurs |
| Injected throwing cleanup seam | No DELETE preparation or success event |
| DELETE prepare/run or readonly failure | Files-first effects stay; native error propagates |
| Caller rollback / actual COMMIT failure | SQL/topics roll back, files do not |
| Later batch failure | Earlier autocommit deletion/events preserved |
| Closed/reinitialized/alternate handle | No cache or hidden connection |

## 5. Good / Base / Bad Cases

- Good: replace one native statement with a one-bind builder at the original site.
- Base: deletion preserves old dual-store limitations and NULL-list behavior.
- Bad: preparing before cleanup, early NULL skip, changes caching, bulk delete,
  fake filesystem rollback, or converting content under a weaker silent contract.

## 6. Tests Required

- Reuse unchanged A5a oracle for old delete/batch orchestration; add a tiny
  notes-delete-oracle.ts for native DELETE only and notes-delete-writes.test.ts.
  A5a/B oracle bytes remain fixed; no production dependency in oracle code.
- A5c review exposes one legacy observer spelling assumption: the A5a focused
  suite recognizes only unqualified DELETE WHERE id and therefore misses the
  builder's WHERE notes.id, losing traces/error injection in six cases. Parent
  approves only that recognizer's optional notes. qualifier. Keep every old test
  body, expected trace, injected failure and content recognizer unchanged. Retain
  the original hash plus explicit one-line exception, not a silent baseline reset.
- Compare complete raw state/audits/results/events/FS traces. Prove one bind/
  prepare/run, native result identity including bigint, two stateful changes
  reads, no clock/UUID, exact missing/helper distinction and unchanged batch order.
- Cover literal/empty/Unicode/NULL/undefined/native-container inputs query-only;
  readonly/query_only, IGNORE/FAIL/ABORT, injected lookup/storage/prepare/run
  errors, lifecycle, savepoints/actual COMMIT and listener/reentrant behavior.
- Limit no-clock/no-query observations to the tested operation. Reinitialization
  runs historical migrations with legitimate clocks: assert the prior operation,
  initialize, then clear setup observations before the next operation. Never
  clear calls after a delete or filter away unexpected operational clock reads.
- Append helper-only native cases; never import real NoteService under RUN_AS_NODE.
  Keep previous native/app statements in order and reuse existing delete/NULL/
  batch/rollback real-file groups. Add uncovered real-app behaviors safely.
- Register focused DB suite and ratchet exactly6-to5. Shared runner/Vitest config
  otherwise unchanged. Independent full review, both types/lint, A5a/B/caller
  regressions, serial native/DB/full/build and normal hooks/CI are required.

## 7. Wrong vs Correct

```ts
// Wrong: prep before cleanup or cached predicate changes observable behavior.
const prepared = makeDelete(db)
deleteNoteFiles(note.file_path, noteId)
const changed = prepared.run({ noteId }).changes > 0
// Correct: leave orchestration and both original predicates in the service.
deleteNoteFiles(note.file_path, noteId)
const result = deleteNoteRow(db, noteId)
if (result.changes > 0) emitDataChanged(['notes'])
return result.changes > 0
```
