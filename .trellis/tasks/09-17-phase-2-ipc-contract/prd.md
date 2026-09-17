# 阶段 2 IPC 契约与共享层

## Goal

让主进程、preload、渲染进程共用**同一份** channel 常量和类型定义，消除 158 个散落字符串与 112 个手抄类型；建立标准的数据刷新订阅；把数据库时间戳迁到 Unix 毫秒。这是整个对齐里可维护性收益最大的一步。

## Requirements

### R1 channel 常量（高-1，D9）
- `src/shared/constants/channels.ts`：`IPC_CHANNELS = { PROBLEM: { LIST_RECENT: 'problem:listRecent', … }, … } as const`，覆盖 preload 158 个去重 channel + 主进程内部 channel（`oj-*`、`userscript:*`）。字符串值保持不变（不破坏 IPC 契约测试与 `ui:command` 等既有事件）。
- `electron/ipc/register*.ts` 139 处 `handle('…')` + 21 处 `on('…')`、`preload.ts` 158 处、`RealtimeSubmissionService.ts` 与 `userScriptRuntimeBridge.ts` 内 4 处，全部改用常量。
- `check-architecture.mjs` 新守卫：`ipcMain.(handle|on)\(['"]` 与 `ipcRenderer.(invoke|send|on)\(['"]` 字面量预算 = 0。

### R2 shared types（高-2，D9）
- `src/shared/types/{problem,submission,stats,coach,browser,scripts,sites,credentials,cookies,notes,backup,ai,rating,config,window}.ts`：把 `electron-env.d.ts` 的 112 个类型改为 zod schema + `export type X = z.infer<…>`（实体类型）或纯 `export type`（仅编译期用的 UI 事件形状）。
- 主进程 72 处同名 `export interface` 改为 `import type { X } from '../../shared/types/x'`（相对路径，`backend/quality.md`）。
- 渲染进程 10 处同名 + 6 组改名副本（`HomeOverviewStats`、`SettingsOverviewStats`、`SidebarProblemRecord`、`HomeProblemRecord`、`HomeRecommendation`、`ImportPreviewSite`、`SiteConfigView`、`NoteItem`、两份 `CodeforcesAccount`）删除，改 `import type from '@shared/types/x'`；确需子集的用 `Pick<>`。
- 删除 `electron-env.d.ts`（`ProcessEnv` 增强移到 `src/main/env.d.ts`）；`tsconfig.tests.json` include 同步。

### R3 preload `window.api`（D15，frontend §2.3）
- `electron/preload.ts` → `src/preload/index.ts`：`const api = { problem: { listRecent: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.LIST_RECENT, input) as Promise<ListRecentOutput>, … } }`，按域分组（模板 `ipc-electron.md` 结构）；`contextBridge.exposeInMainWorld('api', api)`；`declare global { interface Window { api: typeof api } }`。
- 返回类型来自 `@shared/types`（preload 由 Vite 打包，可用 alias）；删除 85 处 `as Promise<X>` 手写断言。
- 渲染层 155 处 `window.electronAPI.x(...)` 改 `window.api.domain.x(...)`；9 个 `*Api.ts` 若退化为纯转发则删除，保留有组合逻辑的（如 `loadProblemDetail` 并发两次调用）。
- `tests/ipc/preloadSurface.test.ts` 改断言 `api` 结构；`electronMock.exposedMainWorld` 键名改 `api`。
- 架构守卫"渲染层只经 `*Api.ts` 访问"改为"渲染层只经 `window.api` 且只在 hooks/ 与 `*Api.ts` 中访问"。

