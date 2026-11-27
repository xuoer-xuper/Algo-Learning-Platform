# A5 Notes Query Research - Future / Not Approved

Date: 2026-11-27. This is read-only research for a future R1 notes slice, not an
approved design, implementation, acceptance record, or authorization to modify
the architecture budget. A4d runtime work remains separate. Parent owns any
subsequent scope/policy approval, specs, gates, Git operations and integration.

Inspected worktree:
`C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform`.
Paths below are relative to `algo-electron/` unless stated otherwise.
The inspected `electron/notes/NoteService.ts` has SHA256
`740c2fbebb1d0bf86445a145797ac1b4ba97b2d542ce915d0cfd6defa701bcac`.
The existing architecture counter reports exactly 12 native SQL boundaries.
No runtime, schema, test, budget, or spec was changed by this research.

## 1. Recommendation And Decisions Needed

Start with the four identical `file_path` lookups in `updateNoteContent`,
`saveNoteImage`, `resolveNoteAssetPath` and `deleteNote`. Their selected column is
NOT NULL, they expose no nullable row ID or timestamp, and they can be converted
without deciding list/action policy. Preserve their exact place in each caller,
including `updateNoteContent`'s SELECT being outside its catch. Do not merge the
remaining eight boundaries into this first slice merely because they share a file.

The later full-row reads require explicit decisions, not assertions:

1. List IDs really are `string | null`; multiple NULL primary keys are legal.
   There is no problem-style unique platform tuple or other declared unique
   fallback key. Retaining rows requires an approved action/key policy.
2. Stored `note_type` is arbitrary text. Read outputs should not pretend it is the
   input enum. Preserve unknown values, rather than parse, coerce or repair them.
3. Shared list/get/create types currently share one schema. Widening only the
   list must not accidentally erase the proven string ID of a created/detail
   note, widen requests, or drop the current extra runtime output fields.
4. `deleteNotesByProblem` consumes the same list internally. Its NULL-ID lookup
   must still execute SQL equality and preserve missing-schema/native failures;
   skipping the row early or using `IS NULL` is not equivalent.
5. Create/content save emit after successful native execution even for diagnostic
   `RAISE(IGNORE)` changes0. The generic data-refresh no-op rule currently has no
   notes exception. A preservation-only exception needs separate approval before
   converting those writes; it is not granted by this document.
6. Create's public builder INSERT includes a tenth column, `deleted_at = NULL`,
   and uses schema-order bindings rather than the old nine-column order. Frozen030
   compatibility, rather than arbitrary changed-default equivalence, needs review.

Known false-save, file/DB divergence, path-containment and backup defects are
separate product work. They are not permission to silently change this refactor's
return values, filesystem ordering, confirmation flow, or transaction semantics.

## 2. Inventory And Real Storage Shape

### Twelve Native Boundaries

| # | Function / source line | Native operation | Observable result |
| --- | --- | --- | --- |
| 1 | `createNote:90` | INSERT nine explicit columns | Constructed nine-field object; unconditional notes event after successful run |
| 2 | `getNotesByProblem:115` | SELECT * WHERE problem_id = ? ORDER BY updated_at DESC | Mapped nine-field rows; no limit or tombstone filter |
| 3 | `getAllNotes:128` | SELECT * ORDER BY updated_at DESC | Same mapped shape; no limit or filter |
| 4 | `getNoteWithContent:140` | SELECT * WHERE id = ? | null if absent; mapped row plus conditional file read |
| 5 | `updateNoteTitle:157` | UPDATE title, updated_at WHERE id = ? | changes > 0 boolean and conditional notes event |
| 6 | `updateNoteContent:170` | SELECT file_path WHERE id = ? | Missing row returns false before entering try |
| 7 | `updateNoteContent:178` | UPDATE content, word_count, updated_at WHERE id = ? | Success returns true and emits even changes0; catch returns false |
| 8 | `saveNoteImage:197` | SELECT file_path WHERE id = ? | Missing row throws existing message; found row delegates to asset save |
| 9 | `resolveNoteAssetPath:205` | SELECT file_path WHERE id = ? | Missing row returns null; found row delegates to resolver |
| 10 | `updateNoteType:217` | UPDATE note_type, updated_at WHERE id = ? | changes > 0 boolean and conditional notes event |
| 11 | `deleteNote:230` | SELECT file_path WHERE id = ? | Missing row returns false before filesystem work |
| 12 | `deleteNote:237` | DELETE WHERE id = ? | changes > 0 boolean and conditional notes event |

