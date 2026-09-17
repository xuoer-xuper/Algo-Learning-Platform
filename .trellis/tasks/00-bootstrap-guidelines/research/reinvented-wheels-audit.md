# 重复造轮子审计（reinvented wheels）

- 日期：2026-09-17　方法：jscpd 7.x（min-tokens 50 / min-lines 5，范围 `electron/` + `src/`）+ 定向 grep + 逐文件阅读。所有数字为实测。
- 结论先行：**跨文件复制粘贴不严重（1.76%），真正的"造轮子"集中在 6 个基础设施模块，共约 1,600 行可被成熟库替代；另有一对 520 行的双胞胎 store。**

---

## 1. jscpd 总量

| 指标 | 值 |
|---|---|
| 扫描文件 | 378 |
| 总行数 | 57,802 |
| 重复行 | 1,018（**1.76%**） |
| 克隆组 | 88 |

行业常见阈值是 5% 以内算健康。本项目远低于此，说明"复制一大段改改"不是主要问题。

前 8 组最大克隆（按行）：

| 行 | 位置 A | 位置 B | 性质 |
|---|---|---|---|
| 145（累计 4 组） | `browser/tabSessionStore.ts` | `windows/applicationSessionStore.ts` | **同一套"临时文件 + fsync + rename"原子写入循环写了两遍**（258 行 vs 264 行，接口名只差前缀） |
| 90（累计 3 组） | `coach/types.ts` | `electron-env.d.ts` | 类型手抄（`CoachIntervention` 38 行、`ProblemSession` 30、`ProblemTimelineData` 22） |
| 52 | `ipc/trustedSender.ts:338` | 同文件 `:391` | `onFromShell` / `onFromCoach` 的 send 校验包装重复 |
| 29 + 27 | `RealtimeSubmissionDiagnostics.ts` | `settingsTypes.ts` + `electron-env.d.ts` | 同一类型三份 |
| 24 | `coach/rules/RuleEngine.ts:44` | 同文件 `:92` | `RuleEngineOptions` 与另一个 options 接口字段重复 |
| 22 | `electron-env.d.ts:447` | `scripts/UserScriptRemoteInstaller.ts:36` | 类型手抄 |
| 21 | `db/repositories/userScript/mutations.ts:72` | 同文件 `:161` | 动态 `SET` 子句拼装重复（Drizzle 的 `.set(partial)` 一行解决） |
| 20 | `ui/ConfirmDialog.tsx:71` | `ui/Dialog.tsx:72` | focus-trap 逻辑重复 |

**类型手抄占 88 组克隆中的大头**，与 frontend-audit 高-2 是同一个根因，IPC 契约收口后自动消失。

---

## 2. A 类：自研替代了成熟方案的模块

