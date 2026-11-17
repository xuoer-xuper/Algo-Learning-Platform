# Release hardening synchronization review

Date: 2026-11-17. Reviewer scope: the complete released2.0.1-to-Drizzle synchronization,
with parent-owned full/native/UI/build/CI acceptance still separate.

## Findings

No remaining actionable runtime or integration finding was identified in the frozen
snapshot. The reviewer made no runtime/test edits. Core implemented the format2
fingerprint correction while review was in progress; attribution must remain with core.

- Confirmed the legacy `NOT LIKE 'sqlite_%'` fingerprint omits legal `sqlitex_*`
  objects using isolated Python in-memory SQLite. The frozen implementation now
  preserves that exact format1 algorithm and uses literal-reserved-prefix GLOB only
  for composite format2. Its real-SQLite regression passed.
- Verified unresolved evidence is checked before opening the target, independent of
  pending keys, and before explicit `migrations: []` could bypass the gate.
- Verified strict versioned checkpoints, backup manifests and resolution audits carry
  Drizzle source/target identities without silently dropping them; absent and empty
  ledger are distinct, exact rows and physical ledger schema are checked.
- Verified format1 target replay stays at its recorded historical range (including
  28-to29), while format2 stages a validated target prefix and calls the official
  migrator against that prefix. Later trusted migrations are not replayed early.
- Verified source30-to-target30 is permitted only with Drizzle advancement; no-op
  composite attempts are rejected. Unknown history/resources and mismatched audit
  or snapshot rows remain blocked.
- Verified keep-current protects/preserves later rows; retry-source records permission
  without migrating; repeat resolution rechecks the expected state and original audit.
- Verified old Drizzle marker association derives a provable exact known prefix from
  the verified source and keys, preserves original bytes, and refuses unknown,
  duplicate, empty or inconsistent keys.
- Verified startup and maintenance share dev/packaged resource resolution; released
  config-protection and publication-tooling sources are unchanged from MERGE_HEAD.
- Frozen legacy001-030, Drizzle SQL/meta and application version remain unchanged.

## Native test review

The existing interruption matrix explicitly selects frozen legacy migrations and
asserts format1 so its committed030 target remains the released contract. The new
suite is native-only, excluded from Vitest and registered serially in test:db/all.
It tests baseline-only and data-only Drizzle work at durable prepared and committed
boundaries. Parent termination is SIGKILL with a flushed rendezvous and close wait,
not voluntary child exit. Wrong resolution fails, default and explicit-empty restart
block, correct resolution preserves later rows, and subsequent restarts are idempotent.
The new suite retains failed-case evidence and deletes only validated successful
scratch directories. No production crash hooks or weakened assertions were added.
Parent reported initial native passes; the reviewer did not run native processes.

## Verification performed by reviewer

- `pnpm run typecheck`: pass.
- `pnpm run typecheck:tests`: pass.
- `pnpm run lint`: pass (full repository lint, zero warnings).
- Focused Vitest: 5 files,110 tests passed in40.25s: resolve-upgrade49,
  drizzleMigrationResources26, drizzleMigrationSafety10, migrationCheckpoint5,
  sqliteMigrationBackup20.
- Architecture runner:22/22 passed.
- `git diff --check`: passed.

## Boundaries

No Git writes, frozen migration regeneration, actual-user profile operation, full
suite, UI, native process, build, NSIS or release operation was performed by reviewer.
Parent must complete final full-suite/build and normal-hook/remote CI validation.
A2d remains separate. This report does not claim publication or whole-phase completion.
