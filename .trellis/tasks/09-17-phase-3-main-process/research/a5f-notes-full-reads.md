# A5f Notes Full Reads - Preliminary Research / NOT GO

2026-11-28. Explicit C worktree, after A5e writer freeze but before its integration.
This report alone is writable. No product/test/spec/runner/Git changes, probes,
typecheck, native runtime or global gates were performed for this research.
Parent reports A5e full3127/UI16/native88/app44/build passing with836 protected
sources unchanged; that is parent-owned A5e evidence, not A5f acceptance.

The existing `a5-notes-queries.md` remains the domain inventory. This report only
refines the remaining three SELECTs and the next slice's decisions. A5a-e write
and file-path contracts are not reopened. All paths below are package-relative
to `algo-electron/`; line numbers refer to the inspected frozen working tree.

## 1. Remaining Boundary And Exact Behavior

`electron/notes/NoteService.ts` currently has three native reads; architecture
budget `tests/architecture/check-architecture.mjs:318` is3.

| Service | Existing operation | Non-negotiable tail |
| --- | --- | --- |
| `getNotesByProblem:121` | `SELECT * FROM notes WHERE problem_id = ? ORDER BY updated_at DESC`, `.all(problemId)` | Map all rows through rowToNote; one raw parameter |
| `getAllNotes:134` | `SELECT * FROM notes ORDER BY updated_at DESC`, `.all()` | Same mapping, zero parameters; exported even though no production caller was found |
| `getNoteWithContent:147` | `SELECT * FROM notes WHERE id = ?`, `.get(noteId)` | Undefined row becomes null; otherwise map, then conditional file read |

The physical schema at `src/main/db/schema.ts:220` has ten columns. Both id and
problem_id are nullable TEXT; id has a table-level primary key, not NOT NULL.
note_type is arbitrary non-null TEXT with default solution and no CHECK. Three
time columns use timestamp_ms; word_count is plain INTEGER. Parent has no FK.

`rowToNote:65` returns exactly these nine keys, in this order:

`id, problem_id, title, file_path, note_type, content, word_count, created_at, updated_at`.

It deliberately drops deleted_at, does not trim/coerce/recount, and does not
actually validate note_type: its `as NoteType` is only a false static narrowing.
Preserve nine output values and property order, including file_path and created_at
which already cross IPC despite being absent from the shared DTO. Do not return
the entire ten-column object or output-parse away extra fields.

No read filters tombstones, joins parents, adds LIMIT, deduplicates NULL IDs or
orders tied rows by ID. Both lists order only updated_at DESC; compare same-run
legacy tie order without inventing a stronger stable-order guarantee. Missing
parent references and deleted_at0 rows remain visible. Query errors propagate
synchronously and precede any file read. No clock, UUID, events or transaction
are introduced; use the handle acquired by the service at its existing point.

Detail's `if (!note.content)` remains exact. It reads the stored file path and
substitutes the entire returned file, or empty string on null. readNoteFile
catches real fs errors. Do not catch a mocked/external service exception, make
the predicate null-only, read files for lists, or recalculate word_count/update
the cache. An empty new note reads back `# title\n\n`; title-only changes leave
the old header, while a content save writes body only. These known behaviors
are illustrated at `tests/db/auditDataIntegrity.repro.ts:224` and are not fixes
authorized by an ORM conversion. Actual-file fixtures must remain contained.

## 2. Public Builder And Native Driver Pitfalls

Existing full-row patterns are
`electron/db/repositories/submission/queries.ts:8` and
`electron/db/repositories/problem/queries.ts:54`: getTableColumns plus raw SQL
timestamp overrides, schema-derived types and synchronous all/get. Installed
Drizzle0.45.4 public interfaces permit typed select objects, SQL expressions,
eq, desc, prepare, get/all and aliases; no private API or fake table is needed.

Recommended query-level starting shape, pending precheck:

```ts
type NoteDatabaseRow = Omit<
  typeof notes.$inferSelect,
  'created_at' | 'updated_at' | 'deleted_at'
> & {
  created_at: number
  updated_at: number
  deleted_at: number | null
}
type NoteRead = Omit<NoteDatabaseRow, 'deleted_at'>

const noteColumns = {
  ...getTableColumns(notes),
  created_at: sql<number>`${notes.created_at}`,
  updated_at: sql<number>`${notes.updated_at}`,
  deleted_at: sql<number | null>`${notes.deleted_at}`,
}
```

