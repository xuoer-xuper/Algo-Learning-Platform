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
- migration `030_timestamps_to_unix_ms.ts`：将实测 82 个 TEXT 时间列（含迁移台账）迁为 Unix 毫秒，保留约束、索引、外键和非时间字段；无损转换失败时回滚并保留备份/failure marker，不将非法非空值静默改成 NULL。`local_day` 列保留，改由毫秒 + 系统时区派生。
- 历史时间解释以 Git 写入代码为证据：显式 `Z`/offset 按绝对时间处理；普通无后缀值沿用旧版系统本地时间契约；script/credential/runtime 域的无后缀值按已验证的固定 UTC+8 写入契约转换。记录迁移时系统时区与适用策略，不根据函数名猜测，不自动修正无证据的外部站点时间。
- 当前业务时间 API 使用 `nowMillis()`、`toLocalDay(ms)`、`formatForDisplay(ms)`（`Intl.DateTimeFormat('zh-CN', { timeZone })`）；当前 repository/IPC 不再调用 `nowBeijing/toBeijing/toChinaStandardTime`。已发布 001–029 的导入保持兼容，允许其冻结的 legacy helper 作为明确例外；`stats/date.ts` 与 `periodSummaryDates.ts` 改基于毫秒。
- repository 返回 `number`；shared types 中时间字段 `z.number()`；渲染 11 处消费点改 `formatForDisplay`。
- `DATABASE_SCHEMA.md` 时间规则改写；`DATABASE_MIGRATION_ROLLBACK.md` 记录 030 的回滚（用迁移前自动备份）。
- 备份导出 JSON 的时间字段同步为毫秒；导入器兼容旧 JSON（字符串→毫秒）。

## Acceptance Criteria

- [x] 架构守卫：IPC 字面量 0；生产代码无旧 `electronAPI` 调用（负向守卫自身字符串不计）；`electron-env.d.ts` 不存在。
- [x] `grep -rhoE "^export (interface|type) \w+" electron src | sort | uniq -d` = 0（跨文件无同名类型）。
- [x] `window.api` 类型完全由 preload 推导：删除任一 preload 方法，渲染层对应调用 `tsc` 报错（用一次临时删除验证）。
- [x] `Dashboard`、`ProblemDetail` 在后台 `syncCodeforces` 写库后 2 秒内自动刷新（Playwright 用例）。
- [x] refetch 期间 `CredentialsPage`、`CoachMetricsView` 不显示骨架屏（`isRefetching` 路径）。
- [x] migration 030：由固定 Git 提交的历史迁移代码重建 v1.0.0/beta.2/rc.1 三种 schema，记录来源 hash 并用合成数据覆盖旧时间格式；测试库在临时目录生成，不提交二进制 SQLite，不称为真实用户历史库。三条路径升级后非空时间列均为 integer、值与历史写入策略一致、关系/约束/行数完整；统计与按相同策略计算的期望值一致，时区跨日差异单独说明。
- [x] 现有真实当前库及旧备份只在隔离副本上补充升级验证；原件不修改、不提交。缺失不可恢复的 v1.0.0 实际用户库不再作为必须提供的前置条件；历史代码重建与真实样本证据分开报告。
- [x] 当前业务写入及 IPC 时间统一毫秒；`nowBeijing/toBeijing/toChinaStandardTime` 的剩余生产调用只允许已发布旧迁移的兼容路径，逐处记录。`toISOString` 仅允许日志/文件名或明确外部协议边界，不能用其生成数据库/普通 IPC 时间。
- [x] `pnpm test:all` 全绿；IPC常量快照覆盖实测179个channel，preload暴露面/输入输出/订阅契约测试通过。

## Out of Scope

- Drizzle（阶段 3）：本阶段 migration 030 仍用现有手写迁移器，是最后一个手写 migration。
- 目录搬迁（`electron/` 仍在，只新增 `src/shared` 与 `src/preload`）。

## Notes

- 前置：阶段 1（zod、返回形状）。
- 顺序：R1 → R2 → R3 → R4 → R5。R5 单独分支 `feat/db-unix-ms-timestamps`，PR 需附升级前后对照数据。
- 风险：R5 是用户数据迁移，`initDbAtPathWithMigrationSafety` 的备份 + failure marker 是安全网；PR 前完成三种历史代码重建路径及已有真实样本的隔离副本验证。
- 2026-11-04 用户纠正：不要要求已不存在的 1.0.0 用户库，改查 Git 历史确认旧版实现并重建验证输入；重建样本不得冒充真实历史数据。
