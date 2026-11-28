# A5b Title/Type Write Design Precheck

- Date: 2026-11-28 (Asia/Shanghai).
- Status: FUTURE / NOT GO. A5a integration and parent approval of governing
  artifacts are prerequisites. This is not implementation or acceptance evidence.
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform.
- Scope: independent design review; only this artifact is written. No product,
  spec, runner, dependency, Git, or original D-worktree changes.

## Verdict and smallest boundary

No blocking design flaw found in the proposed two-UPDATE approach, subject to
the decisions and acceptance requirements below. Read the complete
`research/a5b-notes-title-type.md`, current task context, A5a executable spec,
both actual NoteService methods, schema/client, event bus, IPC, existing tests,
runner, and installed Drizzle/better-sqlite3 implementation sources.

Recommend `algo-electron/electron/db/repositories/notes/title-type.ts` with:

```ts
updateNoteTitleRow(db: Database.Database, noteId: string,
  title: string, now: number): Database.RunResult
updateNoteTypeRow(db: Database.Database, noteId: string,
  noteType: typeof notes.$inferSelect['note_type'], now: number): Database.RunResult
```

Use two explicit functions, not a dynamic-column/general patch API. The physical
type parameter is string; do not import service NoteType into the repository.
Only substitute the two original prepare/run expressions and add their import.
Preserve `getDb`, one `nowMillis`, conditional emit, and return in the service.
Helpers wrap the supplied handle and build/prepare/run once, with no lifecycle,
clock, event, cache, transaction, prelookup, validation, catch, or filesystem work.
Return the untouched native result, not boolean/count or a copied result object.

The required order is getDb -> clock -> prepare -> native bind/step -> first
`result.changes` read -> conditional event -> second `result.changes` read.
Keep both existing predicates; do not precompute or destructure `changes`.
Same-value matches still execute UPDATE and normally count 1. Missing/NULL-bound
IDs still execute and may fail on a damaged/read-only/query-only database.

## Installed-source checks and required construction

Sources below are under `algo-electron/node_modules/`:

- `drizzle-orm/utils.js:83`: `mapUpdateSet` drops undefined SET values and wraps
  non-SQL values with column encoders. Direct undefined title/type silently
  loses an assignment and changes UPDATE OF trigger behavior.
- `drizzle-orm/sqlite-core/dialect.js:65`: SET order follows schema order and
  includes onUpdate fields. Current notes has none; title/type precede updated_at.
- `drizzle-orm/sqlite-core/columns/integer.js:71`: timestamp_ms encoding calls
  `getTime`; a bare timestamp placeholder encodes at run and rejects numbers.
- `drizzle-orm/sql/sql.js:361`: raw placeholders return existing keys unchanged,
  including undefined; encoded Param placeholders call the encoder instead.
- `drizzle-orm/sql/expressions/conditions.js:17`: equality leaves a placeholder
  raw. `sqlite-core/query-builders/update.js:144` prepares before run;
  `better-sqlite3/session.js:22` prepares on the supplied native handle and
  its `run` spreads filled positional values, returning the native result.
- `better-sqlite3/src/util/data.cpp:30`: undefined and null bind SQL NULL.
  `src/util/binder.cpp:160` treats arrays/plain objects as binding containers;
  do not copy node:sqlite invalid-binding expectations. `src/objects/statement.cpp`
  creates the original changes/lastInsertRowid result after native step/reset.

Require SQL-wrapped named placeholders for BOTH text and timestamp assignments:

```ts
.set({
  title: sql`${sql.placeholder('title')}`,
  updated_at: sql`${sql.placeholder('now')}`,
})
.where(eq(notes.id, sql.placeholder('noteId')))
.prepare().run({ title, now, noteId })
```

Type uses explicit note_type with its corresponding raw placeholder. Keep all
three run-object keys even when a diagnostic value is undefined. Generated SQL
has exactly two SET targets and three positional bindings [value, now, noteId].
These are bound values, not interpolated `sql.raw` input. No Date conversion,
coercion, WHERE filter, RETURNING, omitted target, or arbitrary-DDL guarantee.

