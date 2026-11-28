# Drizzle Notes Title And Type Writes

## 1. Scope / Trigger

A5b converts only updateNoteTitle and updateNoteType after A5a integration.
Parent accepts the independent title/type research and design precheck. This
extends the explicit-handle notes repository exception to two metadata writes,
not a general patch API or a change to notes' dual file/DB storage model.
Six other native statements, public types/IPC/UI, schema/history and storage
remain unchanged. No directory migration or new transaction is authorized.

## 2. Signatures

```ts
// electron/db/repositories/notes/title-type.ts
updateNoteTitleRow(db: Database.Database, noteId: string,
  title: string, now: number): Database.RunResult
updateNoteTypeRow(db: Database.Database, noteId: string,
  noteType: typeof notes.$inferSelect['note_type'], now: number): Database.RunResult
// Existing service API and event payload remain unchanged.
updateNoteTitle(noteId: string, title: string): boolean
updateNoteType(noteId: string, noteType: NoteType): boolean
emitDataChanged(['notes'])
```

The physical note_type parameter is schema-derived string; do not import the
service's closed NoteType union into its repository or widen that public union.

## 3. Contracts

- Service retains getDb -> one nowMillis -> helper -> first result.changes read
  -> conditional event -> second result.changes read. Replace only its two
  prepare/run expressions and add the helper import. No cached/destructured
  changes predicate; synchronous listeners can observe the committed write.
- Each explicit helper wraps only the supplied native handle and builds one
  public Drizzle UPDATE, prepares once and runs once. Return the untouched
  native RunResult. No lifecycle acquisition/cache, clock, event, filesystem,
  SELECT, validation, catch, RETURNING, coercion or transaction inside it.
- Exactly two SET targets: title/updated_at or note_type/updated_at. Use raw
  SQL-wrapped named placeholders for BOTH targets. Direct undefined values are
  omitted by mapUpdateSet; a bare timestamp placeholder invokes Date encoding.
  Keep three bindings in original order [value, now, noteId], including keys
  whose diagnostic values are undefined. No sql.raw interpolation of input.
- Equality binds the ID unchanged, including diagnostic NULL/undefined. Do not
  replace with IS NULL, filter tombstones, skip missing rows, or precompare
  same values. Actual UPDATE execution and UPDATE OF targets are observable.
- Matched same-value UPDATE normally changes1. Only changes>0 emits/returns
  true; IGNORE0 returns false/no event. Native FAIL may retain earlier trigger
  effects while ABORT rolls them back. No compensating transaction or catch.
- Caller owns transactions/savepoints and existing withDataChangeTransaction
  around the actual invocation, including COMMIT. Earlier autocommit success
  and events survive later failures. Listener failures remain isolated.
- Both methods update DB metadata only; markdown/assets paths and bytes are
  untouched. Do not fix existing renderer false-result handling or rename files.
- Frozen030 is the supported physical schema. Damaged-DDL diagnostics retain
  native class/code/stage and injected error identity; qualified/quoted error
  wording need not match. Do not translate failures or weaken schema validation.
- Native better-sqlite3 binds undefined as NULL and treats arrays/plain objects
  as binding containers. Derive malformed-input outcomes from original native
  SQL, not the research node:sqlite feasibility probe. These diagnostics do not
  widen supported service/IPC contracts or change runtime validation.
- Reuse the existing isolated real-app notes runner unchanged: split ESM,
  deferred imports, checked owned workspace root, parent cleanup after exit.
  No new runner, userData fallback, unsafe real-FS IDs or ABI rebuild.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Existing/same-value/tombstoned row | Real two-target UPDATE, original event/boolean |
| Missing or NULL-bound ID | Execute UPDATE; normally false/no event |
| Undefined SET value on matched/missing row | Native NOT NULL failure / possible changes0 |
| Fraction/epoch0/extreme/TEXT instant diagnostic | Native raw binding, not Date conversion |
| getDb/clock/prepare/run failure | Original stage/order and thrown identity |
| query_only/readonly, including missing row | Actual native write attempt and error |
| IGNORE / FAIL / ABORT trigger | False/no event / throw with effects / throw with rollback |
| Caller rollback or deferred-FK COMMIT failure | Rollback and discard scoped topics |
| Reentrant/throwing listener | Original visible rows/result and isolated listener error |
| Closed/reinitialized/alternate handle | No stale adapter or hidden connection |
| Successful/failed metadata mutation | No markdown or asset change |

## 5. Good / Base / Bad Cases

- Good: two explicit helpers preserve raw bindings and the original result object.
- Base: no new files or events for missing rows; unchanged public union and IPC.
- Bad: dynamic-column facade, undefined target omission, Date conversion, caching
  changes, prelookup/no-op shortcuts, or treating alternate-driver probes as native.

## 6. Tests Required

- Freeze the two original functions in notes-title-type-oracle.ts, independent
  of the implementation and A5a oracle. Add notes-title-type-writes.test.ts;
  compare complete raw rows/storage types, results/errors, audit effects/events.
- Cover all three supported types, same/missing/tombstone/literal/empty/Unicode
  IDs, raw times, NULL/undefined IDs and values, actual array/object binding.
  Prove exactly two SET targets/three binds, one prepare/run and no SELECT/FS.
- Inject getDb/clock/prepare/run failures, native result identity and a stateful
  changes getter to prove changes/event/changes order. Cover UPDATE OF triggers,
  IGNORE/FAIL/ABORT, damaged DDL, readonly/query_only and connection lifecycle.
- Prove caller rollback, caught inner savepoint, real deferred-FK COMMIT failure,
  partial autocommit and synchronous reentrant/listener-error behavior.
- Append helper-only native repository groups without importing NoteService
  under RUN_AS_NODE. Extend the existing real-app notes suite for metadata-only
  paths/bytes preservation, leaving prior groups and root lifecycle unchanged.
- Register focused suite in test:db; preserve real-app exclusion/runner behavior.
  Ratchet exactly NoteService8-to6, no scanner relaxation. Both typechecks/lint,
  caller regressions, independent review, serial native/DB/full/build and CI
  remain required before normal commit/immediate push and integration.

## 7. Wrong vs Correct

```ts
// Wrong: drops undefined title and encodes numeric now as a Date.
.set({ title, updated_at: sql.placeholder('now') })
// Correct: retain both assignments and pass original raw values to native run.
.set({
  title: sql`${sql.placeholder('title')}`,
  updated_at: sql`${sql.placeholder('now')}`,
})
.where(eq(notes.id, sql.placeholder('noteId')))
.prepare().run({ title, now, noteId })
```
