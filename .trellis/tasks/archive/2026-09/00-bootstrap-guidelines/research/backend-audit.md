# 主进程代码规范审计报告（algo-electron/electron/）

- 审计基准：`.trellis/spec/` 下 electron-fullstack 官方模板（shared/、backend/、guides/ 共 16 个文件）
- 审计范围：`algo-electron/electron/` 全部 313 个 `.ts` 文件（不含 `algo-electron/tests/`；electron/ 内无 `.test.ts`）
- 审计方式：只读；所有数字来自 grep / Python 脚本实际统计，不含估计值
- 日期：2026-09-17

> 说明：模板是为"Drizzle + Zod + electron-log"技术栈写的；本项目固定技术栈为裸 `better-sqlite3` + 自研 `payloadSchema` + 自研 `AppLogger`。凡是"工具选型不同但目的已达成"的条目，本报告标为"等价实现"不计为问题；只有目的未达成的才列为问题。

---

## 一、目录结构与分层

### 1.1 业务逻辑没有按 `services/{domain}/{types.ts, procedures/, lib/}` 组织

- (a) 规范：`backend/directory-structure.md` "Main Process Structure"、`backend/api-module.md` "Module Structure"——每个业务域一个目录，必含 `types.ts` 与 `procedures/`（一个动作一个文件），可选 `lib/`；`backend/index.md` Core Rules "Service modules follow domain layout"。
- (b) 原因：一个动作一个文件让入参校验、日志 scope、返回形状都在同一处；新人按 `procedures/create.ts` 就能找到"创建"逻辑，不必读千行类文件。
- (c) 实际：
  - `electron/` 顶层有 26 个目录（`adapters, ai, app, backup, browser, coach, contextMenus, cookies, credentials, db, diagnostics, downloads, ipc, notes, parsers, rating, scripts, shared, shortcuts, sites, submissions, tracking, windows` 等），没有 `services/` 目录，没有任何 `procedures/` 目录。
  - 业务逻辑以类为主：`browser/TabManager.ts`（2278 行）、`coach/CoachOrchestrator.ts`（1415 行）、`scripts/UserScriptService.ts`、`notes/NoteService.ts` 等。
  - `types.ts` 存在于 15 个目录（`find -name types.ts`），分布在 `db/repositories/*/`（10 个）、`adapters/`、`ai/recommendations/`、`backup/`、`coach/`、`shared/`；`browser/`、`scripts/`、`submissions/`、`credentials/`、`windows/` 等域没有独立 `types.ts`。
  - 各目录自带 `README.md` 说明职责（`db/README.md`、`ipc/README.md`、`shared/README.md` 等），这是本项目替代模板目录约定的方式。
- (d) 优先级：**中**。结构自洽且有 README 与架构守卫（`tests/architecture/check-architecture.mjs`）约束，但与模板"每域 procedures/"差异是全局性的，迁移成本高，建议只在新域上采用模板布局。

### 1.2 `main.ts` 945 行，不只是启动编排

- (a) 规范：`backend/directory-structure.md`——`index.ts` 是 "Main process entry"，业务逻辑在 `services/`；`api-module.md` "Thin IPC handlers"。
- (b) 原因：入口文件应只做"创建对象 + 接线 + 生命周期"，否则窗口逻辑、快捷键、导航策略与启动顺序纠缠，改任何一处都要读全文。
- (c) 实际（`electron/main.ts`）：
  - 22 个模块级 `let` 可变单例（第 104–125 行：`services`、`coachPetWindow`、`downloadManager`、`credentialAutofillService` 等）。
  - `createWindowOnce()` 第 254–522 行约 270 行，内含：窗口状态归一化、`BrowserWindow` 构造、`setWindowOpenHandler`/`will-navigate` 拦截、`openInManagedTab` 导航判定（第 307–316 行）、`ShortcutActions` 定义与 `before-input-event` 处理（第 363–400 行）、TabManager 7 个回调注册。
  - `app.whenReady()` 回调第 681–945 行约 265 行，内联构造 12 个服务并互相接线。
  - `tabManager.` / `windowManager.` / `.send(` 在 main.ts 出现 86 次。
  - 已有 `app/` 目录（12 个文件，1082 行）承接了一部分启动逻辑（`singleInstance`、`mainProcessErrors`、`themeController`、`startupSmoke`），说明拆分方向已开始但未完成。
- (d) 优先级：**高**。建议把 `createWindowOnce` 拆到 `windows/createShellWindow.ts`，把 `whenReady` 内的服务装配拆到 `app/bootstrap*.ts`。

### 1.3 目录名使用 camelCase 而非 kebab-case

- (a) 规范：`shared/code-quality.md` Naming Conventions——Directory: kebab-case（`user-profile/`）。
- (b) 原因：Windows 大小写不敏感、Linux 敏感，kebab-case 不会因 import 路径大小写错误在 CI 上炸。
- (c) 实际：6 个 camelCase 目录——`db/repositories/aiContextSnapshot`、`aiOutput`、`cookieRecord`、`userScript`、`contextMenus`、`coach/problemFacts`。0 个 kebab-case 目录。
- (d) 优先级：**低**。