No SQL lives in `noteStorage.ts`, `noteText.ts` or `noteAssetProtocol.ts`.
`getNotesByProblemForDelete` delegates to the full list, not a count query.
`deleteNotesByProblem` loops that list in returned order, invoking `deleteNote`
per row and counting true results. It adds no transaction or aggregate event.
`getAllNotes` and `NoteListItem` have no executable consumer found by repository
search; keep exported behavior rather than treating that as deletion permission.

### Frozen030 Physical Table

Authoritative sources are `src/main/db/schema.ts:220` and
`drizzle/0000_baseline.sql:142`; historical introduction is migrations010/011.

| Column | Physical contract | Existing service output |
| --- | --- | --- |
| id | Nullable TEXT primary key; default BINARY equality | Typed string, but runtime NULL is returned in lists |
| problem_id | Nullable TEXT, no FK | Raw string or null, even if the problem is absent |
| title | TEXT NOT NULL | Raw string |
| file_path | TEXT NOT NULL | Raw string, usually an absolute local path |
| note_type | TEXT NOT NULL DEFAULT 'solution'; no CHECK | Raw string asserted as three-value NoteType |
| created_at | INTEGER NOT NULL; ORM timestamp_ms | Raw numeric scalar from native SQL |
| updated_at | INTEGER NOT NULL; ORM timestamp_ms | Raw numeric scalar from native SQL |
| content | TEXT NOT NULL DEFAULT '' | Raw cached body; detail may replace a falsy body with file contents |
| word_count | INTEGER NOT NULL DEFAULT 0 | Stored count, not recalculated on reads |
| deleted_at | Nullable INTEGER; no default | Selected by SELECT * but discarded by rowToNote |

There are ten physical columns and nine service output properties, not eleven.
Indexes are the primary key, `notes_problem(problem_id)` and
`notes_updated_at(updated_at)`. Neither file_path nor a parent/title/time tuple is
unique. Do not invent a uniqueness witness, FK, enum CHECK, default, NOT NULL or
soft-delete predicate to make a TypeScript shape easier.

`NoteRow` manually repeats the nine output fields and falsely narrows id.
`rowToNote` copies those fields in a fixed order and asserts `note_type as NoteType`;
its comment is not a runtime narrowing check. The replacement should derive row
types from schema/query inference with raw-time overrides, not another copied row
interface or `sql<string>` assertion on the nullable stored ID.

Existing native reads do not validate, round, clamp, timezone-convert or Date-decode
timestamps. A raw `sql<number>` projection retains epoch0 and diagnostic fractional
or out-of-Date-range numbers. The shared IPC integer contract is not an output
parser and cannot be used to justify adding read-time validation. Tombstones,
orphan parent references, unknown note_type, empty string IDs and NULL IDs remain.

## 3. Filesystem, Failure And Notification Order

### Create

Current sequence is `getDb -> nowMillis -> randomUUID -> input.problem_id ->
input.note_type -> input.content -> input.title -> createNoteFile -> countWords ->
prepare INSERT -> input.problem_id -> input.title -> run -> emit -> construct result`.
Result construction reads problem_id and title again. The three problem_id/title
reads must not be casually collapsed if getter/error equivalence is claimed.
Directory selection uses `input.problem_id ?? '_standalone'`; the DB stores
`input.problem_id ?? null`. Defaults are type `solution` and content empty string.

