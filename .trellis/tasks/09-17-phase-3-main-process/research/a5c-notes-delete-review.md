# A5c Delete-Only Design Precheck

- Date: 2026-11-28 (Asia/Shanghai).
- Status: FUTURE / NOT GO. Parent must integrate A5b and approve governing
  artifacts before implementation. Passing A5b local gates alone is not GO.
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform.
- Sole write: this review. A5b code/report, specs, runners and Git remain unchanged.
- Read the complete `research/a5c-notes-content-delete.md`, current NoteService,
  storage/oracle/tests, A5a/A5b executable contracts and installed library sources.

## Recommendation

Approve DELETE ONLY as the next bounded candidate after prerequisites, not the
combined content/delete proposal. No blocking design flaw found in this delete
boundary. It converts exactly one native statement, ratcheting NoteService6 -> 5.
Content, create and three full-row reads stay untouched, as do schema/history,
IPC/preload/UI, nullable output policy, storage repairs and directory migration.

Recommend the explicit module/signature:

```ts
// algo-electron/electron/db/repositories/notes/delete.ts
deleteNoteRow(db: Database.Database, noteId: string): Database.RunResult
// Implementation shape, not authorization to implement:
return createDrizzleClient(db)
  .delete(notes)
  .where(eq(notes.id, sql.placeholder('noteId')))
  .prepare()
  .run({ noteId })
```

Only the final native DELETE expression and its import change in NoteService.
Helper owns no lifecycle/cache/clock/event/filesystem/prelookup/catch/transaction;
it prepares/runs once, binds one unchanged ID and returns the native result object.
No RETURNING, LIMIT, deletion filter, dynamic table facade or input normalization.
Keep the run-object key even when diagnostic noteId is undefined. The public
service/helper signature stays string; runtime diagnostics do not widen IPC.

## Required service semantics

- Preserve getDb -> existing findNoteFilePath -> missing?false -> deleteNoteFiles
  -> DELETE prepare/bind/step -> changes read -> conditional notes event -> second
  changes read. Do not cache/destructure either predicate or move preparation
  before files. Existing found empty file_path still enters the cleanup branch.
- Distinguish helper from service: direct helper calls execute DELETE for missing/
  NULL IDs and can fail on query_only/readonly/damaged DDL. Service missing lookup
  stops before files and DELETE. Real NULL batch rows still issue the lookup;
  no NULL skip, IS NULL, bulk deletion or new aggregate notification scope.
- Files disappear before DB deletion. IGNORE0 can leave a row without its files
  and returns false/no event. FAIL may retain trigger side effects; ABORT rolls
  back statement effects, not files. SQL errors propagate. Existing cleanup
  swallows filesystem errors (failed unlink can skip later asset removal), then
  DB deletion proceeds; an injected throwing storage helper instead stops it.
- Caller transactions/savepoints and actual-COMMIT notification scope remain
  unchanged. SQL rollback cannot restore files. Partial autocommit batch success
  and its events survive a later failure in the original list order. Keep topic-
  only payload, guarded listener failure and synchronous reentrant visibility.
- Frozen030 is the supported physical schema. Preserve native error class/code/
  stage and injected identity, not identical quoted damaged-DDL wording. No new
  arbitrary-view/altered-schema guarantee or relaxed startup/schema validation.

## Installed-source verification

Inspected current installed sources under `algo-electron/node_modules/`:

- `drizzle-orm/sqlite-core/query-builders/delete.js`: public prepare selects run
  without returning; `sqlite-core/dialect.js` emits only supplied delete clauses.
- `drizzle-orm/sql/expressions/conditions.js`: eq leaves a named placeholder raw.
  `sql/sql.js` fills an existing placeholder key unchanged, including undefined.
- `drizzle-orm/better-sqlite3/session.js`: prepares on the supplied native handle,
  spreads positional parameters to native run and returns its result untouched.
- `better-sqlite3/src/util/binder.cpp`: arrays are flattened, plain objects are
  binding containers, arguments bind left-to-right and errors stop the process;
  `data.cpp` maps undefined/null to SQL NULL. Native oracle tests, not a substitute
  driver's expected messages, must determine malformed-container outcomes.

Independent stdin-only Node22.23.2 capture used the actual schema/client and
installed public builders. Eight ID shapes retained one raw argument (including
undefined/null/array/object/Symbol); the helper returned the exact sentinel result
without reading changes and preserved prepare/run thrown identities. This proves
construction only: no native SQLite instance, SQL execution, source write,
Electron run, typecheck/lint/global/build gate or native acceptance was performed.

## Content remains separate

Independently confirmed actual schema plus `dialect.buildUpdateSet` reorders a
normal content builder's bindings to [now, content, wordCount, noteId], whereas
the existing SQL and A5a trace require [content, wordCount, now, noteId]. Object
property ordering in `.set` does not change schema ordering. Native arrays and
first-error ordering make the distinction observable for malformed diagnostics.
No supported-user regression is claimed from this construction-only finding.

Do not weaken existing trace assertions, reorder shared schema, invent a partial
table, use private hooks or hide raw UPDATE text in the repository. A narrower
supported-input parity contract requires a separate explicit parent decision.
The researched parameter-carrier CTE may retain original bind order, but adds SQL
shape/planner complexity and has no actual-native/type/performance acceptance.
It is a future option, not a recommendation to implement now or evidence of GO.
Content's lookup/catch/files/clock/count and successful IGNORE0 event/true behavior
remain frozen; later conversion needs its own approved preservation exception.

## Minimal tests, reuse and ownership

1. Reuse UNCHANGED `tests/db/notes-file-path-oracle.ts` for original delete/batch
   orchestration. Add only a tiny `notes-delete-oracle.ts` with the original
   one-statement native helper and `notes-delete-writes.test.ts`. No full service
   copy or oracle dependency on production helper; A5a/B oracle bytes stay frozen.
2. Compare full raw state/audits/results/events and trace, native result identity
   including bigint rowid, two stateful changes reads, exactly one DELETE bind,
   no clock/UUID, explicit/closed/reinitialized handles. Include literal/empty/
   Unicode/NULL/undefined and actual native container inputs in query-only tests.
3. Separate helper no-match write attempts from service lookup short-circuit;
   retain empty-path rows, missing/NULL-list behavior, injected lookup/storage/
   DELETE errors, files-first readonly/query_only/IGNORE/FAIL/ABORT, actual batch
   partial effects, caught inner savepoint, rollback/real deferred-FK COMMIT,
   listener failure/reentrancy. No compensating filesystem rollback assertion.
4. Retain all A5a/B regressions and prior native/app groups. Append helper-only
   cases to repositories.test.ts without runtime NoteService under RUN_AS_NODE.
   Reuse existing real-app storage groups for delete/NULL/batch/rollback and add
   only uncovered cases; do not duplicate or redesign its runner/lifecycle.
   Real filesystem fixtures use contained safe IDs, never adversarial paths.
5. Worker1 owns helper, one substitution, tiny oracle/focused suite; worker2 owns
   append-only native tests/bounded app additions. Parent owns governing docs,
   explicit-handle DELETE exception, DB-list registration, exact6-to5 ratchet,
   protected-source snapshot and serial gates/Git. Independent full review after
   freeze; cap3 includes parent. Preserve runner/Vitest exclusion/cleanup unchanged.

Before GO, parent records A5b integration/CI, accepts this boundary in PRD/design/
implement/context plus an executable deletion spec and README. Before acceptance,
both typechecks/lint, focused/caller tests, actual-native DB/app, independent
review, full/build and CI must pass. No A5c implementation or passing native test
is claimed by this precheck; phase/release completion remains out of scope.
