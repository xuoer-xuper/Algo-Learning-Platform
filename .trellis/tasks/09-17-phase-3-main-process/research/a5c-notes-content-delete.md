# Research: Notes Content And Delete Writes After A5b

- Query: Find the smallest remaining notes-write conversion after A5b, preserving
  file/SQL ordering, native bindings, results/errors and notifications.
- Scope: Internal source/spec/installed-library inspection and a stdin-only
  public-builder construction probe; no native database execution.
- Date: 2026-11-28 (Asia/Shanghai).
- Status: FUTURE / NOT APPROVED. A5b final review/full gates/integration are
  parent-owned and are not certified by this research. No A5c implementation GO.
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform.
  Source references below are relative to the repository root.

## Findings

### Recommendation: Delete Only First

Recommend the next independently reviewed slice convert only deleteNote's final
DELETE, with a narrow explicit-handle helper. The actual architecture counter
reports six native boundaries now; deletion alone is exactly 6 -> 5. Converting
content too would be 6 -> 4, but the straightforward content builder does NOT
preserve its original binding order. Do not use the two-statement label to hide
that new compatibility decision. A later content-only slice would be 5 -> 4.

The prior inventory's A5c1/A5c2/A5d labels were proposals, not approved ordering;
this recommendation does not approve their full-row/nullability/UI policies.
Parent must name and approve the next slice after A5b integration and independent
precheck. All three full-row reads, create, UI, schema/history, file repair and
public input/output changes remain excluded.

### Files Found And Existing Patterns

| File/reference | Purpose |
| --- | --- |
| `algo-electron/electron/notes/NoteService.ts:164` | Content: lookup outside try, file/clock/count then UPDATE, unconditional successful-run event. |
| `algo-electron/electron/notes/NoteService.ts:215` | Delete: lookup, cleanup, native DELETE, changes/event/changes. |
| `algo-electron/electron/notes/NoteService.ts:234` | Batch: unchanged list order, one service deletion per row, count true results. |
| `algo-electron/electron/notes/noteStorage.ts:43` | Content writes directly to selected path before DB update. |
| `algo-electron/electron/notes/noteStorage.ts:98` | Cleanup swallows filesystem failures; failed unlink skips asset removal. |
| `algo-electron/electron/notes/noteText.ts:2` | Existing trim/CJK/alphanumeric counting, before UPDATE preparation. |
| `algo-electron/electron/db/repositories/notes/file-path.ts:6` | Accepted A5a row-preserving explicit-handle lookup; leave unchanged. |
| `algo-electron/electron/db/repositories/notes/title-type.ts:6` | A5b raw placeholders and untouched RunResult pattern, not content-order proof. |
| `algo-electron/src/main/db/schema.ts:220` | Physical notes metadata: updated_at precedes content and word_count. |
| `algo-electron/src/main/db/client.ts:10` | Wrap supplied handle only; no lifecycle acquisition. |
| `algo-electron/tests/db/notes-file-path-oracle.ts:96` | Frozen original content, delete and batch functions; keep unchanged. |
| `algo-electron/tests/db/notes-file-path-reads.test.ts:575` | Existing exact content trace asserts original four-binding order. |
| `algo-electron/tests/db/repositories.test.ts` | Actual Electron helper-only repository suite; no service import under RUN_AS_NODE. |
| `algo-electron/tests/electron/notes-file-path-storage.test.ts:426` | Existing real storage/oracle content and delete groups; extend, do not redesign lifecycle. |
| `algo-electron/tests/verify.mjs:114` | Dedicated notes runner owns checked root deletion after child exit. |
| `algo-electron/tests/architecture/check-architecture.mjs:318` | Current exact NoteService budget6. |

### Proposed Delete Helper And Service Boundary

Provisional name and location, requiring parent approval:

```ts
// electron/db/repositories/notes/delete.ts
deleteNoteRow(db: Database.Database, noteId: string): Database.RunResult
```

Construction using existing public APIs:

```ts
return createDrizzleClient(db)
  .delete(notes)
  .where(eq(notes.id, sql.placeholder('noteId')))
  .prepare()
  .run({ noteId })
```

The probe generated `delete from "notes" where "notes"."id" = ?`, passed the
single ID unchanged to the supplied handle and returned its exact result object.
No RETURNING, LIMIT, active-row filter, prelookup, cache, clock, filesystem,
notification, catch or transaction belongs in the helper. Do not turn it into a
generic dynamic-table mutation abstraction. Public service noteId stays string.

Replace only NoteService's final prepare/run expression and add the import.
Keep `getDb -> findNoteFilePath -> missing?false -> deleteNoteFiles -> helper ->
changes -> conditional notes event -> changes` in that order. The two changes
reads cannot be cached or destructured; stateful injected native results make
the difference observable. Result errors are not swallowed by the service.

Important distinction: direct helper calls for missing/NULL IDs still execute
DELETE, but the SERVICE stops after its existing missing lookup and never calls
the helper. A runtime NULL list ID must still perform that lookup, even when it
will match no row. Do not skip NULL in the batch, use IS NULL, bulk-delete, or
claim the service must always run DELETE for missing rows.