Prefer selecting all ten baseline columns then retaining the nine-key mapper,
rather than changing both SQL projection coverage and public shape. A nine-field
SQL projection is possible, but requires review of omitted-column diagnostics;
it does not excuse leaking deleted_at or changing the nine output keys/order.
Reassess later schema extensions rather than claiming arbitrary SELECT-star DDL
equivalence. Full-row timestamp overrides include deleted_at even though the
mapper discards it: otherwise its decoder can still throw before mapping.

Installed implementation evidence (source inspection only):

- `node_modules/drizzle-orm/sqlite-core/query-builders/select.js:603` prepares
  synchronously; select fields are ordered via orderSelectedFields, not native
  object property names. getTableColumns is public (`utils.d.ts:36`).
- `node_modules/drizzle-orm/better-sqlite3/session.js:21` calls the supplied native
  prepare. Its get at88 uses `stmt.raw().get(...params)` and all at75 delegates to
  values, which uses `stmt.raw().all(...params)`. Missing get stays undefined.
- `node_modules/drizzle-orm/utils.js:7` maps every selected position through its
  column/SQL decoder. Ordinary text and integer inherit identity mapping from
  `column.js:40`; plain SQL uses noopDecoder (`sql/sql.js:52`). Thus raw SQL
  timestamps preserve native scalars; no mapWith(Number), Date roundtrip or cast.
- `sqlite-core/columns/integer.js:65` timestamp_ms performs `new Date(value)`:
  fractions truncate, out-of-Date values invalidate, and BigInt throws. Native
  defaultSafeIntegers(true) can yield bigint for INTEGER timestamps/counts;
  the adapter does not force it off. Test both modes, including non-null
  deleted_at and large literals, without promising new bigint IPC support.
- A5a direct text eq preserves ordinary native binding because its column
  encoder is identity. For an explicit raw-bind contract prefer named placeholder
  equality and `.get({noteId})`/`.all({problemId})`; present undefined stays a
  parameter, unlike missing placeholder key. Native arrays remain single JS
  argument containers for better-sqlite3 to expand; do not pre-flatten/coerce.
- `sql/sql.js:87` treats bare undefined as no SQL fragment and bare arrays as
  SQL lists. Therefore `sql<string>`${noteId}`` for a malformed runtime ID is
  not a raw one-argument binding contract. SQL-wrapped named placeholders avoid
  the construction trap but not the two-bind issue discussed next.

The earlier A2f equality-proven bound-ID projection is valid for supported string
IDs under baseline TEXT/BINARY comparison, not a universal drop-in here. It adds
one extra bound argument compared with notes' one-bind detail read and can change
array/invalid-binding outcomes. It also returns bound representation rather than
stored affinity for numeric diagnostics. Do not replace ID in JavaScript either:
NUL/surrogate native encode/decode may differ from the original JS value.
If strict string-ID detail is desired, require a new reviewed proof/feasibility
matrix or explicitly accepted scope; do not copy the A2f generic as a cast.

No new query was constructed, typechecked or executed for this report. Candidate
feasibility and actual Electron/better-sqlite3 evidence remain outstanding.

## 3. Truthful Output Options And Consumer Decisions

Current `src/shared/types/notes.ts:10` already declares note_type as z.string(),
not the main service enum. Its id is still z.string(), shared by list/get/create.
`src/preload/index.ts:340` forwards those operations without an output parser;
Window.api derives from that actual object (`src/preload/index.ts:582`).
`src/features/problems/notesTypes.ts:20` derives NoteItem from NoteRecord, and
`problemsApi.ts:37` /53/57/66 use that same item type for delete-confirmation lists,
normal lists, create and detail. Widening one shared id therefore changes create's
`openNote(note.id)` call at `NotePanelModal.tsx:44`; do not fix this with assertion.

Recommended simplest exact-one-bind option for a full three-read slice:

1. Keep existing Note/create return's string ID and enum input/type contract.
   Add a schema-derived NoteRead with nullable ID and arbitrary string note_type.
   Lists and detail return NoteRead[] / NoteRead|null; nullable detail is a
   conservative truthful read shape, not a claim that supported string equality
   can match NULL. This avoids an extra parameter or dishonest narrowing.
