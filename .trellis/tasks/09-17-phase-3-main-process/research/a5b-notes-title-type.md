# Research: A5b Notes Title and Type Writes

- Query: Identify the smallest behavior-preserving Drizzle conversion of only updateNoteTitle and updateNoteType after A5a.
- Scope: Internal source/specs, installed dependencies, and an isolated in-memory feasibility probe.
- Date: 2026-11-28
- Status: FUTURE / NOT APPROVED. Research only; not implementation authorization or evidence of A5a integration.
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform only. Source paths below are repository-relative.

## Findings

### Bounded Recommendation

Convert only the two native UPDATE expressions at
`algo-electron/electron/notes/NoteService.ts:154` and
`algo-electron/electron/notes/NoteService.ts:211`. Keep getDb, nowMillis, event
checks and return predicates in their original service positions. Use a small
explicit-handle helper module, provisionally
`algo-electron/electron/db/repositories/notes/title-type.ts`, with two explicit
functions returning the native Database.RunResult. Avoid an arbitrary-column API.
Parent must approve extending the explicit-handle repository exception beyond A5a.

Exclude create/content/delete/list/count conversion, storage repair, schema or
IPC changes, and directory relocation. The native-SQL count at
`algo-electron/tests/architecture/check-architecture.mjs:318` is eight; A5b would
ratchet exactly eight to six only after actual builder conversion. Moving native
SQL strings or weakening the scanner is not conversion.

### Files Found and Code Patterns

| File/reference | Purpose |
| --- | --- |
| `algo-electron/electron/notes/NoteService.ts:154` | Title: getDb, clock, prepare, run(title,now,id), conditional event, boolean. |
| `algo-electron/electron/notes/NoteService.ts:211` | Type: identical orchestration with note_type. |
| `algo-electron/electron/db/repositories/notes/file-path.ts:6` | Explicit-handle query helper; no lifecycle acquisition or storage. |
| `algo-electron/electron/db/repositories/submission/firstAc.ts:28` | Existing UPDATE with raw SQL-wrapped named timestamp placeholders. |
| `algo-electron/electron/db/repositories/submission/firstAc.ts:82` | All dynamic SET values are wrapped placeholders; prepare before run arguments. |
| `algo-electron/src/main/db/client.ts:10` | Factory wraps only the supplied connection. |
| `algo-electron/src/main/db/schema.ts:220` | Ten physical notes columns, nullable TEXT id, timestamp_ms updated_at. |
| `algo-electron/drizzle/0000_baseline.sql:142` | Frozen notes CREATE TABLE, used in feasibility probe and not changed. |
| `algo-electron/electron/shared/dataEvents.ts:8` | Synchronous events or existing scope buffering. |
| `algo-electron/electron/shared/dataEvents.ts:17` | Subscriber errors guarded/logged without failing committed writes. |
| `algo-electron/electron/shared/dataEvents.ts:33` | Scope wraps the actual transaction invocation, including COMMIT. |
| `algo-electron/electron/db/repositories/README.md` | Current explicit-handle exception covers file-path reads only. |
| `algo-electron/tests/db/notes-file-path-reads.test.ts` | Service seams, fixture/oracle/trigger/transaction test patterns. |
| `algo-electron/tests/db/notes-file-path-oracle.ts` | Independent frozen A5a oracle; do not make it import the new implementation. |
| `algo-electron/tests/db/dataChangeNotifications.test.ts:191` | Existing title success notification; missing title at line202. |
| `algo-electron/tests/db/repositories.test.ts` | Native query-only helper coverage runner. |
| `algo-electron/tests/electron/notes-file-path-storage.test.ts:72` | Existing isolated real-app notes harness, suitable for bounded extension. |
| `algo-electron/tests/verify.mjs:112` | Notes-specific runner owns temp-root cleanup after child exit. |
| `algo-electron/vitest.config.ts:29` | Real-app notes test excluded from Vitest. |

### Observable Contract

- getDb first, nowMillis exactly once, one native prepare then run. Each UPDATE
  has exactly two SET targets and three bindings: [title or type, now, noteId].
  No SELECT, UUID, filesystem call, catch, coercion or new transaction.
- Keep a real UPDATE for unchanged values and missing rows. A matched same-value
  UPDATE counts as one change. Missing-row writes can still fail on readonly,
  query_only or damaged schema; do not prelookup or short-circuit.