On the actual driver, undefined title/type is bound NULL: a matched ordinary row
fails NOT NULL, while a missing row can succeed with changes0. NULL/undefined ID
remains bound equality, not IS NULL or an early return. Diagnose malformed values
only through independent native-oracle cases; do not widen supported signatures.

## Required implementation tests

1. Freeze the two original functions in a small separate
   `tests/db/notes-title-type-oracle.ts`; add
   `tests/db/notes-title-type-writes.test.ts`. Do not change the A5a oracle or make
   either oracle import the new implementation. Compare full raw rows/storage
   types, native results/errors, trigger effects, exact traces and events.
2. Cover all three supported types, same-value/missing/tombstone rows, empty and
   literal/Unicode IDs, NULL/undefined IDs and SET values, raw epoch/fraction/
   extreme/TEXT times. Native tests must distinguish matched undefined from
   missing-row undefined and derive array/object outcomes from original SQL.
3. Assert one prepare/run, two target columns, three bindings, no SELECT/FS/UUID;
   acquisition/clock/prepare/run failure identity/order; original native result
   identity and two changes reads surrounding the event (a stateful getter seam
   catches caching). Target-specific UPDATE OF triggers expose extra/dropped SETs.
4. Compare readonly/query_only including missing rows; IGNORE0 false/no event,
   FAIL retained effects versus ABORT rollback; damaged table/column class/code/
   stage with qualified wording allowed, not universal altered-schema parity.
5. Test explicit/closed/reinitialized handles, rollback, caught inner savepoint,
   actual deferred-FK COMMIT failure, earlier partial autocommit success, topic-only
   payload, synchronous reentrant visibility and listener-error isolation.
6. Append helper-only native cases in `tests/db/repositories.test.ts`; never import
   NoteService there under RUN_AS_NODE. Extend existing
   `tests/electron/notes-file-path-storage.test.ts` with real-service title/type
   groups proving markdown/assets bytes and paths stay untouched on success and
   failure. Reuse its deferred imports and owned-root lifecycle without rewriting
   prior cases, moving cleanup into the child, or adding another runner.

## Ownership and parent decisions

- Parent must approve the explicit-handle WRITE exception, raw value semantics,
  helper signatures, scope, and tests in PRD/design/implement/context plus an
  executable A5b spec and repository README before GO. A5a approval alone does
  not grant this exception. First confirm A5a integration and its CI evidence.
- Assign production/helper/oracle/focused tests to one owner; if native/app test
  additions are split, give those two files exclusively to a second owner.
  Parent owns shared registration, docs/specs, exact NoteService budget 8 -> 6,
  and serial acceptance gates. Respect cap3; review after writers freeze.
- Register the focused file in test:db; test:all already includes full Vitest
  and the existing native notes app runner. Preserve the current real-app Vitest
  exclusion and runner behavior. No scanner exception or relocation-as-conversion.
- Keep schema/history, public NoteType/IPC/preload/UI, content/create/delete/list,
  false-result UI handling, storage repairs, and phase directory moves unchanged.
  Existing caller/draft/tab/refresh tests plus both typechecks, lint, architecture,
  independent review, native DB/app, full/build and CI remain required afterward.

## Verification performed for this precheck

Source inspection plus one stdin-only Node22.23.2 capture using actual schema/
client and installed public Drizzle builders passed: both statements have the
two targets/three raw arguments (including undefined/null), retain result identity,
and preserve changes/event/changes order. It instantiated no native SQLite addon,
wrote no files, and proves construction only. No lint/typecheck/global/native/build
gate was run. The researcher's separate 44-case node:sqlite probe is not repeated
or promoted to actual-driver acceptance. A5b implementation/test results do not
exist yet; this artifact is a conditional design recommendation, not GO.