---

## 二、IPC 层

### 2.1 大部分 handler 已是薄层；3 个 handler 超过 40 行堆了业务逻辑

- (a) 规范：`backend/api-patterns.md` Anti-Pattern 1 "Fat IPC Handlers"；`directory-structure.md` Key Principle 5 "IPC handlers are thin - They only call procedures"。
- (b) 原因：业务逻辑放在 handler 里无法脱离 Electron 单测，也无法被其他入口（快捷键、菜单、定时任务）复用。
- (c) 实际（脚本统计 `ipc/register*.ts` 内 160 个 handler 的函数体行数）：
  - 超过 20 行：8 个；超过 40 行：3 个。
  - `ipc/registerScriptsIpc.ts:106` `scripts:importFile` **86 行**——对话框、读文件、构造 `existingIdentities`、legacy 身份认领判定、二次确认、资源预取、持久化全部内联。
  - `ipc/registerScriptsIpc.ts` `scripts:confirmRemoteInstall` **75 行**。
  - `ipc/registerCoachIpc.ts:250` `coach:triggerHint` **48 行**——内含一份 4 级演示提示文案表 `demoHints` 与等级解析逻辑。
  - 其余 152 个 handler ≤ 26 行，基本是"取 service → 调用 → 返回"，符合薄层要求。
  - 另有 IPC 注册散落在 `ipc/` 之外：`submissions/RealtimeSubmissionService.ts`（2 处）、`scripts/userScriptRuntimeBridge.ts`（2 处），`ipc/README.md` 已注明是刻意的。
- (d) 优先级：**中**。把三个胖 handler 的主体提到 `scripts/importUserScriptFromFile.ts`、`coach/demoHintLadder.ts` 即可。

### 2.2 输入校验：无 Zod，但有等价的 `payloadSchema` 机制（等价实现，不计问题）

- (a) 规范：`shared/typescript.md` "Zod Schema for Runtime Validation"；`api-patterns.md` Anti-Pattern 2 "Missing Validation"。
- (b) 原因：类型在 IPC 边界被擦除，渲染进程传什么都能进来，必须运行时校验。
- (c) 实际：
  - `package.json` 无 `zod`。`ipc/payloadSchema.ts`（291 行）实现了 `text/freeText/pattern/localDate/int/decimal/bool/optional/nullable/oneOf/arrayOf/object/binary/raw` 共 14 个组合子，`object()` 默认拒绝多余字段，失败抛 `IpcPayloadError`（带 path/expected），由 `trustedSender.ts` 的 `parseOrReject` 转为 invoke 拒绝并写 warn 日志。
  - 覆盖率：带 schema 元组的 `handle(` 88 个 + `on(` 12 个 = 100；零参 handler 47 个（无需校验）；`raw()` 逃逸 4 处（全部在 `registerBrowserShellIpc.ts`，架构守卫 `RAW_IPC_SCHEMA_BUDGET` 卡在 4，只减不增）；`UNSCHEMAD_IPC_BUDGET = {}` 即无未声明 schema 的带参 channel。
  - 与模板差异：模板要求校验在 procedure 内（`safeParse` 后 `return { success:false }`），本项目在注册包装层校验并 **抛错**。语义上更严（不会静默兜底），但失败路径是 invoke reject 而非 `{ success:false }`。
- (d) 优先级：**无问题**。这是本项目的亮点之一，见第十节。

### 2.3 返回形状不统一：`{ ok: ... }` 与 `{ success: ... }` 并存

- (a) 规范：`shared/code-quality.md` "Error Response Format" `{ success: false; error: string; code?: string }`；`api-module.md` "Return consistent response format"。
- (b) 原因：渲染进程判断成功与否要有一个统一字段，否则每个 API 的调用方都要看一遍类型。
- (c) 实际：`electron/` 内 `{ success:` 23 处、`{ ok:` 35 处；`ipc/` 内 `{ success:` 18 处、`{ ok:` 0 处（`ok` 全部在 service 层，如 `backup/`、`scripts/`）。`code` 字段：0 处使用。
- (d) 优先级：**中**。

### 2.4 handler 里直接 `throw` 与 `errorMessage(error)` 直返，把内部错误文本传给渲染进程

- (a) 规范：`backend/error-handling.md` "Exposing Internal Errors"——`return { error: 'Failed to save data' }` 而非透传；`api-module.md` DON'T 3 "Don't expose internal errors"。
- (b) 原因：`ipcMain.handle` 抛出的 Error 会被序列化成 `Error: <message>` 发给渲染层，内部路径、SQL 表名等可能泄漏，且渲染层拿到的是不可判别的字符串。
- (c) 实际：
  - `ipc/register*.ts` 内 `throw ` 29 处；其中 `registerScriptsIpc.ts:475-480` 三处 `TypeError('scripts:save site_ids_json must ...')`、`registerCoachIpc.ts:139` `'CoachPetWindow not initialized'`、`:197/:230` `'比赛模式硬关闭'`。
  - 直接把 `errorMessage(error)`（原始 `error.message`）返回给渲染层：6 处——`ipc/registerSitesIpc.ts:176,198,212`、`ipc/registerRatingIpc.ts:70`、`backup/backupService.ts` 2 处。
  - `.stack` 返回给渲染层：0 处（仅 `shared/logger.ts:65,76` 写入日志文件）。
