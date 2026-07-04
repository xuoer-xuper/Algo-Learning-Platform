# 同步兼容性说明

## 1. 职责

本文说明 Phase 7 当前已经落地的本地同步预留、备份、JSON 导入导出和冲突策略。当前版本不自动上传、不连接云端、不做多端实时同步。

## 2. 当前实现

- `sync_queue`：仅作为未来同步队列预留，当前业务不会自动写入或上传。
- 同步兼容字段：核心历史表补充 nullable `deleted_at`，少数早期表补 `updated_at` 并以 `created_at` 回填。
- SQLite 备份：设置页可选择目录生成时间戳 `.sqlite` 备份，供本机恢复使用。
- JSON 导出：导出题目、访问、提交、每日统计、平台账号和 rating 历史，格式版本为 `schema_version: 1`。
- JSON 导入：导入前预览新增、重复和冲突；默认遇到冲突不写库，只有用户明确选择覆盖才更新冲突字段。

## 3. 可同步与不可同步

可进入普通 JSON 导出的学习数据：

- `problems`
- `problem_visits`
- `submissions`
- `user_daily_stats`
- `platform_accounts`
- `rating_history`

禁止进入普通 JSON 导出或未来自动同步的数据：

- `cookie_records`、完整 Cookie value、session、csrf token 和可复用登录态。
- `sync_queue` 自身。
- `raw_json`、完整请求体、普通日志和本机绝对路径。
- 本机数据库文件本体；`.sqlite` 备份只用于本机恢复，不作为跨端同步格式。

## 4. 冲突策略

- 题目冲突键：`platform + platform_problem_id`。
- 提交冲突键：`platform + platform_submission_id`。
- 每日统计冲突键：`local_day`。
- 账号冲突键：`platform + handle`。
- Rating 历史冲突键：`platform + account_id + contest_id`，导入时会先按账号映射本地 `account_id`。

默认导入策略：

- 新数据直接插入。
- 完全重复的数据跳过。
- 冲突数据阻止导入并返回冲突列表。
- 用户明确选择覆盖冲突时，才按导入文件更新对应字段。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run test:docs
npm run test:all
```

真实多端同步、云端账号系统、增量上传和冲突人工合并 UI 不属于当前实现范围。
