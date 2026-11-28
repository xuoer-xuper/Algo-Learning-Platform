# A5e Native And Real-App Test Implementation

2026-11-28. Explicit C worktree, branch `codex/drizzle-notes-create`, base4fe73b3.
Native worker owns only this report and the two test files below. Core owns
production/oracle/focused tests; parent owns runner/spec/ratchet, serial native
and global gates/Git. No recursive delegation or original D worktree operations.

## Changes

- `algo-electron/tests/db/repositories.test.ts`: append seven groups to81,
  expected native total88. Import only the query helper and independent oracle;
  no actual NoteService/storage import under RUN_AS_NODE.
- `algo-electron/tests/electron/notes-file-path-storage.test.ts`: append eight
  groups to36, expected real-app total44. Load the create oracle dynamically
  after isolation; add a create-local observer without editing the existing
  statement classifier, observers, case bodies, root/ready/protocol or cleanup.

Native differential fixtures extract frozen030 notes DDL and both explicit
indexes from the migrated fixture. They assert eager prepare/payload getter order,
nine exact raw bindings and repeated-now identity, native result/error identity,
scalar/storage classes, array-order negative control and distinct first-invalid
TypeError/RangeError, all126 combined null/undefined masks before uniqueness,
nullable/repeated IDs, literal deleted_at NULL, trigger NEW fields/rowids and both
timings of IGNORE/FAIL/ABORT. Additional groups cover safe-integer results, exact
4MiB multibyte body, query_only/actual readonly/closed/reinitialized explicit
handles, caught savepoint rollback and actual deferred-FK COMMIT failure.
The readonly fixture closes handles before checked lexical/real-parent,
nonsymlink, owned-prefix removal. The helper emits no events or reads clock/UUID.

Actual-app differential cases compare real create with the frozen service using
contained standalone/orphan paths, all three types, empty/body/header variants,
full database and constructed return fields/key order. They cover all three
parent/title reads, listener mutation/reentrant metadata, prepare/second/third
getter and run failures, UUID collision overwriting the existing Markdown before
native uniqueness failure, IGNORE/FAIL/ABORT audit/notification outcomes, ignored
native result getters/undefined results, query_only/damaged-column error stages,
rollback/return-getter/savepoint/real COMMIT failures and successful scoped commit.
Late failures preserve files and existing assets; rollback discards scoped topics,
not files. No hostile filesystem path components are used. Listener-error handling
remains a focused core-suite responsibility, avoiding logger writes in file traces.

## Checks Run And Freeze

Node22.23.2, package cwd. Scoped Prettier write and ESLint both exit0; logs and
exit files are `tmp/drizzle-a5e-native-format.*` and
`tmp/drizzle-a5e-native-lint.*`. Existing-file formatting is syntax/whitespace
only; historical statements and classifiers must pass the parent AST gate.

Initial frozen SHA256:

- repositories.test.ts: `0A24241438E4EF9C35F4BD6E0ED92C2E8662642F092BF98A61284B01AAE36F18`
- notes-file-path-storage.test.ts: `3977D135C124613AE1A06C7C1E75E9DC4001409A91048A6CB20B67144A4613DE`

No native/app/DB/global/typecheck/build/install/rebuild or Git command was run by
this worker. Counts are expected registrations, not a pass claim. Parent serial
execution and independent review remain required. Feasibility197 is not counted
as this implementation's permanent acceptance. Frozen030 explicit-NULL scope and
the accepted trigger spool costs are unchanged; no arbitrary-DDL parity claimed.
