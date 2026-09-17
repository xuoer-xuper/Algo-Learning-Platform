# 分阶段规范对齐计划

- 依据：`spec-alignment-report.md`（高 9 / 中 23 / 低 22 条）
- 原则：先建门、再修核心、后改风格。每个阶段是一个独立 Trellis 任务（或一个 feature 分支 + 一个 squash commit），可单独验证、单独回滚。
- 用时为单人估计，含测试与文档同步。
- **不做的事**：不换 Drizzle / Zod / electron-log / pnpm / Forge / Tailwind 工具类 / kebab-case 重命名 / `services/procedures` 大搬家。这些是"工具选型不同但目的已达成"或"收益远小于 git 噪音"。

---

## 阶段 0　建门（1 天）— 先让规范可执行，再改代码

目标：把"靠自觉"变成"过不了门就提交不了"。这一步不动业务代码，风险为零，且让后续每个阶段都有护栏。

| 步骤 | 内容 | 对应问题 |
|---|---|---|
| 0.1 | 分支模型落地：推送 `dev`；GitHub 设 master 分支保护（仅 PR 合并、要求 CI 通过）；`ci.yml` `on.push.branches` 加 `dev` | 高-9 |
| 0.2 | `husky` + `@commitlint/cli` + 自定义 config：`type-enum` = feat/fix/docs/refactor/test/chore/style/perf/ci；`scope-enum` = 一级目录词表；`commit-msg` 钩子 | 高-8、中-22 |
| 0.3 | `pre-commit` 钩子跑 `npm run lint && npm run typecheck && npm run typecheck:tests`（约 10 秒） | 高-8 |
| 0.4 | 类型纪律棘轮：在 `check-architecture.mjs` 加两条正则守卫 `NON_NULL_ASSERTION_BUDGET`（当前 13）、`EXPLICIT_ANY_BUDGET`（当前 0），只减不增。**替代 typescript-eslint**（TS 7 不兼容） | 高-8、中-6 |
| 0.5 | `tsconfig.json` 加 `verbatimModuleSyntax: true`，锁住 `import type` 纪律（需先跑一次 typecheck 确认无报错） | backend §6.4 |
| 0.6 | `package.json` 加 `"packageManager": "npm@11.8.0"` | 低-18 |
| 0.7 | 更新 `COMMIT_RULES.md`：scope 词表、必带/可选规则、`chore(release):`、分支与合并方式 | 中-22、§4 |

验证：故意提交一条 `update` 信息被拒；故意加一个 `x!.y` 让 `test:architecture` 红。

---

## 阶段 1　核心稳定性修复（3–4 天）— 高优先级里"改动小、收益大"的部分

| 步骤 | 内容 | 对应问题 | 用时 |
|---|---|---|---|
| 1.1 | **dev/prod userData 隔离**：新建 `electron/app/envSetup.ts`，`!app.isPackaged` 时 `setPath('userData', … + '-dev')`，在 `main.ts` 首行 import（与 `applyStartupSmokeUserDataPath` 同位置）。**注意**：开发者现有开发库会"换目录"，需一次性手动复制或接受空库 | 高-6 | 0.5 天 |
| 1.2 | **时间格式修 bug**：`CoachFeedbackStore.computeSince` 改用 `toBeijing()`；`CoachOrchestrator` 三处 `contest_start/end` 改本地格式（加一条数据迁移 030 把已有 UTC 值转换）；删掉 `nowIsoLocal` / `defaultNowIso` 两份复制，统一 import `shared/time` | 高-5 | 1 天 |
| 1.3 | **数据刷新订阅**：`Dashboard`、`ProblemDetail` 订阅 `onProblemsUpdated`；顺手抽一个 `useProblemsUpdatedRefetch(fetchFn)` hook 放 `src/hooks/`，消掉 `App.tsx` 4 次重复的竞态模板 | 高-7、中-10 | 1 天 |
| 1.4 | 6 处 `errorMessage(error)` 直返改为固定文案 + `appLogger.warn`；`registerCoachIpc.ts` 3 处 `console.*` 改 `appLogger` | 中-3、中-5 | 0.5 天 |
| 1.5 | `learningDataExport.ts` 6 处 `prepare` 提到循环外 | 中-7 | 0.5 天 |
| 1.6 | 消非空断言：`NavigationDecision` 改判别联合（一次消 5 处）；`isValidScrapedTitle` / `isRectangle` 改类型谓词（消 2 处）；其余 6 处逐个改 null 检查；棘轮预算降到 0 | 中-6 | 0.5 天 |

