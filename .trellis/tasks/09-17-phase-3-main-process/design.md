# 阶段 3 技术设计

## 0. 启动评审与当前切片（2026-11-07）

本节优先于后续历史示例。依据`research/start-readiness.md`，第一交付A0只包括依赖、
完整schema、typed client与行为/结构等价测试。候选固定版本为drizzle-orm0.45.4、
drizzle-kit0.31.11，安装后按实际API和Electron ABI验证，不采用beta。

- A0新代码写`src/main/db/{schema,client}.ts`，旧`electron/db/connection.ts`仍拥有连接/备份/
  migration/关闭生命周期。工厂`createDrizzleClient(sqlite)`只包装传入连接，不能import即开库。
- schema覆盖25表；沿用现有snake_case列名及精确null/default/PK/unique/partialindex/CHECK/FK，
  不添加模板示例中的额外默认值或业务约束。82时间列映射timestamp_ms，读Date、写Date，
  DTO输出明确getTime，绝不把Date直接送IPC。BLOB使用buffer模式，0与null独立验证。
- A0提供`drizzle.config.ts`和`db:generate`，schema生成输出`drizzle/`，不运行push/migrate。
  用生成SQL构造空临时库，与生产0→30库逐表比较列/默认值/索引/FK和CHECK行为；生成物若
  自动命名约束导致非语义差异须明确比较，不因文字不同删约束。测试不使用用户数据库。
- A1基线引导必须验证连续1–30台账与真实schema，而非只看MAX=30；读取固定版本Drizzle
  migrator的hash/timestamp台账契约，缺资源/未知schema安全失败。Drizzle-only pending也必须
  触发原备份及failure marker，禁止绕开安全层。A0不提前写台账或激活此路径。
- `generate`读取schema代码和snapshot；数据库反向解析是`pull`，不能混称。A0只生成/核对
  schema，后续才固定不可变基线hash并打包资源。
- 现有IPC的返回形状（数组/对象/联合）保持，不套用下方示例改变公共接口。R4事务通知scope
  包住实际commit调用，部分autocommit语义不变。不新增tag或在dev执行release-it。
- 当前规模：25表、electron321个TS文件、250处prepare；排除迁移222处，repository162处。
  main1164/TabManager2494/CoachOrchestrator1474行，仅作分批规划，不硬套旧计数。

## 1. 目标目录

### A2a 题目总览只读查询（A1验收后的下一切片）

以 `research/a2-problem-queries.md` 为行为清单，只转换现有 `problem/overview.ts` 的四条
查询，保持同步函数及兼容导出口；不移动目录，不改schema、事务、IPC或其他域。

- 每次用 `createDrizzleClient(getDb())` 包装当前连接，不缓存已关闭连接、不新增全局ORM单例。
- 总题数/平台分布只过滤 `problems.deleted_at IS NULL`；用 `count()` 而非 nullable id 的
  `count(id)`，分布只按count降序，不新增同分排序保证。
- 今日访问保持本地日期 `[start,end)` 与distinct problem_id，不增加join或软删除过滤；
  参数用 `new Date(ms)`，由timestamp_ms列编码。最近活跃仍包含tombstone事件，返回number/null，
  epoch0不能变null。
- 新增真实临时库行为测试、旧SQL oracle对照、生命周期/只读/R4无事件断言，纳入test:db。
  原生Electron repository测试补numeric/epoch0证据。
- nullable TEXT PK与非空ID DTO政策、recent状态filter-after-limit、写入事务与omnibox分别留到
  后续切片；不要用类型断言、改schema或过滤掉存量数据偷渡政策。

### A1 启动契约（2026-11-07，优先于旧基线示例）

A0已提交`e1e3ae0`，PR #8 CI `42337708058`全绿；下一切片按
`research/a1-migration-protocol.md`接安全迁移器，不改业务repository或目录。

- 默认`initDbAtPathWithMigrationSafety`先校验编译固定的Drizzle SQL/hash/journal，再开库；
  生产`initDb`显式提供appRoot/packaged资源路径。测试可显式传资源集合，不新增可重定向SQL的
  生产环境变量。同步`initDbAtPath`与显式`options.migrations`（含[]）仍legacy-only。
- legacy台账必须是已知连续prefix且名字正确；有业务表却没台账不是新库。旧库升级到30后
  验证完整物理schema，再登记基线，不执行基线CREATE到已有表。现有baseline-only库也验结构。
- 默认ledger使用已安装Drizzle定义，全部记录须是已知hash/timestamp的连续prefix，不依赖
  upstream只看最大timestamp。未知/重复/未来/损坏ledger拒绝；baselinehash和when固定不重生成。
