# 规范对齐总报告：electron-fullstack 模板 vs Algo Learning Platform

- 日期：2026-09-17　基准：`.trellis/spec/`（模板 v0.6.17 原文，未改动）
- 范围：`algo-electron/electron/`（313 个 ts）、`algo-electron/src/`（68 ts/tsx + 16 css）、`algo-electron/tests/`（235 文件）、工具链、仓库、git 历史（248 commit）
- 明细证据（带 grep 命令与行号）见同目录三份分报告：`backend-audit.md`、`frontend-audit.md`、`tooling-tests-git-audit.md`
- 判定原则：**模板是基准**。工具选型不同但目的已达成的记为"等价实现"，不算问题；目的未达成的才算问题。

---

## 0. 一页结论

| 维度 | 结论 |
|---|---|
| 类型纪律 | 很好。`any` 0、`@ts-ignore` 0、非空断言 13 处（模板要求 0）、导出函数 99% 有返回类型。但**没有 lint 规则守着**，全靠自觉。 |
| IPC 安全 | 超出模板。三道防线（sender 校验 → payload 结构 → 按 channel schema），100 个带参 channel 全声明 schema，架构守卫棘轮锁死。 |
| IPC 契约 | 差。158 个 channel 名全是散落字符串；112 个跨进程类型在 `electron-env.d.ts` 里手抄，72 个与主进程重复、10 个与渲染进程重复。这是**最大的可维护性风险**。 |
| 分层 | 中。渲染层隔离彻底（组件 0 处直连 `electronAPI`），主进程 IPC handler 97% 是薄层；但 `main.ts` 945 行不只做编排，`TabManager` 2278 行。 |
| 时间 | 项目约定（本地时间 TEXT 字符串）与模板（Unix 毫秒 INTEGER）根本不同，**不改**。但约定内部有真实 bug：UTC ISO 与本地字符串混进同一比较、同一张表。 |
| 环境隔离 | 缺失。dev 与已安装的正式版共用同一个 userData 与 SQLite 文件。 |
| 数据刷新 | 15 个取数组件不订阅变更事件，Dashboard / ProblemDetail 在后台同步后显示旧数据。 |
| 测试 | 体量大（178 文件 1212 用例）、机制完整，但用例名中英混用（55% 中文）、21 个用例名是文件路径、无 factories。 |
| Git | 248 个 commit 全在 master 一条线，0 merge 0 PR；commit 格式 93% 合规但无工具门；dev 分支 push 不触发 CI。 |
| 残留 | `.gitignore` 生效，无构建产物入库。真残留 5 个文件（见 §3 低-8）。 |

---

## 1. 高优先级（影响稳定性 / 可维护性）

### 高-1　IPC channel 名 158 个全是散落字符串，无集中常量
- **规范**：`frontend/ipc-electron.md` "Add channel in `src/shared/constants/channels.ts`"；`backend/directory-structure.md` Shared Types Directory；`guides/pre-implementation-checklist.md` "Cross-layer usage → shared/constants/"。
- **为什么**：主进程 `handle('x:y')` 和 preload `invoke('x:y')` 各写一遍，拼错一个字母不会有编译错误，只会在运行时静默失败。改名要改两处。
- **现状**：preload 139 个 `invoke('…')` + 19 个 `send('…')`；主进程 139 个 `ipcMain.handle('…')` + 21 个 `on('…')`；`IPC_CHANNELS` 常量 0 处。已经出现漂移苗头：`realtimeSubmission:getStatus` 在主进程是常量 `STATUS_CHANNEL`，在 preload 是字面量（`RealtimeSubmissionService.ts:15` vs `preload.ts:94`）。
- **证据**：frontend-audit §2.1。