2. Keep existing noteRecordSchema/NoteRecord string-ID shape for created output;
   add a derived noteReadRecordSchema using `.extend({id:z.string().nullable()})`
   and corresponding NoteReadRecord. Do not widen request IDs or noteType input
   enum; retain integer updated_at output-schema validation and no runtime parser.
3. Preload list/get/getForDelete use read type; create retains created type.
   NoteItem derives from read type. Add NoteCreatedItem (or equivalent inferred
   create return) and use it for createProblemNote. loadNote can return read type:
   NotePanelModal selects by its requested noteId, never by returned note.id.
4. Keep read mapper nine-key shape and remove its enum assertion. For complete
   A5f no caller needs the mapper to return the creation-specific Note type.
   Do not change create's tested function body/property order or mutator inputs.

If parent prefers strict string detail output, separately review its evidence
instead of widening all outputs by convenience. A non-null guard after equality
could narrow without changing one bind, but is a new validation branch whose
mock/damaged-schema errors must be designed; a single-bind CTE identity witness
is also possible but unproven complexity. Neither is implementation GO here.

Full-list consumer policy needs explicit acceptance in these exact files:

- `src/features/problems/NoteList.tsx:24`: currently key=note.id, NULL active
  selection collides with activeNoteId=null, and clicks/deletes forward id to
  string-only callbacks. Preserve every row; disable only unaddressable actions,
  never substitute ID, hide rows or permit NULL mutation. Show persistent visible
  accessible reason, not only title/hover text; guard callback invocation and
  avoid marking unaddressable rows active.
- `src/shared/types/ipc/notes.ts:30`: true request predicate is string length1..200,
  not trimmed/non-control problem-route identity. An approved pure notes ID helper
  can mirror exactly this rule (new shared file, paired schema/predicate tests).
  Do not reuse `src/shared/internal-page-id.ts`, which rejects currently accepted
  whitespace/control strings. Sharing the helper in main is a separate chosen
  scope; existing Zod inputs must retain exact acceptance behavior.
- No notes uniqueness fallback exists: multiple NULL rows can share title/path/
  parent/time. Recommend tagged string-ID keys for addressable rows plus tagged
  ordinal keys for anonymous/unaddressable rows, with explicit instability under
  reorder for anonymous identity. Do not claim a stable unique tuple or expose
  rowid as a new public ID. NoteList rows have no per-row editor state; editor
  selection remains only actual addressable ID. Parent must accept this tradeoff.
- `src/features/problems/NoteList.tsx:9` reads a plain inherited-key map from
  `notesTypes.ts:3`. Unknown ordinary text displays raw with base class, but
  __proto__/constructor/toString can return object/function instead of a string.
  If a full read slice supports arbitrary stored note_type, recommend own-property
  label lookup (Object.hasOwn or Map) as a bounded consumer-safety correction;
  keep raw text and base class for every unknown value, including inherited names.
  This is an explicit UI correction, not already-approved query parity.
- `NoteEditorPane.tsx:45` keeps unknown type in string editor state and offers only
  existing three options. Do not auto-write solution, add normalization, repair
  stored values or broaden enum input. `NotePanelModal.tsx` draft/title/body flush,
  active selection and stale-load semantics remain protected.
- `src/styles/notes.css` should change only if required for the accepted visible
  disabled-state explanation; preserve existing design tokens/type badge classes.

## 4. Batch Deletion And Protected Tests Are Real Gates

`NoteService.ts:232` getNotesByProblemForDelete delegates to the full list, not a
count or active-row query. `ProblemDetail.tsx:49` uses `.length`, optionally deletes
notes before problem deletion and ignores deleted count. Preserve confirmation
flow, row count, errors and operation order; no product repair is implied.

`NoteService.ts:237` batch loops in full-list order. A NULL row must still acquire
DB, prepare its id equality lookup and bind NULL, then return false without files,
DELETE or increment. Empty string IDs still match/delete internally although the
renderer IPC cannot send them. No early validity filter, `IS NULL`, bulk delete,
new transaction or notification batching is allowed. Earlier autocommits/events
remain when a later item fails.

