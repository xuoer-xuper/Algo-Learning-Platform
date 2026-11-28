# A2d problem deletion independent review

Date: 2026-11-17. Base: synchronized Drizzle317cd9f. Scope: minimal deletion
query-builder replacement, original-SQL differential coverage, native cases and
focused-suite registration. Parent owns the final full/native/build/remote gates.

## Findings fixed

1. `tests/db/deleteProblem.test.ts`: three existing tests asserted local calendar
   labels but seeded +08:00 instants. Parent's complete America/New_York run exposed
   two failures (39/41). Replaced all12 fixed-offset current-schema fixture instants
   in this file with local `new Date(year, month, day, hour, minute).getTime()` values,
   retaining the original local times, relative timing, dates and assertions. No
   filters/skips, production time changes or historical-fixture rewrites.
2. The new differential helper recursively unwrapped Error.cause, which could hide
   a changed observable thrown error. The pinned synchronous better-sqlite3 adapter
   directly propagates native errors. Compare the actual thrown name/message and
   native code instead, without cause unwrapping. All differential cases still pass.

Only this test file was changed by reviewer. Production implementation and the
frozen SQL oracle were not modified.

## Review outcome

No remaining actionable issue found in this slice. Confirmed:

- Four matching raw scalar projections feed one distinct UNION, preserving native
  stored values for integer/time validation; malformed values are rejected before
  any deletion. No Date decoding, casting or value coercion was introduced.
- The exact child-before-parent DELETE order and final native changes result are
  preserved. Empty/quoted IDs, nullable stored IDs, tombstones, unrelated rows and
  retained notes are exercised against independent original SQL.
- Missing-parent orphan deletion still returns false and suppresses notifications
  and stats recomputation rather than introducing an existence shortcut.
- Original native transaction and notification scope enclose the actual invocation,
  so deferred-FK COMMIT failure rolls back all deletion and discards topics. Nested
  success, outer callback/COMMIT rollback and caught savepoint rollback preserve
  their existing data and event boundaries.
- Top-level statistics remain post-COMMIT, with individual sorted-day results. A
  second-day failure keeps deletion and first-day results/events, leaves later days
  unchanged, and warns with the complete affected date set.
- The native repository additions exercise real ABI deletion/event behavior and a
  true deferred-FK COMMIT failure, including proof parent DELETE was reached.
- Upsert, schema, migrations, lifecycle protection, DTO/IPC, release assets and
  package versions are outside and unchanged by the production diff.

## Reviewer verification

- Full `deleteProblem.test.ts`, TZ=Asia/Shanghai:41/41 passed (9.86s).
- Full `deleteProblem.test.ts`, TZ=America/New_York:41/41 passed (9.79s), including
  the explicit23-hour2026-03-08 DST assertion. Neither run uses test-name filtering.
- Scoped ESLint for mutation/oracle/deletion/native-repository files: passed.
- Application and test TypeScript checks: both passed.
- Prettier of the changed test and `git diff --check`: passed.
- Logs: `algo-electron/tmp/drizzle-a2d-review-shanghai.log` and
  `algo-electron/tmp/drizzle-a2d-review-new-york.log`.

No reviewer native/UI/full-suite/build/Git/release operation was performed. Parent
reported native17/17 prior to these fixture-only fixes; final full gates remain
parent-owned. Runtime/tests are now frozen for those gates.
