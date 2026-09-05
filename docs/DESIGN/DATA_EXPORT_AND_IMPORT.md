# 数据导出与导入

## 1. 职责

本文说明当前 v1.0 已落地的数据备份、学习数据 JSON 导出、导入预览和冲突处理策略。本文不描述云同步、移动端或多端实时同步规划。

## 2. 当前实现

- SQLite 备份：设置页可选择目录生成时间戳 `.sqlite` 备份，供本机恢复使用。
- JSON 导出：导出题目、访问、提交、每日统计、平台账号和 rating 历史，格式版本为 `schema_version: 1`。
- 导出 metadata 同时提供 `excluded_tables`、`excluded_fields` 和完整备份提示；排除表清单按当前 SQLite `sqlite_master` 动态闭合，避免新增敏感表后文档失真。
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

禁止进入普通 JSON 导出的表和字段：

- `activity_events`、`study_sessions`、`contest_results`、`site_configs`、`user_scripts`、`user_script_values`、`user_script_resources`、`user_script_host_permissions`、`user_script_update_state`、`notes`、`ai_context_snapshots`、`ai_outputs`、`cookie_records`、`sync_queue`、`coach_events`、`coach_interventions`、`coach_feedback`、`site_credentials` 和内部 `schema_migrations`。
- 完整 Cookie value、session、csrf token、可复用登录态、`submissions.raw_json`、完整请求体、普通日志和本机绝对路径。
- 本机数据库文件本体；`.sqlite` 备份只用于本机恢复，不作为普通学习数据交换格式。

设置页的 JSON 导出入口明确提示：**完整备份请用数据库备份**。数据库备份可能包含本机敏感数据，只用于受保护的本机恢复，不应作为普通共享文件。

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
- 题目、提交以业务键找到本地记录后比较可覆盖元数据，即使本地 UUID 相同也检查差异；提交关联的题目先映射到本地 ID，避免跨库 UUID 差异形成假冲突。题目状态、首次 AC 和维护时间戳不参与元数据冲突比较。

导入后的派生数据：

- 事实写入与派生重算使用同一个事务，任何步骤失败都会回滚整次导入。
- 受影响题目的 `status` 和 `first_solved_at` 按合并后的提交重建。覆盖更改判定、时间或题目关联时，旧题目和新题目都会更新；首次 AC 可以前移、后移或清空。
- `user_daily_stats` 仍作为兼容导出快照参与预览和冲突确认，但导入完成后的数值由最终事实表重算，不以某一端的快照覆盖合并总量。访问、提交和首次 AC 移动日期时，新旧日期都重算。
- 活跃时长与总时长沿用统计 repository 的口径，按访问开始日期累加记录中的 `active_seconds` 与 `duration_seconds`；不合计两端日统计，不重新切分跨午夜访问。
- 重复导入不增加已有事实或重复累计时长；无关历史日期不重算。结果中的新增、更新、跳过计数对应导入文件行数，派生重算不额外计入。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run test:docs
npm run test:all
```