### 高-2　跨进程类型三处手抄：`electron-env.d.ts`（112 个）↔ 主进程（72 个重复）↔ 渲染进程（10 个重复 + 多个改名副本）
- **规范**：`frontend/ipc-electron.md` "Types should be defined in a shared location and used by both main and renderer"；`frontend/type-safety.md` "Bad - don't redefine"；`guides/cross-layer-thinking-guide.md`。
- **为什么**：`electron-env.d.ts` 是全局脚本（0 个 import/export），无法被 import，只能手抄。主进程加字段、改可空性，渲染进程不报错，运行时才炸。
- **现状**：12 个具体例子（frontend-audit §2.2 表格）。最典型：`RealtimeSubmissionStatus` 三份逐字段复制；`OverviewStats` 有 4 个名字（`OverviewStats` / `HomeOverviewStats` / `SettingsOverviewStats` / ambient）；两份 `CodeforcesAccount` 字段还不一样；`UserScriptRecord.site_ids_json` 可空性在两处不同。preload 靠 85 处 `as Promise<X>` 断言对齐 `.d.ts`，另 54 个 invoke 无断言返回 `Promise<any>`。
- **证据**：frontend-audit §1.5、§2.2、§2.3。

### 高-3　`main.ts` 945 行承担窗口构造、导航拦截、快捷键、7 个 TabManager 回调、12 个服务装配
- **规范**：`backend/directory-structure.md` 入口只做 "Main process entry"；`backend/api-module.md` "Thin IPC handlers"；项目自己的 `electron/README.md` 也写"业务逻辑应继续下沉到子模块"。
- **为什么**：改任何一处启动行为都要读全文；22 个模块级 `let` 单例让测试只能靠真实 Electron 冒烟。
- **现状**：模块级 `let` 22 个（104–125 行）；`createWindowOnce()` 270 行（254–522）；`whenReady` 回调 265 行（681–945）；`tabManager.` / `windowManager.` / `.send(` 出现 86 次。`app/` 目录已承接一部分（12 文件 1082 行），方向对但未完成。
- **证据**：backend-audit §1.2。

### 高-4　超长核心文件：`TabManager.ts` 2278 行、`CoachOrchestrator.ts` 1415 行
- **规范**：模板无行数硬阈值，但 `api-module.md` "One file per procedure" 隐含单文件专一；`frontend/quality.md` 组件 300 行上限可类比。
- **为什么**：`TabManager` 集中了全项目最多的非空断言（6/11）和注释-only catch（8/63）；`CoachOrchestrator` 同时做规则调度、LLM 提示、比赛审计、会话追踪四件事，`toISOString` 7 处集中于此。
- **现状**：>500 行文件 14 个，其中 5 个是注入脚本模板或 `.d.ts`（不宜拆），真正需要拆的是这两个加 `main.ts`。
- **证据**：backend-audit §9.1。

### 高-5　时间格式在既有约定内混用：UTC ISO 与本地字符串进同一比较、同一张表
- **规范**：`shared/timestamp.md` "Mixing formats - FORBIDDEN"（模板说的是秒/毫秒，精神是同层只允许一种格式）；`guides/transaction-consistency-guide.md` "consistent format across data paths"。
- **为什么**：本地字符串与 UTC ISO 在东八区差 8 小时，字符串比较直接错位。
- **现状**：
  - `coach/CoachFeedbackStore.ts:345-349` 用 `toISOString()`（UTC）算 `since`，与 `nowBeijing()` 写的 `created_at` 做字符串比较，**暖机窗口多算 8 小时**（可复现 bug）。
  - `coach/CoachOrchestrator.ts:1344,1364,1372` 把 `contest_start/end` 写成 UTC ISO 存入 `coach_interventions`，同一行 `created_at` 是本地时间，**同表两列两种格式**，影响审计导出。
  - `nowBeijing()` 被逐行复制了两份（`CoachEventBridge.ts:257`、`rules/RuleEngine.ts:438`）。
- **注意**：项目"数据库用本地时间字符串"的约定本身不动（见待确认 §5-1）。
- **证据**：backend-audit §5.2、§5.3。

### 高-6　dev 与正式版共用同一 userData 与 SQLite 文件
- **规范**：`backend/environment.md` "Dev/Prod Data Isolation"，`backend/index.md` Core Rules 第一条。
- **为什么**：开发时跑迁移、导入测试数据会直接改用户真实库；dev 与已安装的 exe 因单实例锁不能同时开。
- **现状**：`app.isPackaged` 0 处；`setPath('userData')` 仅冒烟模式 1 处；`getPath('userData')` 14 处全指同一目录。唯一缓解是迁移前自动备份。
- **证据**：backend-audit §8.1。

