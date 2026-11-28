# A5e Create-Only Preliminary Design Review

2026-11-28 (Asia/Shanghai). FUTURE / NOT GO. Sole reviewer write is this file
in the explicit C worktree. A5d sources/reports/specs remain untouched. Read
research/a5e-notes-create-feasibility.md, current create/storage/count/event and
caller paths, frozen030 notes schema and installed Drizzle INSERT/session code.
No native execution, typecheck, global/build gate or Git operation was performed.

## Recommendation

Proceed to actual-native feasibility for the proposed public single-row CTE +
INSERT SELECT, exposed through an eager preparation factory. Do NOT authorize
production implementation yet. No source-level blocker was found in that shape,
but construction capture cannot establish SQLite execution, trigger/default/
constraint parity or cost. A5d's successful UPDATE proof does not prove INSERT.

The minimum future boundary is one notes create INSERT, budget4 -> 3, leaving
all three full-row reads, public types/IPC/UI, schema/history, storage repairs
and layout unchanged. Parent must first integrate A5d, accept actual-native
evidence and persist the contracts/qualifications below before GO.

## Factory And Evaluation Order

Recommend `electron/db/repositories/notes/create.ts` with
`prepareCreateNoteInsert(db: Database.Database)` returning only a typed
synchronous `run(values): Database.RunResult`. Its required payload fields are
id:string, problemId:string|null, title:string, filePath:string,
noteType:(typeof notes.$inferSelect)['note_type'], content:string,
wordCount:number and now:number. The helper must not import service types.

Factory construction must execute native prepare immediately, once. The facade
only forwards an ordinary payload object to the already prepared query and
returns its native result untouched; do not implement lazy prepare, read the
result, retain a module cache or expose a generic Record as the intended API.
This preserves the old expression's order:

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

Place it exactly at the current prepare/run site AFTER file creation and count.
A plain helper call taking `input.problem_id`/`input.title` as arguments is wrong:
JavaScript evaluates those getters before entering the helper/preparing SQL.
The eager factory receiver instead prepares before evaluating the object.

Preserve getDb -> clock once -> UUID once -> problem_id#1 -> note_type once ->
content once -> title#1 -> createNoteFile -> countWords -> prepare -> problem_id#2
-> title#2 -> run -> notes event -> problem_id#3 -> title#3 -> returned object.
Keep `_standalone` directory fallback separate from null DB/output fallback.
Getter values can differ; #3 errors occur after write/event and synchronous
listeners can mutate the input before #3. No caching, destructuring, reread from
DB, RETURNING or result-based success. Service exceptions continue to propagate.

## Builder And Compatibility Decisions

Installed `query-builders/insert.js` checks INSERT SELECT keys/order against all
schema columns; dialect.js emits all ten non-disabled columns. SELECT field
insertion order permits the proposed CTE's nine placeholders in original order:
[id, problemId, title, filePath, noteType, content, wordCount, now, now]. The outer
projection follows schema order, with deleted_at literal NULL. Session prepare
is eager; run fills placeholders and returns native stmt.run unchanged.

- Use SQL-wrapped placeholders, all required keys, no Date/default encoding or
  undefined omission. Both time arguments retain the same original raw value/
  reference. Duplicate placeholder names must still produce nine native args.
- Normal values() reorders arguments to schema order; do not substitute it or
  weaken binding traces. No fabricated partial table, schema reorder, private
  hooks, disguised raw INSERT, conflict-ignore, extra driver SELECT or cache.
- Old SQL omits deleted_at; new SQL names it as NULL. On frozen030 the column
  is nullable without a default. Parent must explicitly accept that limited
  physical-schema boundary, as for A3b1. A changed default, dropped/renamed
  omitted column or view can differ; exact arbitrary damaged-DDL parity is NOT
  available. Existing live handles/test overrides are not per-write validation.
  Keep startup/recovery guards unchanged and reassess with future migrations.
