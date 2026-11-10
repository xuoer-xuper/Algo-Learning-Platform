# Backup Safety Helpers

## Responsibility / 职责

Provide narrow local protection helpers used by the existing main-process config and database owners. A config recovery copy and a SQLite recovery point protect different data.

## Current implementation / 当前实现

- `lib/config-normalization-backup.ts` protects original config bytes before automatic normalization, verifies staged output and refuses unsafe paths or in-place write fallback.
- `lib/migration-checkpoint.ts` contains typed local migration-attempt records. Its database lifecycle integration and recovery acceptance are still in progress; the helper's presence is not release approval.

## Entry points / 入口

- Config: `readConfigNormalizationSource`, `createConfigNormalizationBackup`, `writeNormalizedConfigWithBackup`.
- Migration metadata: `readMigrationCheckpoint`, `writeMigrationCheckpoint`, `assertNoUnresolvedMigrationCheckpoint`. The existing `electron/db/connection.ts` remains the database lifecycle owner.
- Detailed file boundaries: [lib/README.md](lib/README.md) and [legacy backup adapter](../../../../electron/backup/README.md).

## Boundaries / 边界

No generic whole-profile backup, script/session rollback, decryption, uploading or production path override. Notes/images and script files are not captured by a SQLite snapshot. A pre-normalization config copy never includes or replaces later user settings.

## Verification / 验证

```powershell
pnpm vitest run tests/app/configCompatibility.test.ts tests/app/configMigration.test.ts tests/app/configNormalizationBackup.test.ts tests/db/credentialExport.test.ts
pnpm typecheck
pnpm typecheck:tests
```

Run database fault and native integration suites separately after their implementation is stable; focused config tests are not proof of database/installer recovery.
