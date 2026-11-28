# A5d Content Native Feasibility

2026-11-28. Research evidence only, not independent implementation GO. Recommended:
public single-row CTE carrier. Parent's later approved spec governs implementation.

## Scope And Runtime

Research uses C worktree branch `codex/drizzle-notes-content`, base `48ba2c0`.
Only this report and ignored `algo-electron/tmp/a5d-feasibility-*` scratch change.
No production/test/spec/runner/Git/build/install/rebuild or user data operations.
Fixtures extract notes DDL from frozen030 baseline, add the updated_at index and
synthetic audit/FK tables. In-memory DBs and one owned readonly file are isolated;
readonly handles close before checked lexical/real-parent/nonsymlink cleanup.

Actual installed Drizzle0.45.4 / better-sqlite3 13.0.3 run in Electron43.4.0,
embedded Node24.18.1 / ABI148 / NAPI10, under ELECTRON_RUN_AS_NODE. Node22.23.2
launches esbuild then Electron; both actual child statuses are0, signal null.
process.versions.sqlite=3.53.1 is not separately queried better-sqlite3 SQLite.

## Candidate And Reason

Original: `UPDATE notes SET content = ?, word_count = ?, updated_at = ? WHERE id = ?`,
bindings `[content, wordCount, now, noteId]`. Ordinary `.set()` follows schema
order, producing `[now, content, wordCount, noteId]`. Installed dialect.js:65 and
better-sqlite3 binder.cpp:168 explain SET order and argument-container flattening.
Actual native negative control: content=['body','injected'], wordCount=2, now=[],
id='note'. Old/CTE/FROM store content='body', count='injected', time=2; ordinary
builder stores content='injected', count=2, time='body'. This diagnostic is outside
public types but proves reordering is observable; do not weaken exact traces.

Proposed signature: `updateNoteContentRow(db: Database.Database, noteId: string,
content: string, wordCount: number, now: number): Database.RunResult`.
Strict candidate-only tsc passes with real schema and public APIs:

```ts
const orm = createDrizzleClient(db)
const values = orm.$with('note_write_values').as(
  orm.select({
    content: sql`${sql.placeholder('content')}`.as('content'),
    wordCount: sql`${sql.placeholder('wordCount')}`.as('word_count'),
    now: sql`${sql.placeholder('now')}`.as('updated_at'),
    noteId: sql`${sql.placeholder('noteId')}`.as('note_id'),
  }).from(sql`(select 1)`),
)
return orm.with(values).update(notes).set({
  content: sql`(select ${values.content} from ${values})`,
  word_count: sql`(select ${values.wordCount} from ${values})`,
  updated_at: sql`(select ${values.now} from ${values})`,
}).where(eq(notes.id, sql`(select ${values.noteId} from ${values})`))
  .prepare().run({ content, wordCount, now, noteId })
```

```sql
with "note_write_values" as (select ? as "content", ? as "word_count",
? as "updated_at", ? as "note_id" from (select 1))
update "notes" set "updated_at" = (select "updated_at" from "note_write_values"),
"content" = (select "content" from "note_write_values"),
"word_count" = (select "word_count" from "note_write_values")
where "notes"."id" = (select "note_id" from "note_write_values")
```

Four original-order raw bindings, all explicit undefined keys, no Date encoding,
one prepare/run, untouched result and unread changes. No private API, fabricated
table, schema change or raw UPDATE candidate. Public aliased UPDATE FROM carrier
also passes parity, but has higher observed large-content costs.

## Native Evidence

Final92 named checks, zero CTE/FROM differences, exit0. Initial78 evidence retained.
Oracle is exact original SQL, independent of candidate. Matrix covers raw rows/
typeof, result/errors, audit/child rows, SQLite changes and transaction state:

- Ordinary/same/missing/NULL/undefined, empty/literal/Unicode/NUL/surrogate IDs,
  tombstones, ten numeric/text/BLOB ID-affinity combinations.
- Epoch0/fraction/extreme/rawTEXT/Buffer/bigint/infinity/NaN, malformed array/
  object containers and Symbol/boolean/Date/function errors.
- Exact one prepare/run/four binds, native result and injected error identity,
  unread changes getter, bigint lastInsertRowid, closed then independent handle.