- (d) 优先级：**中**。`IpcPayloadError` 抛出是设计选择；但 `errorMessage(error)` 直返的 6 处应改为固定文案 + 日志。

---

## 三、错误处理

### 3.1 空 catch：87 处，全部位于页面注入 JS 模板字符串内（不计为主进程问题）

- (a) 规范：`shared/code-quality.md` "Never Swallow Errors"；`error-handling.md` "Swallowing Errors"。
- (b) 原因：静默失败让 bug 无迹可寻。
- (c) 实际：grep `catch (...) {}` 命中 87 处；Python 脚本按反引号奇偶判断，**87 处全部在模板字符串内**（即注入到 OJ 页面主世界的 JS 源码），真实 TS 代码中 **0 处**。分布：`adapters/shared/frontendVerdictHook.ts` 17、`adapters/sites/vjudge/hook.ts` 14、`adapters/sites/nowcoder/hook.ts` 14、`submissions/scrapers/ptaScraper.ts` 11、`browser/stealthScript.ts` 10、`adapters/sites/codeforces/hook.ts` 10、`adapters/sites/leetcode/hook.ts` 5、`submissions/scriptedRealtimeHook.ts` 2、`submissions/scrapers/luoguScraper.ts` 2、`browser/ojSession.ts` 1、`browser/tabScriptExecution.ts` 1。
  - 页面注入脚本在第三方 DOM 上做"尽力而为"探测，空 catch 是该场景的惯例，但没有任何通道把异常带回主进程。
- (d) 优先级：**低**（注入脚本）。建议在 `frontendVerdictHook` 之类有 `postMessage` 通道的脚本里，对关键路径的 catch 至少回传一个 `{ type:'hook-error' }`。

### 3.2 只写注释不处理的 catch：63 处；只记日志然后继续的 catch：34 处

- (a) 规范：同上；`error-handling.md` Pattern 4——非关键依赖 `logger.warn` + continue 是允许的，关键路径必须 `return { success:false }` 或 throw。
- (b) 原因：注释说明了"为什么可以忽略"是好实践，但要确认忽略的确实是非关键路径。
- (c) 实际（脚本统计，总 catch 436 处）：
  - 注释-only catch 63 处，分布在 34 个文件，最多的是 `browser/TabManager.ts` 8、`scripts/userScriptMainWorldRuntime.ts` 6、`scripts/userScriptRuntimeBridge.ts` 6、`submissions/SubmissionProblemAttacher.ts` 4。抽样阅读注释均解释了原因（如 `trustedSender.ts:63` "Electron may throw while reading properties during WebContents teardown"）。
  - 只 `logger.*` 不 return/throw 的 catch 34 处：`main.ts` 12、`coach/CoachOrchestrator.ts` 4、`scripts/userScriptRuntimeBridge.ts` 4、`browser/TabManager.ts` 3、`scripts/UserScriptRuntime.ts` 2、`tracking/TrackingService.ts` 2、其余 7 个文件各 1。
  - catch 后首行 `return null/false/[]/undefined/{}` 的 111 处（含模板内），主进程侧集中在 `browser/TabManager.ts` 5、`credentials/autofill/autofillServiceCore.ts` 4、`credentials/autofill/autofillPolicy.ts` 4、`scripts/userScriptConnectPolicy.ts` 3。
- (d) 优先级：**低**。数量不算失控且有注释；建议对 `main.ts` 的 12 处逐个确认是否属于"非关键"。

### 3.3 事务内 silent return：未发现

- (a) 规范：`error-handling.md` Pattern 3 "Transaction Helpers Must Throw"；`api-patterns.md` Anti-Pattern 4。
- (c) 实际：`db.transaction(` 共 9 处（`db/repositories/userScript/mutations.ts` 2、`db/repositories/cookieRecord/mutations.ts` 2、`db/repositories/problemVisitRepository.ts` 1、`db/repositories/problem/mutations.ts` 1、`db/migrations/018_*` 1、`db/migrate.ts` 1、`backup/learningDataExport.ts` 1）。逐个阅读：`userScript/mutations.ts:157` 失败 `throw new Error('Legacy userscript identity is no longer available')`；`problem/mutations.ts:46` 的 `return` 是 update 分支正常结束而非失败跳过；`learningDataExport.ts:192` 事务内 6 个 import* 函数均无静默 return。
- (d) 优先级：**符合**。

### 3.4 没有带 `code` 的结构化错误基类