File creation recursively creates the parent and writes `# ${title}\n\n${content}`.
SQL failure can leave the file behind. No transaction, compensation, late reread
or event-on-failure exists. A successful diagnostic INSERT IGNORE still emits and
returns the constructed object even though no row was inserted. IPC additionally
calls the existing `notifyProblemsUpdated` callback after service success.

### Lists And Detail

Lists never read markdown files and preserve only `updated_at DESC`; do not add an
ID tie-break, active-row filter, parent join, limit, or word-count repair. Detail
acquires DB and selects before any filesystem call. If absent it returns null.
If `!note.content`, it reads the stored path and substitutes the entire file or
empty string on null. It does not recompute word_count or update the DB.

This preserves the audited empty-body behavior: a newly created empty note reads
back its header; title-only rename does not rewrite that header; first content
save writes body only. Replacing this fallback is a behavior fix, not ORM parity.

### Title, Type And Content

Title/type: `getDb -> clock -> prepare -> run -> changes > 0 -> event/boolean`.
Only the original two SET targets are present. They do not touch files. Even a
same-value UPDATE must execute; SQLite triggers and changes semantics observe it.

Content: `getDb -> prepare SELECT -> get -> missing? false` is outside the try.
Inside try: `writeNoteContent -> nowMillis -> countWords -> prepare UPDATE -> run
-> emit notes -> true`. All errors inside that try return false; errors in the
initial DB/SELECT path propagate. Moving the UPDATE prepare before file writing,
moving SELECT inside try, or taking the clock earlier changes observable behavior.
On SQL failure the new file body can coexist with the old DB body; on IGNORE0 the
method still returns true and emits. No logging or compensation is performed.

`countWords` trims, counts CJK code points in U+4E00..U+9FFF and counts ASCII
alphanumeric runs. It is an existing display estimate, not a Markdown parser.
Keep its placement and algorithm unchanged, including errors for invalid internal
runtime values. Do not use ORM defaults or file headers to recalculate it.

### Image, Resolve And Delete

Image save: query first; absent throws the existing error; then MIME/extension
selection, mkdir, `Date.now`, UUID and binary write happen in storage. It has no DB
mutation and emits no notes event. Allowed extensions include avif and jpeg;
filename fallback and MIME precedence remain. The current error text omits avif.

Resolver: query first, then normalize and resolve under the selected note's asset
directory with an extension allowlist. It does not test existence or realpath.
The protocol handler performs existence checking, returns400 for malformed
host/segments,404 for missing/rejected paths, and catches/logs errors as404 before
using net.fetch for a valid file URL. Preserve that separation; do not bypass the
service query or claim existing lexical checks prove symlink containment.

Delete: `getDb -> SELECT -> absent? false -> deleteNoteFiles -> prepare DELETE ->
run -> changes > 0 -> event/boolean`. Storage catches cleanup failures; a failed
markdown unlink skips the remaining asset cleanup but does not stop DB deletion.
Conversely SQL failure can leave a DB row whose file was already removed.

Batch delete retains original list order, per-item queries and per-success events.
An error after earlier autocommit deletions leaves their effects/events. A NULL
list ID reaches the native `id = ?` lookup bound to NULL and matches nothing: no
file deletion and no increment. It must not become `IS NULL`, early skip before
the lookup, bulk DELETE, or a claim that every listed note was removed.

### Caller Transactions

None of these service methods creates a transaction or notification scope.
Existing callers can own a real transaction and `withDataChangeTransaction`;
notifications then queue/discard according to that scope, but files are not
rolled back. A SQL rollback is not filesystem atomicity. Do not introduce a
fake notification transaction around a nontransactional batch or move emits to
before execution. Subscriber failures remain isolated by the existing event bus.

## 4. Public And Consumer Contracts

