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

- 精确时间字段使用北京时间 ISO 字符串（UTC+8），格式如 `2026-05-14T16:19:44.967+08:00`。
- 与连续活跃天数相关的统计额外保存 `local_day`。
- UI 展示时直接使用数据库中的时间。

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
| login_url_patterns_json | TEXT | 登录页 URL glob 规则，供自动填充目标校验 |
| login_username_selectors_json | TEXT | 登录用户名字段 CSS 选择器列表 |
| login_password_selectors_json | TEXT | 登录密码字段 CSS 选择器列表 |
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
| sync_excluded | INTEGER NOT NULL DEFAULT 1 | 固定排除同步 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

索引：

```sql
UNIQUE(site_id, domain, name)
INDEX cookie_records_site(site_id)
INDEX cookie_records_domain(domain)
INDEX cookie_records_expires_at(expires_at)
```

安全规则：

- Cookie 不进入 `sync_queue`。
- Cookie 不进入普通 JSON 导出。
- Cookie 值不得写入普通日志。
- 当前实现只保存元数据；`value_encrypted` 保持为空，完整 Cookie 值只在 Electron session 中按需读取。

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

## 7. 笔记与本地 AI 表

### 7.1 notes

题解和笔记。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 笔记 ID |
| problem_id | TEXT | 题目 ID |
| title | TEXT NOT NULL | 标题 |
| file_path | TEXT NOT NULL | 本地 Markdown 路径 |
| note_type | TEXT NOT NULL | solution、review、summary |
| content | TEXT NOT NULL DEFAULT '' | Markdown 正文缓存（migration 011，用于快速预览/搜索） |
| word_count | INTEGER NOT NULL DEFAULT 0 | 字数估算（中英文混排，migration 011） |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

INDEX notes_updated_at(updated_at)

### 7.2 ai_context_snapshots（migration 014）

每日 AI 上下文快照。应用启动时（首次当日打开）自动调用 `ensureTodaySnapshot()` 生成一份当日快照，存库供 AI 模块（阶段总结、复习计划等）按需消费。避免每次调用都重新聚合统计，同时沉淀历史轨迹。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 快照 ID |
| snapshot_date | TEXT NOT NULL UNIQUE | 快照日期（YYYY-MM-DD，本地日期） |
| context_json | TEXT NOT NULL | 完整 AI 上下文 JSON（schema_version=1） |
| schema_version | INTEGER NOT NULL | 上下文版本号 |
| created_at | TEXT NOT NULL | 生成时间（本地时间） |

UNIQUE INDEX snapshots_date_unique(snapshot_date)

### 7.3 ai_outputs

AI 输出独立保存，不污染核心事实表。migration 015 建表。

> 已移除：原 `submission_code_snippets` 已下线，migration 013 物理删除该表。原因：手动维护成本高，AI 模块不依赖此表（contextExporter 直接读取原始 submissions 表）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 输出 ID |
| output_type | TEXT NOT NULL | review_recommendation、review_plan、period_summary、weakness_analysis |
| title | TEXT | 标题 |
| content | TEXT NOT NULL | 结构化 JSON 内容 |
| content_markdown | TEXT | Markdown 渲染（可选） |
| input_summary_json | TEXT | 输入摘要（来源快照、参数等） |
| source_refs_json | TEXT | 题目、提交、统计引用 |
| model_info_json | TEXT | 模型信息（本地规则引擎版本等） |
| created_at | TEXT NOT NULL | 创建时间（本地时间） |
| updated_at | TEXT NOT NULL | 更新时间（本地时间） |

INDEX ai_outputs_type_idx(output_type)
INDEX ai_outputs_created_idx(created_at DESC)

