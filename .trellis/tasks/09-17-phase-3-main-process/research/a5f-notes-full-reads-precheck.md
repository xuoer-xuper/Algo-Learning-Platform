# A5f Full-Read Independent Precheck - NOT GO

2026-11-28. Research-only trellis-check review in the explicit C worktree. Sole
write is this report; no source/test/spec edit, probe, type/native/global gate,
state-changing Git command or delegation. Read the finalized companion
research/a5f-notes-full-reads.md and independently inspected the affected service,
schema, installed public APIs, callers and protected observers. Do not repeat its
full inventory. Parent reports A5e integrated as f27cb67 after PR38 CI passed;
PR8 integration CI is still pending. No A5f production approval is implied.

## Recommendation And Scope Choice

Prefer one coherent three-read slice after parent explicitly accepts the types,
small consumer corrections, batch boundary and exact protected exceptions below.
Budget3 ->0 would then correspond to actual completed notes query migration.
The all3 scope is not just three mechanical SELECT replacements: honest nullable
IDs expose a live batch contract and renderer action/identity policy.

getAllNotes-only is a valid policy-neutral fallback (3 ->2), but has no production
caller and needs a temporary second mapper while leaving live list/detail type
lies untouched. Prefer it only if parent defers the bounded policies, not merely
to avoid reviewing them. Do not silently expand either choice later.

## Proposed Exact Query And Type Boundary

Package-relative paths below refer to algo-electron/.

```ts
// New electron/db/repositories/notes/reads.ts
type NoteDatabaseRow = Omit<
  typeof notes.$inferSelect,
  'created_at' | 'updated_at' | 'deleted_at'
> & {
  created_at: number
  updated_at: number
  deleted_at: number | null
}
type NoteRead = Omit<NoteDatabaseRow, 'deleted_at'>
listNoteRowsByProblem(db: Database.Database, problemId: string): NoteDatabaseRow[]
listAllNoteRows(db: Database.Database): NoteDatabaseRow[]
findNoteRow(db: Database.Database, noteId: string): NoteDatabaseRow | undefined
```

Use public getTableColumns plus raw SQL overrides for ALL three time columns,
including discarded deleted_at. Select all ten frozen030 fields, preserving the
service's explicit nine-key mapping and property order. Do not leak deleted_at,
use a spread-only public return, decode Dates, substitute IDs or normalize values.
Schema-derived nullable id and string note_type replace the false row/enum casts.
Numbers describe supported storage; diagnostic bigint/TEXT/BLOB scalars still
must pass unchanged at runtime, not be coerced to satisfy these types.

Per-problem list/detail use named raw placeholders with exactly one native
argument; all-list has zero. Keep prepare/all versus prepare/get, existing
updated_at DESC only, all tombstones/orphans/NULL rows and absence behavior.
No LIMIT, secondary order, extra SELECT, clock/event/files/cache/lifecycle work.
Service keeps getDb and exact `if (!note.content)` file fallback after mapping.
Do not repair header/cache divergence or recalculate word_count.

Detail can conservatively return NoteRead|null without claiming supported string
equality matches NULL. The stored id remains the result. A2f's bound-ID projection
would add a SECOND binding here and alter malformed arrays/representation; it is
not a drop-in type proof. `sql<string>` around an input or JS ID replacement is
not permission to fake narrowing. Any strict-string detail alternative needs a
separate proof; it is unnecessary for current callers.

Public split should be deliberate:

- Keep existing service Note/createNote return with string id and input enum.
  NoteListItem/NoteWithContent become read shapes. A5e create body is frozen.
- Keep noteRecordSchema/NoteRecord as existing string-ID create output; add
  noteReadRecordSchema by extending only id to nullable and infer NoteReadRecord.
  Both retain string note_type and existing integer updated_at validation.
- Preload list/get/getForDelete use read output; create remains NoteRecord.
  NoteItem derives read output; add NoteCreatedItem for createProblemNote.
  NotePanelModal already selects with requested noteId, not returned id, so no
  unsafe nullable-detail cast or new editor identity is necessary.