### 高-7　15 个取数组件不订阅数据变更事件
- **规范**：`frontend/ipc-electron.md` "Data Refresh Subscription Pattern — All hooks that fetch data via IPC should subscribe to data change events"；`frontend/hooks.md` "CRITICAL"。
- **为什么**：后台 `syncCodeforces`、实时提交监听写库后，不订阅的页面显示旧数据直到手动刷新。
- **现状**：preload 只暴露一个变更事件 `onProblemsUpdated`；订阅了的只有 `HomePage`、`ProblemSidebar`。`Dashboard`（错题/未复习/时间线）和 `ProblemDetail`（提交记录）在 `problems:updated` 后不刷新。另 13 个设置类面板影响较小。
- **证据**：frontend-audit §3.2。

### 高-8　类型纪律与 commit 规范都没有工具门
- **规范**：`shared/code-quality.md` "Lint and Type Check Before Commit"、"No `!`"、"No `any`"；`shared/git-conventions.md` Pre-Commit Checklist。
- **为什么**：现在的 0 `any`、13 个 `!`、93% commit 合规全靠自觉。没有门，下一个 AI 会话或下一次赶工就会退化。
- **现状**：
  - ESLint 用 `@babel/eslint-parser`，`no-unused-vars` / `no-undef` 关闭，无 `no-non-null-assertion` / `no-explicit-any`。**typescript-eslint 8.70 peer 范围是 TS `<6.1.0`，本项目 TS 7.0.2，切不过去**（本次 `npm view` 核实）。
  - 无 husky / commitlint / lint-staged；CI 只在 push master 或 PR 时跑，**push dev 不跑**。
  - 最近 60 条 commit：4 条非法 type（`design:` `tests:` `renderer:` ×2）+ 1 条 `release:`；9 条一次改 >20 文件（最大 195）。
- **证据**：tooling-audit B1、D1、D4。

### 高-9　248 个 commit 全部直接落在 master，0 merge、0 PR
- **规范**：`shared/git-conventions.md` Branch Naming `type/description`、PR Guidelines。
- **为什么**："master 只放稳定版"现在不成立；任何一次失败的实验都直接进主线。
- **现状**：`dev` 是今天才开的（领先 2 commit，未推送）；从未用过 feature 分支。
- **证据**：tooling-audit D2；开发习惯判断见 §4。

---

## 2. 中优先级（风格一致性）

