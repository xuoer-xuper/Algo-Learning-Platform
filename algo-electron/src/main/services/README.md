# Main-process Services

## Responsibility / 职责

This directory holds bounded new main-process service helpers in the target layout. Existing service entry points under `electron/` retain ownership; this is not a general relocation of those domains.

## Current implementation / 当前实现

- `backup/lib/` contains local config-normalization protection and the migration-checkpoint helper being integrated for release safety.
- Database opening, migration execution and recovery remain owned by `electron/db/connection.ts` and `electron/backup/sqliteMigrationBackup.ts`.

## Entry points / 入口

See [backup/README.md](backup/README.md) for the current helper surface. These helpers are main-only and are not renderer or generic filesystem APIs.

## Boundaries / 边界

No whole-profile snapshot feature, cloud backup or automatic rollback after successful use is implemented here. Never log sensitive config/database contents or accept renderer-selected recovery paths.

## Verification / 验证

From `algo-electron/`, run `pnpm typecheck`, `pnpm typecheck:tests` and the targeted tests documented in the backup directory. Full native/packaged release acceptance remains a separate gate.
