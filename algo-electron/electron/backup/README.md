# Backup And Import

## 1. 职责

`electron/backup/` 负责 Phase 7 的本地备份、学习数据 JSON 导出/导入、导入预览和冲突检测。

JSON export does not include Cookie values, credentials, `raw_json`, logs, local absolute paths or private files. SQLite recovery copies contain the database's sensitive tables as stored, including encrypted envelopes; they are local recovery material, not shareable learning-data exports. Neither operation uploads data or decrypts credentials.

## 2. 当前实现程度

- `backupService.ts`：SQLite 备份、JSON 文件导出、JSON 文件读取、导入预览和确认导入封装。
- `sqliteMigrationBackup.ts`：迁移前备份、轮换和 migration failure 恢复材料；数据库及 WAL/SHM 的多文件恢复不等同于单步原子替换。
- `learningDataExport.ts`：学习数据导出结构、版本校验、冲突检测和 merge 导入逻辑。
- `types.ts`：导出版本、导入预览、冲突、导入结果和备份结果类型。
- `src/main/services/backup/lib/config-normalization-backup.ts`: protects original config bytes only before automatic normalization. This is separate from the SQLite lifecycle.

## 3. 封装入口

- `createDatabaseBackup(targetDir)`：使用 SQLite backup API 生成时间戳 `.sqlite` 文件。
- `createPreMigrationBackup(...)`：应用启动发现 pending migration 时创建、刷盘并独立验证一致性备份；整个初始化成功后才轮换已验证文件，未解决的尝试固定其恢复材料。
- `restoreDatabaseFromBackup(...)`：仅在数据库连接关闭后使用迁移恢复材料；操作约束见 [数据库迁移与回滚策略](../../../docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md)。
- `exportLearningData()` / `exportLearningDataToFile(filePath)`：导出题目、访问、提交、每日统计、账号和 rating 历史。
- `previewLearningDataImport(raw)` / `previewLearningDataImportFile(filePath)`：校验版本、统计新增/重复/冲突。
- `importLearningData(data, overwriteConflicts)`：导入非敏感学习数据；默认遇到冲突不写库。
- `writeNormalizedConfigWithBackup(userDataDir, original, serialized)`: verifies a byte-identical local backup, flushes and reopens a staged config, checks the source is unchanged, then replaces it by same-directory rename. A failed stage or rename never falls back to writing over the original file.

## 4. 边界规则

- `cookie_records`、`sync_queue`、Cookie value、`raw_json`、日志和本机绝对路径不进入普通 JSON 导出。
- 冲突默认阻止导入；只有用户明确确认 overwrite 时才覆盖冲突字段。
- 题目和提交按业务键比较可覆盖元数据，本地 `id` 相同也不跳过冲突检测；提交的 `problem_id` 先映射成本地 ID 再比较。派生状态、首次 AC 和维护时间戳不作为元数据冲突。
- 提交导入会按题目平台 ID 重新映射 `problem_id`，避免跨库本地 ID 不一致导致悬挂引用。
- 所有导入写入与重算在同一事务中。新增或覆盖事实后，按最终提交重建受影响题目的 `status`、`first_solved_at`，再通过统计 repository 重算访问、提交及首次 AC 的新旧日期；重算失败整次回滚。
- 每日统计快照仍参与预览和冲突确认，但最终值以合并后的事实表为准。时长沿用现有口径：按访问开始日期累加 `duration_seconds`、`active_seconds`；不把两端日统计直接相加，不对跨午夜访问另行分摊。
- 导入结果的新增、更新和跳过计数对应文件中的记录，派生重算不额外计入；重复导入不重复累计事实或时长，不重算无关历史日期。
- 备份 `.sqlite` 是本机恢复能力，不是普通同步格式；分享前需确认隐私边界。

### Recovery scope

| Material                  | Included                                                                                                              | Not protected by this material                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Learning-data JSON v2     | Problems, visits, submissions, daily statistics, platform accounts and rating history; v1/v2 imports remain supported | Note text/images, config, scripts, credentials, browser sessions and the other excluded tables          |
| SQLite backup             | A consistent database snapshot, including note/file references and sensitive encrypted database fields                | Referenced Markdown/images, script files, `config.json`, browser session files or later database writes |
| Config normalization copy | The exact pre-normalization `config.json` bytes, including opaque encrypted envelopes                                 | Any later settings save, notes/images, database, scripts or browser sessions                            |

None is a whole-profile backup. Migration 030 does not modify note/image or script files; their references alone do not restore missing files. Session/window persistence and script background updates have separate lifecycles. Do not silently roll back those files after the database is in normal use.

Config copies live under `<userData>/config-normalization-backups/config-before-normalization-<sha256>.json`. Only an existing readable file that needs normalization creates a copy. Canonical, absent and invalid-JSON config files are left untouched; protection failures keep normalized values in memory without overwriting the source. Ordinary explicit settings saves retain their electron-store behavior and do not create these copies. A matching existing copy is reused only after byte verification; `.partial` files are never recovery points and no old copy is automatically pruned or restored.

Files/directories are created with owner-only modes on POSIX; on Windows they inherit the existing userData directory's ACL. They remain sensitive local material: do not upload or place them in a shared directory. Linked config files, multiply-linked files and symlink/junction path components are refused. Diagnostics use fixed reason codes, never JSON fragments or envelope values. This does not promise power-loss durability on every filesystem or protection from a hostile process concurrently replacing paths.

## 5. 验证入口

```powershell
cd algo-electron
pnpm run test:db
pnpm vitest run tests/app/configCompatibility.test.ts tests/app/configMigration.test.ts tests/app/configNormalizationBackup.test.ts tests/db/credentialExport.test.ts
pnpm run test:core
```