- (a) 规范：`shared/code-quality.md` "Use Structured Errors"——`AppError(message, code, statusCode)` 及子类。
- (b) 原因：渲染层按 `code` 分支比按 message 字符串匹配稳定。
- (c) 实际：自定义 Error 类 5 个（`MigrationRetryBlockedError`、`CredentialVaultError`、`IpcPayloadError`、`UserScriptRequestDeniedError`、`UserScriptRequestTimeoutError`），无公共基类、无 `code` 字段。`shared/errors.ts` 只提供 `errorMessage()`/`errorName()` 两个取值工具。
- (d) 优先级：**低**。

---

## 四、日志

### 4.1 自研 `AppLogger`，无 `logger.scope()`；以消息前缀代替 scope（等价实现，部分不符）

- (a) 规范：`backend/logging.md` "Scoped Logger Pattern"——`baseLogger.scope('project:create')`；`index.md` Core Rules "Use logger.scope() for module loggers"。
- (b) 原因：scope 让日志可以按模块过滤，且不依赖每条消息手写前缀。
- (c) 实际：
  - `shared/logger.ts`（202 行）是自研 `AppLogger`：滚动文件（2 MiB × 3 归档）、早期启动缓冲 100 条、敏感键正则遮蔽（`authorization|cookie|csrf|password|secret|token|api_key`）、URL 去 query/hash、循环引用保护、默认只写文件（`ALGO_ELECTRON_LOG_STDERR=1` 才镜像到 console）。不依赖 `electron-log`。
  - **无 `scope()` API**（grep `.scope(` 0 处）。替代做法是消息名采用 `模块.事件` 点分命名（`browser.*` 28 条、`userscript.*` 10 条、`coach.*` 8 条、`db.*` 2 条等）。
  - 日志调用共 102 处；导入 logger 的文件 22 个；281 个文件既不导入 logger 也不用 console（大部分是纯函数/类型/注入脚本，但也包括 `coach/`、`submissions/` 下多数业务类——它们通过构造参数注入 logger 或不记日志）。
- (d) 优先级：**中**。建议给 `AppLogger` 加 `scope(name): Logger`（返回自动加前缀的子 logger），把 102 处调用逐步改为 scoped，无需引入 electron-log。

### 4.2 直接 `console.*` 调用：9 处，3 个文件

- (a) 规范：`backend/quality.md` Forbidden Patterns `console.log`；`api-module.md` DON'T 2。
- (b) 原因：console 输出不进日志文件、无遮蔽、无轮转。
- (c) 实际（`console.log` 5、`console.error` 4、`warn/info/debug` 0）：
  - `ipc/registerCoachIpc.ts:160` `console.log(message)`——`log-to-main` channel 把渲染层任意 ≤10 KiB 文本直接打到 console，绕过遮蔽；`:306`、`:325` 两处 `[coach] ... (no orchestrator)` 降级日志。
  - `app/startupSmoke.ts:24,26,27,135`——冒烟测试模式刻意输出到 stdout 供 CI 抓取，属于合理例外。
  - `scripts/userscriptBootstrapPreload.ts:85,99`——preload 上下文无 AppLogger，属于合理例外。
- (d) 优先级：**中**（仅 `registerCoachIpc.ts` 3 处需改为 `appLogger`）。

---

## 五、时间戳

### 5.1 数据库时间列全部为 TEXT 本地时间字符串，与模板 Unix 毫秒 INTEGER 不同（既有约定，如实记录，不评判）

- (a) 规范：`shared/timestamp.md` "All timestamps use Unix milliseconds (integer)"；`backend/database.md` "Always use { mode: 'timestamp_ms' }"；SQL 默认 `(unixepoch() * 1000)`。
- (b) 模板给出的原因：JS 原生、无转换、可排序、毫秒精度、避免秒/毫秒混用。
- (c) 实际：
  - `db/migrations/001–029`：时间列 **65 个全部 `TEXT`**（`created_at/updated_at/first_seen_at/entered_at/submitted_at/expires_at/granted_at` 等），**0 个 INTEGER 时间列**（`002_submissions.ts:18` 的 `runtime_ms INTEGER` 是时长不是时间戳），**0 个 DEFAULT 时间子句**（`unixepoch`、`datetime('now')`、`CURRENT_TIMESTAMP` 均 0 处），时间全部由应用层写入。
  - 写入格式：`shared/time.ts` `nowBeijing()` 返回系统本地时间 `YYYY-MM-DDTHH:mm:ss.SSS`（无时区后缀），调用 63 处；`toBeijing()` 4 处。文件头注释与 `shared/README.md` 均已如实说明"函数名沿用 Beijing，实际是系统本地时间"。
  - 记忆约定 `feedback_time.md`：数据库时间统一用本地系统时间字符串。这是项目层面的既定决策，本报告不评判优劣。
  - 与模板的差异是**全栈性**的：Repository 返回 `string`、IPC 传 `string`、渲染层解析字符串。
- (d) 优先级：**不列为问题**（既有约定）。但下面 5.2 是该约定下的真实不一致。

### 5.2 同一约定下的格式混用：UTC ISO 与本地字符串在同一比较、同一张表里并存

