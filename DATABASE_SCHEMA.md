# 数据库设计（DATABASE_SCHEMA）

## 1. 总原则

数据库使用 SQLite，访问库推荐 `better-sqlite3`。数据库只允许 Main Process 访问，Renderer 必须通过 IPC 获取数据。

设计目标：

- 本地优先。
- 可迁移。
- 可追溯。
- 可从原始事件重算统计。
- 为同步和安卓端预留，但不提前实现云端。

时间规则：

- 精确时间字段使用 UTC ISO 字符串或 UTC 毫秒，项目实现时需统一。
- 与连续活跃天数相关的统计额外保存 `local_day`。
- UI 展示时使用用户本地时区。

命名规则：

- 表名使用复数下划线。
- 主键使用 `id`。
- 创建时间使用 `created_at`。
- 更新时间使用 `updated_at`。
- 软删除预留 `deleted_at`。

## 2. migration 规则

必须存在：

```sql
schema_migrations
```

字段建议：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| version | INTEGER PRIMARY KEY | 迁移版本 |
| name | TEXT NOT NULL | 迁移名称 |
| applied_at | TEXT NOT NULL | 应用时间 |

规则：

- migration 只能向前执行。
- 每次 schema 变更必须更新本文档。
- migration 失败前必须保证数据库已备份或事务可回滚。
- 禁止业务代码散落建表 SQL。

## 3. Phase 1 核心表

### 3.1 problems

记录题目主数据。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 本地题目 ID |
| platform | TEXT NOT NULL | 当前平台，如 codeforces、vjudge |
| platform_problem_id | TEXT NOT NULL | 平台内题目 ID |
| canonical_url | TEXT NOT NULL | 标准 URL |
| title | TEXT | 题目标题，Phase 2 抓取 |
| status | TEXT NOT NULL | unknown、visited、attempted、solved |
| contest_id | TEXT | 比赛 ID |
| problem_index | TEXT | 比赛内题号 |
| source_platform | TEXT | VJudge 原始 OJ |
| source_problem_id | TEXT | VJudge 原始题号 |
| difficulty | TEXT | 难度或 Rating |
| tags_json | TEXT | 标签 JSON，Phase 2 细化 |
| first_seen_at | TEXT NOT NULL | 首次发现时间 |
| last_visited_at | TEXT | 最近访问时间 |
| first_solved_at | TEXT | 首次 AC 时间 |
| extra_json | TEXT | 平台扩展字段 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |
| deleted_at | TEXT | 软删除预留 |

索引：

```sql
UNIQUE(platform, platform_problem_id)
INDEX problems_last_visited_at(last_visited_at)
INDEX problems_status(status)
INDEX problems_source(source_platform, source_problem_id)
```

### 3.2 problem_visits

记录单次题目访问和停留。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 访问 ID |
| problem_id | TEXT NOT NULL | 关联 problems.id |
| session_id | TEXT | 关联 study_sessions.id |
| platform | TEXT NOT NULL | 平台 |
| url | TEXT NOT NULL | 访问 URL |
| entered_at | TEXT NOT NULL | 进入时间 |
| left_at | TEXT | 离开时间 |
| duration_seconds | INTEGER | 页面停留秒数 |
| active_seconds | INTEGER | 活跃秒数 |
| leave_reason | TEXT | navigate、close、idle、crash |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
INDEX problem_visits_problem_time(problem_id, entered_at)
INDEX problem_visits_session(session_id)
INDEX problem_visits_entered_at(entered_at)
```

### 3.3 activity_events

追加式学习行为事件日志。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 事件 ID |
| event_type | TEXT NOT NULL | navigation、problem_detected、visit_start 等 |
| occurred_at | TEXT NOT NULL | 发生时间 |
| local_day | TEXT NOT NULL | 本地日期 YYYY-MM-DD |
| session_id | TEXT | 学习会话 ID |
| problem_id | TEXT | 关联题目 |
| platform | TEXT | 平台 |
| url | TEXT | 当前 URL |
| payload_json | TEXT | 扩展数据 |
| created_at | TEXT NOT NULL | 写入时间 |

索引：

```sql
INDEX activity_events_time(occurred_at)
INDEX activity_events_type_time(event_type, occurred_at)
INDEX activity_events_local_day(local_day)
INDEX activity_events_problem(problem_id)
```

### 3.4 study_sessions

记录一次学习会话。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 会话 ID |
| started_at | TEXT NOT NULL | 开始时间 |
| ended_at | TEXT | 结束时间 |
| duration_seconds | INTEGER | 总时长 |
| active_seconds | INTEGER | 活跃时长 |
| main_platform | TEXT | 主要平台 |
| end_reason | TEXT | close、idle、crash |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
INDEX study_sessions_started_at(started_at)
INDEX study_sessions_ended_at(ended_at)
```