Truthful list typing exposes the current deleteNote(note.id) type lie. A possible
reviewed internal repair is a private delete helper accepting string|null used
by batch and a public deleteNote(string) wrapper. It must perform lookup BEFORE
any null branch; only after the unchanged missing-row decision can the no-null
match invariant narrow ID for filesystem/native deletion. Public IPC/mutator
contracts stay string. This may require a narrowly typed lookup adapter in
`electron/db/repositories/notes/file-path.ts:6`; do not cast NULL to string or
silently alter A5a-c contracts. Parent/precheck must choose the exact signature
and protected-tail exception before any implementation.

Three OLD protected observers require an explicitly reviewed recognition update
if getNotesByProblem becomes an explicit Drizzle projection:

| File / observer | Current behavior | Risk if unchanged |
| --- | --- | --- |
| `tests/db/notes-file-path-reads.test.ts:214` statementKind | Only SELECT-star where problem_id is list | Loses trace and afterList table-drop injection |
| `tests/db/notes-delete-writes.test.ts:173` kindOf | Any SELECT-star is list; other SELECT is lookup | Misclassifies full list and loses afterList injection |
| `tests/electron/notes-file-path-storage.test.ts:158` statementKind | Only SELECT-star from notes is list | Existing batch traces classify as generic select |

Changing only new observers cannot repair old test classification. Conversely,
changing their expectations, removing stage assertions or turning off afterList
would weaken acceptance. Parent must approve precise new-projection recognition
branches, retaining old recognition and every existing assertion/sentinel/body.
This is a future exception request, NOT an A5f exception already authorized.
Relevant existing table-drop and NULL-list regressions are at
`tests/db/notes-file-path-reads.test.ts:793` /825 and
`tests/db/notes-delete-writes.test.ts:683` /720; app NULL-list groups begin around
`tests/electron/notes-file-path-storage.test.ts:787`.

## 5. Smaller Slice If Full Policy Is Not Yet Ready

Scope selection belongs to parent plus independent precheck after A5e integration.
There are two honest bounds, not an automatic three-query GO:

- Full A5f: all three SELECTs, truthful read/create types, minimal reviewed
  nullable-ID actions/key and unknown-type label safety, internal batch-null
  handling, three precise observer recognition exceptions; budget3 ->0.
- Policy-neutral A5f1: getAllNotes alone, new query/helper and schema-derived
  nullable/string-type read result, preserving exactly its nine-key output. No
  production consumer was found; keep exported function. Leave existing mapper
  and remaining two reads untouched, with a local explicit read projection/map
  for this single slice rather than widening untouched public types. Budget3 ->2;
  no UI, preload, shared schema, batch or old-observer exception. This knowingly
  leaves the old type lies in unconverted paths, not a claim of complete notes.

For full A5f the proposed new query-only module
`electron/db/repositories/notes/reads.ts` should expose signatures along these
lines (names final only after review):

```ts
listNoteRowsByProblem(db: Database.Database, problemId: string): NoteDatabaseRow[]
listAllNoteRows(db: Database.Database): NoteDatabaseRow[]
findNoteRow(db: Database.Database, noteId: string): NoteDatabaseRow | undefined
```

The service still owns getDb, nine-key mapping and file fallback. Query helpers
own no clock/files/events/cache/connection lifecycle. Using nullable detail keeps
one native binding and stored value rather than projecting an added input ID.
Type-only exports must not import schema/native runtime into renderer/preload.

Exact likely production change set if full policy is approved:

- New notes reads.ts, NoteService imports/types/mapper/three queries and only the
  separately accepted batch adapter boundary; file-path.ts if null input support
  is deliberately localized there.
- src/shared/types/notes.ts read/create distinction; preload/index.ts list/get/
  getForDelete annotations; features/problems/notesTypes.ts and problemsApi.ts
  derived read versus created item types.
- NoteList.tsx approved action/key/label correction; a pure notes-ID policy file
  and notes.css only if chosen by review. No broad NotePanel/Editor/ProblemDetail
  redesign or request validation change should be needed.
- Parent-owned budget, runner single focused suite, specs/task and relevant
  notes/db/problems README updates after GO. No schema, migration, time-schema,
  recovery, release, privacy/export, protocol or storage-repair changes.

Do not let this file list grant exceptions: protected changes must be explicitly
enumerated and accepted before implementation. If getAll-only is chosen, reduce
it to that helper/service boundary and new tests, with other files frozen.