- Successful diagnostic INSERT IGNORE0 still emits notes and returns the
  constructed object. Create requires its OWN preservation-only data-refresh
  exception; A5d's content exception does not authorize it. Ignore even throwing
  result getters/undefined seams. No new general no-op notification policy.
- File creation writes `# title\n\ncontent` before SQL. Count/getter/SQL failures
  may retain files; a UUID collision may overwrite a file before UNIQUE fails.
  SQL rollback cannot restore files. Empty-content detail later rereads the
  header; that behavior and the false-save UI are separate work, not fixes here.

## Required Actual Proof Before GO

| Area | Minimum differential evidence against independent old SQL/service |
| --- | --- |
| Preparation/binding | Eager one prepare, one run, exact nine raw args/references including repeated now; prepare error before #2 getters; getter error after prepare before run |
| Native input/defaults | Raw text/numeric/BLOB/bigint/NULL/undefined/container values, malformed first-error cases, accepted baseline defaults and deleted_at=NULL; ordinary-builder negative control |
| Constraints/triggers | Duplicate and nullable IDs; combined NOT NULL/UNIQUE priority; BEFORE/AFTER NEW values including deleted_at; IGNORE/FAIL/ABORT audit/state/results |
| Failures/lifecycle | Native prepare/run identity and stage, query_only/actual readonly, closed and alternate handles; no hidden connection/cache |
| Service stages | All three parent/title reads, getter/clock/UUID/file/count/prepare/run/return failures, exact output keys/values, one clock/UUID, event before #3 getters |
| Transactions/events | Commit, rollback, caught inner savepoint and real deferred-FK COMMIT failure; return-getter failure after event; guarded/reentrant listeners; no filesystem rollback |
| Actual storage | Safe contained standalone/problem paths, initial header/empty body, orphan parent, collision overwrite followed by SQL failure, retained bytes/audit on FAIL, untouched unrelated files/assets |
| Plan/cost | Actual INSERT plan with/without triggers and large ASCII/CJK content; no inference from A5d UPDATE's non-materialization or microbenchmark |

Use frozen030 fixtures with both indexes and full-state/effect comparisons.
SQLite INSERT SELECT may choose a different intermediate-row path, especially
with triggers; inspect it rather than promising a plan. String limits count JS
code units, not UTF-8 bytes. Native evidence must use actual Electron/better-
sqlite3; the installed focused-test compatibility driver is not its substitute.
Keep malformed path/ID/getter diagnostics intercepted or query-only; never send
adversarial path components to real filesystem fixtures.

## Reuse And Caller Boundary

Add only a tiny independent old INSERT oracle and a frozen create-only service
oracle; A5a's oracle does not contain create. Reuse existing harness/lifecycle,
prior notes suites and notification/tab/refresh/schema regressions. Existing app
seed calls storage plus raw INSERT and is not service-create acceptance. Native
repository tests import the helper only, never real service under RUN_AS_NODE.
No old observer modification is currently needed; new create instrumentation
can recognize its own exact carrier without broadening the A5d classifiers.

registerNotesIpc maps strict request fields to the service, then invokes legacy
notifyProblemsUpdated only after service return; a service #3 failure skips it,
while a throwing callback can fail IPC after the notes event/write. Preload and
problemsApi forward the constructed object without output parsing. NotePanelModal
awaits create, refetches, then opens note.id. Do not remove extra file_path/
created_at fields, widen IDs/types, repair UI or change the legacy callback.
A narrowly scoped handler test can pin success/throw ordering if needed; no
handler rewrite is warranted by this query conversion.

## Verification And Handoff

Lint/typecheck/native/application tests were NOT run in this research-only turn.
Installed source supports candidate construction and receiver/getter ordering;
the researcher's capture probe remains construction-only, not static/native
certification. The matrix and explicit schema/event decisions remain open gates.
After approved feasibility, implementation still needs independent review, both
full types/lint, focused/native/real-app/full/build and normal hooks/CI. No A5e GO,
release, full-notes migration or phase completion is claimed.
