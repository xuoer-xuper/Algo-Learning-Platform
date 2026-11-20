# Research: Released upgrade safety and Drizzle migration synchronization

- Query: What is the minimal safe integration of released v2.0.1 checkpoint, restore and explicit resolution with the Drizzle migration lifecycle?
- Scope: internal, with the locally installed pinned Drizzle implementation as an external-library reference.
- Date: 2026-11-17
- Workspace: `C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform`.
- Active task: `.trellis/tasks/09-17-phase-3-main-process`.

## Findings

### Implementation decision

Use a versioned composite migration attempt, not a connection-only merge. Preserve the released format-1 contract and existing records. Add format 2 for attempts involving Drizzle, recording validated source Drizzle history and an exact target Drizzle prefix. Preserve the released unconditional failure block, recovery-set preservation, verified backup, and explicit resolution.

No application schema migration is needed. Freeze legacy 001-030, baseline SQL/meta and compiled identity. Do not touch query slices, application version, tags or release assets. A2d problem deletion follows this safety prerequisite separately.

### Critical gaps

1. `algo-electron/src/main/db/migrate.ts:20` and `algo-electron/src/main/db/migrate.ts:119` plan both histories. `pendingKeys` includes `legacy:<version>` and `drizzle:<tag>`: Drizzle can advance with legacy source and target both 30.
2. `algo-electron/src/main/db/legacy-ledger-validation.ts:20` defines strict `DatabaseState` as legacy ledger plus physical schema hash. `algo-electron/src/main/db/legacy-ledger-validation.ts:75` omits Drizzle ledger rows. A Drizzle-only data migration may change neither field. Schema hash is not Drizzle migration identity.
3. `algo-electron/src/main/services/backup/lib/migration-checkpoint.ts:25` stores format-1 source and legacy `targetLedger` only, so cannot express a baseline-only/later Drizzle target.
4. `algo-electron/src/main/db/resolve-upgrade.ts:105` rejects source legacy length at/beyond the known length. `algo-electron/src/main/db/resolve-upgrade.ts:314` requires a strictly longer target legacy history. Both reject valid source-30 Drizzle upgrades.
5. `algo-electron/src/main/db/resolve-upgrade.ts:250` reconstructs only the recorded legacy range. It needs version-aware bounded Drizzle replay, not replay of whatever the newest binary knows.
6. `algo-electron/src/main/services/backup/lib/upgrade-resolution-audit.ts:12` strictly parses legacy markers without `pendingMigrationKeys`; the Drizzle side of the conflicted backup module has these keys. Dropping keys, ignoring empty pending legacy, or retaining key-intersection unblocking loses safety.

### Recommended persisted contract

Use explicit versioned unions for persisted containers. The names below are illustrative; the information/invariants are required:

```ts
type DrizzleIdentity = { tag: string; when: number; sha256: string }
type CompositeDatabaseState = {
  ledger: LegacyLedger
  schemaHash: string
  drizzleLedger: null | readonly DrizzleIdentity[]
}

type CheckpointV2 = {
  formatVersion: 2
  source: CompositeDatabaseState
  targetLedger: LegacyLedger
  targetDrizzle: readonly DrizzleIdentity[]
  // Existing attempt identity, paths, times, states and recovery fields remain.
}
```

- Keep format 1 and its strict legacy source shape unchanged. Do not add optional fields and silently reinterpret old records as composite attempts.
- `null` denotes absent Drizzle ledger; `[]` denotes an existing empty ledger. Schema hash also distinguishes these, but explicit representation makes the source meaning clear.
- Drizzle stores hash and `created_at`, not tag. Derive tag only by matching validated DB rows to trusted compiled identities; validate ledger physical definition first. Checkpoint input cannot supply SQL or resource paths.
- Legacy source/target must be known contiguous prefixes, with source a prefix of target. Drizzle source/target must match exact ordered trusted identities. Neither history may regress, and at least one must strictly advance. A Drizzle target requires completion of frozen legacy baseline.
- Thus source-30 to target-30 is valid in format 2 when Drizzle advances. Do not relax the format-1 strict legacy extension rule to manufacture this case.
- Version backup verification sidecars and resolution audit containers too when they carry composite state. Preserve their format-1 readers. Backup verification, retention, restore and audits must not silently drop composite source fields.
- Existing format-1 completed, unresolved and resolved checkpoints/audits stay readable and are not rewritten just because a new binary runs. A genuine later attempt may archive a terminal record using the current durable protocol.
- Preserve comparison of schema and migration identities rather than whole-current-DB bytes. `keep-current` must still preserve legitimate subsequent user rows.

