# Local Backup Helpers

## Responsibility / 职责

Keep recovery metadata and pre-normalization config bytes local without parsing/decrypting confidential config values or treating a narrow copy as a whole-profile snapshot.

## Current implementation / 当前实现

`config-normalization-backup.ts` exports:

```ts
readConfigNormalizationSource(userDataDir: string): Buffer | null
createConfigNormalizationBackup(userDataDir: string, original: Buffer): string
writeNormalizedConfigWithBackup(userDataDir: string, original: Buffer, serialized: string): void
```

The source path is fixed to `<userData>/config.json`. Verified originals live in `<userData>/config-normalization-backups/config-before-normalization-<sha256>.json`. A matching copy is reopened and byte-compared before reuse. Exclusive `.partial` writes are flushed and reopened before promotion; normalized config is staged in the profile directory and renamed only after the original is checked again. No in-place fallback, automatic restore or retention deletion occurs.

`migration-checkpoint.ts` exposes schema-validated `readMigrationCheckpoint(databasePath, backupDirectory?)`, `writeMigrationCheckpoint(databasePath, backupDirectory, record)` and unresolved-attempt validation. `electron/db/connection.ts` and `electron/backup/sqliteMigrationBackup.ts` retain database ownership. Prepared/restoring/restored/restore-failed states block startup even when no migrations remain.

`upgrade-maintenance-command.ts` strictly parses the current-profile-only `--resolve-upgrade=<UUID> --resolution=keep-current|retry-source` invocation. It supplies local instructions; actual database verification and explicit resolution live in `src/main/db/resolve-upgrade.ts`. No flag accepts another profile, database or backup path.

`upgrade-resolution-audit.ts` validates failure-marker/checkpoint identity, verified resolution audits and preserved legacy-marker associations. Both maintenance resolution and normal startup use these checks. A resolved checkpoint alone does not unlock startup when its protected data copy or audit is missing or inconsistent. The exact archived failure marker remains discoverable if startup stops between marker archival and the next checkpoint.

## Callers / 入口

`electron/app/config.ts` calls the config helper only when an existing readable config needs automatic normalization. Canonical, absent and invalid-JSON files are not rewritten or backed up. Explicit settings saves retain their electron-store contract.

## Boundaries / 边界

Backup/write/read/verification failures leave the source untouched and preserve the in-memory fallback. Config diagnostics use fixed reasons, never parser messages, paths or envelope values. Linked/multiply-linked files and symlink/junction components are refused. POSIX permissions are owner-only; Windows uses the inherited profile ACL. `.partial` material is never a verified recovery point. No guarantee is made against hostile concurrent filesystem changes or all forms of power loss.

## Verification / 验证

`pnpm exec vitest run tests/app/configNormalizationBackup.test.ts` exercises synthetic raw/encrypted bytes, canonical/corrupt/missing files, permission/disk faults, reopen corruption, stale sources, linked paths and normal save behavior on isolated temporary files. `pnpm typecheck` and `pnpm typecheck:tests` check signatures. Native database recovery and actual installer acceptance remain separate verification work.
