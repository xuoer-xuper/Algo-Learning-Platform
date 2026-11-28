# Drizzle Notes File-Path Reads

## 1. Scope / Trigger

A5a converts exactly four file_path lookups in NoteService: content update,
image save, asset resolution and deletion. Parent accepts the independent
a5a-notes-file-path-review after A4d and its handoff are integrated. This is
query construction parity, not a repair of notes' dual file/DB storage model.
All eight other native SQL boundaries and the four orchestration tails remain.

## 2. Signatures

```ts
// electron/db/repositories/notes/file-path.ts
findNoteFilePath(db: Database.Database, noteId: string)
// Schema/query-derived return shape: { file_path: string } | undefined.
// An explicit Pick<typeof notes.$inferSelect, 'file_path'> is also appropriate.
updateNoteContent(noteId: string, content: string): boolean
saveNoteImage(noteId: string, fileName: string, mimeType: string,
  data: ArrayBuffer | Uint8Array): SaveNoteImageResult
resolveNoteAssetPath(noteId: string, relativeUrl: string): string | null
deleteNote(noteId: string): boolean
```

No request, IPC, preload, output, storage, schema or historical migration changes.
The helper's explicit handle deliberately specializes the repositories README's
normal getDb rule: callers still acquire the lifecycle-owned connection at the
original point; the helper never acquires, opens, closes or caches one.

## 3. Contracts

- Wrap the supplied handle with createDrizzleClient and use public select/from/
  where(eq(notes.id, noteId))/get. Select only file_path and bind exactly one
  equality parameter. No LIMIT, deletion filter, normalization, parser or cache.
- Return the row, not its scalar path. A found row with file_path='' remains
  found and enters the existing storage branch; undefined alone means no row.
- Public parameters stay string. The currently unsound list type still permits
  runtime NULL through deleteNotesByProblem; it must execute bound id=NULL and
  return missing, not IS NULL, early skip, coercion or a wider request contract.
- Content SELECT remains outside try. On a found row, keep file write, clock,
  countWords, native UPDATE preparation/run, event and true inside the existing
  catch. No prepare/clock moves ahead of file writing; inner errors return false.
- Image save and resolve query before storage; they add no write or notification.
  MIME/extension, clock/UUID, filename fallback, bytes and path policy stay intact.
  Resolution itself does not check existence; the protocol owns that check.
- Delete queries, then attempts existing file cleanup, then native DELETE and
  changes-based notification/boolean. Storage cleanup errors remain swallowed by
  storage; SQL errors propagate. Batch retains list order, per-row reads and
  partial autocommit effects/events. No compensation or new transaction scope.
- Existing content success, even diagnostic UPDATE IGNORE0, returns true/emits;
  A5a does not modify that write. A later write conversion requires its own
  reviewed preservation exception. Caller SQL rollback never implies file rollback.
- On frozen030 schema, compare actual results/effects/errors. On damaged DDL,
  retain native exception class/code, injected thrown-object identity and stage,
  but do not promise identical quoted-identifier diagnostic text. Capture actual
  better-sqlite3 wording. Do not translate errors or weaken schema validation.
- tests/verify.mjs keeps runElectronAppTest unchanged for coach. A dedicated
  runNotesStorageTest owns the native notes child's isolated-directory lifecycle;
  bundleTest has one optional splitting flag defaulting false. Only notes supplies
  better-sqlite3 and removes inherited ELECTRON_RUN_AS_NODE in its child.
- Only notes supplies splitting:true: ESM split chunks with .mjs extension
  keep transitive external native/logging imports deferred. A single-file bundle
  otherwise hoists these imports despite local dynamic-import init wrappers.
  Output stays under tmp/electron-tests/<outputName>/; all previous calls keep
  their existing single-file output/arguments. This bounded runner extension
  is approved following the implementation-time bundle observation.
- The runner creates a unique notes-storage-* directory under the resolved
  workspace tmp/electron-tests and passes required ALGO_NOTES_TEST_ROOT. Child
  validates an absolute strict child, matching prefix and nonsymlink directory;
  there is no system-temp/user-data fallback. Runner checks lexical/real parent
  containment and nonsymlink ownership before deleting its created directory
  only AFTER synchronous child exit. Child handles DB/events/protocol/network
  teardown but never recursively removes its live session root. Preserve child
  failure if cleanup also fails; cleanup-only failure fails the gate.
