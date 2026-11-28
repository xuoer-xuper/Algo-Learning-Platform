# A5e Notes Create: Construction Feasibility

2026-11-28. FUTURE / NOT GO. Research only in the C worktree. Reuses the existing
`a5-notes-queries.md` inventory; this report narrows to create's one INSERT, not
the three full reads, nullable-ID/UI policy or storage repair. A5d remains frozen.

## Exact Existing Boundary

`algo-electron/electron/notes/NoteService.ts:82` currently performs:

1. getDb -> nowMillis once -> randomUUID once.
2. Read input.problem_id #1 (directory fallback `_standalone`), note_type once
   (fallback solution), content once (fallback empty string), title #1.
3. createNoteFile(problemId,id,title,content), then countWords(content).
4. Native INSERT prepare, THEN read problem_id #2 (DB fallback null), title #2,
   then native run with `[id, problemId2, title2, filePath, noteType, content,
   wordCount, now, now]`. Original SQL names nine columns in that order.
5. emitDataChanged(['notes']), THEN construct the result: id, problem_id #3,
   title #3, file_path, note_type, content, word_count, created_at, updated_at.

All exceptions propagate; no create catch or compensation. Getter values may
differ across all three reads. Getter failures before files stop earlier; prepare
failure wins over #2 getter failures; a #2 failure occurs after prepare but before
run. A #3 getter can throw AFTER successful DB write and notification. Synchronous
listeners can modify input/state before #3 reads; do not cache/collapse getters
or return a DB row. The service ignores the native result entirely.

`noteStorage.ts:31` resolves userData/notes/problemId/id.md, mkdirs recursively,
then writes `# ${title}\n\n${content}`. A later count/prepare/bind/SQL failure can
leave that file; a UUID collision can overwrite an existing file before UNIQUE
fails. Caller SQL rollback does not restore files. These are existing effects,
not permission to add unsafe real-FS fixtures or change storage behavior.

## Public Candidate And Smallest API

Schema order is id,problem_id,title,file_path,note_type,created_at,updated_at,
content,word_count,deleted_at. Installed Drizzle0.45.4 `buildInsertQuery`
(`sqlite-core/dialect.js:335`) names all ten columns. Ordinary `.values()` binds
`[id,parent,title,path,type,now,now,content,count]`, not the old nine-argument order.
Reordering the values object does not fix this. Do not accept changed native
array/container/error ordering just because valid scalar writes look equivalent.

Propose new `electron/db/repositories/notes/create.ts` with an explicit-handle
**eager preparation factory**, provisionally `prepareCreateNoteInsert(db)`.
It returns a narrow typed synchronous `.run({id,problemId,title,filePath,noteType,
content,wordCount,now}): Database.RunResult` facade over the already prepared
public query, preserving its native result unchanged. Types remain string,
nullable parent, numeric count/time; repository noteType is schema-derived text,
not an import of the service union. Named run keys must always exist, including
diagnostic undefined. Do not expose generic untyped Record-only binding as the
intended helper contract. No lifecycle/cache/files/clock/event/input getters
belong in the factory. Returning a typed facade does not authorize caching it.

The service changes only its INSERT receiver/bind object and one import:

```ts
prepareCreateNoteInsert(db).run({
  id,
  problemId: input.problem_id ?? null,
  title: input.title,
  filePath,
  noteType,
  content,
  wordCount,
  now,
})
```

Call the factory at the old prepare location AFTER file/count, not at function
entry. This preserves preparation before #2 getter evaluation. An ordinary
`insertNoteRow(db,input.problem_id,input.title,...)` evaluates those getters before
entering the helper and is therefore wrong. A values callback could defer reads,
but adds unnecessary control inversion when an eager factory fits directly.

Construct the query using public APIs only:

```ts
const orm = createDrizzleClient(db)
const values = orm.$with('note_create_values').as(
  orm.select({
    id: sql`${sql.placeholder('id')}`.as('id'),
    problemId: sql`${sql.placeholder('problemId')}`.as('problem_id'),
    title: sql`${sql.placeholder('title')}`.as('title'),
    filePath: sql`${sql.placeholder('filePath')}`.as('file_path'),
    noteType: sql`${sql.placeholder('noteType')}`.as('note_type'),
    content: sql`${sql.placeholder('content')}`.as('content'),
    wordCount: sql`${sql.placeholder('wordCount')}`.as('word_count'),
    createdAt: sql`${sql.placeholder('now')}`.as('created_at'),
    updatedAt: sql`${sql.placeholder('now')}`.as('updated_at'),
  }).from(sql`(select 1)`),
)
const prepared = orm.with(values).insert(notes).select(
  orm.select({
    id: values.id,
    problem_id: values.problemId,
    title: values.title,
    file_path: values.filePath,
    note_type: values.noteType,
    created_at: values.createdAt,
    updated_at: values.updatedAt,
    content: values.content,
    word_count: values.wordCount,
    deleted_at: sql`null`,
  }).from(values),
).prepare()
// Return the narrow typed run facade; each invocation returns prepared.run(args).
```

Installed public INSERT SELECT validates exact schema field keys/order, so the
outer projection includes ten fields in that order while the CTE declares the
nine placeholders in original order. SQL-wrapped placeholders bypass Date
encoding and undefined/default substitution. No private API, fabricated table,
raw INSERT, schema reorder, RETURNING, conflict-ignore or extra driver SELECT.