- (a) 规范：`shared/timestamp.md` "Mixing Seconds and Milliseconds - FORBIDDEN"（精神是"同一层只允许一种格式"）；`guides/transaction-consistency-guide.md` "Multiple data paths, consistent format"。
- (b) 原因：本地字符串与 UTC ISO 字符串在东八区相差 8 小时，字符串比较会错位；同一列两种格式让 SQL `ORDER BY` / `>=` 结果不可信。
- (c) 实际（`toISOString` 共 27 处 / 15 文件，其中进入数据或比较的）：
  - **`coach/CoachFeedbackStore.ts:345-349` `computeSince()`** 用 `d.toISOString().slice(0,19)`（UTC）生成 `since`，在 `:278` 与 `row.created_at`（`nowBeijing()` 本地时间，见 `db/repositories/coach/feedbackRepository.ts:42`）做字符串比较——**在东八区系统上 since 比真实值早 8 小时**，暖机窗口多算 8 小时。
  - **`coach/CoachOrchestrator.ts:1344,1364,1372`** 把 `contest_start` / `contest_end` 写成 `new Date(...).toISOString()`（带 `Z` 的 UTC），存入 `coach_interventions` 表（`023_coach_interventions.ts:31-32`）；同一行的 `created_at` 由 `interventionsRepository.ts:107` 用 `nowBeijing()` 写本地时间——**同一张表两列两种格式**。`:635,:1299,:1331` 的 `entered_at` 同样是 UTC ISO 进 IPC payload。
  - `coach/CoachOrchestrator.ts:784` `lastActivityAt` 为 UTC ISO，进入 LLM 上下文；`downloads/DownloadManager.ts:152,174,190` `finishedAt`、`downloads/userScriptNavigation.ts:149` `createdAt` 为 UTC ISO 发往渲染层。
  - 合理例外（模板允许的日志/文件名场景）：`shared/logger.ts:131`、`db/connection.ts:156`（failure marker）、`backup/sqliteMigrationBackup.ts:61`（备份文件名）、`ipc/registerBackupIpc.ts:47`（导出文件名）、`cookies/CookieVault.ts:79`（Cookie 过期展示）。
  - `Date.now()` 40 处，均用于计时/id 生成；`Date.now()/1000` 秒级混用 0 处。
- (d) 优先级：**高**（`CoachFeedbackStore.computeSince` 是可复现的逻辑错误；`coach_interventions` 混格式影响审计导出）。

### 5.3 `nowBeijing()` 被复制了两份

- (a) 规范：`guides/pre-implementation-checklist.md` "Pattern exists? Search first"、"Copy-Paste-Modify" 反模式；`transaction-consistency-guide.md` Pattern 1 "Unified Timestamp Utility"。
- (c) 实际：`coach/CoachEventBridge.ts:257 nowIsoLocal()` 与 `coach/rules/RuleEngine.ts:438 defaultNowIso()` 都是 `shared/time.ts nowBeijing()` 的逐行复制（注释也承认"与 shared/time.nowBeijing 同语义"）。
- (d) 优先级：**低**。

---

## 六、类型安全

### 6.1 非空断言 `!`：11 处，7 个文件

- (a) 规范：`shared/code-quality.md` "No Non-Null Assertions"；`backend/type-safety.md`；`quality.md` Forbidden Patterns。
- (b) 原因：绕过 null 检查，运行时抛 `Cannot read properties of undefined`。
- (c) 实际（grep `\w!\s*[.\[(;,)]` 排除 `!=`）：
  - `browser/TabManager.ts:546,663,984,1564` `decision.reason!`（4 处）；`:1254,1295` `this.viewRegistry!`（2 处）
  - `main.ts:314` `decision.reason!`
  - `db/repositories/problem/mutations.ts:23` `identity.title!.trim()`（前面 `isValidScrapedTitle(identity.title)` 已判断，是类型守卫缺返回类型谓词导致）
  - `submissions/SubmissionProblemAttacher.ts:201` `submission.sourceUrl!`
  - `submissions/syncService.ts:68` `adapter.syncSubmissions!`（上一行已 `if (!adapter?.syncSubmissions)`，闭包内丢失收窄）
  - `windows/windowBounds.ts:78` `candidate.bounds!`（上一行 `isRectangle(candidate.bounds)` 已判断，同 mutations 问题）
  - 5 处 `decision.reason!` 可通过把 `NavigationDecision` 改为判别联合 `{allowed:true} | {allowed:false; reason}` 一次消除。
- (d) 优先级：**中**。

### 6.2 `any`：0 处；`@ts-ignore` / `@ts-expect-error`：0 处；`eslint-disable`：0 处

- (c) 实际：grep `: any|as any|<any>|any[]` 命中 8 行，**全部在注释里**（解释为什么不用 any）；`tests/` 内 1 处。`@ts-ignore` 0、`@ts-expect-error` 0、`eslint-disable` 0。
- (d) 优先级：**符合**。

### 6.3 导出函数显式返回类型：553 个中 2 个缺失

- (a) 规范：`shared/typescript.md` "Explicit Return Types"。
- (c) 实际：`app/mainProcessErrors.ts:24 createFatalErrorReporter()`、`rating/codeforces.ts:51 formatCFRatingHistory()`。其余 551 个（99.6%）有显式返回类型。
- (d) 优先级：**低**。