`src/shared/types/notes.ts` defines seven shared properties: id, optional nullable
problem_id, title, content, note_type, word_count and integer updated_at. Runtime
service objects additionally carry file_path and created_at. Handlers/preload
forward without output parsing, so those extra properties currently cross IPC.
Dropping them for privacy, adding a parser, or exposing deleted_at is a separate
shape decision. Do not expand AI/export access; learning-data JSON excludes notes
entirely and SQLite backup contains DB references/body but not external files.

`src/shared/types/ipc/notes.ts` keeps strict input objects and enum noteType.
Identifier policy is string length1..200, not `isInternalPageId`: notes requests
do not additionally reject whitespace or control characters. Do not reuse the
stricter problem-route predicate just because A2g used it. NULL/empty/overlong
stored IDs cannot be actionable through current notes IPC, while whitespace IDs
can be accepted there. Future UI policy should match the actual notes boundary.

`src/preload/index.ts:340` currently uses NoteRecord for list/get/create/getForDelete.
`notesTypes.ts` makes NoteItem = Omit<NoteRecord, 'problem_id'>. `problemsApi.ts`
explicitly returns NoteItem even for create and detail, so widening the shared
list ID alone also widens createNewNote's `openNote(note.id)` argument.
Proposed shape-only correction, pending approval: nullable list record, string-ID
detail/create records, with those stronger types carried through preload and the
API facade. Create has generated UUID evidence; detail can use the unchanged
native equality as the A2f bound-string identity witness. A direct JavaScript
assignment of requested ID is not equivalent for native text normalization.

Relevant UI behavior:

- `NoteList` keys and click/delete actions use note.id. Multiple NULLs collide,
  and `activeNoteId === null` also marks NULL rows active before selection.
- `NotePanelModal`/`NoteEditorPane` treat active ID truthily. Empty IDs cannot
  open/save normally, and null is also the pending-delete/selection sentinel.
- No declared unique fallback exists. A tagged identified/anonymous positional
  key, explicit validity guard and visible accessible disabled-action reason are
  possible policies, not approved decisions. Positional anonymous identity is not
  stable after reordering. Do not use title/file_path as an alleged unique key.
- Unknown ordinary note_type strings use raw label/base badge style. The current
  labels map is a plain object: inherited names such as `__proto__`, `constructor`
  and `toString` do not enter that fallback. The isolated lookup probe confirmed
  object/function results; no React/native render was run. Preserve the data and
  separately decide whether consumer safety belongs in the full-read slice.
- Content save ignores false and clears dirty; title debounce ignores false and
  catches rejection. These are existing false-save risks, not ORM work completed.
- List refresh must not overwrite unsaved editor state. Current tab-isolation,
  pending-title/body flush and stale-read protections remain required.
- `ProblemDetail` counts getForDelete rows via `.length`, optionally calls batch
  note deletion, then deletes the problem. It ignores the note-delete count.
  Keep confirmation and order; do not turn getForDelete into an active-only count.

For an eventual nullable list, one internal option is a private deletion path
accepting string|null while the public delete API remains string. It must first
perform bound equality and only narrow at the original missing-row boundary;
there is no matching row for NULL. This can preserve SQL failures before returning
false. That small internal contract change requires review with the list slice,
not an unchecked cast or silent request widening.

## 5. Installed Builder Feasibility Evidence

An ephemeral stdin script used supported Node22.23.2, installed Drizzle0.45.4,
TypeScript transpilation of the actual schema, and Node `node:sqlite`3.51.3 with a
small in-memory statement adapter. It read the frozen baseline notes CREATE TABLE,
never opened user data, wrote no probe files, and invoked no production service.
This is public-builder/SQLite feasibility, not better-sqlite3/Electron ABI proof.

Observed assertions passed:

- Nine-field list projections with raw timestamp SQL expressions matched the old
  SELECT*/mapping on two NULL IDs, empty ID, unknown type, null parent, epoch0,
  negative/fractional values and a 9000000000000000 out-of-Date-range instant.