### Resolution by version

**Format 1:** Preserve released legacy-only semantics. Verify original backup and recorded legacy target; replay only that range. Do not adopt Drizzle while resolving the old attempt. In particular, a legacy-28 to legacy-29 checkpoint resolves at 29 even if the new binary knows legacy 30 and Drizzle. A subsequent normal startup performs remaining migration in a fresh protected attempt. Defer schema-dependent cleanup for historical targets.

**Format 2:** Accept source legacy 30 with a known Drizzle prefix. Verify source state, target identities, snapshot hash and recovery set. Reconstruct the exact recorded legacy-plus-Drizzle target into an exclusive disposable copy. `keep-current` compares current schema and both histories to that target without replacing user rows. `retry-source` compares to the source and records explicit permission for a later fresh protected attempt.

Both versions retain attempt-id binding, canonical profile/path checks, original marker byte audit, current-state backup before resolution, prepared/verified audit, and refusal to switch an already verified resolution choice.

### Bounded replay and resource provider

`algo-electron/src/main/db/migrate.ts:148` reloads and applies the complete supplied set via the official migrator. `algo-electron/src/main/db/migration-resources.ts:61` requires exact SQL file set and journal agreement. Passing a shorter expected prefix against the unchanged full folder therefore fails. Applying the current full folder can migrate beyond an older checkpoint target.

Recommended minimal replay procedure:

1. Resolve current dev/packaged resources through the same trusted provider as startup. Tests may inject a trusted provider; checkpoint content must never select a folder or SQL.
2. Fully validate current resources against compiled identities. Check recorded source/target against exact known prefixes.
3. Within the exclusive disposable reconstruction directory, stage only the verified target SQL prefix and matching journal prefix. Preserve upstream journal semantics. Validate the staged resource set again against the recorded prefix, already compared to compiled identities.
4. Replay legacy only through recorded target. For a format-2 Drizzle target, use existing baseline adoption plus official migrator against the bounded staged folder.
5. Check both histories, schema and integrity. Delete only successfully verified disposable reconstruction; preserve failed evidence. Never modify original backup or production resources.

A narrow equivalent target-prefix helper is acceptable only if it preserves official behavior and resource validation. If bounded replay cannot be proven, fail closed explicitly. Never replay latest or validate only legacy target.

Production currently has baseline only, but tests exercise later migrations and persisted attempts outlive the creating binary; bounded target semantics are required now.

### Marker compatibility and lifecycle

- Keep the release's unconditional unresolved checkpoint/marker block, even with no current pending migration. Do not retain the old Drizzle key-intersection unblocking rule.
- Pending keys remain evidence, not permission to ignore a marker. Explicitly parse the known optional `pendingMigrationKeys` extension and validate exact source-to-target suffix relationships. Never silently strip unknown fields.
- A Drizzle marker without checkpoint may be associated with a new explicit format-2 recovery record only when verified backup plus ordered keys prove a known exact composite source/target. Preserve original raw-byte audit association. If the target cannot be proved, retain the block. Empty pending legacy is not success.
- Before normal DB open: durable unresolved gate and trusted-resource validation. Then inspect the full known composite state.
- For any pending legacy OR Drizzle key: standalone verified source backup, durable prepared checkpoint, then legacy, baseline and subsequent Drizzle in one protected initialization attempt.
- Mark completed only after both target histories, orphan cleanup and integrity pass. Restore the whole original source for failures inside that window, not merely the last migrator transaction.
- Preserve restoration intent and displaced main/WAL/SHM. Retention stays best-effort after successful startup; global connection assignment remains last. Do not roll back unrelated later service failures.
- Explicit `options.migrations`, including `[]`, remains legacy-only and must not require default Drizzle resources. Such injected attempts may stay format 1.

