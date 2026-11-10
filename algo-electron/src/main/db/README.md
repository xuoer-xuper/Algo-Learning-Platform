# Database Safety Helpers

## Responsibilities / 职责

The native connection and frozen migrations remain in `electron/db/`. These
main-process-only helpers implement verification without importing Drizzle or
moving the application query layer.

## Current Implementation / 当前实现

- `legacy-ledger-validation.ts`: strict ordered ledger parsing, known-prefix
  validation, integrity/FK checks, and exact source schema fingerprints. Optional
  views and triggers are included in a source fingerprint, not silently discarded.
- `migration-diagnostics.ts`: secondary cleanup/logging diagnostics associated
  with the original thrown object; reporting failures never replace that object.
- `resolve-upgrade.ts`: verifies the current profile against a known source or
  reconstructed target, protects current data and records explicit resolution.
  It also associates verified legacy failure markers with preserved raw audits.

## Entry Points / 入口

`readDatabaseState` describes a database; it does not certify a target schema.
`validateDatabaseState` checks integrity and exact ledger/schema identity against
an independently established source or target. Recovery must not bless a target
just because its own current ledger says the migration has run.
`inspectUpgradeRecovery(userData)` only describes verified recovery instructions;
`resolveUpgrade(userData, { attemptId, resolution })` implements `keep-current` or
`retry-source`. Main owns the single-instance lock and restart/exit lifecycle.

## Boundaries / 边界

Checkpoint persistence is in
`src/main/services/backup/lib/migration-checkpoint.ts`; snapshot and recovery-file
handling is in `electron/backup/sqliteMigrationBackup.ts`. Only initialization
owns automatic restoration. No helper authorizes rollback after normal business
use, and SQLite snapshots are not complete profile backups.

## Verification / 验证

Focused tests are `tests/db/databaseInitialization.test.ts`,
`tests/db/sqliteMigrationBackup.test.ts`, `tests/db/migrationCheckpoint.test.ts`,
`tests/db/migrateLogging.test.ts` and `tests/db/resolve-upgrade.test.ts`.
`tests/db/migrationInterruption.test.ts` kills real Electron child processes at
four migration boundaries and checks explicit recovery and later data retention.
Historical fixtures and native ABI tests remain separate from installer acceptance.