- A one-column equality lookup returns the empty-ID filepath, undefined for NULL
  equality and undefined for missing rows; no `IS NULL` substitution is needed.
- Detail bound-native ID projection matched ordinary and empty IDs. Native NUL,
  lone-surrogate and Unicode behavior still requires real driver evidence; the
  identity expression adds a second parameter versus the original one-bind read.
- Public INSERT emitted ten columns and nine bound values, with deleted_at literal
  NULL. Frozen baseline rows retained deleted_at NULL. In an isolated altered-DDL
  counterexample with deleted_at DEFAULT7, the old INSERT stored7 and the new one
  storedNULL. No equivalence claim is valid for that changed physical schema.

Generated INSERT shape:

```sql
insert into "notes"
  ("id", "problem_id", "title", "file_path", "note_type", "created_at",
   "updated_at", "content", "word_count", "deleted_at")
values (?, ?, ?, ?, ?, ?, ?, ?, ?, null)
```

Old binding order is id/problem/title/path/type/content/count/created/updated;
the public builder follows schema order id/problem/title/path/type/created/updated/
content/count. Tests/review must distinguish equivalent persisted values from an
untrue claim of identical parameter positions. No private dialect override or
reordered schema is justified by this migration.

The first probe failed on an encoder trap: bare `sql.param(0)` used
directly as a timestamp INSERT value still reached `value.getTime()` and threw.
The corrected SQL expression retained the raw scalar. Future prepare-before-getter
code should use the established SQL-wrapped named timestamp placeholder pattern,
not a naked Date-column parameter or a handwaved Date cast:

```ts
sql`${0}`
sql`${sql.placeholder('now')}`
```

No runtime workaround was added.

The existing startup physical-schema validators do not provide per-write proof
after arbitrary manual DDL alteration on an already-open connection. A future
frozen030 compatibility decision must state that limit, retain fail-closed startup
validation, and avoid adding an unsolicited schema check on every notes write.

## 6. Proposed Bounded Slices And Ownership

All labels/counts here are proposals. Each needs independent design review and
parent GO; none is marked accepted by this document.

