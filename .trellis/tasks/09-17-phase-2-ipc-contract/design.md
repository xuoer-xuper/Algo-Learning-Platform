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

> **2026-11-04 R2 收口**：`CoachLlmConfig` 继续以 shared zod schema 推导为唯一来源，
> `LlmConfigStore` 直接 import 该类型，删除 `app/config.ts` 的同名 interface；不改变存储或
> IPC 形状。`getCoachConfigForRenderer` 仍移除 `encrypted_api_key`，密文也不传给 renderer。
> 新增 AST 架构守卫，区分重复定义与合法 re-export。

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

> **2026-11-04 实施勘误（优先于本节旧示例）**：实测写路径、17 个取数组件和事务清单见
> [R4 调研](./research/r4-data-refresh.md)。保持既有时间格式、SQL 语义和目录，不涉及 R5。

- 八个 `tables` 值是逻辑失效域，不是完整 SQL 表清单；account/rating 写入映射 `stats`，
  visits 映射 `problems` + `stats`。Cookie metadata 查询本身会写库，**不接入**此次总线，
  避免 CredentialsPage 查询触发无限刷新；事件不携带行数据、ID、密钥或文件路径。
- `emitDataChanged(tables)` 的生产端只在成功写入之后标记。已有外层事务调用必须由同步
  `withDataChangeTransaction(() => db.transaction(operation)())` 包住，嵌套成功并入父集合，
  抛错丢弃当前层；最外层提交成功才发布。不得只包事务 callback，也不得将非事务批处理
  伪装成事务：SubmissionBatchWriter 部分写入已经提交时，即使后续报错也必须刷新。
- 总线不 import Electron/window；主进程 bridge 使用现有 `WindowManager.sendToAll`，
  50ms 固定窗口合并去重，退出时清理订阅与定时器。不存在 `AppWindow.broadcast` 方法。
- `PROBLEM.UPDATED` 保持原始字符串和无 payload 行为一版，**不是相同字符串别名**。
  新 renderer 只订阅 `DATA.CHANGED`；旧公开订阅暂无消费者时，在消费者守卫中仅为该方法
  记录有期限的兼容豁免，不制造虚假调用。
- renderer 新增 `src/context/DataRefreshContext.tsx`、`src/hooks/useIpcQuery.ts`；provider
  通过 `*Api.ts`/hooks adapter 接 IPC，保持架构边界。测试与独立 harness 应显式接 provider。
  query 保留 null/[] 等成功值，区分初载/refetch，key 改变后忽略旧请求，自动刷新错误不产生
  未处理 rejection，同 key 失败保留已加载数据，取消订阅后不再更新。
- App 四处模板是 snapshot + live event，不是数据表刷新。用独立 `useIpcSubscription`
  消除重复代码，保持 subscribe-before-fetch、live-wins、capture result 匹配清理和卸载隔离。
- 保留笔记未保存草稿、凭据编辑草稿和 Coach mock 模式；刷新列表不能覆盖编辑器内容。
  真实同步 Playwright 使用临时数据库、实际 SyncService/writer/preload/bridge 和确定性
  测试网络响应，不把仅改 mock 数组的截图测试当成真实 sync 验收。

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

> **2026-11-04 用户纠正与 Git 证据**：不再以不可恢复的三份真实历史库
> 为唯一验收输入。先完成 `research/r5-git-history.md` 和 `research/r5-reconstruction-plan.md`
> 的固定提交重建：`0758b253`/schema21、`b27debfc`/schema24、`7d052efc`/schema29。
> 只把文本 schema/provenance/seed 纳入版本控制，SQLite 文件在临时目录生成。
> v1.0.0/beta.2 脚本时间为 `toISOString()` 带 Z，`e35212b` 后才改固定 UTC+8 无后缀，
> 因而已知 script 写入的旧新语义可按后缀与列来源区分，不需要猜同一无后缀值的版本。

