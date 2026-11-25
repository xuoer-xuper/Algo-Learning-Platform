# 阶段 3 主进程重构到模板布局

## Goal

主进程从 `algo-electron/electron/`（26 个平铺域目录、裸 SQL、三个千行文件）迁到模板的 `src/main/{index.ts, db/, ipc/, services/{domain}/{types.ts, procedures/, lib/}}`，数据库访问改 Drizzle，收敛重复造轮子，文件名统一 kebab-case。

## Requirements

> **2026-11-07 启动评审**：阶段2已合入dev并归档。当前schema为25表（24个应用表和迁移
> 台账）、82个INTEGER时间列；旧计数只作历史估计。新基础代码位于`src/main/db/`，既有
> `electron/`生命周期与repository暂留原位，不同时做目录迁移。用户已授权继续后续阶段。

### 首个可验收切片 A0：Drizzle schema 与客户端

- 固定并验证兼容的`drizzle-orm`/`drizzle-kit`，完整映射030之后的表、列、空值、默认值、
  唯一/部分索引、CHECK、FK和BLOB；时间列采用timestamp_ms，外部接口仍是整数毫秒。
- 客户端封装现有better-sqlite3连接，不打开第二连接、不在import时初始化数据库或读userData。
- 使用临时库验证schema元数据等价、Date/数字边界、epoch0/null、BLOB与事务回滚；
  既有IPC结果、备份/failure marker和R4提交后通知不变。
- 此切片不启用Drizzle迁移器、不写`__drizzle_migrations`基线、不重写业务查询；生成配置
  仅供后续显式schema生成。A0通过后进入A1迁移基线及安全装配，再逐域查询替换。

### R1 Drizzle ORM + drizzle-kit（D12，A3）
- `src/main/db/client.ts`（`drizzle(sqlite, { schema })`，pragma WAL/foreign_keys/busy_timeout 保留）、`schema.ts`（实测25张表，时间列 `integer({ mode: 'timestamp_ms' })`，与阶段2毫秒列一致）、`migrate.ts`（安全装配后使用Drizzle migrator）。
- 历史 001–030 作为**基线**：`drizzle/0000_baseline.sql` = 030 之后的完整 schema；已有库必须验证可信资源、连续版本/名称台账及完整物理结构，安全备份后才登记Drizzle基线，不能只检查version最大值。旧迁移保持冻结，目录迁移时移到 `src/main/db/legacy-migrations/`，供新库及未到030的旧库升级，再交给Drizzle。
- 249 处 `prepare()` 改 Drizzle query builder；114 处 `as Row` 由 `$inferSelect` 消除；`userScript/mutations.ts` 动态 SET 用 `.set(partial)`。
- `initDbAtPathWithMigrationSafety` 的备份 + failure marker 包住 `migrate()`。
- `drizzle.config.ts`；`pnpm db:generate` / `db:migrate` 脚本；`DATABASE_SCHEMA.md` 改为"schema.ts 为准 + 表说明"。

### A2g Recent-list acceptance clarification (2026-11-20)

The final problem-query migration retains all rows and original-site navigation.
Nullable or otherwise route-invalid IDs must not offer working notes/detail
buttons: disable only those actions with a visible accessible reason, using the
existing main route ID policy unchanged. Recent output types reflect null IDs;
detail parent IDs remain string. This bounded compatibility correction is not
permission for the phase-4 renderer redesign, data repair or broader route changes.

### A3a Submission-read acceptance clarification (2026-11-20)

Preserve all existing submission read results and errors, including all baseline
fields, nullable IDs, raw timestamps and native parameter limits. Correct the
read-only timeline submission ID output to allow already-returned null; keep
request/problem IDs, metric outputs and LLM privacy allowlist unchanged. Empty
first-AC batches must still acquire no database. Submission writes remain separate.

### A4b1 Native UI blocker acceptance (2026-11-23)

Actual Electron diagnostics prove the existing shell router's rapid-tab effect
calls flushSync during React rendering. Parent accepts a bounded prerequisite
fix so native acceptance is console-clean rather than suppressing the warning:
non-transition updates remain direct, while a genuine native View Transition
callback still commits the new route before snapshot capture. Preserve tab
selection, burst threshold, stale-callback protection and animation behavior.
This permits ShellRouter.tsx and its transition regression tests only, not a
phase4 router redesign. Native trend assertions remain unchanged.

### A4b2 Streak acceptance boundary (2026-11-20)

Parent accepts the independent daily-read precheck's separate streak scope after
A4b1: preserve current/longest numeric outputs, qualification thresholds, loops,
clock and invalid-day failure timing. Single NULL/invalid rows and paired invalid
rows retain their different existing outcomes. Only streak SELECT and stats-local
dayDiff nullable narrowing change; shared calendar inputs/outputs stay untouched.