验证：`npm run test:core`；1.1 手动启动 dev 确认 userData 路径带 `-dev`；1.2 在东八区跑 `tests/coach/*feedback*`；1.3 后台 sync 后 Dashboard 自动刷新。

---

## 阶段 2　IPC 契约收口（4–5 天）— 最大的可维护性缺口

这是整个计划里改动面最广的一步，必须在阶段 0 的门建好之后做，且单独一个 feature 分支。

| 步骤 | 内容 | 对应问题 | 用时 |
|---|---|---|---|
| 2.1 | 新建跨进程中立目录（待确认路径，建议 `algo-electron/shared/`，主进程与渲染进程都可 import，架构守卫放行）：`shared/ipc/channels.ts` 集中 158 个 channel 常量，按域分组 `IPC.problem.listRecent` | 高-1 | 1 天 |
| 2.2 | `shared/types/*.ts`：把 `electron-env.d.ts` 的 112 个类型改为 `export`，按域拆文件；主进程 72 个重复定义改为 re-export；渲染进程 10 个同名 + 改名副本（`HomeOverviewStats` 等）改为 import | 高-2 | 2 天 |
| 2.3 | `preload.ts` 改为 import 常量与类型，`ElectronAPI` 接口由 preload 的 `typeof api` 推导（`declare global { interface Window { electronAPI: typeof api } }`），删掉 85 处 `as Promise<X>` 断言 | 高-2、frontend §2.3 | 1 天 |
| 2.4 | 架构守卫加一条：`ipcMain.handle('` / `ipcRenderer.invoke('` 字面量预算 = 0 | 高-1 | 0.5 天 |
| 2.5 | 同步 `SYSTEM_ARCHITECTURE.md`、`electron/ipc/README.md`、`src/README.md`、IPC contract 测试 | 项目 COMMIT_RULES §5 | 0.5 天 |

验证：`tsc` 0 错；`tests/ipc/preloadSurface` 通过；故意改一个 channel 名只需改一处。

---

## 阶段 3　主进程拆分（5–7 天）— 三个超长文件

| 步骤 | 内容 | 对应问题 | 用时 |
|---|---|---|---|
| 3.1 | `main.ts`：`createWindowOnce` 拆到 `windows/createShellWindow.ts`（窗口构造 + 导航拦截 + 快捷键分派）；`whenReady` 的 12 个服务装配拆到 `app/bootstrapServices.ts`；22 个模块级 `let` 收进一个 `MainProcessState` 对象。目标 <300 行 | 高-3 | 2 天 |
| 3.2 | `CoachOrchestrator.ts`（1415）按四职责拆：`ContestAuditor`、`LlmHintCoordinator`、`SessionEventRouter`，Orchestrator 只做接线。目标每文件 <500 | 高-4 | 2 天 |
| 3.3 | `TabManager.ts`（2278）：先抽已成形的 19 个协作文件未覆盖的部分——导航决策、view 生命周期、事件发布——各成模块。目标 <1000（一次到 500 风险太高） | 高-4 | 2–3 天 |
| 3.4 | 3 个胖 handler 主体提到 `scripts/importUserScriptFromFile.ts`、`coach/demoHintLadder.ts` | 中-1 | 0.5 天 |
| 3.5 | `AppLogger` 加 `scope(name): Logger`，新代码用 scoped，旧 102 处不强改 | 中-4 | 0.5 天 |

验证：`test:all`（含真实 Electron 冒烟）；`tests/electron/mainStartupContract` 单实例闸门仍红/绿正确。

---

## 阶段 4　渲染层结构对齐（3–4 天）