| # | 文件 | 行 | 自研了什么 | 模板指定 / 成熟方案 | 决定 |
|---|---|---|---|---|---|
| A1 | `electron/ipc/payloadSchema.ts` | 291 | 14 个校验组合子（text/int/oneOf/object/arrayOf…），使用点 196 处 | **zod**（`shared/typescript.md`、`backend/type-safety.md`） | **替换**。zod 的 `z.object().strict()` 等价于现在的"多余字段拒绝"；`safeParse` 返回 issues 路径等价于 `IpcPayloadError.path`。196 处调用点是机械替换。 |
| A2 | `electron/shared/logger.ts` | 197 | 滚动文件（2MB×3）、启动缓冲、敏感键脱敏、URL 去 query | **electron-log**（`backend/logging.md`） | **替换**。electron-log 自带轮转、scope、renderer 转发。脱敏用它的 `hooks`（`log.hooks.push((msg) => …)`）接现有 `redactString` 函数，脱敏逻辑保留为一个 40 行 hook，其余 150 行删除。 |
| A3 | 裸 SQL：249 处 `prepare(` + `electron/db/migrate.ts` 69 行 + 29 个手写 migration | ~2,900 行 SQL 相关 | 查询、行类型 `as` 断言 114 处、动态 SET 拼装、migration runner | **Drizzle ORM + drizzle-kit**（`backend/database.md`） | **替换**，最大一项。`schema.ts` 一次定义 21 张表后 `$inferSelect` 消掉 114 处 `as`；`migrate()` 替代 `migrate.ts`；drizzle-kit 从 030 起生成 SQL。已发布的 001–029 保留为"历史迁移"通过 `__drizzle_migrations` 基线导入。迁移前备份逻辑（`sqliteMigrationBackup.ts` 139 行）保留，它是模板之外的安全网。 |
| A4 | `electron/app/config.ts` | 274 | JSON 文件读写 + 4 个域的 normalize | **electron-store**（`backend/environment.md` 提到 electron-store 与 env-setup 顺序） | **替换存储层**。`loadConfig/saveConfig` 40 行改为 `new Store<AppConfig>({ schema })`；4 个 normalize 函数改为 zod schema 的 `default()`/`catch()`，与 A1 共用。 |
| A5 | `electron/shared/time.ts` 41 + `db/repositories/stats/date.ts` 48 + `ai/summary/periodSummaryDates.ts` 32 + 散在 10 个文件的 `getMonth()+1` 手写格式化 | ~180 | `nowBeijing`、`formatLocalDate`、`nextLocalDay`、`dayDiff` | 模板 `shared/timestamp.md`：**全栈 Unix 毫秒整数**，展示层才格式化 | **替换为毫秒 + `Intl.DateTimeFormat`**（展示）。切换后 `time.ts` 只剩 `nowMillis()`；`local_day` 列改为从毫秒派生。 |
| A6 | `electron/browser/tabSessionStore.ts` 258 + `electron/windows/applicationSessionStore.ts` 264 | 522 | 两份几乎相同的"防抖 + 原子写 JSON 快照"store | 无模板规定；这是 **B 类内部重复** | **合并**为一个泛型 `AtomicJsonSnapshotStore<T>`（约 200 行），两处各留 30 行适配。 |
| A7 | `electron/scripts/UserScriptResourceCache.ts` | 230 | 资源缓存 + TTL | 无模板规定 | 保留（油猴 `@resource` 语义特化，无现成库）。 |
| A8 | `electron/scripts/userScriptMetadata.ts` | 234 | Tampermonkey 头解析 + `@match` 匹配 | 无模板规定；社区有 `userscript-meta` / `match-pattern` 但不覆盖 TM 全键 | 保留。 |
| A9 | `electron/coach/DebouncedWindowFollower.ts` 53 + 12 个文件的 `setTimeout/clearTimeout` 手写节流 | ~120 | debounce / throttle | 无模板规定；可用 `lodash-es/debounce` 或 20 行共享 `debounce()` | **收敛**为 `electron/shared/timing.ts` 一份（不引 lodash，模板未指定）。 |
| A10 | `src/rendererErrors.ts` | 86 | 渲染进程错误发布/订阅 | 无模板规定 | 保留。 |
| A11 | `src/components/ui/{Dialog,ConfirmDialog,DropdownMenu,Toast}.tsx` | 498 | 自研 focus-trap、Portal、键盘导航 | 模板 `frontend/components.md` 自身就是手写模式，未指定 UI 库 | 保留；只合并 Dialog/ConfirmDialog 的 20 行 focus-trap 重复。 |
| A12 | 回调集合当事件总线：`new Set<(…) => void>` 9 处（TabManager、UserScriptRuntime、TrackingService、WindowManager） | ~60 | 手写 subscribe/unsubscribe | Node `EventEmitter`（已用 3 处）或 `EventTarget` | **统一为 `EventEmitter`**（类型化包装 20 行）。 |
| A13 | `Math.random().toString(36)` id 生成 5 处（vs `randomUUID` 49 处） | 5 | 短 id | `crypto.randomUUID()` | 统一。 |

不算问题的：`JSON.parse(JSON.stringify)` 0 处；`Promise.race` 0 处；`AbortController` 6 处（正确用法）。

**A 类可删除/替换代码量**：A1 291 + A2 ~150 + A3 migrate 69 + 114 处 `as` + 21 行 SET 拼装 + A4 ~230 + A5 ~180 + A6 ~320 + A9 ~100 + A12 ~60 ≈ **1,600 行**，加 SQL 字符串转 query builder 的净减量另计。

---

## 3. B 类：项目内部重复实现