### Owner files

One core worker should own this cohesive runtime set; independent changes to its persisted contract and callers risk a false-green merge:

| File | Responsibility |
| --- | --- |
| `algo-electron/electron/db/connection.ts` | Resolve lifecycle conflict; combined plan, protected attempt, exact target verification and recovery. |
| `algo-electron/electron/backup/sqliteMigrationBackup.ts` | Resolve backup conflict; unconditional durable gate, composite verify/restore/sidecar/retention, evidence preservation. |
| `algo-electron/src/main/db/migrate.ts` | Expose validated source identities or narrow helpers; preserve prefix/schema validation and official migrator. |
| `algo-electron/src/main/db/migration-resources.ts` | Trusted resource provider/bounded replay support only if needed; frozen identities remain. |
| `algo-electron/src/main/db/legacy-ledger-validation.ts` or a narrow adjacent composite-state module | Preserve v1 shape; define/read/compare composite state without weakening legacy checks. |
| `algo-electron/src/main/services/backup/lib/migration-checkpoint.ts` | Strict v1/v2 union and version-specific progression/state handling. |
| `algo-electron/src/main/services/backup/lib/upgrade-resolution-audit.ts` | Versioned audits and explicit marker compatibility; exact evidence binding. |
| `algo-electron/src/main/db/resolve-upgrade.ts` | Version-aware validation, trusted resources, bounded reconstruction, explicit resolution. |

Parent can resolve documentation/spec indexes, READMEs, lockfile and architecture/test-runner conflicts separately, while preserving runtime resource packaging. No migration-directory move or broad service refactor is needed.

### Required regression matrix

| Scenario | Expected |
| --- | --- |
| Released v1 completed | Startup works; a real Drizzle upgrade gets a new protected record. |
| Released v1 prepared/restoring/failed, including no pending SQL | Startup blocks until verified explicit resolution. |
| Released v1 resolved-keep-current / resolved-retry-source | Original audit/hash/raw marker association stays valid without record rewrite. |
| Historical v1 legacy 28 to 29 | Resolve at 29 only, then separately protect 30 plus baseline on normal startup. |
| Legacy 30 without Drizzle ledger | Baseline gets backup + v2 checkpoint despite empty pending legacy. |
| Existing empty Drizzle ledger | Source is distinguished from absent table; adoption remains protected. |
| Drizzle-only data migration with unchanged schema | Exact Drizzle history distinguishes source and target. |
| Later Drizzle failure after legacy success | Restore whole pre-attempt source and retain durable block. |
| Death before/after baseline or after Drizzle commit before completed | Restart blocks even when pending keys are empty. |
| keep-current after new user rows | Verify exact target without losing those rows. |
| retry-source after source restoration | Verify exact source, audit/backup it, then allow fresh protected attempt. |
| Older recorded Drizzle target, newer current resources | Reconstruct only recorded prefix; never execute later migrations. |
| Wrong/missing/gapped/duplicate history, hash/time, schema, backup or audit | Refuse without clearing marker or blessing partial target. |
| Old pendingMigrationKeys marker without checkpoint | Explicitly validate/associate only a provable composite target; otherwise preserve block. |
| Explicit legacy override including [] | Existing seam works without packaged Drizzle resources. |
| Native/packaged lifecycle | Trusted resolution provider matches startup; missing/modified resources fail before mutation. |

Tests, all relative to `algo-electron/`: `tests/db/drizzleMigrationSafety.test.ts`, `tests/db/drizzleMigrationValidation.test.ts`, `tests/db/drizzle-migration-test-helpers.ts`, `tests/db/resolve-upgrade.test.ts`, `tests/db/migrationCheckpoint.test.ts`, `tests/db/databaseInitialization.test.ts`, `tests/db/sqliteMigrationBackup.test.ts`, `tests/db/migrationInterruption.test.ts`.

### Files found and reusable patterns

