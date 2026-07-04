# DB 模块说明

## 1. 职责

`electron/db/` 是本地 SQLite 持久化边界，负责数据库连接、迁移和 repository 查询/写入函数。

本模块不抓取网页、不解析 OJ 页面、不注册 IPC。业务服务应通过 repository 或明确的写入封装访问数据库，schema 变更必须通过 migration 和 `DATABASE_SCHEMA.md` 同步。

## 2. 当前实现程度

- 数据库引擎：`better-sqlite3`。
- 数据库位置：`app.getPath('userData')/data/algo-learning.sqlite`。
- 连接配置：启用 WAL、foreign keys、`busy_timeout = 5000`。
- 迁移系统：`schema_migrations` 表记录已执行版本；迁移在事务内执行。
- 当前迁移版本：001 到 021。
- Repository 覆盖：账号/rating、AI 上下文快照、AI 输出、Cookie 元数据、题目、站点配置、统计、提交、用户脚本。

数据库结构的权威契约仍是根目录 `DATABASE_SCHEMA.md`。

## 3. 文件职责

- `connection.ts`：数据库生命周期。
- `migrate.ts`：迁移执行器。
- `migrations/`：按版本追加的 schema/data migration。
- `repositories/`：按业务域拆分的数据库访问函数。
- `repositories/aiContextSnapshot/`：每日 AI 上下文快照创建、读取、列表和 JSON context 解析实现。
- `repositories/aiOutput/`：AI 输出保存、读取、列表、更新、删除和元信息序列化实现。
- `repositories/account/`：平台账号、当前 rating、peak rating 和 rating history 实现。
- `repositories/cookieRecord/`：Cookie 元数据保存、查询和安全摘要实现。
- `repositories/problem/`：题目 upsert、删除、详情、列表和概览统计实现。
- `repositories/submission/`：提交去重写入、按题目/平台查询和首次 AC 更新实现。
- `repositories/site/`：站点配置 CRUD、内置 seed、导入导出和导入预览实现。
- `repositories/stats/`：统计 repository 的趋势、洞察、日期 helper 和日统计重算实现。
- `repositories/userScript/`：用户脚本元信息、启用状态、匹配规则和本地文件路径实现。

## 4. 连接封装

`connection.ts`：

- `initDb()`：创建数据目录，打开 SQLite，设置 pragma，按顺序运行迁移。
- `initDbAtPath(dbPath)`：打开指定 SQLite 文件并运行同一组迁移，供临时数据库测试使用。
- `getDb()`：返回已初始化连接；未初始化时抛错。
- `getDbPath()`：返回当前 SQLite 文件路径，供备份服务使用。
- `closeDb()`：关闭连接并清空模块内单例。

使用规则：

- 应用启动阶段先调用 `initDb()`。
- 自动测试必须使用 `initDbAtPath(dbPath)` 指向临时目录，不能写入用户真实 `userData`。
- 业务代码不要自己 new `Database`。
- 长生命周期服务通过 repository 或明确封装访问数据库。
- 退出阶段调用 `closeDb()`。

## 5. 迁移封装

`migrate.ts`：

- `runMigrations(db, migrations)`：创建 `schema_migrations`，跳过已执行版本，对每个新 migration 开事务运行 `up()`，成功后写入版本记录。

Migration 文件约定：

- 文件名使用三位版本前缀，例如 `018_normalize_codeforces_submission_ids.ts`。
- 每个 migration 导出对应常量，例如 `migration018`。
- `version` 必须唯一且递增。
- `name` 应描述实际动作。
- `up(db)` 必须可在事务中执行。
- 新增 migration 后必须加入 `connection.ts` 的迁移列表，并同步 `DATABASE_SCHEMA.md`。

## 6. Repository 分层

- `accountRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/account/`。
  - `upsertAccount(platform, handle, displayName?)`
  - `updateCurrentRating(accountId, rating)`
  - `updatePeakRating(accountId, peak)`
  - `getAccount(...)` / `getAccountById(...)` / `getAccountsByPlatform(...)`
  - `upsertRatingHistory(data)`
  - `getRatingHistory(accountId)`
  - `computePeakRating(accountId)`
- `problemRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/problem/`。
  - `upsertProblem(identity)`
  - `getRecentProblems(limit, platform?, status?)`
  - `deleteProblem(problemId)`
  - `getProblemDetail(problemId)`
  - `getProblemCount()`
  - `getPlatformDistribution()`
  - `getTodayVisitedCount()`
  - `getLastActiveTime()`
  - `getOverviewStats()`
- `submissionRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/submission/`。
  - `upsertSubmission(data)`
  - `getSubmissionsByProblem(problemId)`
  - `getSubmissionsByPlatform(platform, limit?)`
  - `updateFirstAc(problemId)`
- `statsRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/stats/`。
  - 趋势、平台分布、时间线、复习、错题和连续天数查询。
  - `recomputeDailyStats(date?)`
  - `recomputeAllDailyStats()`
- `siteRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/site/`。
  - 站点配置 CRUD。
  - `seedBuiltinSites()`
  - 站点配置导入导出和冲突预览。
- `userScriptRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/userScript/`。
  - 用户脚本 CRUD 和启用状态切换。
- `aiContextSnapshotRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/aiContextSnapshot/`。
  - 每日 AI 上下文快照创建、读取、列表。
- `aiOutputRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/aiOutput/`。
  - AI 输出保存、读取、列表、删除、更新。
- `cookieRecordRepository.ts`
  - 兼容导出口；内部实现位于 `repositories/cookieRecord/`。
  - Cookie 元数据保存、按站点/domain 查询和安全摘要。

## 7. 写入规则

- Schema 变化必须走 migration，不能在 repository 中临时 `ALTER TABLE`。
- Repository 不应执行网络请求或浏览器脚本。
- 提交写入应优先走 `SubmissionBatchWriter`，由它统一处理题目关联、首次 AC 和统计刷新。
- Cookie 和用户源码不得写入普通日志；数据库字段写入必须符合既有 schema 和隐私边界。
- 统计类 repository 可以读多表，但写事实数据的逻辑应留在对应业务写入入口。

## 8. 测试入口

DB 相关行为目前分布在 submissions、AI、统计、备份导入等测试中。修改 repository 或 migration 后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

Repository 和备份导入临时数据库测试：

```powershell
npm run test:db
```

说明：`better-sqlite3` 当前按 Electron ABI 编译，真实 SQLite 测试需要用 Electron 自带 Node 运行；普通 `node`/`tsx` 会因 native module ABI 不匹配失败。

提交写入相关回归：

```powershell
node node_modules\esbuild\bin\esbuild tests\submissions\submissionBatchWriter.test.ts --bundle --platform=node --format=esm --outfile=tmp\submissions-submissionBatchWriter.test.mjs
node tmp\submissions-submissionBatchWriter.test.mjs
```

若变更 schema，还必须人工核对根目录 `DATABASE_SCHEMA.md` 与 migration 列表一致。