## 6. Proof And Caller Acceptance Required

The A5a frozen oracle contains getNotesByProblem and rowToNote but does not expose
getAllNotes or getNoteWithContent. Keep it frozen; add a small independent full-read
oracle with original SQL, nine-key mapper and fallback, without production query
imports. New focused tests may reuse existing harnesses but cannot weaken old
tests. Native RUN_AS_NODE imports query-only reads, never real storage/service.

Required query/native differential matrix:

- Whole ordered nine-key results and ten-column source coverage; empty/missing,
  repeated NULL IDs, empty IDs, orphan parents, unknown types including prototype
  names, deleted_at0/nonzero, all values and exact key order. Multiple equal times
  use old/new same-connection order; no synthesized secondary sort.
- Exact one/zero/one binds, one prepare and correct all/get, no hidden SELECT,
  native parameter errors and injected prepare/step identity. NULL/undefined,
  empty/literal/Unicode/NUL/surrogate IDs; arrays/objects/Symbol/boolean/bigint;
  distinguish SQL construction errors from actual native binding. Do not send
  adversarial paths through real filesystem fixtures.
- Raw epoch0/negative/fractional/out-of-Date/large integer/TEXT/BLOB instants,
  defaultSafeIntegers mode for all selected times including discarded deleted_at,
  number/bigint scalar preservation rather than decoder coercion. These are
  diagnostic storage/binder fixtures, not relaxed supported IPC schemas.
- Readonly/query_only, explicit independent/closed/reinitialized handles,
  transaction visibility/rollback, unchanged schema/ledger/full state and no
  events/writes/clock/UUID. Missing table/column native class/code/stage retained;
  arbitrary damaged-schema diagnostic text need not be identical.
- Lists never read files. Detail absent returns null without FS; nonempty cache
  never reads file; falsy cache reads once after native result. Actual contained
  files verify header fallback, stale header after title rename, missing/unreadable
  file empty fallback, unchanged count/cache, no writes and original assets.

Required caller and protected-tail matrix if full A5f:

- `tests/ipc/notes-create.test.ts` create mapping/extra fields/notification remains;
  add read IPC checks for list/get/getForDelete forwarding exact results/errors,
  no output parse/filter, no read notifications. Existing preload surface/schema
  enforcement and `tests/ipc/timestampSchemas.test.ts` remain intact.
- New read schema accepts NULL ID and arbitrary string type, rejects non-string
  IDs; created schema remains string ID; updated_at integer validation unchanged.
  Full types prove createProblemNote->openNote still receives string.
- NoteList tests retain all rows, distinguish multiple NULL/empty/overlong IDs,
  require no open/delete callback for rejected IDs and no null active highlight;
  permit current accepted whitespace/control IDs. Keys have no duplicate warning;
  document anonymous ordinal identity limits instead of asserting impossible
  stable identity. Unknown/prototype type names display raw with base badge.
- Existing `tests/components/noteTabIsolation.test.tsx`,
  `tests/components/dataRefreshSurfaces.test.tsx:247`, debounce/editor flush and
  `tests/ui/rendererScreenshots.pw.spec.ts:726` native UI scenarios preserve valid
  notes opening/creating/switching/deleting and unsaved drafts. If UI changes,
  real desktop/mobile acceptance must inspect disabled reason, click and keyboard
  behavior, not only a typecheck or snapshot.
- getForDelete still counts every associated row. Batch retains actual NULL
  lookup/table-loss failure, empty-ID deletion, order, count, per-success events,
  earlier autocommits on late failure and caller COMMIT/rollback file divergence.
  Three observer updates get narrow recognition tests, including negative controls
  that distinguish lookup from list and prove afterList still fires.
- Keep A5a-e helpers and all mutation bodies/oracles/old assertions frozen except
  explicitly approved batch type adapter/classifier recognition deltas. Parent
  hashes and AST-subsequence gates must account for each exception, not blanket
  exclude entire files. A new count ratchet is exact, no scanner relaxation.

Independent precheck, installed candidate/type/native evidence where needed,
both type programs, focused/caller lint/tests, parent-serialized native/app/DB/
full/UI/build and ordinary integration gates remain future work. This research
does not approve output policy, protected exceptions, source edits, release or
completion of phase3.
