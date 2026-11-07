# Problem Repository

## 1. 职责

`electron/db/repositories/problem/` 是 `problemRepository.ts` 的内部实现目录，负责 `problems` 事实表的 upsert、删除、题目列表、详情、Omnibox 本地建议和首页概览统计。

本目录不解析 OJ 页面、不抓提交、不注册 IPC、不读取 Cookie。题目身份解析来自 `electron/adapters/` 和 `electron/parsers/`，提交写入来自 `electron/submissions/`。

## 2. 当前实现程度

- `types.ts`：题目列表、详情、提交行、平台分布和概览返回类型。
- `mutations.ts`：upsert 的查找/更新/插入使用 Drizzle，保留抓取标题质量判断和已有有效标题；删除暂保留原实现。
- `queries.ts`：平台/题目键查 ID 使用 Drizzle；最近题目列表、详情和访问记录仍保留原查询，状态根据 submissions 实时计算。
- `omnibox.ts`：从本地题目与最近访问生成最多 8 条建议。先限制题目/访问候选，再按现有时间索引补最近 URL，不对整张 `problem_visits` 做分组或窗口扫描。
- `overview.ts`：题目总数、今日访问、平台分布、最近活跃时间和概览聚合。四条只读查询使用 Drizzle 包装当前 SQLite 连接，仍同步返回 number/null，不缓存连接。
- `../problemRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 写入：`upsertProblem(identity)`、`deleteProblem(problemId)`。
- 查询：`getRecentProblems(limit, platform?, status?)`、`getProblemDetail(problemId)`、`findProblemIdByPlatformKey(platform, platformProblemId)`。
- Omnibox：`getOmniboxSuggestions(query)`；固定返回上限由 `OMNIBOX_SUGGESTION_LIMIT` 定义，不接受 renderer 自定义 limit。
- 概览：`getProblemCount()`、`getPlatformDistribution()`、`getTodayVisitedCount()`、`getLastActiveTime()`、`getOverviewStats()`。

## 4. 边界规则

- `upsertProblem()` 只接收已经解析好的 `ProblemIdentity`，不要在 repository 内写站点 URL 解析逻辑。
- Upsert 保留同一连接和单次时间捕获，不新增事务。已有题目只 SET 原六列，CASE/COALESCE 保留空缺参数及 UPDATE OF 触发语义；空字符串可覆盖 contest/index，source 只在插入时写入，软删除题目不复活。
- 兼容旧 upsert 的特例：NULL ID 仍实际执行 `id = ?` 绑定 null 的 UPDATE（不改 IS NULL、不提前返回），成功后即使无匹配行也发原有 problems/stats 通知；只读/SQL 错误仍抛出且不通知。其他写入的无变更不通知规则不因此放宽，外层事务继续负责提交后发布及回滚丢弃。
- 状态展示优先根据 submissions 实时计算，避免依赖可能滞后的 `problems.status`。
- 删除题目会同步删除关联 submissions、problem_visits、activity_events；UI 侧仍应先处理笔记确认。
- Omnibox 仅查询本地 `problems`/`problem_visits`；输入按参数绑定，并把 `%`、`_`、`\` 作为 LIKE 字面量处理。结果过滤软删除行，同时按 problem 与 URL 去重。
- 高频建议查询不得对整张 `problem_visits` 使用 `GROUP BY` 或窗口函数；继续复用 `idx_problems_last_visited`、`idx_pv_entered` 和 `idx_pv_problem_time`。
- 总览沿用各查询原有过滤：题目总数/平台分布排除已软删除题目，按行计数（包括 nullable TEXT 主键）；今日访问按本地日 `[start,end)` 统计 distinct problem_id，不排除软删除访问或关联已删除题目的访问；最近活跃时间也保留软删除事件。
- Drizzle 的 timestamp_ms 参数使用 Date 编码，输出显式转回毫秒数并保留 epoch 0/null。总览读取不写库、不运行迁移、不发 R4 通知；平台分布只按数量降序，不新增同分排序保证。
- `findProblemIdByPlatformKey()` 保持大小写敏感的两个键精确相等，不 trim、不把引号或 `%`/`_` 当 SQL 模式；只读未软删除题目。无匹配或 nullable ID 返回 null，空字符串 ID 原样保留；同步使用当前连接，数据库异常仍抛出，不伪装成未找到。
- Schema 变化必须先写 migration，再更新本目录 SQL 和测试。
- 不写入 Cookie、源码、请求体或浏览器日志。

## 5. 验证入口

```powershell
cd algo-electron
pnpm typecheck
pnpm typecheck:tests
pnpm vitest run tests/db/problemOverview.test.ts tests/db/problemLookup.test.ts tests/db/drizzleClient.test.ts
pnpm vitest run tests/db/problemUpsert.test.ts tests/db/dataChangeNotifications.test.ts tests/parsers/titleValidation.test.ts
pnpm test:db
```

`problemOverview.test.ts` 使用冻结时钟与真实临时 SQLite，覆盖旧 SQL 结果对照、日期边界、nullable ID、软删除、0/毫秒精度、只读/无通知及关闭重开。`problemLookup.test.ts` 对照原 SQL 验证查键语义、字面量、null/空 ID、软删除、只读/无通知、事务连接、关闭重开及异常传播。`test:db` 同时运行 `repositories.test.ts` 的真实 Electron ABI 总览和查键用例。

`problemUpsert.test.ts` 与冻结原三语句的 `problem-upsert-oracle.ts` 在独立临时库中比较完整原始行和事件，覆盖标题/字段、NULL/空 ID、0/毫秒、UPDATE OF、真实只读/触发器/提交错误、savepoint 和外层通知。原生 repository 用例另验证 bound-null 无修改仍通知以及整数时间写入。
