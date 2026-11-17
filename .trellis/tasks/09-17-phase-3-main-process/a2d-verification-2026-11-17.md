# A2d problem deletion: verification

Status: implementation, independent review, full local gates and build check passed.
Commit/push/remote CI integration pending; not a release or whole-phase completion.

## Boundary

- Work branch `codex/drizzle-problem-delete`, based on accepted safety merge `317cd9f`.
- Production scope: four-branch affected-instant UNION and four DELETEs in
  `electron/db/repositories/problem/mutations.ts`; upsert and other queries unchanged.
- Same native connection, native transaction and notification scopes. Raw stored
  instant validation, exact IDs/tombstones, missing-parent orphan removal and
  post-inner-transaction statistics behavior are preserved.
- No schema, migration, DTO, IPC, directory-layout, release/version or actual-user
  profile changes. Original D-drive workspace stays untouched.
- Research and independent precheck: `research/a2d-problem-delete.md`.

## Required proof

- Independent original-SQL oracle and real SQLite row/error/event/warning checks.
- Invalid/raw time rejection, local-day/DST/epoch0/negative values, nullable/empty/
  literal IDs, tombstones, missing parent, notes and close/reinitialization.
- Actual deferred-FK COMMIT failure, savepoint/outer rollback and ordered events.
- Per-day statistics partial failure leaves deletion and earlier days committed.
- Focused Vitest, both typechecks, lint/architecture, test:db including native ABI,
  full test:all and normal hooks/remote CI. No output is claimed before execution.

## Handoff

PR8 stays draft againstdev; this bounded query slice does not complete phase3 or
publish a new version. DTO-returning reads and later domains remain separate work.

## Preliminary execution

- Implementer: both typechecks and scoped lint passed; deletion41 + upsert35 +
  notifications11 =87 focused tests passed in normal timezone. Its initial New York
  run selected only the38 differential cases and passed, including23-hour DST.
- Parent: native repository suite17/17 passed, including two new deletion cases
  (post-COMMIT events/affected dates/notes, actual deferred-FK COMMIT rollback).
- Parent ran the entire deletion file in America/New_York:39 passed and2 original
  fixed-UTC+8 fixture cases failed because hardcoded day keys disagreed with local
  dates. This is retained as a real test portability finding, not a product failure
  or ignored success. Checker owns replacing those current-schema fixture instants
  with local calendar construction and must rerun the whole file, without filtering.
- Logs: `algo-electron/tmp/drizzle-a2d-native.log`,
  `algo-electron/tmp/drizzle-a2d-dst.log` (initial failure retained).

## Final local validation

- Independent review: no remaining actionable issue; see
  `research/a2d-problem-delete-review.md`. Test errors now compare actual thrown
  name/message/native code rather than stripping cause chains.
- Full deletion file41/41 in Asia/Shanghai and America/New_York after local fixture
  correction; New York includes the23-hour DST assertion, without selection/skips.
- `pnpm test:db`:30 files/341 tests, native repositories17/17, historical migration
  and both real forced-kill matrices all passed.
- `pnpm test:all`:206 files/2005 tests, UI11/11, native suites, architecture22/22,
  packaging12/12, docs, security, performance, lint and both TypeScript checks passed.
  Coverage: statements75.70%, branches69.73%, functions72.93%, lines78.86%.
- `pnpm build:check`: passed, including packaged-main native external guard.
  Existing bundle-size and fallback resource URL warnings remain; this is not a
  fresh installer build or NSIS installation acceptance. Safety-sync build evidence
  belongs to its own earlier snapshot, not this A2d output.
- Logs: `algo-electron/tmp/drizzle-a2d-{db,all,build}.log`; independent timezone logs
  `drizzle-a2d-review-{shanghai,new-york}.log` retain the corrected full-file runs.