### 6.4 `import type` 使用充分，但无工具强制

- (a) 规范：`shared/typescript.md` "Type Imports"。
- (c) 实际：179 个文件使用 `import type`，326 行。`tsconfig.json` 有 `isolatedModules: true` 但无 `verbatimModuleSyntax`；`eslint.config.js` 使用 `@babel/eslint-parser`，未接 typescript-eslint，故无 `consistent-type-imports`、`no-non-null-assertion`、`no-explicit-any` 规则——6.1 / 6.2 的合规是靠人工维持的。
- (d) 优先级：**中**（建议加 `verbatimModuleSyntax: true` 或 typescript-eslint 三条规则，把现状锁住）。

### 6.5 DB 行类型靠 `as` 断言：114 处

- (a) 规范：`type-safety.md` "Zod Schema for All Types"、`typescript.md` "Type Guards"——外部数据要有运行时校验或类型守卫。
- (b) 原因：`.get() as Row` 只是编译期声明，列名改了不会报错。
- (c) 实际：`.get(...) as` / `.all(...) as` 114 处；`db.prepare<Params, Row>()` 泛型形式仅 2 处（`db/migrate.ts`），共 241 处 `prepare(`。裸 SQL 在 `db/` 之外 52 处（架构守卫 `BARE_SQL_BUDGET` 卡在 12 个文件，`backup/learningDataExport.ts` 35 处、`notes/NoteService.ts` 12 处）。
- (d) 优先级：**低**（Drizzle 的 `$inferSelect` 在裸 better-sqlite3 下无等价物；建议统一用 `prepare<[], Row>()` 泛型代替 `as`）。

### 6.6 `interface` 与 `type` 的选择

- (a) 规范：`shared/typescript.md` "Use type for Object Types"，`interface` 仅用于预期被扩展的形状。
- (c) 实际：`export interface` 323 处，`export type X = {` 1 处。与模板相反。
- (d) 优先级：**低**（风格）。

---

## 七、数据库

### 7.1 迁移：手写 migration + `schema_migrations`，命名与事务规范一致（等价实现）

- (a) 规范：`backend/database.md` Migrations（drizzle-kit）；`guides/db-schema-change-guide.md` Schema Change Checklist。
- (c) 实际：
  - `db/migrations/001_initial.ts` … `029_site_credential_labels.ts`，29 个文件全部匹配 `NNN_snake_case.ts`，导出 `migrationNNN`，在 `db/connection.ts:51-57 allMigrations` 数组登记（README 要求同步 `docs/DESIGN/DATABASE_SCHEMA.md`，该文件存在）。
  - `db/migrate.ts:57-60` 每个 migration 在 `db.transaction()` 内执行 `up()` 并写版本行；失败记 `db.migration-failed` 后原样抛出。
  - `db/connection.ts:115-165 initDbAtPathWithMigrationSafety`：有 pending migration 时先用 SQLite backup API 备份到 `userData/backups`，失败则关闭连接、从备份恢复、写 failure marker，下次启动拒绝重试（`assertMigrationRetryAllowed`）。这超出模板要求。
  - 数据迁移类 migration（003/004/016/017/018）与 schema migration 混编在同一序列，符合 `db-schema-change-guide.md` "Clean Up Dirty Data" 的精神。
- (d) 优先级：**符合**。

### 7.2 连接 pragma：符合

- (c) 实际：`db/connection.ts:177-180` `journal_mode = WAL`、`foreign_keys = ON`、`busy_timeout = 5000`。模板只要求前两项。
- (d) **符合**。

### 7.3 循环内 `prepare()`：`backup/learningDataExport.ts` 6 处

- (a) 规范：`backend/database.md` "Batch lookup (avoid N+1)"；`quality.md` Forbidden "await in loops → N+1"。
- (b) 原因：每行重新 `prepare` 同一条 SQL，既是 N 次查询也是 N 次编译。
- (c) 实际（脚本检测 for 循环体内的 `db.prepare(`）：`backup/learningDataExport.ts:350-352`（importProblems）、`:412-413`（importProblemVisits）、`:468-469`（importSubmissions）、`:524-531`（importDailyStats）、`:576-578`（importAccounts）、`:627-634`（importRatingHistory）。均在 `:192` 的单个事务内，事务保证了原子性但不减少查询次数。`await` 在循环内：1 处。
- (d) 优先级：**中**（把 `prepare` 提到循环外是零风险改动；导入是低频操作，性能影响有限）。

### 7.4 分页：只有 `LIMIT ?`，无 cursor/offset

- (a) 规范：`backend/pagination.md` "Default to cursor pagination"。
- (c) 实际：`LIMIT ?` 20 处、`OFFSET` 0 处、`cursor` 0 处；IPC 的 list/get 类 channel 58 个均为"取最近 N 条"。本地单用户 SQLite 数据量小，未见分页需求。
- (d) 优先级：**低**（记录差异，暂无必要改）。

