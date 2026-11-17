# 阶段 3 技术设计

## 1. 目标目录

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
