# 阶段 2 技术设计

## 1. 目录（本阶段新增）

```
algo-electron/src/
├── shared/
│   ├── constants/channels.ts     # IPC_CHANNELS as const
│   ├── constants/errorCodes.ts   # 阶段 1 已建
│   └── types/
│       ├── common.ts             # createOutputSchema（阶段 1）
│       ├── ipc/*.ts              # 输入 schema（阶段 1）
│       └── {problem,…,window}.ts # 实体/事件 schema + 类型
└── preload/index.ts              # window.api
```
`electron/` 与 `src/`（渲染）本阶段不动。`@shared` alias 在 renderer / preload / vitest 生效；主进程用相对路径 `../../src/shared/...`（模板 `backend/quality.md`；阶段 3 搬到 `src/main` 后变成 `../shared/...`）。架构守卫需放行主进程 import `src/shared`（现禁止 `electron` → `src`）。

## 2. channel 常量形状

```ts
export const IPC_CHANNELS = {
  BROWSER: { NAVIGATE: 'browser:navigate', GO_BACK: 'browser:goBack', /* … */ },
  PROBLEM: { LIST_RECENT: 'problem:listRecent', GET_DETAIL: 'problem:getDetail', DELETE: 'problem:delete', UPDATED: 'problems:updated' },
  DATA: { CHANGED: 'data:changed' },
  UI: { COMMAND: 'ui:command' },
  OJ: { SUBMISSION_GET_TOKEN: 'oj-submission:getDocumentToken', CREDENTIALS_FILL: 'oj-credentials:fill', CREDENTIALS_CAPTURE: 'oj-credentials:capture' },
  // …
} as const
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS][keyof (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]]
```
- 值不改。`tests/ipc/channels.test.ts`：常量值集合 == 现有 158 + 内部 channel 快照（防止改值）。
- `trustedSender.handleFromShell(channel: IpcChannel, …)` 收窄参数类型 ⇒ 传字面量直接编译错误（比守卫更早）。

## 3. 类型单一来源

| 类型来源 | 规则 |
| --- | --- |
| 数据库实体（`ProblemRecord`、`SubmissionRecord`…） | `src/shared/types/<entity>.ts` 用 zod 定义**输出**形状（含 `createdAt: z.number()`）。阶段 3 Drizzle 的 `$inferSelect` 与之对照，procedures 负责转换。 |
| IPC 输入 | `src/shared/types/ipc/*.ts`（阶段 1） |
| 主进程→渲染事件 payload（`UiCommand`、`TabInfo`、`CoachContestModePayload`…） | `src/shared/types/<domain>.ts`，判别联合用 `z.discriminatedUnion` |
| 仅主进程内部（`Migration`、`TrustedSenderCheck`…） | 留在主进程模块，不进 shared |

改名副本处理：`HomeOverviewStats` → `OverviewStats`；`HomeProblemRecord` → `Pick<ProblemRecord, …>`；`NoteItem` → `Omit<NoteRecord, 'problem_id'>`；两份 `CodeforcesAccount` 合为 `PlatformAccount`（主进程定义为准，渲染层补 `handle` 从 `platform_handle` 派生）。

## 4. preload

```ts
// src/preload/index.ts
const api = {
  problem: {
    listRecent: (input: ListRecentProblemsInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.LIST_RECENT, input) as Promise<ListRecentProblemsOutput>,
    onUpdated: subscribe(IPC_CHANNELS.PROBLEM.UPDATED),
  },
  data: { onChanged: subscribe<DataChangedPayload>(IPC_CHANNELS.DATA.CHANGED) },
  window: { minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE), … },
  // 域：browser tab window problem submissions cookies credentials stats ai notes sites scripts backup config rating coach data
} as const
function subscribe<T>(channel: IpcChannel) {
  return (handler: (payload: T) => void): (() => void) => {
    const wrapped = (_e: IpcRendererEvent, p: T) => handler(p)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  }
}
contextBridge.exposeInMainWorld('api', api)
declare global { interface Window { api: typeof api } }
```
- `as Promise<X>` 只保留在 preload 这一处（`ipcRenderer.invoke` 返回 `Promise<any>`，这是唯一合法的断言点），X 来自 shared 输出 schema。
- 多参数 invoke（现 `invoke('x', a, b, c)`）改为单对象参数 `invoke('x', { a, b, c })`，与阶段 1 的 zod 对象 schema 对齐；主进程 handler 签名同步。这是本阶段唯一改变 wire 形状的地方，`tests/ipc` 契约测试同步。
- 31 个"暴露而无消费者"的 preload 方法（`docs` 中记录）在本阶段删除；守卫加"preload 方法必须有渲染层调用者"。

## 5. 数据刷新

- 主进程 `src/main/services/data-events.ts`（阶段 3 前放 `electron/shared/dataEvents.ts`）：`emitDataChanged(tables)` 做 50ms 合并去重后 `AppWindow.broadcast(IPC_CHANNELS.DATA.CHANGED, { tables })`。
- 写路径接入点：`db/repositories/*/mutations.ts`（问题：repository 不该知道窗口 ⇒ 用 `EventEmitter` `dataEvents.emit('changed', tables)`，`main.ts` 装配时订阅并广播）。
- 渲染层 `useIpcQuery`：
  ```ts
  export function useIpcQuery<T>(fetcher: () => Promise<T>, deps: unknown[], opts: { tables?: DataTable[]; enabled?: boolean }) {
    // state: data | undefined, status 'idle'|'loading'|'refetching'|'error'
    // effect 1: initial fetch with cancelled flag
    // effect 2: onDataRefresh(tables) → refetch (status 'refetching', keep data)
  }
  ```
  `null/[]` 三态的现有组件改为 `status === 'loading'` 判断，`isRefetching` 不显示骨架。

## 6. 时间戳迁移（migration 030）

- 转换函数 `parseLegacyTimestamp(text, tz): number | null`：
  - `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?$/` → 本地时间，用 `Date.UTC(...) - tzOffsetAt(thatInstant)`（用迁移时系统时区；记录到 `schema_migrations.name` 后缀或单独日志）。
  - 以 `Z` 或 `±HH:MM` 结尾 → `Date.parse`。
  - 其他 → `null` 并记日志（不中断）。
- 表/列清单：从 `docs/DESIGN/DATABASE_SCHEMA.md` 与 001–029 提取 65 列，写成数组驱动循环；每表一个事务。
- `local_day`：`user_daily_stats.local_day` 保留字符串（它是分组键），由 `toLocalDay(ms)` 生成；重算一次 `recomputeDailyStatsForDates(all)`。
- 备份导出 JSON `schemaVersion` 升到新值；导入器按 `schemaVersion` 分支转换。
- 回滚：`sqliteMigrationBackup` 自动备份 + `DATABASE_MIGRATION_ROLLBACK.md` 步骤；030 失败 ⇒ 自动恢复备份 + failure marker（现有机制）。

## 7. 测试

- 单元：`tests/shared/time.test.ts`（毫秒/本地日/展示）、`tests/db/migration030.test.ts`（三种格式 + 三个时区 `TZ=` 环境变量各跑）。
- 集成：`tests/db/fixtures/` 放三份脱敏真实库（v1.0.0、beta.2、rc.1 时期），`tests/db/upgradePath.test.ts` 逐份升级到 030 并断言行数、时间列类型、抽样值。
- 契约：`tests/ipc/channels.test.ts`、`preloadSurface.test.ts`、`apiConsumers.test.ts`（每个 preload 方法有调用者）。
- UI：Playwright `dataRefresh.pw.spec.ts`。