---

## 八、环境隔离

### 8.1 dev/prod 共用同一 `userData`，无 `app.isPackaged` 分流

- (a) 规范：`backend/environment.md` "Dev/Prod Data Isolation"——`if (!app.isPackaged) app.setPath('userData', ... + '-dev')`，且必须在独立模块中、在任何读取 userData 的 import 之前执行；`index.md` Core Rules 第一条。
- (b) 原因：开发时跑迁移、导入测试数据会直接污染用户真实库；dev 与已安装的 prod 无法同时运行（同一 SQLite 文件 + 单实例锁）。
- (c) 实际：
  - `app.isPackaged` 在 `electron/` 内 **0 处**。
  - `app.setPath('userData', ...)` 仅 `app/startupSmoke.ts:18`，且只在 `STARTUP_SMOKE_MODE && ALGO_ELECTRON_SMOKE_USER_DATA` 时生效（CI 冒烟）。
  - `app.getPath('userData')` 使用 14 处（`db/connection.ts:76`、`main.ts:168,696,698,750,757,802,814,818`、`app/config.ts:102`、`ipc/registerScriptsIpc.ts:120,283,309,379`），全部指向同一目录。
  - 唯一缓解：`db/connection.ts:115` 迁移前自动备份。
- (d) 优先级：**高**（开发误操作直接影响真实数据；改动只需在 `main.ts` 顶部 import 一个 `app/envSetup.ts`，与 `applyStartupSmokeUserDataPath()` 同位置）。

---

## 九、超长文件与命名

### 9.1 超过 500 行的文件：14 个

- (a) 规范：模板未给行数硬阈值，但 `api-module.md` "One file per procedure"、`directory-structure.md` 隐含单文件小而专一。
- (c) 实际（`wc -l`）：

| 行数 | 文件 |
|---:|---|
| 2278 | browser/TabManager.ts |
| 1415 | coach/CoachOrchestrator.ts |
| 1095 | electron-env.d.ts（类型声明，preload API 契约） |
| 951 | scripts/userScriptMainWorldRuntime.ts（注入页面的 GM 运行时） |
| 945 | main.ts |
| 734 | coach/problemFacts/ConstraintParser.ts |
| 715 | backup/learningDataExport.ts |
| 705 | submissions/scrapers/ptaScraper.ts（大部分是注入脚本模板） |
| 671 | adapters/shared/frontendVerdictHook.ts（注入脚本模板） |
| 582 | adapters/sites/vjudge/hook.ts（注入脚本模板） |
| 573 | scripts/userScriptRuntimeBridge.ts |
| 568 | coach/CoachPetWindow.ts |
| 517 | ipc/registerCoachIpc.ts |
| 513 | coach/types.ts |

  - `TabManager.ts` 已有 `browser/` 下 19 个协作文件（`tabViewLayout`、`tabSessionStore`、`navigationPolicy` 等），但主类仍 2278 行、非空断言 6 处、注释-only catch 8 处，是全项目最集中的复杂度。
  - `CoachOrchestrator.ts` 1415 行同时承担规则调度、LLM 提示、比赛审计、会话追踪四类职责，`toISOString` 7 处集中于此。
- (d) 优先级：**高**（`TabManager.ts`、`CoachOrchestrator.ts`、`main.ts` 三个）；其余 **低**（注入脚本模板与 d.ts 不宜按 TS 模块拆）。

### 9.2 文件名：PascalCase 54 个、camelCase 229 个、kebab-case 0 个

- (a) 规范：`shared/code-quality.md` 文件命名——React 组件 PascalCase、Hook camelCase、**工具/类型文件 kebab-case**、目录 kebab-case。
- (b) 原因：单一约定避免 import 路径大小写错误；kebab-case 在 URL/CLI 里无歧义。
- (c) 实际（313 个 `.ts`）：
  - PascalCase 54 个——全部是"一个文件一个类"的服务/管理器（`TabManager.ts`、`CoachOrchestrator.ts`、`UserScriptService.ts`、`WindowManager.ts` 等）。
  - camelCase 229 个——函数式模块与配置（`tabManagerConfig.ts`、`navigationPolicy.ts`、`registerCoachIpc.ts` 等）。
  - kebab-case 0 个。
  - 其余 30 个：29 个迁移 `NNN_snake_case.ts` + `electron-env.d.ts`。
  - 实际隐含规则是"类文件 PascalCase、其他 camelCase"，与模板的"非组件一律 kebab-case"不同，但项目内部是一致的（未发现同一类型混用）。
- (d) 优先级：**低**（重命名 283 个文件的 git 噪音远大于收益；建议在 spec 里把项目实际规则写明即可）。

---

## 十、符合规范的亮点