| # | 重复内容 | 出现 | 抽到哪 |
|---|---|---|---|
| B1 | 跨进程类型手抄 | `electron-env.d.ts` 112 个类型，主进程 72 个重复、渲染 10 个重复 + 6 组改名副本（`OverviewStats` 4 个名字、`ImportPreview`/`ImportConflict` 各 3 份、`CodeforcesAccount` 2 份不同结构） | `src/shared/types/*.ts`（模板位置），主/渲染只 import |
| B2 | 原子 JSON 快照 store | 2 份 × ~260 行 | 见 A6 |
| B3 | `nowBeijing()` 逐行复制 | `coach/CoachEventBridge.ts:257`、`coach/rules/RuleEngine.ts:438` | 随 A5 消失 |
| B4 | `errorMessage()` | `electron/shared/errors.ts`、`src/shared/errors.ts` | `src/shared/lib/errors.ts`（跨进程 shared 建好后合一） |
| B5 | `EVENT_TYPE_LABELS` | `CoachMetricsView.tsx:39`、`SessionTimelineView.tsx:55` | `features/coach/constants.ts` |
| B6 | 取数竞态模板（`disposed` / `receivedLiveUpdate` 15 行） | `App.tsx` 4 次 + 各组件 `cancelled` 旗标 5 处 | `hooks/useIpcQuery()`（模板 `hooks.md` 的 `useData` 形状） |
| B7 | `trustedSender` 的 shell/coach 两套 `handleFrom*`/`onFrom*` | 4 个导出名各 3 处定义（含 facade） | 参数化为 `createGuardedIpc(kind)` |
| B8 | `parseRuntimeMs` / `parseMemoryKb` | `adapters/shared/text.ts`、`submissions/scrapers/genericTableValueParsers.ts` | 保留 `adapters/shared/text.ts` 一份 |
| B9 | `getAdapter` / `registerAdapter` / `setEnabledSitesFetcher` | `adapters/registry.ts` 与 `parsers/registry.ts` 两套注册表 | 合并为一个 registry（parsers 是 adapters 的子集能力） |
| B10 | `getLastActiveTime` | `db/repositories/problem/overview.ts`、`stats/insights.ts` | 保留 stats 一份 |
| B11 | `getZoomFactorForUrl` | `app/config.ts` 与 `browser/zoomPreferences.ts`（config 里是转发） | 随 A4 消失 |
| B12 | 测试 setup 样板 | `resetElectronMock` 38 文件、`mkdtemp` 32 文件、`MockBrowserWindow` 26 文件、`initDbAtPath` 20 文件、`new TabManager(` 13 文件，无共享 factory | `tests/setup/` + `tests/factories/`（模板结构） |
| B13 | 站点 hook | 4 个 `hook.ts` 共 1,494 行，共性已抽到 `adapters/shared/frontendVerdictHook.ts` 671 行；jscpd 未报跨站克隆 | 已收敛，不动 |
| B14 | Repository CRUD 样板 | 10 个 repository 的 insert/update 手写 SQL；jscpd 只报 `userScript/mutations.ts` 内部 21 行 | 随 A3 Drizzle 消失 |
| B15 | 九个 `*Api.ts` 包装 | 每个函数一行转发 `window.electronAPI.x`，共 155 处 | preload 改为 `typeof api` 推导后，`*Api.ts` 退化为纯 re-export，可删 |

其余 22 个"重名导出函数"是主进程 service 与渲染进程 `*Api.ts` 同名（如 `updateNoteTitle`、`saveCoachConfig`），是 IPC 两端的正常镜像，不是重复实现。

**B 类重复代码量**：jscpd 1,018 行 + 人工识别的 B6/B7/B9/B12 约 400 行 ≈ **1,400 行**，其中 B1 与 B2 占七成。

---

## 4. 前 10 个收敛项（收益 ÷ 风险）

| 序 | 项 | 减少行数（约） | 风险 | 何时 |
|---|---|---|---|---|
| 1 | B1 跨进程类型合一 + IPC channel 常量 | 700 | 低（纯类型，tsc 兜底） | 阶段 2 |
| 2 | A6/B2 两个 session store 合并 | 320 | 低（有 10 个测试文件覆盖） | 阶段 3 |
| 3 | A1 payloadSchema → zod | 250 | 低（196 处机械替换，`tests/ipc` 契约测试兜底） | 阶段 1 |
| 4 | A2 logger → electron-log + 脱敏 hook | 150 | 低 | 阶段 1 |
| 5 | A4 config → electron-store + zod | 230 | 低（配置文件格式不变，仍是 JSON） | 阶段 1 |
| 6 | B6 `useIpcQuery` hook | 120 | 低 | 阶段 4 |
| 7 | A12 事件总线统一 EventEmitter | 60 | 低 | 阶段 3 |
| 8 | B9 两套 registry 合并 | 80 | 中（parsers 有独立测试 5 文件） | 阶段 3 |
| 9 | A5 时间 → Unix 毫秒 | 180 + 65 列迁移 | **高**（数据迁移 + 全栈类型变更 + 11 处渲染消费） | 阶段 2 末，单独 feature 分支 |
| 10 | A3 Drizzle | 净减约 800 | **高**（249 处查询改写，21 张表） | 阶段 3，单独 feature 分支，分表推进 |
