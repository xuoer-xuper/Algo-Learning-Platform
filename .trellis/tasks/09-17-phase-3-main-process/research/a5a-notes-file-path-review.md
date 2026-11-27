# A5a Notes File-Path Reads: Independent Design Precheck

Date: 2026-11-27. Design only; no implementation authorization. Reviewed frozen
a5-notes-queries.md, SHA256
b660d4c13beaf219188d209397714893f0f8c2023d9d2d9f1303774ca21c03e2,
against actual source, schema, callers, installed builders and test runners.
Paths below are relative to algo-electron/ unless otherwise stated.

## Verdict / Parent Decisions

Recommend the four-read A5a slice, subject to parent acceptance and A4d remote
integration. No need to decide full-note DTOs, nullable lists, UI keys/actions,
notes writes/defaults or known dual-store defects first. This review approves
neither those later decisions nor immediate implementation.

Parent must record three bounded decisions before GO:

1. Select the query-only helper and explicit-handle boundary below. The existing
   repositories README says repositories obtain getDb themselves; document this
   deliberate caller-supplied-handle case without moving acquisition or changing
   ownership. No new DB lifecycle, facade or future-layout move is needed.
2. Accept native prepare/bind/failure-stage parity on damaged DDL, not identical
   quoted-column diagnostic text. A concrete counterexample is recorded below.
   Keep exact supported-schema behavior and original catch placement; never
   rewrite native errors to manufacture a wording match.
3. Approve the narrowly scoped native-app harness/runner files and architecture
   ratchet12-to8 adjustment. The current app runner does not externalize the
   native DB module; RUN_AS_NODE cannot test real NoteService/storage unchanged.

## Smallest Coherent Production Boundary

Add electron/db/repositories/notes/file-path.ts with one exported function:

```ts
findNoteFilePath(db: Database.Database, noteId: string)
// Inferred return: { file_path: string } | undefined
```

Use a public builder around the supplied native handle, select only
notes.file_path, where eq(notes.id, noteId), and synchronous get(). Preserve one
bound equality parameter. No LIMIT, active filter, coalescing, normalization,
output parser, raw full-query SQL, assertion or connection/statement cache.

Return the row, not a scalar path: an existing row with file_path='' must still
enter the original storage branch. Undefined alone represents a missing row.
The NOT NULL schema column supplies the inferred string type; no hand-copied row
interface or sql<string> nullability assertion is necessary.

Replace exactly four SELECT expressions in NoteService.ts:170/197/205/230 and
their obsolete row assertions. Retain each existing const db=getDb(), then call
the helper at the original point. Import the helper directly; do not introduce
a notesRepository facade/barrel or move NoteService into future services layout.
All remaining eight SQL sites and every method signature/body tail stay intact.

Public helper/service parameters stay string. The existing unsound list typing
still permits a runtime NULL ID to reach batch deletion. Do not add an early
NULL/empty guard, isNull, string coercion or a public nullable API. eq binds the
runtime NULL as SQL equality, returns no row on the valid schema, and still
prepares/fails on a broken schema. Later truthful list typing is a separate slice.

## Observable Ordering To Preserve

| Entry | Required unchanged sequence after getDb |
| --- | --- |
| updateNoteContent | SELECT/get outside try; missing false; inside try write file, clock, countWords, native UPDATE/run, notes event, true; inner error false |
| saveNoteImage | SELECT/get; missing existing error; otherwise storage validation/mkdir/clock/UUID/write; no DB write or notes event |
| resolveNoteAssetPath | SELECT/get; missing null; otherwise original storage resolver; no existence check, write, clock or event added |
| deleteNote | SELECT/get; missing false; deleteNoteFiles; native DELETE/run; changes-based event/boolean; SQL error still propagates |

SELECT failure must precede all filesystem activity and must not be swallowed by
content's later catch. Content file errors remain false; delete storage cleanup
errors retain their existing swallowed behavior. Late write failure can leave a
changed/deleted file with unchanged DB state. A caller SQL rollback does not undo
files. Do not add compensation, transactional wrappers or refreshed values.

Batch deletion keeps list order, per-row lookup, boundNULL no-op and per-success
events, including earlier partial effects before failure. Protocol still calls
the service, checks existence itself, uses the existing400/404 handling and fetches
the file only after success. Requests, IPC/preload outputs, confirmation order,
AI/export privacy and storage/path policies remain unchanged.

## Concrete Diagnostic Qualification

Supported Node22.23.2, TypeScript6.0.3, Drizzle0.45.4 and node:sqlite3.51.3,
using actual transpiled schema and a disposable in-memory statement adapter:

- Generated lookup is select "file_path" from "notes" where "notes"."id" = ?.
  It projects exactly one field and binds exactly one value, including NULL.
- On a disposable notes table lacking file_path, the old query reports
  no such column: file_path. The quoted builder reports
  no such column: "file_path" - should this be a string literal in single-quotes?
  Both fail during prepare. Native better-sqlite3 wording remains to be captured.
- Do not bypass quoting/private dialects, catch/translate errors or loosen schema
  validation. Use the already accepted A4a/A3 damaged-schema distinction: native
  class/code/identity and ordering, with explicitly qualified wording parity.