| 步骤 | 内容 | 对应问题 | 用时 |
|---|---|---|---|
| 4.1 | 文件归位（纯 `git mv`）：`useOmnibox.ts` → `hooks/`；`browserShellApi.ts`、`tabApi.ts`、`windowApi.ts` → `src/api/` 或各 feature；feature 内 hook 进 `hooks/` | 中-9 | 0.5 天 |
| 4.2 | 每个 feature 加 `index.ts` 公共导出；`ShellRouter` 与 `App.tsx` 只从 index import | 中-8 | 0.5 天 |
| 4.3 | 引入 `ShellActionsContext`（`onNavigate` / `onClose` / `onOpenTab`），消掉 5 层 drilling；`App.tsx` 拆出 `NoticeBarStack` 组件。目标 App <250 行 | 中-12、中-13 | 1 天 |
| 4.4 | refetch 不闪骨架：`CredentialsPage`、`CoachMetricsView` 改三态；`SiteManagementPanel`、`UserScriptManager` 加 loading | 中-11 | 0.5 天 |
| 4.5 | `App.tsx` 5 处 `.catch(() => undefined)` 改为 `reportRendererError`；`EVENT_TYPE_LABELS` 合并到 `features/coach/constants.ts` | 中-17、中-18 | 0.5 天 |
| 4.6 | CSS：`styles/index.css` 单入口（`tokens.css` + `base.css` + `@import` 各功能文件）；`App.css` 退役；17 个滚动容器加 `scrollbar-gutter: stable`；`app-shell.css` 708 行按壳层区域拆 3 个 | 中-14、中-15 | 1 天 |

验证：`test:ui`（Playwright 截图）；`test:performance`（入口体积）。

---

## 阶段 5　测试与细节（2–3 天，可与前面并行）

| 步骤 | 内容 | 对应问题 |
|---|---|---|
| 5.1 | 测试用例名语言二选一（待确认）；21 个路径名用例改为行为描述；新增 `tests/docs` 规则禁止路径名用例 | 中-19 |
| 5.2 | 新建 `tests/factories/`：`problem.factory.ts`、`submission.factory.ts`、`coachEvent.factory.ts` + `resetAllCounters()`；新测试必须用 | 中-20 |
| 5.3 | vitest 加目录级覆盖率门：`electron/db/**`、`electron/adapters/**`、`electron/parsers/**` 80%；`electron/ipc/**` 60%；全局棘轮保留 | 中-20 |
| 5.4 | 残留清理：删 `algo-coach-showcase.html`、`release-notes.txt`；`ai coach技术栈.md` → `AI_COACH_TECH_STACK.md`；`REFACTOR_HANDOFF.md`、`TASKS.md` 归档到 `docs/ARCHIVE/` | 中-23、低-20 |
| 5.5 | `.mailmap` 合并三个作者身份 | 低-19 |
| 5.6 | 低优先级零散项按顺手原则处理：布尔命名、`HomePage` useMemo、hook 返回类型、`useToast` 删或用 | 低-4/9/14/15 |

---

## 阶段 6　spec 文档落地（与阶段 0 同时开始，本任务完成）

见 `00-bootstrap-guidelines` 任务本身。做法：**模板文件一字不改**，在每个 spec 目录加一个 `project-overrides.md`（或在 `index.md` 顶部加"本项目差异"段落）记录经用户确认的项目约定，并在 `.trellis/spec/README.md` 说明"模板为基准，overrides 为本项目裁决"。

---

## 总览

| 阶段 | 内容 | 用时 | 前置 |
|---|---|---|---|
| 0 | 建门（分支保护、commitlint、husky、棘轮） | 1 天 | 无 |
| 1 | 核心稳定性（userData 隔离、时间 bug、刷新订阅、错误直返） | 3–4 天 | 0 |
| 2 | IPC 契约收口（channel 常量、shared types） | 4–5 天 | 0 |
| 3 | 主进程拆分（main / CoachOrchestrator / TabManager） | 5–7 天 | 2 |
| 4 | 渲染层结构（归位、index、Context、CSS 单入口） | 3–4 天 | 2 |
| 5 | 测试与细节 | 2–3 天 | 0 |
| 6 | spec 落地 | 0.5 天 | 用户确认 |
| 合计 | | 约 19–25 个工作日 | |

阶段 1 与 2 可并行（不同文件）；阶段 3 与 4 可并行；阶段 5 随时插入。