1. **IPC 三道防线**（`ipc/trustedSender.ts` 457 行 + `ipc/payloadSchema.ts` 291 行）：`checkShellSender`（已登记 webContents + 主 frame + 预期 origin）→ `checkIpcPayload`（深度/体积/成环/原型污染）→ 按 channel 的 schema 元组。100 个带参 channel 全部声明 schema，`raw()` 逃逸 4 处且被架构守卫棘轮锁死；`object()` 默认拒绝多余字段；schema 元组同时推导 handler 参数类型，校验与类型只有一个来源。比模板的"每个 procedure 手写 safeParse"覆盖更完整、更难遗漏。
2. **迁移安全网**（`db/connection.ts`、`backup/sqliteMigrationBackup.ts`）：pending migration 前用 SQLite backup API 备份、失败自动恢复、写 failure marker 阻止重复重试。模板只要求 `migrate()` 返回 `{success,reason}`。
3. **架构守卫**（`tests/architecture/check-architecture.mjs`）：禁止 `register*.ts` 直接 import `ipcMain`、禁止 `main.ts` 恢复模块级 `win/tabManager` 单例、裸 SQL / 未声明 schema / `raw()` 三个棘轮只减不增、渲染层只能经 `*Api.ts` 访问主进程。这是模板没有而本项目自建的执行机制。
4. **类型纪律**：`any` 0、`@ts-ignore` 0、`eslint-disable` 0、非空断言仅 11、导出函数 99.6% 有显式返回类型、`import type` 179 个文件。在没有 typescript-eslint 强制的情况下靠人工做到这个水平。
5. **日志遮蔽**（`shared/logger.ts`）：敏感键正则、Bearer/Basic 头、URL query/hash 一律遮蔽；`console.*` 直接调用全项目只有 9 处且 6 处有合理理由。模板的 electron-log 默认不做遮蔽。
6. **事务纪律**：9 处 `db.transaction` 均无 silent return；`userScript/mutations.ts` 失败明确 throw 回滚。
7. **模块 README**：`db/`、`ipc/`、`shared/`、`db/repositories/*/` 各有 README 说明职责、边界与测试入口，`db/README.md` 明确"schema 变更必须走 migration 并同步 DATABASE_SCHEMA.md"，对应 `db-schema-change-guide.md` 的检查项。
8. **主进程导入路径**：`electron/` 内 `@` 别名 import 0 处，全部相对路径，符合 `quality.md` "Main process: relative paths"。
9. **时间约定的自我披露**：`shared/time.ts` 与 `shared/README.md` 明确注明 `nowBeijing` 实为系统本地时间及其在非东八区的风险，没有掩盖。

---

## 十一、问题清单汇总

| # | 问题 | 优先级 | 位置 / 计数 |
|---|---|---|---|
| 1.2 | `main.ts` 承担窗口/快捷键/导航/服务装配逻辑 | 高 | main.ts 945 行，22 个模块级 let，createWindowOnce 270 行 |
| 5.2 | UTC ISO 与本地字符串混用进入比较与同一张表 | 高 | CoachFeedbackStore.ts:345-349 + :278；CoachOrchestrator.ts:1344,1364,1372 |
| 8.1 | dev/prod 共用 userData，无 isPackaged 分流 | 高 | `app.isPackaged` 0 处；`getPath('userData')` 14 处 |
| 9.1 | 超长核心文件 | 高 | TabManager 2278 / CoachOrchestrator 1415 / main 945 |
| 2.1 | 3 个胖 IPC handler | 中 | scripts:importFile 86 行、confirmRemoteInstall 75、coach:triggerHint 48 |
| 2.3 | `{ok}` 与 `{success}` 并存，无 `code` | 中 | ok 35 / success 23 |
| 2.4 | 原始 error.message 直返渲染层 | 中 | 6 处（registerSitesIpc 3、registerRatingIpc 1、backupService 2） |
| 4.1 | logger 无 scope() | 中 | 102 处调用靠手写点分前缀 |
| 4.2 | console.* 直接调用 | 中 | registerCoachIpc.ts:160,306,325（其余 6 处有合理理由） |
| 6.1 | 非空断言 | 中 | 11 处 / 7 文件，TabManager 6 |
| 6.4 | 类型纪律无工具锁定 | 中 | 无 verbatimModuleSyntax / typescript-eslint |
| 7.3 | 循环内 prepare | 中 | learningDataExport.ts 6 处 |
| 1.1 | 无 services/{domain}/procedures 布局 | 中 | 全局 |
| 3.1 | 空 catch（全在注入脚本模板内） | 低 | 87 处 / 11 文件 |
| 3.2 | 注释-only / log-only catch | 低 | 63 / 34 处 |
| 3.4 | 无带 code 的 AppError 基类 | 低 | 5 个孤立 Error 子类 |
| 5.3 | nowBeijing 复制两份 | 低 | CoachEventBridge.ts:257、RuleEngine.ts:438 |
| 6.3 | 导出函数缺返回类型 | 低 | 2 / 553 |
| 6.5 | DB 行类型靠 as | 低 | 114 处 |
| 6.6 | interface 多于 type | 低 | 323 : 1 |
| 7.4 | 无 cursor 分页 | 低 | LIMIT 20 处，cursor 0 |
| 1.3 / 9.2 | 目录/文件命名非 kebab-case | 低 | 目录 6 个；文件 PascalCase 54 / camelCase 229 |
