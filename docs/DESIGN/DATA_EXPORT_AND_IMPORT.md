# 数据导出与导入

## 1. 职责

本文说明当前 v1.0 已落地的数据备份、学习数据 JSON 导出、导入预览和冲突处理策略。本文不描述云同步、移动端或多端实时同步规划。

## 2. 当前实现

- SQLite 备份：设置页可选择目录生成时间戳 `.sqlite` 备份，供本机恢复使用。
- JSON 导出：导出题目、访问、提交、每日统计、平台账号和 rating 历史，格式版本为 `schema_version: 1`。
- JSON 导入：导入前预览新增、重复和冲突；默认遇到冲突不写库，只有用户明确选择覆盖才更新冲突字段。
- 同步兼容字段：核心历史表保留 nullable `deleted_at`，少数早期表补 `updated_at` 并以 `created_at` 回填，用于导入覆盖和数据恢复时表达状态。
- `sync_queue` 表已经存在，但当前 v1.0 不自动写入、上传或连接远端服务。

## 3. JSON 导出范围

可进入普通学习数据 JSON 的表：

- `problems`
- `problem_visits`
- `submissions`
- `user_daily_stats`
- `platform_accounts`
- `rating_history`

禁止进入普通 JSON 导出的数据：

- `cookie_records`、完整 Cookie value、session、csrf token 和可复用登录态。
- `sync_queue` 自身。
- `raw_json`、完整请求体、普通日志和本机绝对路径。
- 本机数据库文件本体；`.sqlite` 备份只用于本机恢复，不作为普通学习数据交换格式。

## 4. 冲突策略

冲突键：

- 题目：`platform + platform_problem_id`
- 提交：`platform + platform_submission_id`
- 每日统计：`local_day`
- 账号：`platform + handle`
- Rating 历史：`platform + account_id + contest_id`，导入时会先按账号映射本地 `account_id`

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
