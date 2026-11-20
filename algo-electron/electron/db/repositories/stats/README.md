# Stats Repository

## 1. 职责

`stats/` 承接 `statsRepository.ts` 的内部实现，负责从 SQLite fact tables 聚合统计数据。外部仍通过 `electron/db/repositories/statsRepository.ts` 导入，避免影响 IPC、AI context 和 renderer 调用方。

本目录不注册 IPC、不访问浏览器、不解析站点页面、不写提交事实表，只读取统计所需数据并维护 `user_daily_stats` 聚合表。

## 2. 当前实现程度

- `types.ts`：统计查询返回类型。
- `date.ts`：本地日期字符串和连续天数计算 helper。
- `trends.ts`：每日活跃、刷题、AC、提交趋势。
- `insights.ts`：平台分布、单题访问、时间线、连续活跃、复访、错题和未复习列表。
- `recompute.ts`：从 `problem_visits`、`submissions`、`problems`、`activity_events` 重算 `user_daily_stats`。
- `../statsRepository.ts`：兼容导出口，不承载 SQL 细节。

## 3. 封装函数

- 趋势：`getDailyActiveStats`、`getVisitedTrend`、`getAcTrend`、`getSubmissionTrend`。
- 洞察：`getPlatformDistribution`、`getProblemVisitStats`、`getTimeline`、`getLastActiveTime`、`getRevisitStats`、`getStreakDays`、`getWrongProblems`、`getUnreviewedProblems`。
- 重算：`recomputeDailyStats`、`recomputeAllDailyStats`。

## 4. 边界规则

- 日期过滤统一使用本地 `yyyy-mm-dd` 字符串；不要用 `toISOString()` 生成 UTC 日期参与 `local_day` 或 `LIKE 'yyyy-mm-dd%'` 比较。
- `recompute.ts` 是统计聚合表的唯一写入口；新增统计写入时先确认是否属于 fact table 还是 aggregate table。
- 查询函数返回普通对象数组，不向调用方暴露 `better-sqlite3` statement 或连接对象。
- Schema 变化必须先写 migration，再更新本目录 SQL 和测试。

- A4a将平台分布、单题访问和最后活跃时间迁移到Drizzle；其余趋势/洞察/重算另行处理。
- 每次包装当前连接，不缓存、不新建事务、不写入或通知。平台分布保留active父行COUNT(*)及count倒序，NULL ID也计数。
- 单题访问保留COUNT(*)和原生COALESCE(SUM/AVG,0)，墓碑/孤立访问仍计入，AVG忽略NULL时长；INTEGER SUM溢出仍抛错，不转字符串或返回零。
- 最后活跃时间保留raw occurred_at倒序首行及空值回退，epoch0和诊断小数/极值不经Date解码；不改成MAX或委托题目overview。
- 历史migration030调用recompute-core.ts；本批不改该依赖路径，也不改变任何schema/输入/IPC类型。

## 5. 验证入口

```powershell
cd algo-electron
pnpm typecheck
pnpm typecheck:tests
pnpm run test:unit tests/db/stats-basic-reads.test.ts
pnpm test:db
```

原生测试由统一runner运行真实Electron/better-sqlite3并检查退出状态，不以单独GUI进程启动成功代替验收。