- 结构对照以hash已验证SQL在内存库构造的metadata为基准，忽略仅Drizzle ledger；只规范化
  A0证明的隐式UNIQUE/index表达差异。其他表、列、CHECK、索引、FK、view/trigger漂移失败。
  日后已应用非baseline迁移时不再拿旧结构比较，必须按对应版本契约扩展验证，不能空库重放任意DML。
- 基线登记与后续Drizzle-only迁移都算pending写入；一次SQLite backup覆盖legacy→baseline→
  later全部步骤。failure marker保留旧pendingMigrations，另加optional pendingMigrationKeys，
  键为`legacy:<version>`/`drizzle:<tag>`，不伪造numeric版本号。原错误/恢复错误分开。
- `src/main/db`新增resource/schema-validation/migrate模块；metadata查询允许在这一DB边界，
  SQL守卫扩大扫描而非整体豁免src。资源仅复制SQL和journal到packagedresources/drizzle。
- 新增fresh/21/24/29/30/已登记/后续失败恢复/资源缺失损坏/伪造台账/结构漂移/explicitoverride
  测试，真实Electron与打包应用核对实际resource和baselineledger。A1不发布、不操作用户原库。

```
algo-electron/src/main/
├── index.ts                     # 入口 < 150 行
├── env-setup.ts                 # 阶段 1 的 envSetup 移入
├── env.d.ts                     # ProcessEnv
├── app/
│   ├── bootstrap-services.ts    # 构造 AppContext（原 whenReady 265 行）
│   ├── app-context.ts           # 22 个单例的类型化容器
│   ├── single-instance.ts  main-process-errors.ts  startup-smoke.ts  theme-controller.ts  chromium-flags.ts  app-protocol.ts
├── db/
│   ├── client.ts  schema.ts  migrate.ts  drizzle.config.ts
│   ├── legacy-migrations/001_… 030_…   # 只供新库建到基线
│   └── migration-backup.ts      # 原 backup/sqliteMigrationBackup.ts
├── ipc/
│   ├── index.ts                 # registerIpc(ctx)
│   ├── guard/{trusted-sender.ts, payload-limits.ts}
│   └── {problem,submission,stats,ai,notes,backup,site,user-script,credential,cookie,coach,browser,window,download,rating,config}.handler.ts
├── services/
│   ├── logger.ts                # electron-log（阶段 1）
│   ├── data-events.ts           # 阶段 2
│   └── {domain}/
│       ├── types.ts
│       ├── procedures/*.ts
│       ├── lib/**
│       └── README.md
└── lib/                         # 主进程内共享：errors.ts timing.ts typed-emitter.ts atomic-json-snapshot-store.ts time.ts
```
`drizzle/` 迁移 SQL 放 `algo-electron/drizzle/`，`electron-builder.json5` `extraResources` 打包（模板 `database.md` 的 `process.resourcesPath` 路径）。

### 域映射（旧 → 新）

| 旧目录 | 新域 |
| --- | --- |
| `db/repositories/problem`, `problemVisitRepository`, `tracking/` | `services/problem`（visits 归 problem） |
| `db/repositories/submission`, `submissions/`, `adapters/shared/frontendVerdict*` | `services/submission` |
| `db/repositories/stats`, `ai/` | `services/stats`, `services/ai` |
| `notes/` | `services/notes` |
| `backup/`（除迁移备份） | `services/backup` |
| `sites/`, `parsers/`, `adapters/`, `db/repositories/site` | `services/site`（`lib/adapters/<site>/`） |
| `scripts/`, `db/repositories/userScript*`, `downloads/userScriptNavigation` | `services/user-script` |
| `credentials/`, `db/repositories/credential` | `services/credential` |
| `cookies/`, `db/repositories/cookieRecord` | `services/cookie` |
| `coach/`, `db/repositories/coach` | `services/coach` |
| `browser/`, `contextMenus/browserContextMenu`, `shortcuts/` | `services/browser` |
| `windows/`, `contextMenus/appMenu` | `services/window` |
| `downloads/`（其余） | `services/download` |
| `rating/`, `db/repositories/account` | `services/rating` |
| `diagnostics/` | `services/diagnostics` |
| `app/config.ts` | `services/config` |
| `shared/` | `src/main/lib/` |

## 2. procedure 形状（模板 `api-module.md`）