- All28 NULL/undefined masks (7 masks x matched/missing x null/undefined): same
  first constraint and missing-row changes0. All three EXPLAIN HaltIfNull orders
  are updated_at -> content -> word_count, not textual SET order.
- Exact three UPDATE OF targets, BEFORE/AFTER NEW values, unrelated rows,
  IGNORE/FAIL/ABORT effects, query_only and actual readonly existing/missing.
- Commit/rollback/caught inner rollback/actual deferred-FK COMMIT failure after
  callback return/retained earlier autocommit; exact4MiB multibyte round-trip/hash;
  10k-row indexed target-only update; separate single damaged-column diagnostics.

Proxy/Symbol paired-invalid cases all give the same TypeError with EMPTY trap
traces. They prove parity only, NOT experimental first-invalid/trap order. Future
tests can use distinguishable Symbol/out-of-range-bigint failures. Array negative
control and exact binding trace already prove the order requirement.

## Plans And Cost

EXPLAIN: old40 opcodes, CTE99, FROM63. Old/CTE use indexed target ID search;
CTE has four constant-row scalar coroutine subqueries and no observed MATERIALIZE.
FROM materializes the constant source and uses an ephemeral update shape. No
update-wide scan; no guarantee of future planner choices.

Sequential same-process microbenchmark,3 prepared warmups, no filesystem work:

| Payload / iterations | Old prepared / full | CTE prepared / full | FROM prepared / full |
| --- | --- | --- | --- |
| 4 bytes / 1500 | 1.526 / 7.193 us | 1.896 / 110.642 us | 3.059 / 80.834 us |
| 4,194,304 ASCII bytes/code units / 12 | 2.158 / 2.108 ms | 2.055 / 2.183 ms | 5.135 / 5.596 ms |
| 4,194,304 CJK code units / 6 | 17.982 / 18.435 ms | 17.925 / 18.256 ms | 27.881 / 27.072 ms |

Full means uncached construction+prepare+run, the intended helper path. Small
CTE construction cost is real (~0.11ms), not zero overhead. IPC max4*1024*1024 is
JS code units; CJK case is12,582,912 UTF-8 bytes. RSS/heap before/after is recorded,
not peak/native allocator attribution or leak/memory-equivalence proof. No timing
threshold/general speedup claim. Prefer CTE for parity without FROM large cost.

## Remaining Gates And Evidence

No service/files/clock/catch/events acceptance occurs in this query-only probe.
Implementation must retain lookup outside try, file -> clock -> count -> UPDATE
-> event -> true inside try, ignored result/IGNORE0 success, false on inner errors,
propagating lookup errors and nonrollbackable file effects. No other notes query,
public contract, schema/history, storage repair or lifecycle change is proposed.

Both old observers need explicitly approved exact fixed carrier-prefix branches:
focused notes-file-path-reads.test.ts and real-app notes-file-path-storage.test.ts.
Keep old branches, bodies/assertions/injection/bind traces and frozen oracle;
never match arbitrary WITH. Formal focused/native/real-app tests, both project
typechecks, lint, callers, independent review, serial DB/full/build and stable
protected-source accounting remain required; arbitrary changed-DDL/view parity
and future planner/performance guarantees are not established.

Reproduce from C worktree `algo-electron` with Node22.23.2 on PATH:
`node node_modules/typescript/bin/tsc -p tmp/a5d-feasibility-tsconfig.json` and
`node tmp/a5d-feasibility-run.mjs` (requires exclusive native ownership).
Runner records actual child exits. Candidate-only strict tsc exit0; not full types.
Retained candidate.ts, native.ts/mjs, run.mjs, tsconfig.json, evidence.json,
native.log/.exit, types-final.log/.exit and initial-evidence/native artifacts all
use the `tmp/a5d-feasibility-` prefix. Final SHA256 evidence:

- candidate.ts: B6B0ABE5CBEE1209EE5F77D4C973DA4855CB9909CF12BCC10A8AD2BAC07A93D9
- native.ts: 55924A2D76E7EF271BCE1E3E3032A6CF177DB9AF98D0D95C064CC1C75791EF00
- evidence.json: CAFE8B02936FCEDD6E4B992B557CDA1B57E2FD88A329C7FB14064977E9334E6C