| # | 问题 | 规范 | 现状 | 证据 |
|---|---|---|---|---|
| 中-1 | 3 个胖 IPC handler | `api-patterns.md` Anti-Pattern 1 | `scripts:importFile` 86 行、`scripts:confirmRemoteInstall` 75 行、`coach:triggerHint` 48 行（含演示文案表）；其余 152 个 ≤26 行 | backend §2.1 |
| 中-2 | 返回形状 `{ok}` / `{success}` 并存，无 `code` | `code-quality.md` Error Response Format | `{ok:` 35 处（service 层）、`{success:` 23 处（ipc 层）、`code` 0 处 | backend §2.3 |
| 中-3 | 原始 `error.message` 直返渲染层 | `error-handling.md` "Exposing Internal Errors" | 6 处：`registerSitesIpc.ts:176,198,212`、`registerRatingIpc.ts:70`、`backupService.ts` ×2 | backend §2.4 |
| 中-4 | logger 无 `scope()`，靠手写 `模块.事件` 前缀 | `logging.md` Scoped Logger | 102 处调用；自研 `AppLogger` 其余功能（轮转、脱敏）优于 electron-log | backend §4.1 |
| 中-5 | `console.*` 绕过 logger | `quality.md` Forbidden | `registerCoachIpc.ts:160,306,325`（其余 6 处有合理理由：冒烟 stdout、preload 无 logger） | backend §4.2 |
| 中-6 | 非空断言 13 处 | `code-quality.md` NEVER | 主进程 11（TabManager 6，其中 5 处 `decision.reason!` 可用判别联合一次消除）、渲染 2（`main.tsx:9`、`computeMetrics.ts:123`） | backend §6.1、frontend §7.1 |
| 中-7 | 循环内 `prepare()` | `database.md` N+1 | `learningDataExport.ts` 6 处，均在单事务内 | backend §7.3 |
| 中-8 | feature 内无 `components/ hooks/` 分层、无 `index.ts` | `frontend/directory-structure.md` Module Structure | 6 个 feature 全平铺；全 `src/` 只有 `ui/index.ts` 一个 index；跨 feature 深层 import 8 处 | frontend §1.2 |
| 中-9 | hook 与非 hook 文件错位 | `directory-structure.md` Quick Reference | `components/useOmnibox.ts`（212 行 hook 在 components）、`hooks/browserShellApi.ts`（非 hook 在 hooks）、`components/tabApi.ts` `windowApi.ts` | frontend §1.3、§10 |
| 中-10 | 无取数 hook；`useEffect` 直接 await，竞态模板复制 4 次 | `hooks.md` Custom Hook with IPC | 4 个 hook 无一取数；`App.tsx:106-189` 同样 15 行 `disposed/receivedLiveUpdate` 模板重复 4 次 | frontend §3.1 |
| 中-11 | refetch 闪骨架 / 加载态与空态混同 | `react-pitfalls.md` Loading State | `CredentialsPage.tsx:54`、`CoachMetricsView.tsx:83` refetch 时 `setLoading(true)`；`SiteManagementPanel`、`UserScriptManager` 无 loading 状态 | frontend §5.3、§5.4 |
| 中-12 | 零 Context，props drilling 5 层 | `state-management.md` | `onNavigate` 30 处引用穿 5 层；`onClose` 65 处；`App.tsx` 8 state + 8 effect 是事实上的全局容器 | frontend §9.1 |
| 中-13 | 组件 >300 行 3 个 | `quality.md` | `SessionTimelineView` 438、`TabStrip` 432、`App.tsx` 389 | frontend §6.4 |
| 中-14 | CSS 三条入口链、5 个文件 >500 行、无 `tokens.css` 独立文件 | `css-design.md` 单入口 | `index.css` / `App.css`→8 文件 / 6 处组件旁 import；`app-shell` 708、`settings` 665、`ui` 659、`dashboard` 640、`bubble` 517；旧别名 `var(--bg)` 372 次 vs 语义 token 137 次 | frontend §8.1-8.3 |
| 中-15 | `scrollbar-gutter: stable` 0 处 | `components.md`、`index.md` Core Rules | 17 个 `overflow: auto` 容器，滚动条宽 10px，会横向抖动 | frontend §6.1 |
| 中-16 | 类名非 BEM | `css-design.md` | 463 个类选择器 0 个 `__`；项目自洽用 `block-element-sub` + `--modifier` | frontend §8.5 |
| 中-17 | 渲染层吞错 9 处 | `code-quality.md` Never Swallow | `App.tsx` 5 处 `.catch(() => undefined)` 无注释；其余 4 处有降级注释 | frontend §11.1 |
| 中-18 | 重复常量 | `pre-implementation-checklist.md` | `EVENT_TYPE_LABELS` 在 `CoachMetricsView.tsx:39` 与 `SessionTimelineView.tsx:55` 各一份 | frontend §11.2 |
| 中-19 | 测试用例名中英混用、路径名用例 | `code-quality.md` Test Naming | 661/1212 中文；21 个用例名 = 文件路径；四类 describe 分组 0 次；`describe` 仅 61/178 文件 | tooling A4 |
| 中-20 | 无 `tests/factories/`；覆盖率单一全局门 | `backend/quality.md` 按层 80/60 | 全局 65/60/62/68（棘轮）；无 factory、无 `resetAllCounters` | tooling A1、A3 |
| 中-21 | 主进程无 `services/{domain}/procedures/` 布局 | `backend/directory-structure.md` | 26 个平铺域目录 + README 替代；结构自洽，迁移代价高 | backend §1.1 |
| 中-22 | commit scope 无词表、大杂烩 commit | `git-conventions.md` Scopes / Atomic | scope 用过 coach/ci/test/ui 无规则；`fix(test)` 把 type 当 scope | tooling D1 |
| 中-23 | 残留文件 | 项目 CONTRIBUTING §5 | `algo-coach-showcase.html`（40KB，无引用）、`release-notes.txt`（与 CHANGELOG 重复）、`algo-electron/docs/ai coach技术栈.md`（含空格中文名，破坏 `git ls-files` 解析） | tooling C1 |

