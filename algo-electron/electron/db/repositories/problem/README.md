# Problem Repository

## 1. 职责

`electron/db/repositories/problem/` 是 `problemRepository.ts` 的内部实现目录，负责 `problems` 事实表的 upsert、删除、题目列表、详情、Omnibox 本地建议和首页概览统计。

本目录不解析 OJ 页面、不抓提交、不注册 IPC、不读取 Cookie。题目身份解析来自 `electron/adapters/` 和 `electron/parsers/`，提交写入来自 `electron/submissions/`。

## 2. 当前实现程度

- `types.ts`：题目列表、详情、提交行、平台分布和概览返回类型。
- `mutations.ts`：upsert 的查找/更新/插入使用 Drizzle，保留抓取标题质量判断和已有有效标题；删除的原始数值 UNION 与四次 DELETE 也使用同连接 Drizzle，native transaction 与统计重算边界不变。
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
- 删除保留单条 distinct UNION，使用原始数值 instant 投影再由 `toLocalDay` 验证；不得先用 Date decoder 截断小数或转换非法值。epoch 0、nullable first_solved、tombstone 与 occurred_at（非 stored local_day）语义不变。
- 按 submissions → problem_visits → activity_events → problems 顺序删除；父行不存在仍删除匹配 children，但返回 false、不发通知/重算。空字符串/引号 ID 精确绑定，nullable parent ID 不匹配；notes 不删，UI 侧仍应先处理笔记确认。
- native transaction 的实际调用仍处于 `withDataChangeTransaction` 内，COMMIT 失败或 savepoint 回滚丢弃对应事件。统计在本函数内层 transaction 返回后逐个排序日期重算：顶层较早日期已提交，第二日失败仅 warning 并仍返回 true；嵌套调用的重算仍受外层事务回滚约束，不能改成通用 after-commit 调度。
- Omnibox 仅查询本地 `problems`/`problem_visits`；输入按参数绑定，并把 `%`、`_`、`\` 作为 LIKE 字面量处理。结果过滤软删除行，同时按 problem 与 URL 去重。
- Omnibox第二候选管线通过Drizzle CTE取最近64条活跃访问，再JOIN活跃题目并匹配；不得将父行/搜索过滤提前到窗口内或新增同分排序。INNER JOIN相等条件下投影非空visit.problem_id，与原parent ID相等，空ID保持；第一管线可返回NULL ID的遗留DTO政策未在本片更改。
- 第二管线时间使用显式别名的原始scalar投影，保持整数毫秒/epoch0，不由Date转换改变诊断数据；只读不发事件。第一管线及最终排序、去重、8条上限不变，查询异常同步抛出。
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
pnpm vitest run tests/db/problemOverview.test.ts tests/db/problemLookup.test.ts tests/db/drizzleClient.test.ts tests/db/omniboxSuggestions.test.ts
pnpm vitest run tests/db/problemUpsert.test.ts tests/db/deleteProblem.test.ts tests/db/dataChangeNotifications.test.ts tests/parsers/titleValidation.test.ts
pnpm test:db
```

`problemOverview.test.ts` 使用冻结时钟与真实临时 SQLite，覆盖旧 SQL 结果对照、日期边界、nullable ID、软删除、0/毫秒精度、只读/无通知及关闭重开。`problemLookup.test.ts` 对照原 SQL 验证查键语义、字面量、null/空 ID、软删除、只读/无通知、事务连接、关闭重开及异常传播。`test:db` 同时运行 `repositories.test.ts` 的真实 Electron ABI 总览和查键用例。

`problemUpsert.test.ts` 与冻结原三语句的 `problem-upsert-oracle.ts` 在独立临时库中比较完整原始行和事件，覆盖标题/字段、NULL/空 ID、0/毫秒、UPDATE OF、真实只读/触发器/提交错误、savepoint 和外层通知。原生 repository 用例另验证 bound-null 无修改仍通知以及整数时间写入。

`deleteProblem.test.ts` 与 `problem-delete-oracle.ts` 以独立真实 SQLite 对照冻结原 SQL 的完整原始行、返回值、错误根因、事件时序和告警。41个用例包括四分支非法时间、0/本地午夜、nullable/空/引号ID、tombstone/孤儿/notes、单条UNION和删除顺序、触发器及真实deferred-FK COMMIT失败、嵌套savepoint/外层回滚、第二日统计失败及重初始化。差分矩阵可在`TZ=America/New_York`独立运行验证23小时本地日；原生ABI由协调入口另验，不用Vitest结果替代。

`omniboxSuggestions.test.ts` 使用数字毫秒的当前schema fixture，与独立冻结的
`omnibox-suggestions-oracle.ts` 比较完整有序结果/异常；覆盖候选窗口、转义、时间同分、
null/空ID、墓碑、只读无通知及连接生命周期。native repository用例另验真实Electron ABI；
完整omnibox和列表/详情/访问DTO迁移仍待nullable-ID政策决策，不以本片完成代称全部迁移。