### A4b1 Daily-read and chart safety acceptance (2026-11-20)

Parent explicitly accepts the independently reviewed nullable daily-read output
policy and narrow chart consumer correction. Preserve every existing row, raw
day string/null, count, order, limit, cutoff, loader and AI JSON behavior. Both
trend charts must give each row its own categorical position so NULL dates
cannot steal real-date coordinates. NULL displays only as "日期缺失"; nonnull
strings retain existing tick/full-tooltip formatting. This is an intentional fix
of a demonstrated chart bug, not a claim of identical old UI behavior.

This limited phase3 renderer-consumer safety exception is not phase4 redesign.
Only four trend reads, corresponding read types/shared AI shape and the two chart
axes/labels change. No schema/data repair, writer/input/time validation, loader,
privacy/export version, broad UI/layout or historical migration changes. Streak,
insight lists and recomputation remain separately accepted slices.

### A4a Basic-statistics acceptance boundary (2026-11-20)

After A3 acceptance, convert only platform distribution, single-problem visit
aggregates and latest activity time. Keep existing signatures, exact scalar values,
NULL-duration AVG semantics, native SUM overflow and raw latest timestamps. No
new output/nullability/UI decision, filters, date calculations or transaction is
needed. Trends, streak, insight lists and migration-coupled recompute are separate.

### A3b2 First-AC acceptance boundary (2026-11-20)

Convert only the two first-AC state mutations, preserving raw values, original
status transitions, affected-day ordering, actual UPDATE execution, native
failures and caller-owned transaction/notification semantics. Recompute must
prepare all three statements before consuming any iterable, including empty or
throwing inputs. No changes to imports/batch orchestration, read queries, schemas,
migrations, time validation or public outputs. Parent accepts the independent
A3b2 precheck after A3b1 local acceptance; implementation waits for its integration.

### A3b1 Supported-schema acceptance boundary (2026-11-20)

Submission INSERT conversion preserves current frozen030 data/default behavior,
notifications, statement ordering and raw/native values. It does not promise
equivalence after arbitrary manual DDL changes to omitted columns/defaults/views.
Do not weaken startup validation or silently claim per-write schema checks. Keep
damaged-schema failures native and synchronous, without requiring identical
qualified-column wording. Only upsertSubmission changes; first-AC writes remain
separate. This scope is explicitly accepted after independent design review.

### R2 目录迁移（D2、D3）
- `src/main/index.ts`（< 150 行）：`import './env-setup'` → `bootstrapServices()` → `registerIpc()` → `createShellWindow()`；22 个模块级 `let` 收进 `AppContext` 对象由 `bootstrapServices` 返回。
- `src/main/services/{problem,submission,tracking,stats,ai,notes,backup,site,user-script,credential,cookie,coach,browser,window,download,rating,diagnostics}/{types.ts, procedures/, lib/}`：
  - `types.ts` = 该域的 zod 输入/输出 schema（从 `src/shared/types` re-export 或本域私有）。
  - `procedures/` = 每个 IPC 动作一个文件，`createX(input): XOutput` 形状，内部 `safeParse` + 调 `lib/` + Drizzle。
  - `lib/` = 现有 service 类（`TabManager`、`CoachOrchestrator`、`UserScriptService`…）与 repository 逻辑。
- `src/main/ipc/{domain}.handler.ts` 薄层：`setupProblemHandlers()` 只做 `handleFromShell(IPC_CHANNELS.PROBLEM.X, schemas, (_e, input) => procedure(input))`；`ipc/index.ts` 汇总；`trustedSender.ts` 移到 `ipc/guard/`。
- 3 个胖 handler 主体进 procedures（`user-script/procedures/import-from-file.ts`、`confirm-remote-install.ts`、`coach/procedures/trigger-hint.ts` + `lib/demo-hint-ladder.ts`）。
- `adapters/`、`parsers/`、`sites/` 合并为 `services/site/lib/adapters/`；`scripts/` → `services/user-script/`；`windows/` + `browser/` → `services/browser/` 与 `services/window/`；`shared/` → `src/main/lib/`（主进程内共享）。
- `vite.config.ts` main entry 改 `src/main/index.ts`；preload 路径同步；`electron-builder.json5` files 白名单同步；`tests/packaging` 守卫同步。
- 每个域目录保留 README（项目约定，`test:docs` 检查）。

### R3 三个超长文件拆分（高-3、高-4）
- `main.ts` 945 → `index.ts` < 150 + `app/bootstrap-services.ts` + `services/window/lib/create-shell-window.ts`（窗口构造、`will-navigate`、`setWindowOpenHandler`）+ `services/window/lib/shell-shortcuts.ts`（`before-input-event` 分派）+ `services/browser/lib/tab-manager-callbacks.ts`。
- `TabManager.ts` 2278 → `services/browser/lib/{tab-manager.ts (< 600), navigation-policy.ts, view-lifecycle.ts, tab-events.ts, tab-ordering.ts}`；`NavigationDecision` 判别联合（阶段 0 已做）。
- `CoachOrchestrator.ts` 1415 → `services/coach/lib/{coach-orchestrator.ts (< 400), contest-auditor.ts, llm-hint-coordinator.ts, session-event-router.ts}`。

