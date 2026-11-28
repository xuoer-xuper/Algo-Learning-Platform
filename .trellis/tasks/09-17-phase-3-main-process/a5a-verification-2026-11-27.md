# A5a Notes File-Path Read Verification

Started: 2026-11-27; final local gates: 2026-11-28. Branch
codex/drizzle-notes-file-path, accepted integrated base
299b0e327d994bbe030807389644a443101e8144. Local gates pass; Git integration
remains pending until its separate closure record.
Phase3 and its parent remain active. No release, installer or schema change.

## Boundary And Implementation

Parent accepts the four-read precheck in governing PRD/design/implement and
project/drizzle-notes-file-path.md before dispatch. Two disjoint implementers
own query/oracle/focused/native groups and actual-app storage test respectively;
parent owns runner/ratchet/docs and serial gates. Total concurrency never exceeds3.

The helper wraps the caller-supplied native DB, selects one file_path field with
one bound equality/get and returns row presence. NoteService differs exactly by
one import and four original SELECT/assertion substitutions; all method tails
and remaining8 native SQL sites are unchanged. Bare-SQL ratchet12-to8 matches.
All53protected paths, including schema/history/storage/time/IPC, stay unchanged.

The oracle freezes lookup, four methods, list/map/batch and word counting without
production query/storage imports. Initial focused63/63 and both TypeScript/lint/
format pass. The first focused run found a fixture-only clock assertion including
reinitialization's migration clocks; isolating the read interval corrects that
test without changing production or weakening read assertions. Existing caller
regressions pass5files101 (notifications, IPC/timestamp, notes draft/tab/refresh).

## Native Query Gate

Standalone parent-owned Electron ABI repository gate exits0 with65/65 groups,
including5new notes groups. All159prior native top-level statements remain in
order. New cases cover one field/binding/get, ordinary/empty/literal/Unicode/NUL/
surrogate IDs, raw/empty/BLOB paths, NULL equality, read-only/query-only, explicit
and closed/reinitialized handles, transaction/savepoint visibility and no effects.

Actual better-sqlite3 missing-column diagnostics confirm the qualified contract:
old `no such column: file_path`; builder
`no such column: "file_path" - should this be a string literal in single-quotes?`.
Both throw native SqliteError/SQLITE_ERROR during prepare; injected object
identities and get/binding errors remain unchanged. No error rewriting.
Evidence: tmp/drizzle-a5a-initial-native.log/.exit.

## Real-App Harness Findings And Fix

Two implementation assumptions needed correction, both in the test harness:

1. Single-file ESM bundling hoists transitive native/logging externals even when
   local imports become deferred init wrappers. Notes-only split .mjs chunks
   preserve actual isolation-before-import; entry has only Node/Electron static
   imports. All other bundles remain single-file; coach app runner is unchanged.
2. First native run passes21/21 behavior groups but fails recursive cleanup with
   EPERM while Chromium session is still alive. Residuals contain only session
   LevelDB/network/cache/preferences, not notes data. closeAllConnections does
   not destroy a session. Repeating a live-root delete is not a lifecycle fix.

Independent reviewer approves a dedicated runNotesStorageTest. Parent creates a
unique workspace tmp/electron-tests/notes-storage-* directory, passes required
ALGO_NOTES_TEST_ROOT and removes inherited RUN_AS_NODE only for that child. Child
validates absolute strict containment/prefix/nonsymlink directory before path
setup; it closes DB/subscriptions/protocol/connections and exits truthfully.
Parent checks lexical and real ownership and cleans only after synchronous child
exit. Child failure survives secondary cleanup errors; cleanup-only failure fails.

Corrected exact runner passes21/21 with status0 even when parent RUN_AS_NODE=1;
all runner-owned notes-storage-* roots are gone afterwards. Seven isolated runner
probes cover success, child/cleanup/both failures, symlink, escaped realpath and
throwundefined. Generic coach function remains byte-identical to baseline.
The original system-temp diagnostic root remains after an attempted checked
PowerShell cleanup was rejected by tool policy before execution; no bypass/retry.
Evidence: tmp/drizzle-a5a-{initial,fixed}-app.log/.exit.

## Native Storage Coverage

Actual app/service/SQLite/files/protocol, no production bootstrap or window:
four missing outcomes; SELECT stage/identity before FS including content catch
boundary; old-versus-new real-file traces and deterministic clocks/UUID; content
bytes/cache, file error, late prepare/ABORT/query-only/IGNORE; image ArrayBuffer/
Uint8Array bytes/MIME/fallback; actual note-asset fetch and resolver/existence
separation; markdown/assets cleanup, swallowed unlink error, late DELETE effects;
actual NULL-list partial batch; outer rollback and real deferred-FK COMMIT failure.
The latter explicitly proves SQL rollback does not restore removed/changed files.

No claimed fixes to existing false-save/dual-store/backup/path policies or future
notes output types/UI; remaining queries need separate reviewed slices.

## Independent Review And Serial Acceptance

The original independent reviewer reports no product/test finding or edit after
the parent/implementer harness lifecycle correction. The complete diff covers
helper/service/oracle/focused/native/app, runner/config/ratchet and governing docs.
AST proves7old orchestration/map/list/batch functions plus countWords unchanged
after type erasure and all159prior native top-level statements preserved/in order.
UTC6files164 focused/caller tests, both TypeScript programs and scoped9lint/format
pass. Ten independent runner probes prove old coach/node defaults, notes split
and env/cleanup ordering, primary/secondary/undefined errors and rejected invalid
cleanup targets. A post-interruption closure reviewer independently inspects the
final diff and preserved evidence; see research/a5a-implementation-review.md.

Parent serial test:db exits0:42files1109tests plus native65 and real-app21.
It retains historical21/24/29 upgrades, actual backup/import, legacy/Drizzle
forced-exit/recovery and actual transaction failures. Unchanged730-day warmed
recompute benchmark is1.34ms against the original<50ms gate.

On2026-11-28 test:all exits0:226files2852tests, native65, real-app21 and UI16.
Both typechecks, full lint, architecture/security, docs/packaging, native
backup/recovery, startup/userscript/OJ bridge and renderer performance pass.
Coverage is76.94% statements/70.67% branches/74.28% functions/80.15% lines;
duplication1.76%. Unchanged recompute benchmark1.41ms<50ms. build:check exits0,
including packaged-main better-sqlite3 externalization. No installer/release.

All823product/config/test hashes remain stable through these gates, all53protected
paths match integrated299b0e3, original D62dirty/HEAD20ee62c are unchanged.
Evidence: tmp/drizzle-a5a-{db,all,build}.log/.exit and gate-source.json.
The old A4b2 Tooltip incident does not recur; this is not proof of its root cause
or a repair. Preserve trusted-event/simultaneous-state requirements on recurrence.
