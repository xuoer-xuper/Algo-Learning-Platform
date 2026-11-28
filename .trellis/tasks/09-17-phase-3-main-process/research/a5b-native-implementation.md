# A5b Native And Real-App Test Additions

- Date: 2026-11-28 (Asia/Shanghai).
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform.
- Base: 41ef2e6; branch codex/drizzle-notes-title-type.
- Status: native-test writer frozen; actual Electron execution and independent
  review remain pending parent acceptance.

## Changes

- Append six groups to tests/db/repositories.test.ts, importing only the two
  new query helpers and query-only independent original helpers. No runtime
  NoteService/storage import is added under RUN_AS_NODE.
- Original/builder comparisons use fresh native handles with the actual notes
  DDL from the migrated fixture. Compare results, full DB snapshots and effects;
  helpers must not publish events. New groups cover exact two targets/three
  raw bindings, native result identity including safe-integer bigint rowid,
  same/missing/tombstone/literal/NULL IDs, raw times, actual undefined/null/
  array/object/Buffer/Symbol binding, UPDATE OF/IGNORE/FAIL/ABORT effects,
  injected failures, damaged DDL, query_only/readonly/closed handles, explicit
  connection independence, savepoints and actual deferred-FK COMMIT failure.
- Append eleven real-app groups to tests/electron/notes-file-path-storage.test.ts:
  original and builder metadata-only differential groups, four write failures,
  damaged-column preparation, three transaction outcomes and reentrant/throwing
  listener plus partial-autocommit preservation. Markdown and nested asset paths
  and bytes remain unchanged; direct operations assert no filesystem/UUID work.
- New metadata-only filesystem observer accounts for both rename paths and
  allows legitimate logger activity outside notes during listener-error tests.
  It does not alter the pre-existing observer or file-path assertions.
- Existing tests, isolated root setup, split/deferred imports, teardown and
  parent-after-exit cleanup remain unchanged. No runner or config edit.

## Checks Actually Run

- Node22.23.2 scoped Prettier write/check on the two owned test files: passed.
- Scoped ESLint with unused-directive/max-warning checks: passed.
- No native Electron, full typecheck, global/build, ABI rebuild, dependency
  installation or Git operation was run by this worker. Parent runs serial
  native gates; independent reviewer runs both typechecks after freeze.

## Remaining Gates

Six new native groups should bring the repository runner to 71 groups; eleven
new app groups should bring the existing app suite to 32. These are expected
registration totals, not test-pass claims. Native undefined/container binding,
safe-integer result behavior and real-app storage/COMMIT outcomes must pass
the actual Electron execution before acceptance. Reviewer should confirm all
prior top-level/native and runTests statements remain structural subsequences.