Generated SQL (construction-proven, NOT executed in SQLite):

```sql
with "note_create_values" as (
 select ? as "id", ? as "problem_id", ? as "title", ? as "file_path",
 ? as "note_type", ? as "content", ? as "word_count",
 ? as "created_at", ? as "updated_at" from (select 1)
)
insert into "notes" ("id", "problem_id", "title", "file_path", "note_type",
 "created_at", "updated_at", "content", "word_count", "deleted_at")
select "id", "problem_id", "title", "file_path", "note_type", "created_at",
 "updated_at", "content", "word_count", null from "note_create_values"
```

## Construction Evidence And Limits

One stdin Node22.23.2 script transpiled actual schema.ts in memory (not tsc) and
used installed Drizzle0.45.4 against a prepare/run capture object. No database
was opened, no native statement executed, no files written by the probe, and no
service/storage imported. It exited0 and demonstrated:

- One prepare/run, nine original-order arguments, exact supplied result identity.
- Nine raw reference checks including arrays, explicit undefined and repeated
  now object references; no conversion or omission by builder/session.
- `prepare -> problem getter -> title getter -> run`; prepare sentinel prevents
  both getters, and throwing first getter follows prepare with no later getter/run.
- Ordinary `.values()` construction emits the ten-column SQL but reordered args.

This is NOT static typechecking, real SQLite parsing/execution, error/trigger/
constraint/default compatibility, service acceptance or performance evidence.
The final typed facade still requires both typechecks. Scalar SELECT/CTE affinity,
native array flattening, first-invalid errors, plan and large-payload cost need
actual Electron/better-sqlite3 proof before implementation approval.

## Explicit Compatibility Decision Needed

The old INSERT omits deleted_at; candidate names it as literal NULL. On frozen030
that column is nullable with no default, so this is a candidate equivalence, not
universal DDL parity. Changed omitted defaults, renamed/dropped deleted_at or view
replacements can differ in outcome/preparation failure. Require an explicit
supported-frozen030 boundary like A3b1, preserving existing schema/recovery guards
and documenting that test overrides/live handles do not validate every write.
No historical intermediate-schema support is implied; reassess future migrations.

Successful INSERT IGNORE0 still emits notes and returns the constructed object.
Create is NOT covered by the current content-only exception in data-refresh.md;
parent must separately accept this preservation-only exception before GO. Ignore
result getters/undefined exactly as before. FAIL can retain trigger audit effects;
ABORT rolls back statement effects, neither restores the file. Return-stage getter
failure can leave an autocommit row/event; a real caller transaction can roll it
back and discard scoped topics. Test real COMMIT failure, not callback-only throw.

## Reuse And Future Acceptance

- Freeze the original create function in a small new oracle (A5a oracle does NOT
  include create); reuse its dependency-injection pattern rather than copying
  all NoteService. Add independent old INSERT for native helper comparisons.
- Reuse existing focused notes harness conventions and isolated app runner/root
  lifecycle; append native repository helper cases without importing service
  under RUN_AS_NODE. Old app seed uses storage.createNoteFile plus raw INSERT,
  so it is not already service-create acceptance. No existing protected observer
  accommodation is identified as necessary; new create observations can classify
  its exact CTE separately without broadening old classifiers.
- Differential tests need all getter/read failure stages, file/count/prepare/run
  ordering, one clock/UUID, exact nine bindings and native result identity;
  generated ID/output key order and extra file_path/created_at output stay intact.
- Cover independent/null/defaulted/orphan-parent notes, empty body/header, all
  supported types, raw scalar/container/undefined diagnostics, UNIQUE/NOT NULL,
  BEFORE/AFTER NEW values, IGNORE/FAIL/ABORT, readonly/query_only, closed/alternate
  handles, nested/outer rollback/real deferred-FK COMMIT, listener reentrancy and
  return-getter failure after event. Actual storage fixtures must stay contained.
- Reuse `tests/db/dataChangeNotifications.test.ts` topic-only create coverage,
  A5a/B/C/D focused/native/app regressions, `tests/components/noteTabIsolation.test.tsx`,
  dataRefreshSurfaces and IPC/preload contracts. Add a narrow create handler test
  only for an uncovered mapping/success-notify/error boundary, not output parsing.
- Callers remain `electron/ipc/registerNotesIpc.ts:47` (strict mapped inputs,
  legacy notify callback after service returns), `src/preload/index.ts:345`,
  `src/features/problems/problemsApi.ts:56`, and NotePanelModal's create/load/open
  flow. No public types, routes, nullability/UI, unknown-type display or privacy
  policy changes. Existing unparsed extra result fields are not removed.

Only after A5d integration: parent selects scope, independent precheck and
actual-native feasibility prove/qualify the candidate, then persists GO/contracts.
Future implementation would ratchet exactly4-to3, leaving all full reads separate.
Both typechecks/lint/focused/native/real-app/full/build/CI remain future gates.
This research writes only this report; no production/tests/specs/A5d report/Git/D
changes, no native/full/build/typecheck/install/rebuild, no claim of A5e acceptance.