### R4 收敛项（重复造轮子 A6/A9/A12、B7/B9）
- `tabSessionStore.ts` + `applicationSessionStore.ts` → `src/main/lib/atomic-json-snapshot-store.ts`（泛型，约 200 行）+ 两处 30 行适配。
- 12 处手写 debounce/throttle → `src/main/lib/timing.ts`；`DebouncedWindowFollower` 用之。
- 9 处 `Set<callback>` 事件总线 → `src/main/lib/typed-emitter.ts`（`EventEmitter` 泛型包装）。
- `trustedSender` 的 shell/coach 两套 `handleFrom*/onFrom*` → `createGuardedIpc(kind)`。
- `adapters/registry.ts` + `parsers/registry.ts` → 一个 `site-registry.ts`。
- `Math.random().toString(36)` 5 处 → `crypto.randomUUID()`。
- `parseRuntimeMs/parseMemoryKb`、`getLastActiveTime` 各留一份。

### R5 文件名 kebab-case（D7）
- 283 个非组件文件 `git mv` 到 kebab-case（`TabManager.ts` → `tab-manager.ts`），紧接 R2 目录迁移在同一分支完成，避免两次大 diff；`git log --follow` 可追踪。
- 目录 6 个 camelCase → kebab-case。
- eslint `unicorn/filename-case` 或自写守卫锁住（组件 `.tsx` PascalCase、hook `useX.ts` 例外）。

### R6 日志 scope、错误类（中-4、低-3）
- 所有 procedure 用 `logger.scope('domain:action')`（模板 `api-module.md`）。
- `src/main/lib/errors.ts`：`AppError(message, code)` 基类；5 个孤立 Error 子类继承之并带 `code`（对应 `errorCodes.ts`）。

## Acceptance Criteria

- [ ] `algo-electron/electron/` 目录不存在；`src/main/` 结构与 `backend/directory-structure.md` 一致（每个域有 `types.ts` + `procedures/`）。
- [ ] 应用查询不再使用裸`prepare`或手抄`as Row`；冻结legacy migration、schema校验、pragma和迁移恢复基础设施为明确且测试覆盖的例外，不用全局grep=0迫使改写历史迁移。
- [ ] 新库从零启动：legacy 001–030 → drizzle 基线 → 后续 drizzle 迁移；旧库（rc.1 + 030）启动：直接识别基线；两条路径各有测试。
- [ ] `src/main/index.ts` < 150 行；`tab-manager.ts` < 600；`coach-orchestrator.ts` < 400；全项目无 > 700 行的非注入脚本 TS 文件（注入脚本模板与 `.d.ts` 例外清单写在守卫）。
- [ ] 每个 `ipc/*.handler.ts` 的 handler 体 ≤ 5 行（守卫统计）。
- [ ] jscpd < 2%（合并双胞胎 store 后应降至约 1.4%）。
- [ ] 文件名守卫 0 违规；`git log --follow src/main/services/browser/lib/tab-manager.ts` 能追到 `electron/browser/TabManager.ts`。
- [ ] `pnpm test:all` + `pnpm build:win` + 安装包升级启动。
- [ ] `docs/DESIGN/SYSTEM_ARCHITECTURE.md`、`DATABASE_SCHEMA.md`、各域 README 重写；`test:docs` 通过。

## Out of Scope

- 广泛渲染层重构（阶段4）；已明确批准的A2g无效ID操作、A4b1日期图表consumer-safety及其原生验收发现的局部路由生命周期修复除外。测试目录重排（阶段 5，但本阶段搬源码时**同步移动**对应测试文件到 `tests/unit/services/{domain}/` 的临时位置，避免 import 断裂）。

## Notes

- 前置：阶段 2（shared types、毫秒时间戳）。
- 顺序：R1（Drizzle，在旧目录内完成，先 problem/submission/stats 三域验证模式，再推全）→ R2 + R5（一起，单独大 PR）→ R3 → R4 → R6。
- 这是最长的阶段（10 天），R1 与 R2 分别一个 PR；R2 的 PR 只做移动与 import 修正，不改逻辑（reviewer 可用 `git diff -M` 看到零逻辑变更）。
- 风险：Drizzle 对 SQLite 的 `INSERT … ON CONFLICT` 与部分原生 SQL（`COALESCE`、`CASE WHEN`）需用 `sql` 模板；`BARE_SQL_BUDGET` 守卫改为允许 `sql\`\`` 只在 `db/` 与 `lib/queries/` 中出现。