Deletion includes tombstones and exact literal equality. It removes files first.
IGNORE can leave the DB row after files disappear and returns false/no event;
FAIL may retain trigger side effects and throws/no event; ABORT rolls back the
statement, not the already-deleted files. Existing swallowed storage errors still
allow DB deletion. A synthetic thrown storage helper still stops before DELETE.
Caller savepoint/rollback/actual COMMIT scope owns DB/events only, never file
restoration. Earlier successful autocommit batch deletions/events survive a later
failure, with original ordering and no artificial aggregate notification scope.

Frozen030 physical schema is the supported boundary. Native errors preserve
class/code/stage and injected identity; quoted/qualified damaged-DDL wording may
differ as already approved for earlier slices. No arbitrary view/DDL parity claim,
error translation or weaker startup/schema validation is proposed.

### Content Is Not A Mechanical Copy Of A5b

The old expression is:

```sql
UPDATE notes SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
```

Its native run arguments are `[content, wordCount, now, noteId]`. A normal public
builder with SQL-wrapped placeholders for all three assignments instead emits:

```sql
update "notes" set "updated_at" = ?, "content" = ?, "word_count" = ?
where "notes"."id" = ?
```

The arguments are `[now, content, wordCount, noteId]`, even when the `.set` object
is written in old SQL order. Installed Drizzle0.45.4
`sqlite-core/dialect.js:65` iterates table-column keys, and schema.ts:231 places
updated_at before content:232 and word_count:235. The stdin capture confirmed
the changed order with actual schema and public builders. The existing A5a
focused assertion at notes-file-path-reads.test.ts:575 will detect this change.
Do not silently weaken that assertion or claim exact native trace parity.

Ordinary valid scalars still map to the intended columns; the construction probe
does not establish a normal supported-user data regression. However, native
binding order is not generally cosmetic for malformed internal diagnostic values:

- better-sqlite3 `src/util/binder.cpp:168` walks run arguments left to right and
  stops on failure. A content Symbol and a clock Proxy whose getPrototypeOf
  throws reach different first failures after this reordering. The production
  service normally rejects non-string content earlier in storage/counting;
  this is a direct-helper diagnostic, not a newly supported IPC request.
- `binder.cpp:171` flattens arrays into the positional sequence. From its source,
  content=`['body','injected']`, wordCount=2, now=`[]`, id='note' yields four
  flattened values. Old bindings address content='body', word_count='injected',
  updated_at=2; reordered bindings address updated_at='body', content='injected',
  word_count=2. These values are diagnostic violations of helper parameter types.
  This is a source-derived counterexample, NOT an executed native result here.
- Constraint/error ordering for multiply-invalid bindings or damaged DDL must be
  measured independently; this research does not assert a particular NOT NULL
  first-error difference without actual SQLite execution.

All dynamic SET targets still need raw SQL-wrapped placeholders: direct undefined
values can drop assignments (`utils.js:83`); bare timestamp placeholders invoke
Date encoding. Reordering the shared schema, fabricating a partial table, using
private dialect hooks or moving raw UPDATE text into the exempt DB layer are not
acceptable ways to conceal the issue.

### Deferred Content Alternatives, Not A Recommendation To Implement

1. Independently approve a narrower compatibility contract: unchanged supported
   scalar outcomes/native effects and service ordering, but explicitly qualify
   raw bind order and malformed-container diagnostics. This requires parent
   judgment, tests and an honest update to earlier exact-order evidence; research
   alone cannot grant it.
2. Use a public single-row CTE as a parameter carrier in original bind order,
   then reference its four fields from UPDATE/WHERE. Construction-only probe
   using `$with`, `select`, `from(sql\`(select 1)\`)`, `with(...).update` and scalar
   subqueries generated the following shape and retained original four arguments:

```sql
with "note_write_values" as (
  select ? as "content", ? as "word_count", ? as "updated_at", ? as "note_id"
  from (select 1)
)
update "notes"
set "updated_at" = (select "updated_at" from "note_write_values"),
    "content" = (select "content" from "note_write_values"),
    "word_count" = (select "word_count" from "note_write_values")
where "notes"."id" = (select "note_id" from "note_write_values")
```

This keeps one native prepare/run and four original-order binds but adds SQL
shape/planning complexity, retains schema-order assignments and requires actual
SQLite validation of native errors, storage types, triggers, readonly/missing
rows and transaction effects. No native execution, static typecheck, performance
or full compatibility proof was run for it. It is not an approved implementation
and is disproportionate to silently add during a purported two-line substitution.

Regardless of the later construction choice, content keeps its lookup OUTSIDE
try, then file write -> clock -> countWords -> UPDATE preparation/run -> event ->
true INSIDE try. Catch returns false for any inner failure, while lookup errors
propagate. Never move preparation ahead of the filesystem or clock/count.
Successful native IGNORE0 still emits notes and returns true; this must be a
separately approved preservation-only data-refresh exception. File effects can
remain after clock/count/SQL failure or caller rollback. Do not repair this,
read result.changes, add compensation, or change the renderer's false handling.