- No new output parser, field removal, request-ID widening, enum widening or
  extra IPC argument. Existing file_path/created_at runtime extras stay intact.

## Consumer Decisions Requiring Parent Acceptance

1. Preserve every NoteList row. Only string IDs with length1..200 can call the
   existing open/delete IPC paths. This is the actual notes schema rule at
   src/shared/types/ipc/notes.ts:30; do NOT use isInternalPageId, whose whitespace/
   control exclusions are stricter. Keep accepted whitespace/control strings
   actionable. A small pure notes-ID predicate plus schema-equivalence tests is
   sufficient; no request schema rewrite is needed.
2. Missing/empty/overlong IDs have no open/delete callback, no active highlight
   when activeNoteId is null, a disabled delete button, and persistent visible
   accessible explanation that the missing/invalid identifier prevents opening
   and deletion, localized consistently with the existing interface.
   Guard the click itself; aria-disabled/hover title alone cannot prevent action.
   Preserve valid-row navigation and existing design tokens/layout. No list
   filtering, fabricated ID, edit recovery, bulk-action change or broad redesign.
3. Separate render identity from action eligibility: tagged JSON keys
   ['note-id', id] for EVERY string ID, including empty/overlong unique values;
   ['anonymous-note', index] only for NULL-ID rows. Tags avoid collisions even
   with literal IDs resembling fallback strings. Multiple NULL rows have no
   stable unique tuple: path/title/type/time are not unique. Document positional
   anonymous identity under reorder rather than claiming stability; do not
   expose rowid or conflate anonymous rows with active selection. The companion
   report's invalid-ID ordinal fallback is safe but unnecessarily remounts
   unique invalid string rows; using their real string identity is smaller.
4. Unknown type stays arbitrary text with the base badge. NoteList.tsx:10 indexes
   a prototype-bearing Record: '__proto__' can yield an object and 'constructor'
   or 'toString' a function instead of its raw label. Recommend a bounded
   own-property lookup correction with tests for these values, ordinary unknown
   text and all three known labels/classes. This is an explicit consumer fix,
   not query-equivalent existing behavior. Editor state stays string and only
   its three current options can write; no automatic type normalization.

ProblemDetail counts getForDelete rows and ignores batch's deleted count. Preserve
that existing flow, including anonymous rows counted but not deletable by id=NULL;
do not turn this migration into deletion-confirmation product repair.

## Required Batch And Lookup Design Exception

Honest nullable list ids make current deleteNote(note.id) invalid statically.
Skipping NULL BEFORE lookup changes an already-tested error path: afterList can
drop notes, and the NULL row must still acquire DB and fail during preparation.
Do not cast NULL to string, filter rows, call Reflect.apply in production, widen
IPC or replace equality with IS NULL.

Recommend a private `deleteStoredNote(noteId: string | null): boolean`, used by
batch and by unchanged-public-signature `deleteNote(noteId: string): boolean`.
It owns the existing deletion body at the same stage: getDb, actual file-path
lookup, original missing-row return, then a null guard if required for typing,
then unchanged files/DELETE/two changes reads/event/return. Under SQL equality a
NULL argument cannot yield a row. Keep the guard AFTER lookup/missing detection;
no second query or changed count/event/exception ordering. Parent must accept
this private extraction and impossible-row diagnostic boundary, not claim the
old mutation body is literally untouched. Other write bodies stay frozen.

The minimum typed lookup amendment is internal
`findNoteFilePath(db, noteId: string | null)`. Merely changing the parameter is
NOT sufficient: installed conditions.d.ts BinaryOperator uses GetColumnData's
'raw' mode, whose string type excludes null (column.d.ts:65). Propose the same
one-bind public named-placeholder equality already used by note DELETE:
`eq(notes.id, sql.placeholder('noteId'))` with prepared `.get({ noteId })`.
No extra argument or Date encoder. This changes a protected A5a helper and needs
explicit parent approval plus existing/new actual-native binder/error reproof;
do not present it as a type-only change. deleteNoteRow and storage signatures
can remain string because only found/non-null IDs reach them.