Phase 7 追加 `deleted_at` 字段，用于未来同步和导入覆盖时表达软删除状态。

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
INDEX sync_queue_status_created_idx(status, created_at)
UNIQUE INDEX sync_queue_entity_operation_created_idx(entity_type, entity_id, operation, created_at)
```

禁止进入同步队列：

- Cookie。
- 本地绝对文件路径中的敏感部分。
- 普通日志。

### 8.2 同步兼容字段

Phase 7 通过 migration 021 为历史核心表追加同步兼容字段，均为 nullable，避免改变既有业务行为：

- `deleted_at`：追加到 `submissions`、`problem_visits`、`activity_events`、`study_sessions`、`user_daily_stats`、`platform_accounts`、`rating_history`、`contest_results`、`site_configs`、`user_scripts`、`notes`、`ai_context_snapshots`、`ai_outputs`。
- `updated_at`：追加到早期缺少更新时间的 `activity_events`、`rating_history`、`contest_results`、`ai_context_snapshots`，历史行以 `created_at` 回填。

### 8.3 user_scripts

本地用户脚本（类似油猴脚本）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | 脚本 ID |
| name | TEXT NOT NULL | 用户可编辑的显示名称 |
| namespace | TEXT | 脚本身份命名空间；`NULL` 为尚未认领的 legacy canonical，空字符串为明确无 namespace 的 canonical，`local:<id>` 为本地副本 |
| identity_name | TEXT NOT NULL | 稳定的脚本身份名称，不随显示名称编辑 |
| description | TEXT | 脚本描述 |
| version | TEXT | 脚本版本 |
| match_urls_json | TEXT NOT NULL | 严格 `@match` 规则数组；scheme/host/path 解析，目标 query/hash 不参与匹配 |
| include_rules_json | TEXT NOT NULL DEFAULT '[]' | `@include` glob/regex 数组 |
| exclude_rules_json | TEXT NOT NULL DEFAULT '[]' | `@exclude` glob/regex 数组 |
| exclude_match_rules_json | TEXT NOT NULL DEFAULT '[]' | 严格 `@exclude-match` 数组 |
| grant_json | TEXT NOT NULL DEFAULT '[]' | `@grant` 声明数组 |
| connect_json | TEXT NOT NULL DEFAULT '[]' | `@connect` 声明数组 |
| noframes | INTEGER NOT NULL DEFAULT 0 | `@noframes`；仅允许 0/1 |
| run_at | TEXT NOT NULL DEFAULT 'document-idle' | `@run-at` 原始值 |
| update_url | TEXT | `@updateURL` |
| download_url | TEXT | `@downloadURL` |
| last_install_url | TEXT | 最近一次安装来源；供 B6.6 更新回退链使用 |
| antifeature_json | TEXT NOT NULL DEFAULT '[]' | `@antifeature` 数组 |
| icon_url | TEXT | `@icon` |
| code | TEXT NOT NULL | 脚本源码（兼容旧版，新版可能为空） |
| file_path | TEXT | 脚本本地存储路径 |
| site_ids_json | TEXT | 关联的作用站点 ID 列表 |
| enabled | INTEGER NOT NULL DEFAULT 1 | 是否启用 |
| auto_update_enabled | INTEGER NOT NULL DEFAULT 1 | 是否允许自动更新；本地副本默认关闭 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |
| deleted_at | TEXT | 软删除预留 |

活动脚本身份索引（migration 025）：

```sql
CREATE UNIQUE INDEX user_scripts_active_identity_unique ON user_scripts(namespace, identity_name)
  WHERE deleted_at IS NULL AND namespace IS NOT NULL
CREATE UNIQUE INDEX user_scripts_active_legacy_identity_unique ON user_scripts(identity_name)
  WHERE deleted_at IS NULL AND namespace IS NULL