Other in-memory assertions passed for ordinary/missing/empty/literal/Unicode IDs,
multiple NULL rows, raw/empty paths and tombstones. NULL with a missing table
still prepares and throws. These are feasibility probes, not Electron ABI tests.

## Tests And Nonoverlapping Ownership

Suggested worker1 ownership after GO:

- electron/db/repositories/notes/file-path.ts and only four lookup substitutions
  plus import in electron/notes/NoteService.ts.
- tests/db/notes-file-path-oracle.ts: independently freeze the original lookup
  and four orchestration methods; include the original batch path if needed for
  batch differential evidence. Never delegate expectations to the new helper.
- tests/db/notes-file-path-reads.test.ts: real temporary SQLite plus storage seams
  for exact order/errors/returns, independent state/event/clock/UUID assertions.
- Appended query-only native groups in tests/db/repositories.test.ts; preserve
  every existing group. No import of whole NoteService into RUN_AS_NODE.

Suggested worker2 ownership: tests/electron/notes-file-path-storage.test.ts only,
using real app/SQLite/storage for the bounded four-call acceptance. It may import
worker1's frozen oracle after its interface is agreed, but must not edit it or
use the new helper as its expected implementation. No product storage changes.

Parent owns tests/verify.mjs, vitest.config.ts, architecture budget and all
README/spec/task files. Register the focused file and new app suite under DB so
test:db and test:all both execute it; exclude only the real-app file from Vitest.
New notes repository directory requires its README; update repository/notes/DB/
Electron-test documentation and the narrow explicit-handle explanation.

Required focused/native-query cases: full single-field values and row presence,
empty path versus missing row, literal/Unicode/native NUL and surrogate binding,
tombstones and NULL equality, query-only/readonly, explicit handle independence,
closed/reinitialized handles and caller savepoint visibility. Preserve schema,
ledgers, changes and no query-side events/writes. Inspect one SELECT/native get
and binding order; distinguish prepare failure from bind/get failure and preserve
injected thrown-object identity. Include actual NULL-list batch behavior, not
only direct helper invocation via a reflective test seam.

Required orchestration/storage cases: all four missing outcomes, SELECT failure
before FS including content's outside-catch path, successful content file/DB
bytes, file failure and late UPDATE failure, image bytes for ArrayBuffer and
Uint8Array, unchanged MIME/fallback filename and deterministic clock/UUID order,
resolver-before-protocol existence check, deletion of markdown/assets, swallowed
cleanup failure followed by DELETE, late DELETE failure and no invented file
rollback. Keep exact per-success events and partial-batch effects. Existing
notes IPC, data-change, tab/draft and refresh regressions remain relevant callers;
no renderer redesign or native UI feature test is required for these four reads.

## Bounded Real-App Runner And Filesystem Safety

Existing runElectronAppTest at tests/verify.mjs:101 externalizes only electron
and electron-log. Extend it with optional per-call options, defaulting to current
behavior: extraExternals and normalMode. Only the notes call supplies
extraExternals:['better-sqlite3'] and normalMode:true. The unchanged coach call
keeps its original bundle options and environment. Do not globally change coach
semantics, package configuration or production entrypoints for this test.

For normalMode, pass an explicit environment overlay that removes inherited
ELECTRON_RUN_AS_NODE. Node22 spawnSync was independently checked to omit a key
whose overlay value is undefined. Actual Electron execution must assert app is
available and report its real exit status and test results; a successful GUI
launch is not acceptance. Keep electron-log external as in the existing runner.

Harness bootstrap imports only Node/Electron setup first, creates a unique owned
temporary directory, sets userData and any needed session/log paths before
service/DB initialization, then dynamically imports service/connection/storage
after setup. Do not import production main/bootstrap/env setup or open a window.
Keep deferred imports deferred in the bundle. Register the unchanged privileged
scheme before ready only if exercising the actual protocol; install its handler
after ready, fetch the local test asset and unregister during cleanup.

Use synthetic DB records whose stored paths and IDs are known-contained. Check
resolved targets before every destructive action and before recursive cleanup;
no drive/root/userData guesses. Malicious/NUL/path-escape IDs belong in query-only
or intercepted-storage probes, never uncontrolled real-FS deletes. Close handles,
unsubscribe/restore seams and finish pending fetches before cleanup; preserve the
primary error if cleanup also fails, then app.exit with a truthful status.

Vitest app.setPath only records calls and getPath returns a shared temp path.
If focused tests touch actual storage, explicitly override getPath to a unique
owned directory first; do not modify the global mock. Protocol tests must not
claim symlink containment from existing lexical path checks.

## Architecture / Verification Status

An independent stdin-only probe ran the actual guard functions on an in-memory
four-expression substitution: count12 becomes8, stale budget12 fails and exact
budget8 passes. The proposed helper path is already within the existing DB layer.
Parent should lower only NoteService's entry12-to8 in the same accepted change;
no receiver rename, SQL relocation without builders or scanner exemption change.

Only this artifact was written. No production/test/fixture/spec/Git mutation,
native/global/build run, user DB or original D-worktree access. Lint/TypeCheck/
Tests: not run, intentionally not implementation acceptance. Parent must persist
the selected contract and runner ownership, await A4d integration and give GO;
implementation/native/full/build/CI evidence remains future work.
