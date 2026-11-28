# Drizzle Notes Creation

## 1. Scope / Trigger

A5e converts only createNote's INSERT after integrated4fe73b3. Parent accepts
actual-native197 feasibility checks and independent design review, including
the explicit schema and cost qualifications below. Three full reads, public
types/IPC/UI, storage repair, schema/history and layout remain separate.

## 2. Signatures

```ts
// electron/db/repositories/notes/create.ts
type CreateNoteValues = {
  id: string
  problemId: string | null
  title: string
  filePath: string
  noteType: (typeof notes.$inferSelect)['note_type']
  content: string
  wordCount: number
  now: number
}
prepareCreateNoteInsert(db: Database.Database): {
  run(values: CreateNoteValues): Database.RunResult
}
// Existing service input/output stay unchanged.
createNote(input: CreateNoteInput): Note
```

The factory eagerly prepares once on the supplied handle. Its narrow typed run
facade forwards the complete payload and returns the native result unchanged.
No lifecycle, cache, clock, input getter, filesystem, event or transaction owner
is introduced. Diagnostic malformed helper values do not widen supported IPC.

## 3. Contracts

- Use public note_create_values CTE with nine SQL-wrapped named placeholders in
  id, problemId, title, filePath, noteType, content, wordCount, now, now order.
  SELECT from constant `(select 1)`. Public with/insert/select projects all ten
  schema fields in schema order; deleted_at is `sql` literal NULL aliased with
  `.as('deleted_at')`. The alias is required by installed strict INSERT SELECT
  types; an unaliased construction-only capture was not typecheck evidence.
- Keep one native prepare/run and exactly nine raw bindings, including repeated
  same-reference now and explicitly present undefined keys. Plain values()
  reorders native arguments and changes actual array-container writes. No Date
  encoding, default substitution, coercion, private dialect, fabricated table,
  raw INSERT, schema reorder, RETURNING, conflict policy or extra driver query.
- Preserve service order: getDb, clock once, UUID once, parent#1, type, content,
  title#1, createNoteFile, countWords, prepare, parent#2, title#2, run, notes
  event, parent#3, title#3, constructed return. Factory receiver stays at the
  old prepare expression, after files/count and before evaluating run payload.
  Do not cache/destructure repeated getters, return a selected row or catch.
- Directory parent defaults to _standalone; DB and output parents default to
  null independently. Listener mutations can change third getter values.
  Prepare failure prevents second reads; third-read failure follows write/event.
  Keep extra file_path/created_at result fields and existing property order.
- Create-specific preservation exception: successful native run always emits
  notes and constructs the result, even diagnostic IGNORE0. Ignore result and
  all its getters entirely. Caller notification scope surrounds actual COMMIT;
  rollback/failed COMMIT discards scoped topics, not file effects. FAIL versus
  ABORT audit effects, guarded/reentrant listeners and autocommit remain native.
- File creation precedes SQL and writes `# title\n\ncontent`. Later failure or
  SQL rollback may leave that file; collision may overwrite bytes before UNIQUE
  rejects the row. Do not add compensation or describe this as atomic storage.
- Supported physical schema is frozen030: deleted_at is nullable with no
  default. Old SQL omits it; new SQL names literal NULL. A changed DEFAULT73
  demonstrably diverges (old73/newNULL). Changed omitted columns/views and
  arbitrary damaged DDL are not universally equivalent. Keep startup/recovery
  guards; live handles/test overrides are not per-write validation. Reassess
  future schema changes. Native errors retain class/code/stage/identity, not
  necessarily quoted-identifier wording on damaged schemas.
- Cost is accepted, not assumed equal: measured no-trigger plans have a constant
  coroutine/no ephemeral source; INSERT SELECT with diagnostic triggers uses a
  ten-column OpenEphemeral spool although EQP omits a MATERIALIZE label. Full
  small-input construction measured about0.13-0.15ms. With AFTER trigger, sample
  4MiB ASCII old/new2.32/5.34ms and4M CJK code units19.15/30.35ms; without trigger
  2.27/2.43ms and18.15/18.52ms. These are bounded sequential samples, not latency,
  peak-memory or future-plan guarantees. Frozen030 has no notes trigger. A
  nine-scalar-subquery INSERT alternative is unproven and not approved here.
- IPC mapping/legacy callback stays unchanged: callback follows service return;
  service failure skips it, while callback failure can follow committed effects.
  No output parser or removal of existing extra fields. Reuse unchanged native
  app runner and safe owned paths; no old observer/test/assertion relaxation.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Clock/UUID/first input getter fails | Original error/order; no later effect |
| File/count fails | Propagate; any already written bytes remain |
| Prepare fails / second getter fails | Prepare before second getters / no run |
| Successful INSERT or IGNORE0 | Event then third getters/result; ignore native result |
| Third getter fails | Propagate after write/event; retain autocommit effects |
| Duplicate/NOT NULL/trigger FAIL or ABORT | Native priority/state/audit; no success event |
| Raw NULL/undefined/container/instant | Original nine-argument native behavior |
| Readonly/query_only/closed/alternate handle | Actual native error/lifecycle; no hidden connection |
| Nested rollback/actual deferred-FK COMMIT failure | DB/topics roll back, files do not |
| Altered omitted default/column/view | Outside universal parity; guards unchanged |

## 5. Good / Base / Bad Cases

- Good: explicit eager factory preserves query/input sequencing and raw binds.
- Base: nine bindings and supported ten-column INSERT; existing file/DB partial
  effects remain visible, not repaired or hidden by a broad success claim.
- Bad: argument-taking helper evaluates input before preparation, reads changes,
  claims arbitrary DDL parity or uses mock files as real storage acceptance.

## 6. Tests Required

Tiny independent old INSERT and frozen create-only service oracle; reuse old
countWords oracle, unchanged notes regressions and caller tests. Cover full rows,
storage types, native result/error identity, all getter stages/order, output keys,
default/type/body variants, collision, native arrays/first-invalid negative
control, combined constraints, NEW values/deleted_at, IGNORE/FAIL/ABORT, readonly,
connection lifecycle, savepoint and actual COMMIT. Real app covers contained
Markdown/header/empty body/collision/late failure/rollback plus untouched assets.
Never send adversarial path components to real filesystem fixtures.

Append native/app cases without changing previous statements; helper only under
RUN_AS_NODE. One focused DB registration, exact4-to3 ratchet, no scanner changes.
Independent review, both full typechecks/lint/focused callers, serial DB/native/
app/full/build, protected hashes and normal hooks/CI are implementation gates;
candidate197 is feasibility only. No release or installer acceptance implied.

## 7. Wrong vs Correct

```ts
// Wrong: second input getters execute before SQL preparation.
insertNoteRow(db, input.problem_id, input.title)
// Correct: factory receiver prepares before evaluating the run payload.
prepareCreateNoteInsert(db).run({
  id, problemId: input.problem_id ?? null, title: input.title,
  filePath, noteType, content, wordCount, now,
})
```