### 3.5 site_configs

记录内置和用户自定义站点。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | site id |
| name | TEXT NOT NULL | 显示名称 |
| domains_json | TEXT NOT NULL | 域名列表 |
| home_url | TEXT NOT NULL | 首页 |
| enabled | INTEGER NOT NULL | 是否启用 |
| problem_url_patterns_json | TEXT | 题目 URL 规则 |
| submit_url_patterns_json | TEXT | 提交 URL 规则 |
| cookie_policy | TEXT | Cookie 策略 |
| adapter | TEXT | 专用 adapter 名称 |
| is_builtin | INTEGER NOT NULL | 是否内置 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
INDEX site_configs_enabled(enabled)
```

### 3.6 cookie_records

CookieVault 的本地记录表。注意：是否保存完整 Cookie 值由实现阶段决定，默认不明文导出。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 记录 ID |
| site_id | TEXT NOT NULL | 站点 ID |
| domain | TEXT NOT NULL | Cookie 域 |
| name | TEXT NOT NULL | Cookie 名 |
| value_encrypted | TEXT | 加密或本地保护后的值 |
| expires_at | TEXT | 过期时间 |
| http_only | INTEGER | 是否 HttpOnly |
| secure | INTEGER | 是否 Secure |
| same_site | TEXT | SameSite |
| last_seen_at | TEXT NOT NULL | 最近读取时间 |
| purpose | TEXT | login、submit、sync |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
UNIQUE(site_id, domain, name)
INDEX cookie_records_site(site_id)
INDEX cookie_records_expires_at(expires_at)
```

安全规则：

- Cookie 不进入 `sync_queue`。
- Cookie 不进入普通 JSON 导出。
- Cookie 值不得写入普通日志。

## 4. Phase 2 表

### 4.1 submissions

记录提交记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 本地提交 ID |
| problem_id | TEXT | 关联题目 |
| platform | TEXT NOT NULL | 平台 |
| platform_submission_id | TEXT NOT NULL | 平台提交 ID |
| verdict | TEXT NOT NULL | 统一 verdict |
| raw_verdict | TEXT | 平台原始 verdict |
| language | TEXT | 提交语言 |
| submitted_at | TEXT NOT NULL | 提交时间 |
| is_first_ac | INTEGER NOT NULL DEFAULT 0 | 是否首次 AC |
| runtime_ms | INTEGER | 运行时间 |
| memory_kb | INTEGER | 内存 |
| source_url | TEXT | 提交详情 URL |
| raw_json | TEXT | 原始数据 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
UNIQUE(platform, platform_submission_id)
INDEX submissions_problem_time(problem_id, submitted_at)
INDEX submissions_verdict(verdict)
INDEX submissions_submitted_at(submitted_at)
```

### 4.2 submission_sync_runs

记录提交同步任务。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 同步任务 ID |
| platform | TEXT NOT NULL | 平台 |
| started_at | TEXT NOT NULL | 开始时间 |
| ended_at | TEXT | 结束时间 |
| status | TEXT NOT NULL | success、failed、partial |
| fetched_count | INTEGER | 拉取数量 |
| inserted_count | INTEGER | 新增数量 |
| updated_count | INTEGER | 更新数量 |
| error_message | TEXT | 错误摘要 |
| created_at | TEXT NOT NULL | 创建时间 |

## 5. Phase 3 表

### 5.1 user_daily_stats

按本地日期缓存聚合统计。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| local_day | TEXT PRIMARY KEY | 本地日期 |
| active_seconds | INTEGER NOT NULL DEFAULT 0 | 活跃秒数 |
| duration_seconds | INTEGER NOT NULL DEFAULT 0 | 停留秒数 |
| visited_problem_count | INTEGER NOT NULL DEFAULT 0 | 访问题目数 |
| solved_problem_count | INTEGER NOT NULL DEFAULT 0 | 首次 AC 题数 |
| submission_count | INTEGER NOT NULL DEFAULT 0 | 提交数 |
| ac_submission_count | INTEGER NOT NULL DEFAULT 0 | AC 提交数 |
| platform_distribution_json | TEXT | 平台分布 |
| recomputed_at | TEXT | 最近重算时间 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
INDEX user_daily_stats_recomputed_at(recomputed_at)
```

## 6. Phase 4 表