```

存量活动同名脚本按 `created_at ASC, id ASC` 选择首条作为 legacy canonical；其余活动记录不删除，转为 `local:<id>` namespace 并关闭自动更新。legacy canonical 首次确认更新时原子认领为脚本声明的 namespace；无 `@namespace` 时认领为空字符串。

migration 027 从存量 `code` metadata 重新分离旧版混存在 `match_urls_json` 中的 `@include`，并回填 exclude、grant、connect、run-at 和更新元数据。`site_ids_json` 非空时是正向匹配的权威范围，不再回退 metadata；两类 exclude 始终优先。所有 027 JSON 数组列由 SQLite `json_valid/json_type` CHECK 保证基本形状。

### 8.4 user_script_values

GM 值的主进程持久化地基。值按 JSON 保存，站点页面不能直接访问；B6.2 接入私有桥后消费。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 记录 ID |
| script_id | TEXT NOT NULL | 关联脚本，删除脚本时级联清理 |
| value_key | TEXT NOT NULL | 脚本内键名 |
| value_json | TEXT NOT NULL | JSON 值，带 `json_valid` CHECK |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

约束：`UNIQUE(script_id, value_key)`、`FOREIGN KEY(script_id) ... ON DELETE CASCADE`。

### 8.5 user_script_resources

`@require`/`@resource` 安装缓存地基。B6.1 只建立无损存储和 repository；下载、SRI 校验及注入消费留给 B6.5。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 缓存 ID |
| script_id | TEXT NOT NULL | 关联脚本 |
| resource_kind | TEXT NOT NULL | `require` 或 `resource` |
| resource_key | TEXT NOT NULL | require 稳定键或 resource 名称 |
| declaration_order | INTEGER NOT NULL | 同类声明顺序，非负整数 |
| source_url | TEXT NOT NULL | 原始下载 URL |
| content_blob | BLOB | 原始字节，图片/字体不经 TEXT 损坏 |
| content_encoding | TEXT NOT NULL | `binary` 或 `utf8` |
| content_type | TEXT | MIME 类型 |
| integrity | TEXT | 待 B6.5 验证的完整性声明 |
| fetched_at | TEXT | 成功抓取时间 |
| created_at / updated_at | TEXT NOT NULL | 创建/更新时间 |

约束：`UNIQUE(script_id, resource_kind, resource_key)`、`UNIQUE(script_id, resource_kind, declaration_order)`、脚本外键级联；查询索引按脚本、kind、声明顺序排列。

### 8.6 user_script_host_permissions

`@connect` 跨域授权记录。repository 将 host pattern trim 并转为小写；`UNIQUE(script_id, host_pattern)` 保留稳定 ID。撤销写 `revoked_at`，再次授权 revive 同一行，`last_used_at` 单独记录最近使用。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 授权 ID |
| script_id | TEXT NOT NULL | 关联脚本 |
| host_pattern | TEXT NOT NULL | 已批准 host pattern |
| granted_at | TEXT NOT NULL | 授权时间 |
| last_used_at | TEXT | 最近使用时间 |
| revoked_at | TEXT | 撤销时间；NULL 为活动授权 |

### 8.7 user_script_update_state

每个脚本一行的更新检查状态，主键同时是级联外键。`status` 仅允许 `idle/checking/current/available/error`；保存 ETag、Last-Modified、可用版本、上次/下次检查时间和错误摘要，并按 `next_check_at/status` 建索引。

### 8.8 site_credentials

站点登录凭据的主进程数据边界。B4.1 建立 schema/repository，B4.2 `CredentialVault` 已接入异步 safeStorage 加密、envelope 校验和旧 key rotation；B4.3 自动填充已通过 `persist:oj-main` 的隔离 preload 通道接入，登录捕获和账户管理仍属于 B4.4-B4.5。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 凭据 ID |
| site_id | TEXT NOT NULL | 关联 `site_configs.id`；站点删除时级联清理 |
| username | TEXT NOT NULL | 登录用户名或账号标识，不是密码 |
| display_name | TEXT | 账户中心中的可选脱敏显示名，不是密码或密钥 |
| secret_envelope | TEXT | V1 `electron-safe-storage` 版本化 JSON；活动行必有，软删除行清空 |
| last_used_at | TEXT | 最近一次填充/使用时间 |
| sync_excluded | INTEGER NOT NULL DEFAULT 1 | 固定为 `1`，不进入同步和普通 JSON 导出 |
| created_at | TEXT NOT NULL | 北京时间时间戳 |
| updated_at | TEXT NOT NULL | 北京时间时间戳 |
| deleted_at | TEXT | 软删除时间；软删除同时清空 envelope |

约束和索引：

```sql
UNIQUE(site_id, username)
FOREIGN KEY(site_id) REFERENCES site_configs(id) ON DELETE CASCADE
CHECK (sync_excluded = 1)
INDEX site_credentials_active_site_idx(site_id, deleted_at)
INDEX site_credentials_last_used_idx(last_used_at DESC)
```

`secret_envelope` 的 V1 形状固定为 `{version:1, provider:"electron-safe-storage", ciphertextBase64:string}`。repository 拒绝明文、无版本、未知 provider、非法 base64 和额外字段；同站点同用户名再次保存会 revive 原 tombstone 并保留原 `id`。

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

## 11. 已确认的数据库实现约束

当前实现约束：

- 时间字段使用文本时间字符串，业务日期使用本地日期键；统计聚合必须可从原始事件重算。
- 主键 ID 使用代码侧生成的字符串 ID，repository 负责去重和 upsert 边界。
- Cookie 明文不进入普通导出、日志或测试快照；Cookie 策略以 Electron session 和 CookieVault 边界为准。
- 站点凭据只允许版本化 safeStorage envelope 进入 `site_credentials`；凭据表固定 `sync_excluded=1`，不得进入普通 JSON 导出、同步队列、日志或 renderer payload。
- 题目 tags 当前按 JSON 文本存储；如未来要拆独立 `problem_tags` 表，必须新增 migration、同步本文档并提供回滚说明。
- 所有 schema 变更必须追加 migration，不允许改写已发布 migration。

后续 schema 变更必须同时更新 `docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md` 中的验证和回滚说明。
