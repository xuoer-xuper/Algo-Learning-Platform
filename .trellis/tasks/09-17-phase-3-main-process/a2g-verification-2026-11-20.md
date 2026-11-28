# A2g Recent Problems Verification

Date: 2026-11-20. Base: `32cd84d`; branch `codex/drizzle-recent-problems`.
This records a bounded problem-query/UI compatibility slice, not phase3 completion
or release acceptance. Original D worktree and published2.0.1 remain unchanged.

## Contract And Implementation

- Independent research/precheck approved the exact route-ID policy and typed
  LIMIT placeholder. DB migration preserves whole rows and native errors;
  disabling invalid internal actions is an explicit UI behavior correction.
- `getRecentProblems` now uses real Drizzle builders over the current connection,
  with raw nullable timestamp, original status/count/tombstone/order semantics,
  and SQL LIMIT before the existing JS status filter. No transaction or events.
- Recent ID/time are nullable; shared detail ID stays explicitly string. The
  unchanged main predicate is shared with sidebar and both main route branches.
  Every row/site action stays; invalid notes/detail buttons have persistent
  visible explanation and accessible ListRow labels. Both lists use tuple keys.
- No schema, migrations001-030, baseline/meta, dependency/version, route/input,
  recovery protocol, unrelated domain queries or generic UI primitives changed.

## Local Evidence

- DB implementer focused5 files183 tests; both typechecks and focused lint passed.
  Independent frozen recent SQL oracle covers41 cases, including17 limit values.
- UI implementer focused119 plus35 primitive/governance/transition tests passed;
  both typechecks and scoped lint passed. Existing transition warnings remain.
- Parent `pnpm test:db`:32 files474 tests, native Electron repositories23/23 and
  both real forced-termination matrices passed. Native recent case compares all
  17 LIMIT bindings plus null rows, status horizon, read-only and transactions.
- Parent `pnpm test:all`:210 files2157 tests, UI14/14, repositories23/23, both
  typechecks, zero-warning lint, architecture/security/docs/packaging/performance,
  native startup/userscript/OJ trust-boundary smokes and crash matrices passed.
- Coverage75.78% statements/69.86% branches/73.03% functions/78.92% lines.
  Production duplicated lines1.74%, below the unchanged3% tool gate.
- New actual Electron UI test passed at1280x800,1024x720,800x600. Parent inspected
  wide/narrow screenshots: explanation wraps, disabled icons visible, no notice
  overflow, URL/keyboard navigation retained. UI uses synthetic mocked preload,
  not a claim of private-data or installer acceptance.
- Logs: `algo-electron/tmp/drizzle-a2g-{db,all,build,ui-focused}.log`.
  Screenshots: `algo-electron/tmp/recent-problem-actions-ui/invalid-ids-*.png`.

## Independent Review And Final Build

- Full-diff reviewer found no actionable issues and made no product/test fixes.
  Both typechecks, scoped lint and independent9 files161 tests passed; frozen
  oracle/body extraction and bounded cross-layer contracts independently checked.
- `pnpm build:check` passed including packaged-main native external guard.
  Existing bundle/resource fallback warnings remain; no installer was built.
- Product/test source hashes stayed stable during final gates. Original D
  HEAD20ee62c and all62 dirty file hashes match the preserved baseline; frozen
  schema/migrations/baseline, dependency/version and dev/master/tag are unchanged.

## Remote Acceptance

- Work commit377cf4f23aa67ceaad79d9fcb74654f730dc66a3 passed normal hooks and
  immediate push's full test:ci2157/UI14; no bypass. Hook normalization changed
  only line endings in the screenshot harness; its Git blob remained identical.
- PR21 CI44675893865 passed both required jobs; manual jobs skipped by design.
  Squash6c42a381e5256ba1ccfc69414bc6dbd57a8f6306 merged into refactor/drizzle;
  its tree equals the tested feature commit. PR8 CI44676609924 then passed.
- PR8 remains draft/base dev; dev/master/public2.0.1 untouched. No installer or
  release is claimed. A3a research/precheck is ready and implementation continues
  separately on codex/drizzle-submission-reads. Remaining main-layout/splits and
  later phases are still incomplete, so the phase3 task is not archived.