### 6.1 platform_accounts

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 账号 ID |
| platform | TEXT NOT NULL | 平台 |
| handle | TEXT NOT NULL | 平台账号 |
| display_name | TEXT | 显示名称 |
| current_rating | INTEGER | 当前 Rating |
| peak_rating | INTEGER | 历史最高 Rating |
| last_synced_at | TEXT | 最近同步时间 |
| raw_json | TEXT | 原始数据 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
UNIQUE(platform, handle)
```

### 6.2 rating_history

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 历史记录 ID |
| account_id | TEXT NOT NULL | 账号 ID |
| platform | TEXT NOT NULL | 平台 |
| contest_id | TEXT | 比赛 ID |
| contest_name | TEXT | 比赛名称 |
| rank | INTEGER | 排名 |
| rating_before | INTEGER | 变化前 |
| rating_after | INTEGER | 变化后 |
| delta | INTEGER | 变化值 |
| contest_at | TEXT | 比赛时间 |
| raw_json | TEXT | 原始数据 |
| created_at | TEXT NOT NULL | 创建时间 |

索引：

```sql
INDEX rating_history_account_time(account_id, contest_at)
UNIQUE(platform, account_id, contest_id)
```

### 6.3 contest_results

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 记录 ID |
| platform | TEXT NOT NULL | 平台 |
| contest_id | TEXT NOT NULL | 比赛 ID |
| contest_name | TEXT | 比赛名称 |
| account_id | TEXT | 账号 ID |
| rank | INTEGER | 排名 |
| solved_count | INTEGER | 解题数 |
| penalty | INTEGER | 罚时 |
| rating_delta | INTEGER | Rating 变化 |
| contest_at | TEXT | 比赛时间 |
| raw_json | TEXT | 原始数据 |
| created_at | TEXT NOT NULL | 创建时间 |

索引：

```sql
INDEX contest_results_account_time(account_id, contest_at)
UNIQUE(platform, contest_id, account_id)
```

## 7. Phase 6 表

### 7.1 notes

题解和笔记。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 笔记 ID |
| problem_id | TEXT | 题目 ID |
| title | TEXT NOT NULL | 标题 |
| file_path | TEXT NOT NULL | 本地 Markdown 路径 |
| note_type | TEXT NOT NULL | solution、review、summary |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### 7.2 ai_outputs

AI 输出独立保存，不污染核心事实表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 输出 ID |
| output_type | TEXT NOT NULL | review_plan、weakness、summary |
| title | TEXT | 标题 |
| content | TEXT NOT NULL | 输出内容 |
| input_summary_json | TEXT | 输入摘要 |
| source_refs_json | TEXT | 题目、提交、统计引用 |
| model_info_json | TEXT | 模型信息 |
| created_at | TEXT NOT NULL | 创建时间 |

## 8. Phase 7 表

### 8.1 sync_queue

未来同步队列。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 队列 ID |
| entity_type | TEXT NOT NULL | 实体类型 |
| entity_id | TEXT NOT NULL | 实体 ID |
| operation | TEXT NOT NULL | upsert、delete |
| status | TEXT NOT NULL | pending、synced、failed |
| payload_hash | TEXT | 数据摘要 |
| created_at | TEXT NOT NULL | 创建时间 |
| synced_at | TEXT | 同步时间 |
| error_message | TEXT | 错误 |

索引：

```sql
INDEX sync_queue_status_created(status, created_at)
UNIQUE(entity_type, entity_id, operation, created_at)
```

禁止进入同步队列：

- Cookie。
- 本地绝对文件路径中的敏感部分。
- 普通日志。

## 9. Verdict 枚举

统一 verdict 建议：

- `AC`
- `WA`
- `TLE`
- `MLE`
- `RE`
- `CE`
- `PE`
- `OLE`
- `SKIPPED`
- `TESTING`
- `UNKNOWN`

保留平台原始 verdict 到 `raw_verdict`。

## 10. 有效活跃日规则

默认规则：

- 当天 `active_seconds >= 300`，或
- 当天有至少一次提交，或
- 当天有至少一个题目首次 AC。

该规则用于连续活跃天数。后续可配置，但必须保持历史统计可重算。

## 11. 待实现时必须确认的问题

实现数据库前必须确认：

- UTC 时间格式使用 ISO 字符串还是毫秒整数。
- ID 使用 `crypto.randomUUID()` 还是自定义短 ID。
- Cookie 值是否进入 SQLite，还是只从 Electron session 读取并缓存摘要。
- tags 使用 JSON 还是独立 `problem_tags` 表。

未确认前，优先按照本文档默认字段实现，避免临时随意扩表。