- Bound id equality includes tombstones and literal IDs. Empty, Unicode and
  SQL-metacharacter IDs stay literal. Diagnostic runtime NULL remains bound
  equality, not IS NULL or an early invalid-ID return.
- Preserve exactly title/updated_at or note_type/updated_at. UPDATE OF triggers
  observe the SET list even for unchanged values. No row-spread or unrelated SETs.
- Both mutations update DB metadata only. They never rename/rewrite markdown or
  assets. Do not infer a filesystem write from the old IPC comment about titles.
- Emit only when changes > 0, then return the original changes > 0 predicate.
  Missing rows and successful diagnostic IGNORE return false/no event. Unlike
  content/create compatibility exceptions, successful run alone is insufficient.
- Errors propagate unchanged. Diagnostic FAIL can preserve earlier trigger
  effects with no event; ABORT rolls statement effects back. No compensating
  transaction or catch. Preserve both service reads of result.changes.
- Caller owns transaction/savepoint/notification scope. Wrap its actual invocation
  with withDataChangeTransaction; failure at real COMMIT discards topics. Earlier
  autocommit success/events must survive a later failure. No artificial batch scope.
- Payload stays only {tables:['notes']}, not titles/types/IDs/paths. Retain listener
  isolation and synchronous reentrant visibility.

### Schema and Caller Boundaries

Notes id remains nullable TEXT via table-level PK. Title and note_type are NOT
NULL TEXT; type default is solution, without CHECK. Updated_at is NOT NULL INTEGER
with timestamp_ms encoding. No notes column has an onUpdate function. Both title
and note_type precede updated_at in schema order, preserving bind order.

Service NoteType remains solution/review/summary (`NoteService.ts:18`). A physical
helper can honestly accept string or typeof notes.$inferSelect['note_type'] without
importing the service and creating a cycle. Do not widen the public union or IPC.
Strict-object schemas at `algo-electron/src/shared/types/ipc/notes.ts:48` and
`algo-electron/src/shared/types/ipc/notes.ts:75` retain length1-200 title/identifier
bounds and the closed type enum; do not add trim/control-character policy.

Handlers at `algo-electron/electron/ipc/registerNotesIpc.ts:58` and
`algo-electron/electron/ipc/registerNotesIpc.ts:70` return the service directly;
no extra problems compatibility callback. Preload boolean promises remain at
`algo-electron/src/preload/index.ts:347` and
`algo-electron/src/preload/index.ts:353`. Renderer adapters remain at
`algo-electron/src/features/problems/problemsApi.ts:74` and
`algo-electron/src/features/problems/problemsApi.ts:81`.
Title trim/default/save/catch at
`algo-electron/src/features/problems/useDebouncedNoteTitleSave.ts:36` ignores false;
type save/reload at `algo-electron/src/features/problems/NotePanelModal.tsx:93` also
awaits without branching on false. Preserve these existing behaviors, not fix them.

### Proposed Builder and Installed-Library Evidence

Illustrative title helper (names pending approval); type helper explicitly changes
note_type/updated_at instead. No clock/event/filesystem/lifecycle work in helpers.

```ts
export function updateNoteTitleRow(
  db: Database.Database,
  noteId: string,
  title: string,
  now: number,
): Database.RunResult {
  return createDrizzleClient(db)
    .update(notes)
    .set({
      title: sql`${sql.placeholder('title')}`,
      updated_at: sql`${sql.placeholder('now')}`,
    })
    .where(eq(notes.id, sql.placeholder('noteId')))
    .prepare()
    .run({ title, now, noteId })
}
```

Use SQL-wrapped named placeholders for BOTH SET values, not only the timestamp.
The current factory/schema and public builder suffice; no private dialect hook,
partial fake schema or native UPDATE string is needed.