---

## 3. 低优先级（细节优化）

| # | 问题 | 现状 |
|---|---|---|
| 低-1 | 空 catch 87 处，全部在注入 OJ 页面的模板字符串内 | 真实 TS 代码 0 处；注入脚本"尽力探测"是惯例，但无异常回传通道 |
| 低-2 | 注释-only catch 63 处 / log-only catch 34 处 | 抽样注释均解释原因；`main.ts` 12 处建议逐个确认 |
| 低-3 | 无带 `code` 的 `AppError` 基类 | 5 个孤立 Error 子类 |
| 低-4 | 导出函数缺显式返回类型 | 主进程 2/553；渲染 40/219（全是组件 + 2 个 hook） |
| 低-5 | DB 行类型靠 `as` 114 处 | 裸 better-sqlite3 无 `$inferSelect`；可改 `prepare<[], Row>()` 泛型 |
| 低-6 | `interface` 323 : `type` 1 | 模板偏好 `type`，项目一致用 `interface` |
| 低-7 | 无 cursor 分页 | `LIMIT ?` 20 处；本地单用户 SQLite 无需求 |
| 低-8 | 文件/目录命名非 kebab-case | 类文件 PascalCase 54、其余 camelCase 229、kebab 0；目录 camelCase 6；项目内部一致 |
| 低-9 | 布尔 state 无 `is/has` 前缀 33 处 | `loading` ×6、`saving`、`dirty`、`open`… |
| 低-10 | `as X` 断言 6 处（渲染） | 4 处是 `<select>` 值断言为联合类型，无运行时校验 |
| 低-11 | 无路径别名 | `'../../components/ui'` 深层相对路径 |
| 低-12 | Tailwind 装了但工具类使用 0/727 | 只当 `@theme` token 引擎；打包了未用的运行时 |
| 低-13 | 滚动条非"hover 淡入" | `index.css:221` 常显 |
| 低-14 | `useToast` 存在但 0 使用 | 反馈统一走 `NoticeBar` + `setStatus` |
| 低-15 | `HomePage.tsx:58-67` 每次渲染重建 Set | 未 `useMemo` |
| 低-16 | 唯一 `eslint-disable`（`MilkdownEditor.tsx:137`）+ 全局关闭 `react-hooks/set-state-in-effect` | |
| 低-17 | 无 prettier | 有 `.editorconfig`；代码风格实际统一（无分号、单引号） |
| 低-18 | npm 无 `packageManager` 字段 | 模板 pnpm 前提（monorepo）不成立，不换 |
| 低-19 | 三个 git 作者身份 | 191 / 48 / 9，可用 `.mailmap` 合并 |
| 低-20 | 阶段性文档未归档 | `algo-electron/docs/REFACTOR_HANDOFF.md`（B 阶段已完成）、`TASKS.md`（与 `.trellis/tasks` 重叠）；`BROWSER_SHELL_REFACTOR_PLAN.md` 234KB |
| 低-21 | `.agents/skills` 与 `.grok/skills` 43 个相同文件 | Trellis 为多客户端各复制一份，103 个 AI 工具配置文件占仓库 10.5% |
| 低-22 | 组件测试靠每文件 `@vitest-environment jsdom` 注释 | 21 个文件；可用 `test.projects` 按目录切 |

---

## 4. 关于开发习惯的判断