- This lifecycle correction is independently reviewed: the first native run
  passes all21 behavior groups but fails live-root cleanup with EPERM; leftover
  files are Chromium session stores. closeAllConnections is not session disposal.
  Increasing sleeps/retries cannot replace correct ownership. The original
  system-temp diagnostic root is left untouched after tool-policy rejection.
- The real-app suite starts with Node/Electron setup, unique owned temp paths,
  isolated userData/session/logs, then deferred service/DB/storage imports. No
  production bootstrap/window or user DB. Any real protocol test registers the
  privileged scheme before ready and the handler after ready, fetches the asset,
  completes pending work and unregisters before cleanup.
- Assert resolved containment before destructive operations and cleanup. Use only
  contained synthetic IDs/paths for actual storage. NUL/path-escape adversarial
  IDs belong to query-only or intercepted-storage tests. Close DB, restore seams
  and unsubscribe before cleanup; preserve primary failures and exit truthfully.
- Vitest setPath does not change the Electron double's getPath. Real filesystem
  use there requires a per-case getPath override, not shared temp storage.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Missing row | Content/delete false; image existing error; resolve null; no FS |
| Empty stored file_path | Found row; unchanged storage branch executes |
| Tombstone, empty/literal/Unicode ID | Exact native equality and raw file_path |
| Runtime NULL batch ID | Execute SELECT equality; no matching row or file delete |
| SELECT prepare/get failure | Propagate before FS, including content outside try |
| Content file/late UPDATE failure | False; no event; earlier file effect may remain |
| Delete cleanup failure | Existing swallowed cleanup then actual DELETE |
| Late DELETE failure | Throw/no success event; prior file deletion may remain |
| query_only/readonly | SELECT succeeds; unchanged later writes fail natively |
| Closed/reinitialized/explicit alternate handle | No cached or hidden connection |
| Caller transaction/savepoint/failed COMMIT | Native visibility and scoped events; files not rolled back |
| Damaged missing column | Native prepare failure; quoted wording may differ |

## 5. Good / Base / Bad Cases

- Good: reuse one query helper with a supplied handle at each original lookup.
- Base: eight native statements and old dual-store limitations remain explicit.
- Bad: hide NULL rows, return scalar-path truthiness, add filters/guards, move a
  SELECT into content's catch, or describe all-mocked storage as real native proof.

## 6. Tests Required

- Freeze original lookup/four methods/batch independently of the new helper.
  Compare returns/throws, full DB state, exact events, clock/UUID and FS order.
- Focused/native query coverage: one selected field/one binding/one get, ordinary/
  missing/empty/literal/Unicode/NUL/surrogate IDs, raw/empty paths, tombstones,
  NULL equality and actual NULL-list batch, query_only/readonly, explicit handle,
  closed/reinitialized connection, transactions/savepoints and no query writes.
- Capture preparation versus bind/get failures and injected error identity; native
  missing-table/column diagnostics must demonstrate the accepted qualification.
- Real-app storage coverage: four missing outcomes, read failure before FS,
  content bytes/cache/errors, image binary forms/MIME/fallback/clock/UUID,
  resolution/existence/protocol separation, markdown/assets deletion, swallowed
  cleanup, late SQL errors and partial batch. No unsafe real-FS fixtures.
- Register focused and real-app files in test:db and test:all; exclude only the
  real-app file from Vitest. Native repository runner imports only the query
  helper, not real NoteService/storage under RUN_AS_NODE.
- Ratchet NoteService's exact bare-SQL count12 to8 without scanner/exemption edits.
  Independent full review, both typechecks, lint, DB/full/native/build and relevant
  IPC/draft/tab/refresh callers are required before normal commit/immediate push.

## 7. Wrong vs Correct

```ts
// Wrong: empty stored path becomes a missing row; NULL bypasses prepare errors.
if (!noteId) return undefined
return row?.file_path || undefined

// Correct: keep native equality and row presence separate from path content.
return createDrizzleClient(db)
  .select({ file_path: notes.file_path })
  .from(notes)
  .where(eq(notes.id, noteId))
  .get()
```