### R4 数据刷新订阅（高-7，模板 `ipc-electron.md` Data Refresh）
- 主进程：`src/shared/constants/channels.ts` 加 `DATA.CHANGED = 'data:changed'`，payload `{ tables: ('problems'|'submissions'|'notes'|'stats'|'sites'|'scripts'|'credentials'|'coach')[] }`；所有写路径（repository mutations、SubmissionBatchWriter、TrackingService、NoteService、backup import、sync）在事务提交后广播；现有 `problems:updated` 保留为 `DATA.CHANGED` 的别名一版后删除。
- preload：`api.data.onChanged(handler): () => void`。
- 渲染层：`src/renderer/src/context/DataRefreshContext.tsx`（模板形状 `onDataRefresh`）+ `src/renderer/src/hooks/useIpcQuery.ts`：`useIpcQuery(fetcher, deps, { tables })` 返回 `{ data, isLoading, isRefetching, error, refetch }`，初次加载与 refetch 区分（模板 `react-pitfalls.md`）。
- 15 个取数组件迁到 `useIpcQuery`；`App.tsx` 4 处竞态模板删除。

### R5 时间戳迁到 Unix 毫秒（D1，A5，高-5 根治）
- migration `030_timestamps_to_unix_ms.ts`：对 65 个 TEXT 时间列逐表 `ALTER TABLE … ADD COLUMN <col>_ms INTEGER` → `UPDATE` 转换（识别 `YYYY-MM-DDTHH:mm:ss.SSS`（本地）与 `…Z`/`+08:00`（UTC/带偏移）两种历史格式；本地格式按**执行迁移时的系统时区**解释并在迁移日志记录时区）→ 重建表去掉旧列（SQLite 无 DROP COLUMN 的老版本兼容路径已在 013 用过）。`local_day` 列保留，改由毫秒 + 系统时区派生。
- `electron/shared/time.ts` 只剩 `nowMillis()`、`toLocalDay(ms)`、`formatForDisplay(ms)`（`Intl.DateTimeFormat('zh-CN', { timeZone })`）；`nowBeijing/toBeijing/toChinaStandardTime` 删除；`stats/date.ts` 与 `periodSummaryDates.ts` 改基于毫秒。
- repository 返回 `number`；shared types 中时间字段 `z.number()`；渲染 11 处消费点改 `formatForDisplay`。
- `DATABASE_SCHEMA.md` 时间规则改写；`DATABASE_MIGRATION_ROLLBACK.md` 记录 030 的回滚（用迁移前自动备份）。
- 备份导出 JSON 的时间字段同步为毫秒；导入器兼容旧 JSON（字符串→毫秒）。

## Acceptance Criteria

- [ ] 架构守卫：IPC 字面量 0；`grep -rn "electronAPI" electron src tests` = 0；`electron-env.d.ts` 不存在。
- [ ] `grep -rhoE "^export (interface|type) \w+" electron src | sort | uniq -d` = 0（跨文件无同名类型）。
- [ ] `window.api` 类型完全由 preload 推导：删除任一 preload 方法，渲染层对应调用 `tsc` 报错（用一次临时删除验证）。
- [ ] `Dashboard`、`ProblemDetail` 在后台 `syncCodeforces` 写库后 2 秒内自动刷新（Playwright 用例）。
- [ ] refetch 期间 `CredentialsPage`、`CoachMetricsView` 不显示骨架屏（`isRefetching` 路径）。
- [ ] migration 030：用 rc.1 真实库副本（`tests/db/fixtures/rc1.sqlite`，脱敏）升级后所有时间列 `typeof === 'integer'`，抽样 20 行与原字符串按时区换算一致；`user_daily_stats` 重算结果与升级前一致。
- [ ] `grep -rn "toISOString\|nowBeijing\|toBeijing" electron src` 只剩日志/文件名场景（≤ 5 处，各有注释）。
- [ ] `pnpm test:all` 全绿；`tests/ipc` 契约测试覆盖 158 个 channel。

## Out of Scope

- Drizzle（阶段 3）：本阶段 migration 030 仍用现有手写迁移器，是最后一个手写 migration。
- 目录搬迁（`electron/` 仍在，只新增 `src/shared` 与 `src/preload`）。

## Notes

- 前置：阶段 1（zod、返回形状）。
- 顺序：R1 → R2 → R3 → R4 → R5。R5 单独分支 `feat/db-unix-ms-timestamps`，PR 需附升级前后对照数据。
- 风险：R5 是用户数据迁移，`initDbAtPathWithMigrationSafety` 的备份 + failure marker 是安全网；PR 前必须在三份不同时期的真实库副本上验证。