用户设想：**master 只放稳定版；在 dev 开发；完成后合并回 master；commit 用 Angular 规范 + 中文信息。**

**结论：方向正确，是从 0 merge 0 PR 起步的最小可行第一步。** 与模板 `git-conventions.md`（只规定 commit 格式和 feature 分支名）和项目 `COMMIT_RULES.md`（本来就是 Conventional type + 中文）都不冲突。需要补六点才能真正成立：

1. **dev 之上仍要有短命 feature 分支**：`feat/<描述>`、`fix/<描述>` 从 dev 切出（英文 kebab-case），完成后合回 dev。只有 dev 一条线时两个并行任务会互相夹杂。小改（typo / docs）可直接在 dev 提交。
2. **合并方式写死**：feature → dev 用 **squash merge**（一个 feature 一个 commit，大杂烮留在分支内部）；dev → master 用 **`--no-ff` merge commit**（保留"这版含哪些 feature"的树形），tag 打在这个 merge commit 上。不 rebase master。
3. **PR 是必需的，即使一个人开发**：CI 只在 `pull_request` 和 push master 时跑，push dev 不跑。建议两者都做：`ci.yml` 的 `on.push.branches` 加 `dev` 跑 `fast-guard`；PR 到 master 跑全部 4 个 job。
4. **scope 词表**：Angular 规范里 scope 可选，但项目现状混乱（`fix(test)`、`renderer:`、`design:`、`release:`）。定一张取自一级目录的词表，规定 `feat/fix/refactor/perf` 必带 scope，`docs/chore/test/style/ci` 可选；`release:` 改写为 `chore(release): 发布 vX.Y.Z`。
5. **commitlint + husky 把规则变成门**：`commit-msg` 跑 commitlint（`type-enum` + `scope-enum` 自定义，中文 subject 不受 `subject-case` 影响）；`pre-commit` 跑 `npm run lint && npm run typecheck`（或 `test:core`，约 11 秒）。
6. **语言约定写死**：type / scope 用英文小写（commitlint 可解析、`git log --grep` 可用），description 用中文。不要为对齐模板改成英文描述，那会造成新旧历史两种语言。

---

## 5. 符合规范、优于模板的亮点（应写进 spec 保护起来）

1. **IPC 三道防线**：`trustedSender.ts`（sender 归属 + 主 frame + origin）→ `checkIpcPayload`（深度 / 体积 / 成环 / 原型污染）→ `payloadSchema.ts` 按 channel 的 schema 元组（`object()` 默认拒绝多余字段，schema 同时推导 handler 参数类型）。100/100 带参 channel 全声明，`raw()` 逃逸 4 处被棘轮锁死。
2. **迁移安全网**：pending migration 前 SQLite backup API 备份、失败自动恢复、failure marker 阻止重复重试。
3. **架构守卫棘轮**（`tests/architecture/check-architecture.mjs` + `guards.mjs`）：裸 SQL 出 db 层、渲染层只经 `*Api.ts`、交互控件出 `ui/`、裸 hex、未声明 schema 的 IPC，全部只减不增，且有反向用例验证守卫自身。
4. **渲染层隔离**：`window.electronAPI` 156 次调用中 155 次收口在 9 个 `*Api.ts`；组件 0 次直连；0 次 import electron/node；20/20 preload 订阅返回 unsubscribe。
5. **日志脱敏**：`AppLogger` 对 authorization/cookie/csrf/password/token/api-key 键、Bearer 头、URL query/hash 一律遮蔽。模板的 electron-log 默认不做。
6. **浏览器 API 零违规**：无 alert/confirm/prompt/localStorage/File.path；确认走 `ConfirmDialog`。
7. **事务纪律**：9 处 `db.transaction` 均无 silent return。
8. **加载态三态样板**：`HomePage` / `Dashboard` / `ProblemSidebar` 用 `null / []` 区分未读到与空。
9. **108 个目录 README** + `test:docs` 覆盖率检查，替代了模板"目录即契约"的作用。
10. **时间约定的自我披露**：`shared/time.ts` 明确注明 `nowBeijing` 实为系统本地时间及非东八区风险。
