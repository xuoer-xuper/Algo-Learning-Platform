# A5e Create Actual-Native Feasibility

2026-11-28. FUTURE / NOT IMPLEMENTATION GO. C worktree branch
`codex/drizzle-notes-create`, base4fe73b3. Only this report and ignored `tmp/a5e-*`
probes change. Reuses prior construction/precheck; recommend the corrected public
CTE subject to independent acceptance, schema qualification and measured costs.

## Candidate And Type Correction

`tmp/a5e-candidate.ts` has eager `prepareCreateNoteInsert(db)` returning only typed
`run(values): Database.RunResult`. Required keys: id,problemId,title,filePath,
noteType,content,wordCount,now; nullable parent and schema-derived noteType text.
Factory immediately prepares once; facade forwards to that prepared query and
returns its native result. No lifecycle/cache/files/clock/event ownership.

Initial strict tsc found TS2769: the previous unaliased outer SQL NULL selection
becomes DrizzleTypeError through the public INSERT SELECT type. Adding
`.as('deleted_at')` to the literal NULL fixes this without casts/private APIs or
an extra bind. Initial `tmp/a5e-types.log/.exit` retain failure2; corrected
`tmp/a5e-types-aliased.log/.exit` pass0. Candidate-only, not full project types.

```sql
with "note_create_values" as (
 select ? as "id", ? as "problem_id", ? as "title", ? as "file_path",
 ? as "note_type", ? as "content", ? as "word_count",
 ? as "created_at", ? as "updated_at" from (select 1)
)
insert into "notes" ("id", "problem_id", "title", "file_path", "note_type",
 "created_at", "updated_at", "content", "word_count", "deleted_at")
select "id", "problem_id", "title", "file_path", "note_type", "created_at",
 "updated_at", "content", "word_count", null as "deleted_at"
from "note_create_values"
```

Public `$with/select/from`, `with/insert/select`, `prepare/run` on existing schema
and supplied handle only. No raw INSERT candidate, fabricated table, private API,
RETURNING or extra driver SELECT. Nine SQL-wrapped placeholders retain old order:
`[id, problemId, title, filePath, noteType, content, wordCount, now, now]`, including
explicit undefined and repeated identical now-array references.

## Actual Runtime And Results

Drizzle0.45.4 / better-sqlite3 13.0.3 / Electron43.4.0, embedded Node24.18.1,
ABI148/NAPI10. Node22.23.2 launches esbuild and Electron under ELECTRON_RUN_AS_NODE;
spawnSync records both exits0, signals null. Actual `SELECT sqlite_version()` is
**3.53.4**; process.versions.sqlite3.53.1 is not the linked driver version.

Fixtures use frozen030 notes DDL and BOTH notes_problem/notes_updated_at indexes,
plus synthetic audit/deferred-FK tables. Independent old SQL names nine original
columns. In-memory DBs and one owned readonly file only; closed before checked
lexical/real-parent/nonsymlink cleanup. No NoteService/userData/real notes files.

**197 grouped checks, zero old/CTE parity mismatches, actual exit0.** JSON retains
old/new raw rows/typeofs, results/errors, audit/child rows, changes/total_changes
and transaction state. Stored integers use safeIntegers and serialize as `123n`.

- Ordinary/empty content; NULL/undefined/empty/literal/Unicode/NUL/surrogate/
  numeric/BLOB IDs and parents; raw text, fraction, epoch0, negative, safe-edge,
  out-of-Date, Buffer, bigint, infinity and NaN values/storage types.
- Arrays/empty arrays/plain objects/Symbol/boolean/Date/function errors; paired
  invalid values give TypeError for earlier Symbol, RangeError for earlier
  out-of-range bigint. No unsupported Proxy trap-order inference.
- All126 NULL/undefined masks over title/path/type/content/count/shared now;
  five duplicate/constraint combinations. Physical NOT NULL order is title ->
  file_path -> note_type -> created_at -> updated_at -> content -> word_count,
  before UNIQUE. Repeated NULL/undefined IDs succeed; duplicate string/empty/
  BLOB IDs fail identically. Baseline omitted deleted_at is NULL.
- One eager prepare/run, nine raw args, same repeated now reference, native
  result/error identity, bigint lastInsertRowid9007199254740993n, ignored
  throwing-result-getter and undefined-result seams.
- Prepare -> problem getter -> title getter -> run. Prepare failure prevents
  both getters; getter failures follow prepare and stop later getter/run;
  injected prepare/run exceptions retain identity. This is the factory receiver
  expression, not full service first/third reads, files, clock, UUID or events.