```ts
// services/problem/procedures/list-recent.ts
const log = logger.scope('problem:list-recent')
export function listRecentProblems(input: ListRecentProblemsInput): ListRecentProblemsOutput {
  const parsed = listRecentProblemsInput.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message, code: 'VALIDATION' }
  try {
    const rows = db.select().from(problems).where(...).orderBy(desc(problems.lastVisitedAt)).limit(parsed.data.limit).all()
    return { success: true, data: rows.map(toProblemRecord) }
  } catch (error) {
    log.error('failed', { error })
    return { success: false, error: 'Failed to list problems', code: 'IO' }
  }
}
```
- handler：`handleFromShell(IPC_CHANNELS.PROBLEM.LIST_RECENT, [listRecentProblemsInput], (_e, input) => listRecentProblems(input))`。
- 校验发生两次（guard 层 zod + procedure 内 safeParse）是刻意的：guard 保证 wire 安全，procedure 保证可脱离 IPC 单测。同一 schema 对象，无重复定义。
- `Date` ↔ 毫秒：Drizzle `timestamp_ms` 返回 `Date`，`toProblemRecord` 用 `.getTime()`（模板 `timestamp.md`）。

## 3. Drizzle 基线引导

```ts
// db/migrate.ts
export function runMigrations(sqlite, db): MigrationResult {
  const legacyVersion = readLegacyVersion(sqlite)          // schema_migrations 最大 version 或 null
  if (legacyVersion === null) runLegacy(sqlite, legacyMigrations /* 001–030 */)
  else if (legacyVersion < 30) runLegacy(sqlite, legacyMigrations.filter(m => m.version > legacyVersion))
  markDrizzleBaselineIfMissing(sqlite)                     // 在 __drizzle_migrations 插入 0000_baseline 记录（hash 与文件一致）
  migrate(db, { migrationsFolder })                        // 0001+ 由 drizzle-kit 生成
}
```
- `0000_baseline.sql` 由 `drizzle-kit generate` 在 030 之后的空库上生成一次，之后**不再修改**。
- 测试：新库路径、rc.1 库路径、中途版本库路径三条。

## 4. AppContext

```ts
export interface AppContext {
  db: DrizzleDb; sqlite: Database
  windows: WindowManager; views: ViewRegistry; tabs: (w: AppWindow) => TabManager
  coach: CoachOrchestrator | null; pet: CoachPetWindow | null
  userScripts: UserScriptService; downloads: DownloadManager; credentials: CredentialVault; cookies: CookieVault
  submissions: RealtimeSubmissionService; tracking: TrackingService; sync: SyncService
  config: ConfigService; dataEvents: DataEvents; logger: Logger
}
```
`bootstrapServices(): Promise<AppContext>` 顺序构造；`registerIpc(ctx)` 与 `createShellWindow(ctx)` 只读 ctx。模块级 `let` 归零（架构守卫已禁 `win/tabManager` 单例，扩展为禁止 `src/main/index.ts` 有任何模块级 `let`）。

## 5. TabManager 拆分边界

| 新文件 | 职责 | 来源行（现 TabManager.ts） |
| --- | --- | --- |
| `tab-manager.ts` | 标签表、激活、公开 API | 类骨架 |
| `navigation-policy.ts` | `NavigationDecision`、URL 判定、阻止原因 | 与 `main.ts:307-316` 合并 |
| `view-lifecycle.ts` | `WebContentsView` 创建/挂载/销毁/bounds | `createView*`、`disposeView*` |
| `tab-events.ts` | 逐页导航/标题/加载事件发布 `{windowId, tabId, webContentsId, url, isMainFrame, reason}` | 事件回调块 |
| `tab-ordering.ts` | 排序、拆出、过户 | 与 `TabTransferCoordinator` 协作 |

原则：先按现有 19 个协作文件的边界提取，每提一块跑 `tests/browser`（28 文件）。

## 6. CoachOrchestrator 拆分边界

| 新文件 | 职责 |
| --- | --- |
| `coach-orchestrator.ts` | 接线、生命周期、对外 API |
| `contest-auditor.ts` | ContestGuard 事件 → 静默 + `coach_interventions` 审计写入（红线 §7） |
| `llm-hint-coordinator.ts` | 提示请求生命周期、过期结果丢弃、额度 |
| `session-event-router.ts` | `ProblemSessionTracker` 事件 → RuleEngine → 干预 |

## 7. 兼容 / 回滚
- R1 在旧目录完成并合入后再做 R2，保证 Drizzle 问题不与移动混淆。
- R2 PR 用 `git diff -M90%` 审阅：应全是 rename + import 路径变更。
- 回滚：R1 若在生产库出问题，Drizzle 与裸 SQL 读同一文件、同一 schema（030 之后），可 revert 代码不动数据。
