# Problem Repository

## 1. 职责

`electron/db/repositories/problem/` 是 `problemRepository.ts` 的内部实现目录，负责 `problems` 事实表的 upsert、删除、题目列表、详情和首页概览统计。

本目录不解析 OJ 页面、不抓提交、不注册 IPC、不读取 Cookie。题目身份解析来自 `electron/adapters/` 和 `electron/parsers/`，提交写入来自 `electron/submissions/`。

## 2. 当前实现程度

- `types.ts`：题目列表、详情、提交行、平台分布和概览返回类型。
- `mutations.ts`：题目 upsert 和删除。upsert 会校验抓取标题质量，并保护已有有效标题。
- `queries.ts`：最近题目列表和题目详情，状态根据 submissions 实时计算。
- `overview.ts`：题目总数、今日访问、平台分布、最近活跃时间和概览聚合。
- `../problemRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 写入：`upsertProblem(identity)`、`deleteProblem(problemId)`。
- 查询：`getRecentProblems(limit, platform?, status?)`、`getProblemDetail(problemId)`。
- 概览：`getProblemCount()`、`getPlatformDistribution()`、`getTodayVisitedCount()`、`getLastActiveTime()`、`getOverviewStats()`。

## 4. 边界规则

- `upsertProblem()` 只接收已经解析好的 `ProblemIdentity`，不要在 repository 内写站点 URL 解析逻辑。
- 状态展示优先根据 submissions 实时计算，避免依赖可能滞后的 `problems.status`。
- 删除题目会同步删除关联 submissions、problem_visits、activity_events；UI 侧仍应先处理笔记确认。
- Schema 变化必须先写 migration，再更新本目录 SQL 和测试。
- 不写入 Cookie、源码、请求体或浏览器日志。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