- `algo-electron/src/main/db/migrate.ts:41`: strict legacy physical-ledger/contiguous-prefix/timestamp validation; rejects populated DB with missing/empty history.
- `algo-electron/src/main/db/migrate.ts:98`: validates Drizzle physical ledger and exact hash/time prefix before upstream timestamp-based migrator.
- `algo-electron/src/main/db/migrate.ts:119`: requires post-030 schema for absent/baseline-only Drizzle; rejects Drizzle ledger before legacy completion.
- `algo-electron/src/main/db/migrate.ts:148`: revalidates trusted resources immediately before application; baseline adoption records identity without recreating application tables.
- `algo-electron/src/main/db/migration-resources.ts:21`: frozen baseline tag `0000_baseline`, time `1794022401703`, hash `b92f46f0e3cf2258b73dd4c1845c4646640b2f7d98309ef96d681bbf2bc20216`.
- `algo-electron/src/main/db/schema-validation.ts:200`: post-030 validation excludes only Drizzle ledger, rejects extra views/triggers; preserve these stronger checks.
- `algo-electron/src/main/services/backup/lib/migration-checkpoint.ts:110`: only completed and two verified resolution states are terminal; unresolved attempts cannot be overwritten.
- `algo-electron/electron/backup/sqliteMigrationBackup.ts:193`: standalone snapshot hash/integrity/state verification is the recovery trust boundary.
- `algo-electron/electron/backup/sqliteMigrationBackup.ts:227`: partial backup, reopen/verify, fsync, rename and durable verified sidecar; retention is deferred.
- `algo-electron/src/main/services/backup/lib/upgrade-resolution-audit.ts:80`: current marker binding compares pending legacy suffix; v2 also needs composite suffix binding.
- `algo-electron/src/main/db/resolve-upgrade.ts:372`: skips current-schema cleanup for historical legacy targets; retain this and consider bounded Drizzle target suitability.

### Related specs and task artifacts

- `.trellis/workflow.md`: persist research and validate narrow slices before proceeding.
- `.trellis/spec/project/drizzle-adoption.md`: pinned versions, frozen baseline, full history/schema checks, Drizzle-only backup/restore/retry safety, lifecycle ownership.
- `.trellis/spec/project/upgrade-recovery.md`: durable attempts, standalone verified backups, explicit resolution, evidence preservation, no silent unblock.
- `.trellis/spec/backend/database.md`: connection ownership, SQLite and synchronous transactions.
- `.trellis/spec/project/regression-checks.md` and `.trellis/spec/project/historical-database-fixtures.md`: native/runtime and historical coverage.
- Task `prd.md`, `design.md`, `implement.md`: A0/A1/A2a/A2b/A2c precede A2d; this safety synchronization is separate from the next query conversion.

### External references and versions

- `algo-electron/package.json:69`: drizzle-orm 0.45.4. `algo-electron/package.json:97`: drizzle-kit 0.31.11.
- Local installed `algo-electron/node_modules/drizzle-orm/better-sqlite3/migrator.js`: reads migration files and delegates to dialect migrator. Preserve that official execution path for bounded replay.
- Background docs: https://orm.drizzle.team/docs/migrations and https://orm.drizzle.team/docs/get-started-sqlite . These pages were not fetched; evidence comes from pinned local source and repository specs/tests, not assumptions about current online releases.

## Caveats / Not Found

- Research only: no code edits, tests, builds, installation, Git operations or release actions were performed. Only this research file was written.
- Source was inspected during a parent-owned merge. Conflict-side line numbers are snapshot anchors and may shift; file/function names are durable references.
- Format 2 and bounded replay are recommendations, not implemented/verified behavior. Runtime and regression verification remain necessary.
- Some old Drizzle markers may not prove a unique known target. No safe automatic association is established for that case; retain the block instead of guessing.
- Compatibility applies to every persisted consumer: checkpoint, backup sidecar/retention, restore, marker association, resolution audit and repeat resolution, not just the checkpoint parser.
- This design intentionally does not hash mutable user rows. Exact migration history and physical schema remain the recovery contract; physical schema alone cannot prove a Drizzle-only data migration ran.