- 重建生成器仅在显式再生成时用 `git show` 读取固定提交的 migration/runtime helper 闭包，
  不 checkout、不运行旧 app/bootstrap、不读用户 profile；记录源 blob hash 和 snapshot hash。
  普通 CI 读取已提交文本快照，无需网络、旧 tag 或完整 Git 历史。
- 第一块只证明 21/24/29 重建库升级到现有 29 的路径，不能称为 030 完成；随后 030 验收
  扩展相同 fixtures，并补现有真实 24/29 样本的隔离副本。
- 82 列显式清单排除 `run_at`、HTTP `last_modified` 与日期分组键；显式 offset 优先，
  无后缀按历史列写入契约（local / UTC+8）转换。历史 VJudge 透传无后缀值没有源时区信息，
  按既有系统本地契约处理并记载这一限制，不凭日期或平台猜测时区。
- 非法非空值中止并恢复备份；禁止静默 NULL。表重建必须在外层事务前安排外键状态，
  用完整事务与 `foreign_key_check` 防止级联删除，不在事务中假装 `foreign_keys=OFF` 生效。
- 统计重算使用显式传入的迁移 DB；迁移运行时全局 getDb 尚未赋值。毫秒迁移后按实际
  时刻派生 local_day，UTC/offset 跨日造成的正确重分组要与期望比较，不强求旧错误聚合一致。
- 旧统计曾对 `.0` 毫秒文本使用 `substr(...,1,10)`，生成十位数字伪日期桶；实库副本各5个，
  含已无事实对应的旧缓存。仅030识别 `^\d{10}$` 的该已知衍生缓存并删除后按全部事实重建，
  原缓存由升级前备份保留；有效日期桶保留元数据，其他非法日期仍拒绝。不得删除事实行或
  把十位数字猜成日期，也不在日常重算入口悄悄清理任意非法数据。
- 不修改已发布 001–029。它们仍直接 import `nowBeijing`：允许冻结的旧迁移兼容 helper
  保留为唯一生产调用例外；新的 repository/IPC 不得再使用。删除 helper 必须先设计完整
  legacy migration 隔离，不以破坏旧迁移换取 grep 为零。

- 转换 parser 接受明确的 local/fixed-UTC+8 策略，支持带 Z/offset 和已知 T/空格 wall-time
  格式；严格验证日期和毫秒，nullable 原值保留 NULL，非法非空值抛错。DST gap/fold 行为
  必须由独立时区测试固定，不采用一次猜测 offset 的算法。
- **2026-11-05 实际副本补充证据**：早期洛谷提交 `5f0c96c` 将 `submitTime * 1000`
  直接绑定 TEXT 列，better-sqlite3/SQLite 会保存为十进制整数加 `.0` 的字符串。
  parser 明确兼容 `^-?(0|[1-9]\d*)\.0+$`，按**毫秒原值**做安全整数/Date范围校验；
  不乘1000、不按长度猜秒，不接受任意数值字符串、非零小数或溢出。此分支与时区策略无关。
- 表重建方案需在 030 实施评审时确定：82 列、完整外键/索引/约束保留，在真正提交后才
  发布刷新；不是“每表嵌套事务即可隔离”。
- `local_day` 保持字符串分组键，由毫秒+系统时区派生；迁移使用显式 DB 的重算入口。
- 备份 JSON 实际字段 `schema_version` 从1升到2；旧1版在预览/冲突比较/导入之前规范化。
- 回滚：`sqliteMigrationBackup` 自动备份 + `DATABASE_MIGRATION_ROLLBACK.md` 步骤；030 失败 ⇒ 自动恢复备份 + failure marker（现有机制）。

## 7. 测试

- 单元：`tests/shared/time.test.ts`（毫秒/本地日/展示）、`tests/db/migration030.test.ts`（三种格式 + 三个时区 `TZ=` 环境变量各跑）。
- 集成：`tests/db/fixtures/` 保存 pinned-source 的 schema21/24/29 文本快照与 provenance，
  `tests/db/historicalUpgradePath.test.ts` 动态生成带合成数据的临时库，先验到29，030实施后
  扩展到30并检查行数、关系、类型、值和回滚；现有真实样本副本作为分开报告的本地补充证据。
