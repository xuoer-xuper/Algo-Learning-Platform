# Backup And Import

## 1. 职责

`electron/backup/` 负责 Phase 7 的本地备份、学习数据 JSON 导出/导入、导入预览和冲突检测。

本目录不做云同步、不上传数据、不读取 Cookie，不导出 `raw_json`、日志、本机数据库内容以外的私有文件或可复用登录态。

## 2. 当前实现程度

- `backupService.ts`：SQLite 备份、JSON 文件导出、JSON 文件读取、导入预览和确认导入封装。
- `learningDataExport.ts`：学习数据导出结构、版本校验、冲突检测和 merge 导入逻辑。
- `types.ts`：导出版本、导入预览、冲突、导入结果和备份结果类型。

## 3. 封装入口

- `createDatabaseBackup(targetDir)`：使用 SQLite backup API 生成时间戳 `.sqlite` 文件。
- `exportLearningData()` / `exportLearningDataToFile(filePath)`：导出题目、访问、提交、每日统计、账号和 rating 历史。
- `previewLearningDataImport(raw)` / `previewLearningDataImportFile(filePath)`：校验版本、统计新增/重复/冲突。
- `importLearningData(data, overwriteConflicts)`：导入非敏感学习数据；默认遇到冲突不写库。

## 4. 边界规则

- `cookie_records`、`sync_queue`、Cookie value、`raw_json`、日志和本机绝对路径不进入普通 JSON 导出。
- 冲突默认阻止导入；只有用户明确确认 overwrite 时才覆盖冲突字段。
- 提交导入会按题目平台 ID 重新映射 `problem_id`，避免跨库本地 ID 不一致导致悬挂引用。
- 备份 `.sqlite` 是本机恢复能力，不是普通同步格式；分享前需确认隐私边界。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run test:core
```