| Installed source (under algo-electron/node_modules/) | Verified behavior |
| --- | --- |
| `drizzle-orm/utils.js:83` | mapUpdateSet drops undefined values; non-SQL values become column Params. Direct title/type undefined can silently remove the SET target. |
| `drizzle-orm/sqlite-core/dialect.js:65` | UPDATE uses schema column order and includes onUpdate fields; current notes has none. |
| `drizzle-orm/sqlite-core/columns/integer.js:71` | timestamp encoder calls getTime; bare placeholder uses that encoder at run. |
| `drizzle-orm/sql/sql.js:361` | Raw placeholder returns the supplied value unchanged if the key exists, including undefined; Param placeholder encodes. |
| `drizzle-orm/sqlite-core/query-builders/update.js:144` | Generated query preparation precedes execution. |
| `drizzle-orm/better-sqlite3/session.js:22` | Supplied native handle prepares the statement. |
| `drizzle-orm/better-sqlite3/session.js:69` | Fill placeholders, spread positional args into stmt.run, return native RunResult unchanged. |
| `better-sqlite3/src/util/data.cpp:30` | Native undefined and null both bind SQL NULL, unlike node:sqlite. |
| `better-sqlite3/src/util/binder.cpp:160` | Native argument binding supports array/plain-object forms; do not infer invalid-object errors from a different driver. |

Do not convert diagnostic raw times through Date, normalize them or cast a Date
as number: fractions/extreme values can change. Raw placeholders preserve the
existing number API and native bind stage. UPDATE has no INSERT omitted-default
expansion issue. Still do not promise universal damaged-DDL/view parity: preserve
native error class/code/stage and injected identity; qualified/quoted missing-column
wording may differ. Do not rewrite errors or weaken physical schema validation.

### Feasibility Probe Actually Run

A stdin-only probe used Node22.23.2, installed Drizzle0.45.4, TypeScript6.0.3 to
transpile the actual schema in memory, and node:sqlite DatabaseSync(':memory:')
behind a minimal prepare/run adapter. It extracted frozen baseline notes DDL.
No user DB, filesystem fixture, source edit, Electron launch, ABI rebuild, global
test or build was used; better-sqlite3 addon was not instantiated.

Generated SQL, each with [value, now, noteId]:

```sql
update "notes" set "title" = ?, "updated_at" = ? where "notes"."id" = ?
update "notes" set "note_type" = ?, "updated_at" = ? where "notes"."id" = ?
```

All44 paired original/builder cases passed comparisons of full rows/storage types,
run results/booleans, errors, trigger audit effects and prepare/run traces. Cases:
ordinary/same-value/missing/tombstone; empty/literal/Unicode/NULL IDs; empty values;
epoch0/fraction/outside-Date-range/TEXT time; NULL/undefined/object/symbol values;
IGNORE/FAIL/ABORT; query-only missing-row execution. Separate injected prepare/run
sentinels retained object identity. Same-value matched changes1; IGNORE kept its
prior audit but returnedfalse; FAIL kept audit, ABORT rolled audit back.

Two deliberate counterexamples were confirmed:

1. Direct .set({title:undefined, updated_at:rawValue}) generates only updated_at,
   losing the original title assignment and UPDATE OF trigger contract.
2. Bare updated_at:sql.placeholder('now') with numeric2.25 prepares then throws
   TypeError 'value.getTime is not a function' before native run.

CRITICAL DRIVER LIMIT: the44-case probe is feasibility, not better-sqlite3/Electron
acceptance. node:sqlite rejects undefined binding; better-sqlite3 source binds it
NULL. Under the actual driver, matched undefined title/type should hit NOT NULL,
whereas missing rows can returnfalse. Object/array binding behavior also differs.
Native differential tests must derive expected results from the original SQL, not
copy node:sqlite errors. No native error wording or final helper typecheck is proven.

### Future Validation and Ownership Proposal

Parent must first accept A5a integration, review this slice, approve explicit-handle
write helpers/raw values, and persist its design/executable contract. This research
does not start A5b. Respect total concurrency cap3, including parent and reviewers.

- Implementer: only two service substitutions plus helper; freeze a separate small
  notes-title-type oracle and focused suite. Reuse A5a patterns, not copy the full
  storage harness or change its independent oracle.
- Parent: bounded test registration, README/spec/context updates and exact8-to6
  ratchet; serial native/full/build gates after code freeze.
- Independent reviewer: original-vs-builder contract, evidence and scope; no broad
  additional notes conversion during review.

Required coverage before acceptance:

| Area | Required evidence |
| --- | --- |
| Fixed statement | One prepare/run; exactly two SET targets/three binds in order; no SELECT, FS, UUID, hidden connection or cache. |
| Rows/results | Full raw rows unchanged except targeted fields; all3 supported types, same-value, missing, tombstones, empty/literal/Unicode IDs; diagnostic NULL/undefined with unchanged equality. |
| Raw values | Epoch0 and ordinary ms; diagnostic fractions/extreme/TEXT times and native invalid binding behavior; no Date conversion. |
| Errors/triggers | getDb/clock/prepare/run failure order and sentinels; readonly/query_only including missing row; target-specific audit, IGNORE/FAIL/ABORT, missing table/column diagnostics. |
| Lifecycle | Explicit independent/closed handle, close/reinit; no cached adapter; service still uses lifecycle-owned handle. |
| Events/transactions | Exact notes-only payload, no-op/throw suppression, listener failure/reentrancy; outer rollback, caught inner savepoint, real deferred-FK COMMIT failure, earlier partial-autocommit success. |
| Native app | Real service title/type changes under isolated existing harness; markdown/assets bytes untouched; use safe contained synthetic IDs. |
| Caller regressions | IPC/schema/API consumer tests, note title debounce/draft/tab isolation and refresh surfaces remain green. |

Append helper-only native checks to existing tests/db/repositories.test.ts without
importing the real NoteService under RUN_AS_NODE. Extend the existing real-app notes
suite for no-file-write evidence rather than creating another runner. Its ESM split
chunks defer native/log imports; the parent owns isolated temp-root deletion only
after child exit. Do not reintroduce single-file import hoisting, live Chromium-root
removal, userData fallback, unsafe real-FS IDs, or ABI rebuild contention. Per-case
Vitest filesystem usage requires overriding getPath, not merely setPath.

Register the future focused suite in test:db/test:all. Preserve architecture,
security, both typechecks, lint, independent review, native DB/app, full tests,
build and CI requirements. A5b test counts and acceptance do not exist yet.

### Related Specifications

Read .trellis/workflow.md plus these source-of-truth documents:

- `.trellis/spec/project/drizzle-notes-file-path.md`: explicit-handle reads, unchanged
  orchestration, damaged-schema qualification, isolated native-app runner lifecycle.
- `.trellis/spec/project/drizzle-submission-writes.md`: raw named-placeholder UPDATE,
  native ordering/effects and existing caller notification semantics.
- `.trellis/spec/project/drizzle-adoption.md`: frozen physical schema, connection
  ownership and incremental conversion rather than directory relocation.
- `.trellis/spec/project/data-refresh.md`: conditional events and real COMMIT scopes.
- `.trellis/spec/project/domain-rules.md`: main-only DB, guarded IPC, local-first data.
- `.trellis/spec/project/migration-status.md`: current paths and later relocation.
- `.trellis/spec/backend/database.md`: general ORM guidance; do not apply its generic
  soft-delete filtering/transaction examples in place of these preservation contracts.
- `.trellis/spec/shared/code-quality.md`, shared/backend/project/guides indexes and
  `.trellis/spec/guides/pre-implementation-checklist.md`: type safety, reuse and scope.

### External References and Versions

Installed package.json pins drizzle-orm0.45.4, drizzle-kit0.31.11,
better-sqlite3 13.0.3, Electron43.4.0, TypeScript6.0.3. Probe Node22.23.2.
Installed dependency source, not latest online examples, establishes the precise
placeholder/binding claims above. Useful official references (not fetched here):

- https://orm.drizzle.team/docs/update
- https://orm.drizzle.team/docs/perf-queries
- https://sqlite.org/lang_conflict.html
- https://sqlite.org/c3ref/changes.html

## Caveats / Not Found

- FUTURE / NOT APPROVED: parent owns acceptance/design and may choose different
  helper names or test ownership. No code, spec, task metadata or Git changes here.
- Probe proves only current builder feasibility with an alternate in-memory driver,
  not actual better-sqlite3 diagnostics, Electron import safety or release quality.
- Direct malformed/runtime inputs are preservation diagnostics, not supported new
  IPC forms. Native undefined/array/object behavior needs independent oracle tests.
- No user database, original D worktree, historical migrations, frozen baseline or
  dependency installation was modified. No implement/check context manifest read.
- No automatic markdown/title synchronization, wider enum fix, nullable list fix,
  metadata/file transaction repair or renderer false-result handling belongs here.
- A5a review/full/build/integration status must come from parent evidence; this
  artifact deliberately makes no merge, completion or publication claim.