- 契约：`tests/ipc/channels.test.ts`、`preloadSurface.test.ts`、`apiConsumers.test.ts`（每个 preload 方法有调用者）。
- UI：Playwright `dataRefresh.pw.spec.ts`。

## 8. R5 实施契约（2026-11-04）

- 纯时间函数放 `src/shared/time.ts`：`nowMillis()`、`toLocalDay(ms)`、
  `formatForDisplay(ms, options?)`、`localDayBounds(day)`、`shiftLocalDay(day, days)`。
  local_day/startDate/endDate 等日历键仍是 YYYY-MM-DD；duration/秒数、HTTP validator 不变。
- `electron/shared/time.ts` 转导出新的毫秒 helper，同时仅保留冻结 `nowBeijing()` 供旧
  001–029 migration 使用；其余当前业务写入必须改 numeric，不用同名字符串 helper 混过检查。
- `electron/shared/legacyTimestamp.ts` 提供 `parseLegacyTimestamp(value, policy, location?)`：
  value 为 string/number/null，policy 为 `'local'|'utc8'`；已有安全整数毫秒保持，NULL保持；
  显式Z/offset优先，严格 T/空格年月日时分秒（可有1–3位小数），无后缀按 policy。
  日历溢出和DST gap拒绝，DST fold采用JS兼容的较早时刻，测试明确该不可恢复歧义。
  错误只含表/列等元数据，不输出原始敏感字段值。
  兼容早期SQLite TEXT affinity保留的整数毫秒 `.0+` 形状，见本节及历史来源记录；
  这是精确旧写入表示转换，不是宽松数字/秒数猜测。
- `electron/db/timestampColumns.ts` 是82列与时区策略显式清单；其他数据/用户JSON不自动识别。
  `Migration.requiresForeignKeysDisabled` 仅030使用；runner在事务外关闭FK，拒绝已有外层事务，
  一次事务执行up、重新prepare台账INSERT、foreign_key_check，成功后提交；finally恢复FK。
  030.up必须断言已在事务内且FK关闭，不能被普通旧runner直接调用。
- 030捕获sqlite_schema表/index/trigger定义，按明确列名替换TEXT类型、创建临时新表并复制转换后行，
  drop原表后rename新表回原名，再重建index/trigger；不rename旧表以免SQLite自动改写外键引用。
  保留所有其他列、CHECK/UNIQUE/BLOB及关系，最终FK/integrity验收；失败由原安全入口恢复备份。
- 台账 applied_at 一起变INTEGER；runner按实际列affinity写字符串（旧阶段）或数值（030后），
  不能在重建台账前缓存INSERT statement；新库仍顺序执行1–29，再030，不修改已发布文件。
- 统计计算拆DB显式参数helper，migration可调用不依赖全局getDb；转换后对旧bucket与新fact日键
  并集重算，旧已空bucket置零保留元数据。activity/feedback local_day从转换后时刻更新。
- AI context schema_version升2，仅转换已定义 `exported_at`、wrong_problems[].last_attempt、
  unreviewed_problems[].last_visited_at、recent_activity[].occurred_at；同步row版本，
  任意raw_json/user-script values/content不递归改写。无法识别的非空context版本安全失败。
- 学习导出 schema_version升2；parse/preview/import均先统一规范化，v1字符串按local历史契约
  转数值，v2必须数值；预览与确认相同语义。`markAffected` 明确区分毫秒值和local_day键。
- 全部跨IPC的时间点（含diagnostics/realtime/download/待安装/Coach指标快照）统一数值；
  外部站点日期在adapter/受控注入桥入口转换，上游秒数显式乘1000，不能靠Number日期字符串。
- 三个worker所有权：core负责DB/迁移/纯时间/legacy parser及DB测试；runtime负责DB以外主进程
  业务/backup/adapters/Coach及其测试；shared-renderer负责schema/preload/renderer及components/UI。
  相互文件不覆盖，类型变更期间的跨worker失败集中集成后验证。