One additional exact TYPE-ONLY protected test touch follows this widening:
tests/db/notes-file-path-reads.test.ts:57 declares Scenario.lookup as
typeof findNoteFilePath, while :195 assigns the frozen string-only oracle.
Strict function variance will reject that assignment after widening. Keep the
old oracle unchanged and use typeof oldFindNoteFilePath for that harness slot;
existing direct calls are string and existing NULL diagnostics use Reflect.
Request this precise annotation exception separately; never rewrite the oracle
or loosen assertions to hide it. This is static inference, not a run tsc result.

## Exact Old Observer Adjustments - Requests, Not Authorization

Only changing new tests would leave three old observers blind to explicit
projection. Parent must record exact replacements after capturing the chosen
builder SQL, retaining every old branch/body/assertion/error injection:

| File and location | Proposed bounded recognition addition |
| --- | --- |
| tests/db/notes-file-path-reads.test.ts:217, statementKind | Keep old SELECT-star problem list; recognize the exact ten-column notes projection with problem_id equality and DESC order as list |
| tests/db/notes-delete-writes.test.ts:177, kindOf | Keep old star branch; recognize the same new full-list query before fallback lookup |
| tests/electron/notes-file-path-storage.test.ts:161, statementKind | Keep old SELECT-star notes branch; recognize the new full per-problem list as list, not generic select |

Normalize only existing quote/whitespace spelling and accepted notes qualifiers.
Match the full frozen projection and predicate/order, not any SELECT mentioning
notes or problem_id. Wrong projections, path-only lookups and detail/other queries
must not be swallowed by the new list branch. Capture generated SQL before parent
approves exact code; no query was constructed in this precheck.

Keep afterList immediately after native all and before service mapping/next
lookup. A5a's table-loss trace remains exactly
['db','prepare:list','all:list:["parent"]','db','prepare:lookup']; A5c's equivalent
still has all:list and the same following lookup. Preserve actual NULL/empty-ID
batch binding order, count, partial autocommit and file/event assertions. Add
observer positive/negative controls; do not change expected traces or exempt
entire files. Protected accounting must retain old hashes with explicit helper,
type-slot and classifier edits; app/native AST accounting needs equally precise
exceptions. A5e's no-new-observer-exception statement remains true for A5e only.

## Gates Before Implementation And Acceptance

- Parent first selects scope and persists read/create, action/key/type-fallback,
  private batch/lookup and exact protected-test exceptions after A5e integration.
  This report recommends those decisions; it does not grant them.
- Public candidate strict types and actual-native differential proof: ten-column
  source/nine-key outputs, one/zero/one raw bindings, all timestamp decoders
  bypassed including discarded deleted_at, null/tombstone/unknown rows, raw
  scalar and safeIntegers modes, arrays/undefined/invalids, tie order, native
  errors and explicit handle/transaction lifecycle. Reprove amended path lookup
  against its frozen old oracle. No service/storage under RUN_AS_NODE.
- New independent full-read oracle; focused service read/get/prepare errors,
  missing/nonempty/falsy cache decisions and unchanged full results/order. Real
  app uses contained files to test header/stale-header/empty/missing/unreadable
  fallback, no cache/count/file mutations, and existing deletion/NULL batch.
- Read/create schema and IPC/preload forwarding tests; UI tests for all rows,
  exact ID predicate, no invalid callbacks/null active state, collision-free
  keys and string-ID reorder, anonymous-position limits, prototype type labels.
  Keep create IPC12, note tabs/drafts/flush, display/governance and refresh tests.
  Verify disabled reason and valid interactions in native desktop/narrow layout.
- After freeze: independent review, both full typechecks/lint, focused/callers,
  exact protected hashes/ASTs, parent-serial native/app/DB/full/UI/build and normal
  integration gates. No native evidence or A5f pass count exists yet.

## Verification Status

Findings fixed: none; research-only assignment.
Findings not fixed: the named design/type/protected-policy prerequisites above
require explicit parent acceptance and future proof. No source edits authorized.
Lint/TypeCheck/Tests: not run for A5f. A5e results are separate historical evidence.