| Slice | Boundaries converted | Native prepares left in NoteService | Separate acceptance concern |
| --- | --- | --- | --- |
| A5a | Four file_path reads (#6,#8,#9,#11) | 8 | Preserve placement, missing/error behavior and unchanged storage side effects |
| A5b | Title/type UPDATE (#5,#10) | 6 | Exact SET targets, clock before prepare, changes/events, caller transaction |
| A5c1 | Detail read (#4) | 5 | Truthful raw note_type, string-ID witness, nine fields and file fallback |
| A5c2 | Two list reads (#2,#3) and typed internal consumers | 3 | Nullable list/key/action policy and batch-delete NULL lookup behavior |
| A5d | Content UPDATE and DELETE (#7,#12) | 1 | Files first; original catch/partial effects; explicit IGNORE event exception |
| A5e | Create INSERT (#1) | 0 | Frozen030 defaults/order scope, FS/getter timing, constructed result and events |

A5c1/c2 may be reviewed together if one owner deliberately handles the shared type
split, but they must not smuggle in nullable list decisions under a detail-only GO.
A5d/e must not be used as a hidden repair of the dual-store authority model.

### Query Location And Architecture Guard

`tests/architecture/guards.mjs:38` counts only prepare/exec on receivers named db,
database or getDb(). It does not count arbitrary SQL templates or prove builder
use. Database layer exemption is exactly electron/db/ and src/main/db/. The
ratchet requires budget = actual, including partial reductions; a stale positive
entry after zero fails. Current entry is NoteService:12 at
`tests/architecture/check-architecture.mjs:318`.

Do not rename the connection, move native SQL into an exempt directory, broaden
the scanner exemption, or increase the budget to obtain a green guard. R1 still
defers the later services/kebab-case directory migration. Project database rules
also place query construction in repositories/procedures, not arbitrary storage
helpers, so approve the location explicitly rather than relying on scanner gaps.

A bounded recommendation is a query-only helper under the existing DB layer,
for example `electron/db/repositories/notes/queries.ts`, with a README if creating
that directory. Accept an explicit current native handle; never acquire/capture a
global DB or call filesystem code there. A5a can centralize the identical public
builder filepath projection while the four service call sites still acquire DB
and invoke it at the original line. This is an actual conversion, not a raw SQL
relocation. Preserve runtime NULL equality from the existing batch caller even
before its type correction. Alternatively retaining builders in the legacy
service needs an explicit reviewed placement allowance; it is not assumed here.

Suggested eventual ownership, without spawning concurrent writers on the same file:

- DB implementer: only the accepted NoteService statements and necessary query
  module, frozen independent oracle, focused native/differential tests and runner
  registration. Parent decides helper names and exact file allowlist before GO.
- Consumer implementer, only for A5c: selected shared output schemas, preload
  annotations, `src/features/problems/notesTypes.ts`, the existing
  `src/features/problems/problemsApi.ts` facade, and necessary NoteList guards/keys
  plus focused IPC/component/UI tests. No new facade is implied.
- Parent: architecture budget reduction in the same accepted conversion, specs,
  README/task records, serial native/global/build gates and integration.

Potential test names are `tests/db/notes-file-path-reads.test.ts`,
`tests/db/notes-oracle.ts`, later focused notes-read/write suites, and a dedicated
native Electron-app suite if real storage is exercised. These files are only
proposals; none has been added. Do not let a source-file migration force a broad
test-directory or production directory move.

## 7. Existing Evidence And Required Verification

### Coverage Actually Present

| Existing test/source | What it covers | What it does not establish |
| --- | --- | --- |
| `tests/db/dataChangeNotifications.test.ts` | Happy create/title/delete, missing title false, topics contain no row data | All noteStorage helpers are mocked; no real FS/SQL ordering or notes read oracle |
| `tests/ipc/timestampSchemas.test.ts` | Note updated_at integer/nonnullable shape | Actual query values, NULL IDs or enum/output split |
| `tests/ipc/ipcSchemas.test.ts` | Image ArrayBuffer/Uint8Array input and invalid binary cases | Full notes action/nullability parity |
| `tests/components/millisecondDisplay.test.tsx` | NoteList epoch0 display | Native persistence or invalid-ID interaction |
| `tests/components/noteTabIsolation.test.tsx` | Tab/problem identity, pending title/body flush, stale reads, same-tab preservation | Database/filesystem behavior; API and Crepe are substituted |
| `tests/components/dataRefreshSurfaces.test.tsx` | Notes list refresh keeps unsaved title | Save-failure honesty or SQL correctness |
| `tests/ui/rendererScreenshots.pw.spec.ts` | Actual Electron renderer/Milkdown, responsive notes tabs and autosave isolation | Notes API is synthetic; not real NoteService/SQLite/filesystem end-to-end |
| `tests/db/migration030.test.ts`, historical upgrades, Drizzle schema/client tests | Notes storage/schema/time migration and generic ORM contracts | Twelve service operations and their filesystem sequence |
| `tests/db/auditDataIntegrity.repro.ts`, `tests/components/auditNoteSave.repro.tsx` | Historical defect repros and synthetic evidence | Not default regression gates; not newly rerun by this research |

The operational audit is
`docs/OPERATIONS/PROJECT_AUDIT_BATCH1_2026_09_11.md` at repository root:
AUD-001 backup omits files; AUD-002 false save; AUD-003 imported parent ID path
escape; AUD-008 empty-body/header divergence. Current source still has relevant
behavior. This research did not repeat destructive/path-escape scenarios and
does not claim arbitrary filename overwrite, code execution, or new user loss.
Backup wording has since been clarified in `electron/backup/README.md`; do not
repeat the old audit's UI wording as if it were still the current text.

### Required Matrix Before Accepting A Slice

| Boundary | Required independent evidence |
| --- | --- |
| Four lookup reads | Existing/missing/empty/literal/Unicode ID, runtime NULL batch row, raw path, tombstone, no extra selected columns, one query at original point |
| Lifecycle/errors | Readonly/query_only, caller transaction visibility, closed/reinitialized DB, missing table/column, no hidden second connection or cached prepared adapter |
| Full reads | Exact nine output keys, ordered rows including ties and multipleNULL, orphan parents, unknown type, raw epoch0/fraction/out-of-Date-range values, no writes/events |
| Detail fallback | Cached body skips FS; empty cache reads whole file; missing/unreadable file gives empty string; no word-count recompute, header/title behavior unchanged |
| DB-only writes | Same-value UPDATE, exact UPDATE OF targets, missing/empty IDs, clock/prepare/error order, IGNORE/FAIL/ABORT, readonly, post-run conditional notification |
| Content/delete | File failure versus late prepare/run failure, caught versus propagated error, SQL success with changes0, file-before-SQL effects, no invented compensation |
| Create | UUID/clock/getter/file/count/prepare/run/return order, independent and parent notes, empty body, defaulted inputs, UNIQUE failure, IGNORE, exactly9 bindings/10 columns on accepted schema |
| Transactions | Real outer COMMIT failure and rollback, nested savepoint scopes, partial autocommit batch; filesystem changes are not mistaken for rolled-back SQL effects |
| IPC/UI | Strict unchanged requests, truthful nullable list only, strong create/detail types, unknown types, retained rows/disabled invalid actions, unique tagged keys, list refresh/draft/tab behavior |
| Assets/native | MIME and extension fallback, ArrayBuffer/Uint8Array, missing note, normal path resolution/existence/protocol results, no notes event for image/resolve |
| Compatibility/privacy | No baseline/schema/history/recovery changes; no note body/path in event payload, AI context or learning-data export; existing extra IPC properties not silently removed |

Freeze the old SQL and original orchestration independently for differential
tests; do not import the new mapper/query/nullable guard into both oracle and
implementation. Compare return/throw, SQL rows, exact event sequence, clock/UUID
calls and filesystem call order. Keep fixtures synthetic and assert containment
before cleanup. Source counters and SQL snapshots supplement, not replace, native
behavior evidence. Run approved checks serially with the parent-owned ABI/build
work; concurrency must stay within the user's total cap3.

### Native Harness Caveat

`noteStorage.ts` imports Electron app. The current native repository runner uses
`ELECTRON_RUN_AS_NODE=1`, so importing the whole NoteService with actual storage is
not automatically a valid real-app test. A query-only helper can be exercised in
that native DB runner, while actual filesystem/protocol checks need a reviewed
Electron-app harness with isolated `app.setPath('userData', ...)`, no visible
window, actual better-sqlite3 externalized, cleanup/exit discipline and explicit
runner registration. Do not call an all-mocked storage test full native coverage.

Vitest's `tests/electron/electronMock.ts` adds a second trap: setPath only records
calls and getPath returns a shared temp path. Real-FS Vitest tests must override
getPath to a unique per-case contained directory; setting mock app.setPath alone
does not isolate storage. No global mock change is needed for this future slice.

## 8. Research Verification And Limits

Completed here: source/spec/task/test/audit inspection, repository searches,
architecture counter on the inspected NoteService, the isolated public-builder
probe described in section5, and a plain-object note-type-label lookup probe.
The corrected in-memory probe exited0; the initial timestamp-encoder probe failed
as documented. Neither used production DB/filesystem or Electron ABI.

Not run here: Vitest, typecheck, lint, architecture/docs gates, native Electron,
UI acceptance, global tests, release build, packaged install, recovery checks or
Git mutation. No acceptance status follows from this document. Before writing
production code, parent must select the next slice, reconcile the output/FS/event
decisions above, authorize its exact paths and record independent design review.