### Caller And Test Boundaries

Notes IPC at `electron/ipc/registerNotesIpc.ts:62` and :74 directly returns
content/delete results; :82 preserves batch count. Existing identifier is only
length1..200, content limit4MiB in `src/shared/types/ipc/notes.ts:24`; no new trim,
route-ID, path or nullable policy is implied. Preload at `src/preload/index.ts:349`
and :355 still exposes boolean promises. `problemsApi.ts:70`/:85 forwards them.
`NotePanelModal.tsx:80` treats fulfilled content false as saved and :110 ignores
delete false; `ProblemDetail.tsx:68` ignores batch count. Those known behaviors
are separate product work, not justification to widen this refactor.

For delete-only acceptance, a minimal new focused suite can reuse the UNCHANGED
frozen A5a `createNotesFilePathOracle` for old delete/batch orchestration and add
a separate tiny `notes-delete-oracle.ts` for the original DELETE helper. This
avoids duplicating the full old storage service or parameterizing its oracle
with production code. Keep A5a/B oracle bytes unchanged and retain all prior
native/app statements/groups. Existing A5a focus/native-app suites remain gates.

Required delete-only evidence:

- Exact one DELETE parameter/prepare/run, native RunResult identity (including
  safeIntegers bigint lastInsertRowid), original two changes reads and no clock.
- Helper ordinary/empty/literal/Unicode/NULL/undefined IDs and actual native
  array/object binding; service missing lookup stops before files/DELETE.
- Full rows/events/audit/file effects; UPDATE targets untouched; deleted rows,
  readonly/query_only, IGNORE/FAIL/ABORT, injected prepare/run/storage errors.
- Files-first failure, swallowed cleanup, actual NULL-list batch, later failing
  batch item, caller rollback/caught savepoint/real deferred-FK COMMIT, listener
  failure/reentrancy and explicit closed/reinitialized/independent handles.
- Real-app cases use safe contained synthetic IDs only. Unsafe/null-like path
  diagnostics belong in query-only or intercepted-storage tests. Reuse deferred
  imports, existing owned-root checks and parent-after-child-exit cleanup without
  another runner, ABI rebuild, userData fallback or live-root recursive deletion.

Suggested disjoint ownership: worker1 helper/single service substitution/new tiny
oracle/focused suite; worker2 append-only native repositories and bounded real-app
additions. Parent owns docs/spec/context, focused DB registration, exact6-to5
ratchet, serial full/native/build/CI/Git. Independent precheck precedes GO;
independent full review follows freeze. Cap3 includes parent and both workers.

### Probe Actually Performed

Node22.23.2 stdin-only script transpiled actual schema.ts in memory with installed
TypeScript6.0.3, then used installed Drizzle0.45.4 on a prepare/run capture object.
It instantiated no better-sqlite3 database and no Electron process, wrote no
probe files and touched no user data. Observed ordinary content reordered args,
delete's one raw NULL argument, CTE's original four args, and exact supplied
RunResult identity for all three. A separate pure architecture counter confirmed
current6, hypothetical delete-only5, hypothetical content+delete4 in memory.
No actual-native error/container/constraint, transaction, filesystem, typecheck,
lint, build, full gate, installation or Git operation was performed by research.

### Related Specifications And External References

- `.trellis/spec/project/drizzle-notes-file-path.md`: row presence, old storage
  sequencing, runtime NULL batch and native-app lifecycle.
- `.trellis/spec/project/drizzle-notes-title-type.md`: explicit handle, raw
  placeholders and untouched native result; not a waiver for content reordering.
- `.trellis/spec/project/data-refresh.md`: caller-owned real COMMIT scope and
  current exception list; content exception requires a new explicit decision.
- `.trellis/spec/project/drizzle-adoption.md`, domain-rules.md and
  migration-status.md: frozen schema/lifecycle, main-only queries, later layout.
- Shared code-quality and guides/pre-implementation-checklist: bounded reuse,
  no assertion-based public widening and evidence before changing contracts.

Installed versions inspected: Drizzle0.45.4, kit0.31.11, better-sqlite3 13.0.3,
Electron43.4.0, TypeScript6.0.3. Official references (not fetched during research):

- https://orm.drizzle.team/docs/delete
- https://orm.drizzle.team/docs/update
- https://orm.drizzle.team/docs/select#with-clause
- https://sqlite.org/lang_with.html
- https://sqlite.org/lang_conflict.html

## Caveats / Not Found

- FUTURE / NOT APPROVED. Recommend delete-only6-to5 first, not the initially
  suggested combined6-to4, pending A5b integration and independent precheck.
- The new content bind-order problem is construction-proven; malformed native
  effects above are explicitly source-derived and need future actual-driver
  differential evidence. CTE feasibility is not acceptance or GO.
- No source/spec/task/context/Git change here; only this research artifact.
- Do not infer A5b completion, release permission, task archival, full-row UI
  policy, storage repair or weakened parity from this research.