- BEFORE/AFTER all NEW fields including deleted_at; both timings of IGNORE/FAIL/
  ABORT retain original audit/state/outcome. Rowid probe: first BEFORE NEW.rowid=-1,
  last_insert_rowid=0, AFTER1/1; second BEFORE-1/1, AFTER2/2. Native results1/2
  match; ephemeral rowids do not leak in this bounded probe.
- query_only/actual readonly, alternate/closed/new handles, facade after close;
  commit/rollback/caught inner savepoint, actual deferred-FK COMMIT failure after
  callback return, retained earlier autocommit. Exact4MiB multibyte body/hash.

## Deliberate Differences

These two diagnostics are separate from the zero-mismatch parity matrix:

1. Ordinary values() negative control with content=['body','count-injected',41],
   wordCount=7, now=[]: old/CTE store content='body', count='count-injected',
   created_at=41, updated_at=7. Ordinary builder stores content='41.0', count=7,
   created_at='body', updated_at='count-injected'. Both succeed. Raw order matters
   for malformed internal diagnostics; this does not widen public input types.
2. Altered omitted-default fixture deleted_at DEFAULT73: old stores73, CTE stores
   NULL, both succeed. Explicit frozen030 scope is required; arbitrary altered
   defaults/omitted columns/views are NOT equivalent. Do not weaken existing
   startup/recovery validation or add per-write validation.

## Plan And Cost

Opcode totals include trigger subprograms:

| Fixture | Old | CTE | CTE ephemeral payload |
| --- | ---: | ---: | --- |
| No trigger | 43 | 64 | None |
| BEFORE audit | 66 | 104 | Ten-column OpenEphemeral |
| AFTER audit | 63 | 101 | Ten-column OpenEphemeral |
| Both | 86 | 124 | Ten-column OpenEphemeral |

EQP shows a constant coroutine/scan without MATERIALIZE text, but full opcodes
prove INSERT payload materialization with triggers. A5d's UPDATE observation must
not be reused for INSERT. No source notes-table scan; carrier is constant-row.

Sequential same-process in-memory benchmark, three warmups; timings exclude
cleanup/verification and all filesystem work. Full = construction+prepare+run:

| Payload / iterations / trigger | Old prepared / full | CTE prepared / full |
| --- | --- | --- |
| 4 bytes /400/none | 2.583 /10.292 us | 3.379 /151.193 us |
| 4 bytes /400/AFTER | 3.022 /11.642 us | 4.837 /125.851 us |
| 4MiB ASCII /8/none | 2.342 /2.272 ms | 2.298 /2.431 ms |
| 4MiB ASCII /8/AFTER | 2.298 /2.323 ms | 5.027 /5.341 ms |
| 4,194,304 CJK units /4/none | 17.555 /18.146 ms | 18.355 /18.519 ms |
| 4,194,304 CJK units /4/AFTER | 19.033 /19.145 ms | 31.009 /30.352 ms |

Performance AFTER trigger writes a small audit label, not content. Triggered
large-payload cost is measurably higher, not hidden as noise. Frozen030 has no
notes triggers, but future migrations need reassessment. CJK is12,582,912 UTF-8
bytes; IPC counts JS code units. Small construction costs ~0.13-0.15ms here.
No latency threshold, future-plan, speedup, peak-memory or leak guarantee;
before/after RSS/heap snapshots cannot establish those claims.

## Remaining Gates And Evidence

Parent must accept independent review, frozen030/cost qualifications, eager
factory contract and create-specific IGNORE0 notification exception before GO.
Full service first/second/third getters, file/count/clock/UUID/event/return errors,
real contained storage/collision/rollback, reentrancy and IPC callback sequencing
remain implementation gates. This is not complete application acceptance.

No product/tests/spec/Git/D/install/rebuild/global/full/build edits or execution.
Reproduce in C worktree `algo-electron`, Node22.23.2 PATH, exclusive native slot:
`node node_modules/typescript/bin/tsc -p tmp/a5e-tsconfig.json`, then
`node tmp/a5e-run.mjs`. Retained a5e-candidate.ts, a5e-tsconfig.json,
a5e-native.ts/mjs, a5e-run.mjs, a5e-native-evidence.json, native.log/.exit and
initial/aliased types.log/.exit. Corrected final SHA256:

- candidate.ts: A4C8C061D0A9C2A41C610DDB85C21A17FD8443FA3B105974EBB8E1019D2C4764
- native.ts: BE8A62BED02F75A8A57041AE3F52F1A7216CF55BB40CD24C77D5509899EA948B
- native-evidence.json: 095A59CB5341659451A91155E6F469C8032D4C0BAAB66B11CDA08BF0B5AF93C2
