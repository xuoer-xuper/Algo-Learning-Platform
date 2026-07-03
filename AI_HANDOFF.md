# AI 开发交接（AI_HANDOFF）

## 1. 当前阶段

Phase 6 进行中。已完成：P6-001 本地题解 Markdown 系统、P6-002 笔记独立浮层、P6-004 AI 上下文导出层、P6-005 错题复习建议（本地规则引擎）、P6-006 薄弱标签分析（本地规则引擎）、P6-010 限制 AI 修改核心数据。P6-003 代码片段管理已撤销（用户反馈手动维护成本高，AI 模块不依赖此表）。

下一批待办：P6-007 阶段学习总结 → P6-008 复习计划生成 → P6-009 AI 输出本地保存（建 `ai_outputs` 表）→ P6-011 可追溯性测试。

2026-07-03 补充：提交监测七站当前已按用户手测通过收口（Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode）。本轮没有改数据库 schema、IPC/Preload API 或 Cookie 策略。实时提交监测的权威设计文档为 `docs/submission-monitoring-design.md`，后续修改提交监测、站点 adapter、实时 hook 前必须先读该文档。

提交监测 adapter 已开始按站点目录拆分，主线在 `algo-electron/electron/adapters/sites/`：

- `registry.ts` 只注册和查找 adapter，内置列表由 `adapters/sites/index.ts` 维护。
- 各站点 `index.ts` 负责组装 `SiteAdapter`；题目 URL/身份解析放 `problem.ts`；提交结果解析放 `submissions.ts`；提交表格解析放 `tables.ts`。
- 已拆分：Codeforces（problem/submissions/hook/urls）、AcWing（problem/submissions）、Nowcoder（problem/submissions/tables/hook）、VJudge（problem/submissions/hook）、PTA（problem/submissions）、洛谷（problem/submissions）、LeetCode（problem/submissions/hook）。
- 模块级说明已补：`algo-electron/electron/` 下主进程核心目录均已有 README，覆盖 `adapters`、`ai`、`app`、`browser`、`cookies`、`db`、`notes`、`parsers`、`rating`、`scripts`、`shared`、`sites`、`submissions`、`tracking`，并已加入 `docs/README.md` 索引。
- P8-013 已完成提交监测 adapter 标准化，P8-014 已完成主进程目录文档全覆盖，P8-015 已完成 renderer、测试、构建入口文档覆盖，P8-016 已完成 renderer 结构审计和首轮低风险拆分。新增 `docs/renderer-structure-audit.md`，并抽出 `src/shared/display.ts` / `src/shared/README.md`，集中平台名称、短标签、首页 URL、状态文案和颜色等展示常量。P8-017 已完成第一轮大型 feature 拆分：`SettingsPage.tsx` 抽出 `RealtimeSubmissionPanel.tsx`，`Dashboard.tsx` 抽出 `TrendPanel.tsx`。P8-018 已完成第二轮拆分：`Dashboard.tsx` 抽出 `AiSuggestionsPanel.tsx`。P8-019 已完成设置页站点管理拆分：`SettingsPage.tsx` 抽出 `SiteManagementPanel.tsx`。P8-020 已完成用户脚本管理器拆分：`UserScriptManager.tsx` 抽出 `UserScriptEditor.tsx`、`UserScriptList.tsx` 和 `types.ts`。P8-021 已完成笔记弹层拆分：`NotePanelModal.tsx` 抽出 `NoteList.tsx`、`NoteEditorPane.tsx` 和 `notesTypes.ts`。P8-022 已完成 Dashboard 图表拆分：`Dashboard.tsx` 抽出 `PlatformDistributionPanel.tsx` 和 `RatingPanel.tsx`。P8-023 已完成站点管理内部拆分：`SiteManagementPanel.tsx` 抽出 `AddSiteForm.tsx`、`ImportPreviewPanel.tsx` 和 `siteManagementTypes.ts`。P8-024 已完成 Dashboard 列表面板拆分：`Dashboard.tsx` 抽出 `DashboardListsPanel.tsx`，列表时间格式化、平台名称映射和列表项类型收敛到 analytics feature 内部。P8-025 已完成设置页首页与同步面板拆分：`SettingsPage.tsx` 抽出 `DefaultHomePanel.tsx`、`LearningOverviewPanel.tsx`、`PlatformDistributionSummary.tsx` 和 `CodeforcesSyncPanel.tsx`。P8-026 已完成笔记标题保存 hook 拆分：`NotePanelModal.tsx` 抽出 `useDebouncedNoteTitleSave.ts`，标题防抖、切换前 flush、卸载 flush 和删除 pending 清理均由 hook 负责。P8-027 已完成 App 浏览器工具栏拆分：`App.tsx` 抽出 `components/BrowserToolbar.tsx`，工具栏 UI 通过 props 接收导航、同步和全局面板入口回调。P8-028 已完成 App modal 状态 hook 拆分：`App.tsx` 抽出 `hooks/useAppModalState.ts`，设置、统计、脚本、题目详情、笔记弹层状态和浏览器预览背景由 hook 管理。P8-029 已完成 App 浏览器视图显隐 hook 拆分：`App.tsx` 抽出 `hooks/useBrowserViewVisibility.ts`，首页和 modal 背景驱动的 `WebContentsView` 显隐副作用由 hook 管理。P8-030 已完成 App 浏览器导航 hook 拆分：`App.tsx` 抽出 `hooks/useBrowserNavigation.ts`，URL 监听、地址栏跳转、导航按钮、侧栏宽度同步和当前页提交抓取 IPC 由 hook 管理。P8-031 已完成 Analytics 数据 helper 与类型收敛：`Dashboard.tsx` 抽出 `analyticsApi.ts` 和 `types.ts`，统计页核心数据、AI 建议降级、rating 历史、趋势补零、重算和浏览器 view 显隐 IPC 由 analytics helper 封装。P8-032 已完成用户脚本管理数据 helper 收敛：`UserScriptManager.tsx` 抽出 `scriptsApi.ts`，脚本列表、站点列表、导入、保存、启停、删除和打开目录调用由 scripts helper 封装。P8-033 已完成设置页数据 helper 与类型收敛：`SettingsPage.tsx`、`DefaultHomePanel.tsx`、`CodeforcesSyncPanel.tsx`、`SiteManagementPanel.tsx` 改用 `settingsApi.ts`，学习概览、实时诊断和 CF 账号类型收敛到 `settingsTypes.ts`。P8-034 已完成 Problems 数据 helper 与类型收敛：题目侧栏、详情、笔记弹层、Milkdown 图片上传和标题防抖保存改用 `problemsApi.ts`，题目详情和提交展示类型收敛到 `problemTypes.ts`。P8-035 已完成首页数据 helper 与类型收敛：`HomePage.tsx` 改用 `homeApi.ts`，首页概览、最近访问、复习建议和题目更新订阅类型收敛到 `homeTypes.ts`。P8-036 已完成 Renderer 业务 feature IPC helper 收口：`src/features` 下业务组件的 preload 调用均集中到本域 `*Api.ts`。P8-037 已完成共享组件窗口/标签 helper 收敛：`TabBar.tsx`、`WindowControls.tsx` 改用 `tabApi.ts` 和 `windowApi.ts`。P8-038 已完成应用壳 hooks 浏览器 helper 收敛：`useAppModalState.ts`、`useBrowserNavigation.ts`、`useBrowserViewVisibility.ts` 改用 `browserShellApi.ts`。P8-039 已完成 Renderer preload 类型细化：`electron-env.d.ts` 与 `preload.ts` 补齐主要 IPC 类型，移除本轮可处理的显式 `any` 和 helper 断言；DOC-012 已完成文档总索引补强：`docs/README.md` 现覆盖根目录契约、设计、模块 README、调研、ADR、辅助与历史材料，根 `README.md` 已改为指向文档总索引。
- 高风险：Nowcoder 和 VJudge 已改为网络结果驱动或强身份关联，避免自测/公开状态行误入库；不要重新引入通用 DOM verdict observer 作为这两站的实时入库来源。

当前已验证命令：`node node_modules\typescript\bin\tsc --noEmit`、`node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs`、`node tmp\browser-ojBridge.test.mjs`。完整 adapter/submission 测试仍应在提交前再跑一遍。

P6-003 撤销：原 `submission_code_snippets` 表（migration 012）已由 migration 013 物理删除。已移除 `codeSnippetRepository.ts`、IPC（snippets:*）、ProblemDetail 代码片段 UI、preload/electron-env.d.ts 接口、App.css 中 `.snippet-*` 样式。AI 上下文导出层（P6-004）直接读取原始 submissions 表，不受影响。

P6-004 完成：建立 `electron/ai/contextExporter.ts`，聚合概览（题量/提交/连续天数/平台）、趋势、错题、待复习、标签维度统计、最近活动，schema_version=1。严格剥离 Cookie、绝对文件路径、日志内容、用户私有代码正文。提供 JSON 与 Markdown 双格式导出（`renderContextAsMarkdown`）。IPC：ai:exportContext、ai:exportContextMarkdown。

P6-004 扩展（每日快照，migration 014）：新增 `ai_context_snapshots` 表，应用启动时（app.whenReady）调用 `ensureTodaySnapshot()` 自动生成当日快照存库（若不存在）。日期键使用 `todayBeijing()`（本地日期），与 daily_stats 保持一致。快照供阶段总结、复习计划等 AI 模块按需消费，避免每次重新聚合统计。失败不阻塞启动（try-catch 包裹）。repository：`aiContextSnapshotRepository.ts`，提供 ensureTodaySnapshot/getSnapshotByDate/listSnapshots。

P6-005 完成：`electron/ai/recommendations/reviewRecommender.ts` 本地规则引擎，纯只读查询不写库。评分维度：错误次数×8（上限40）+ 遗忘风险 0.5/天（上限25）+ 访问重视 5/次（上限15）。仅推荐从未 AC 的题。结果携带 `source` 字段（wrong_count/last_attempt/days_since_attempt/visit_count）可追溯。Dashboard 概览卡片下方渲染复习建议卡片。IPC：ai:getReviewRecommendations。

P6-006 完成：`electron/ai/recommendations/weaknessAnalyzer.ts` 本地规则引擎。评分维度：(100-AC率)×0.5 + 错误提交×0.5（上限25）+ 停留时长×0.01（上限25）。仅统计题量≥2 的标签保证统计意义；无标签数据时降级提示。结果携带 `evidence` 字段（本地统计依据）。Dashboard 渲染薄弱标签卡片（含进度条）。IPC：ai:getWeaknessAnalysis。

P6-010 完成：PROJECT_RULES.md 新增 3.6「AI 数据写入边界」条款（只读区/核心禁写/输出区/敏感隔离/本地优先/可追溯）；ARCHITECTURE.md 第 13 节扩展为模块结构 + 可以/不可以 + 可追溯性三小节，列出具体模块路径与禁止表；模块边界新增 `ai` 模块声明。

Phase 5 站点管理与多标签页重构已完成。

P5-004 修复：之前禁用站点只更新了数据库 enabled 字段，但 URL 识别流程未检查该字段。已在 TrackingService.handleNavigation() 中增加 getSiteById 检查，禁用站点的题目不再触发识别和写入。

P5-005 完成：支持导入导出站点配置。导出为 JSON 文件（不含 Cookie），导入前有格式校验和冲突预览（内置站点自动跳过，用户站点冲突可勾选覆盖）。涉及新增 IPC：sites:exportConfig、sites:importConfig、sites:confirmImport。

P5-006 完成：新增 PTA 默认站点配置。在 seedBuiltinSites 和 siteRegistry.ts 中添加 PTA（pintia.cn），创建 builtins/pta.ts，更新 SITE_ADAPTER_GUIDE.md。

P5-007 完成：实现 PTA URL 识别。创建 parsers/sites/pta.ts，支持练习题目页、考试题目页、带类型参数的考试题目页三种 URL 模式。注册到 registry.ts。添加 PTA 标题抓取逻辑到 extractProblemTitleScript.ts（多策略降级 + 7s 额外延迟适配 Angular SPA）。实现 PTA 提交记录 DOM 抓取到 domScraper.ts。修复前端 5 个文件缺少 PTA 平台映射的 bug。

P5-008 完成：提供 adapter 扩展接口。定义 `SiteAdapter` 接口，解耦了 `parsers/registry.ts` 与数据库；支持在 `main.ts` 中根据当前 URL 自定义页面标题抓取脚本。

P5-009 完成：建立站点规则测试样例。在 `tests/parsers/siteRules.test.ts` 中编写了 8 个单元测试，包含内置站点解析、自定义适配器注册和动态配置解析器匹配，测试不启动 Electron 且全部通过。

P5-010 完成：新增普通 OJ 站点端到端验收。允许用户手动填入站点 ID、名称、首页 URL、匹配域名及题目识别规则。

P5-011 完成：升级 Electron 到最新稳定浏览器基线（42.2.0，Chromium 148）。已完成 package.json 依赖更新，修复了 `better-sqlite3` 因 V8 原生接口更新导致的 C++ 编译失败；同时在 `main.ts` 中禁用了 PostQuantumKyber 以修复握手失败的 SSL 问题，清理了过时的导航 API 并在全局彻底清除了 `BrowserView` 相关的过时命名。

P5-012 完成：实现内置 Tampermonkey/UserScript 脚本引擎。添加了 `user_scripts` 表、主进程服务 `UserScriptService` 及注入机制，支持自动解析 `@match` / `@include` 并于 `did-finish-load` 时注入脚本代码（包含基础 `GM_addStyle` 支持）。在前端 React 端添加了油猴图标入口与管理面板 `UserScriptManager`。

P5-013 完成：多标签页重构与 Chrome 级 UI。引入 `TabManager`、`DetachedWindow` 以及 React `TabBar` 组件，支持多个独立 WebContentsView 标签页，并可双击剥离为原生独立窗口。同时修复了由于路由重定向（如 Codeforces 教练题跳转 `/attachments`）导致持久化到数据库的 `canonical_url` 被错误污染的底层 Bug。

P6-001 完成：建立本地题解 Markdown 系统。新增 `notes` 表（migration 010），实现 `electron/notes/NoteService.ts` 整合 DB repository 与 Markdown 文件存储。笔记文件存储在 `{userData}/notes/{problemId}/{noteId}.md`，支持三种类型：题解（solution）、复习笔记（review）、总结（summary）。新增 IPC：notes:listByProblem、notes:get、notes:create、notes:updateTitle/Content/Type、notes:delete、notes:getForDelete、notes:deleteByProblem、notes:openDir。删除题目时若有关联笔记会询问是否一并删除笔记文件（默认保留）。

P6-002 完成：笔记入口重构 + 所见即所得编辑器。笔记入口从题目详情页内嵌改为**独立浮层**——题目列表每行「⋯」详情按钮左侧新增「✎」笔记按钮，点击打开独立弹窗 `NotePanelModal`（经 `ModalLayer` 渲染）。编辑器弃用 textarea，改用 **@milkdown/crepe** 所见即所得 Markdown 编辑器（封装于 `MilkdownEditor.tsx`），输入 `## ` 自动渲染为二级标题，内置工具栏/代码块/表格/链接。notes 表新增 `content`/`word_count` 缓存字段（migration 011），实现**文件+DB 双存**：文件存 `.md` 供外部编辑器使用，DB 缓存正文用于快速预览和字数统计。编辑器 onChange 400ms 防抖自动保存。已删除旧 `NotePanel.tsx`（详情页内嵌版本）。tsc 与 vite build 均通过，milkdown（含 vue/codemirror 依赖）成功打包进 renderer bundle。

## 2. 当前代码状态

已知现状：

- 项目目录：`algo-electron/`
- Electron + React + TypeScript + Vite 已初始化。
- TailwindCSS 已初始化（tailwindcss@3 + postcss + autoprefixer）。
- 默认模板 UI 已清理，index.html 标题已更新。
- 已迁移到 `WebContentsView`，旧 `BrowserView` 已移除。
- `BrowserHost` 模块已创建（`electron/browser/BrowserHost.ts`），统一管理浏览器视图。
- Preload 已收紧，只暴露白名单 API（`electronAPI`），不再暴露通用 `ipcRenderer`。
- 远程 OJ 页面使用安全默认值：nodeIntegration: false, contextIsolation: true, sandbox: true。
- WebContentsView 使用持久 session（`persist:oj-main`），重启后登录状态保留。
- 站点注册表已建立（`electron/sites/siteRegistry.ts`），内置 Codeforces、AcWing、牛客、VJudge。
- SQLite 已初始化（`electron/db/connection.ts`），使用 better-sqlite3，WAL 模式。
- 数据库已建表：schema_migrations、problems、problem_visits、activity_events、study_sessions。
- 统一 ProblemIdentity 类型已定义（`electron/shared/types.ts`）。
- 四平台 URL 识别已实现（`electron/parsers/sites/`），导航到题目页自动写入 problems 表。
- problem:detected 事件已实现，URL 变化时自动触发识别和写入。
- CookieVault 基础模块已建立（`electron/cookies/CookieVault.ts`），使用 persist:oj-main session。
- 新窗口请求已处理：target="_blank" 和 window.open 在当前视图中打开（BrowserHost.ts）。
- 默认首页可配置（`electron/app/config.ts`），首次默认 Codeforces，用户可通过 config.json 修改。
- Problem repository 已抽离（`electron/db/repositories/problemRepository.ts`）。
- 首次访问记录 first_seen_at，后续访问更新 last_visited_at。
- 单题停留时间已结算：进入题目页开始计时，离开或切换题目时结束写入 problem_visits。
- 题库侧边栏已实现（`src/features/problems/ProblemSidebar.tsx`），显示最近访问题目，点击可跳转。
- 侧边栏可收起/展开，支持分页（每页 30 条）。
- visit 追踪逻辑已抽到 `electron/tracking/TrackingService.ts`，main.ts 不再堆业务逻辑。
- 活跃事件已记录：每次进入题目页写入 activity_events。
- 基础统计已实现：总题数、今日访问、平台分布、最近活跃时间。
- 基础设置页已实现：查看统计、设置默认首页。
- 数据库时间改为本地系统时间（北京时间）。
- Phase 1-5 全部完成。四个平台登录验证通过、自定义站点与多标签页系统上线。
- 页面标题抓取已实现（page-title-updated 事件）。
- 四平台提交同步已实现：Codeforces（API）、AcWing/牛客（DOM 抓取）、VJudge（DOM 抓取）。
- 同步自动关联题目、识别首次 AC、更新题目状态。
- 侧边栏支持按平台/状态筛选，显示提交次数。
- 题目详情页已实现：点击题目查看提交历史。
- 题目状态从 submissions 表实时计算。
- 站点禁用功能已真正生效：TrackingService.handleNavigation() 在识别题目后检查 site_configs.enabled，禁用站点不再触发 URL 识别和写入。
- 站点配置导入导出已实现：导出 JSON（不含 Cookie），导入有格式校验和冲突预览（内置站点自动跳过，用户站点冲突可勾选覆盖）。
- PTA 已添加为内置站点：seedBuiltinSites 和 siteRegistry.ts 中包含 PTA（pintia.cn）。
- PTA URL 识别已实现：parsers/sites/pta.ts 支持练习题目页、考试题目页、带类型参数的考试题目页。
- PTA 标题抓取已实现：extractProblemTitleScript.ts 中添加 PTA 适配逻辑，优先使用 document.title，过滤"输入格式"等小节标题，Angular SPA 额外 7s 延迟。
- PTA 提交同步已实现：domScraper.ts 中添加 scrapePta 函数，支持评测结果、编译器、耗时、内存、分数列。提交记录页从每行题目链接提取 platformProblemId，自动关联/创建题目。
- 洛谷已添加为内置站点：前端 5 个文件已补充 `luogu` 平台映射，`siteRegistry.ts` 中已包含洛谷（luogu.com.cn）。
- 洛谷 URL 识别与标题抓取已实现：`parsers/sites/luogu.ts` 支持题目页 URL 匹配，并使用正则剥离了题目标题的前缀与标签。
- 洛谷提交同步已实现：`domScraper.ts` 中添加了针对 Vue SPA 机制的抓取逻辑，通过追加 `?_contentOnly=1` 参数成功获取提交列表最新数据。
- 现行提交监测主线已迁到 `electron/adapters/sites/` 和 `electron/submissions/`：实时 hook 通过 `SubmissionWatcherCore` 入库，核心拒绝 `TESTING`/`UNKNOWN`，站点 adapter 必须处理正式提交 intent、自测拦截、最终状态解析和题目身份关联。详细规则见 `docs/submission-monitoring-design.md`。

## 3. 当前文档状态

文档总入口是 `docs/README.md`。新 Agent 或开发者接手时先读它，再按任务类型进入对应契约、设计、模块 README、测试说明或 ADR。

已建立或更新的长期文档：

- 根目录契约与协作：`PROJECT_RULES.md`、`ROADMAP.md`、`TASKS.md`、`AI_HANDOFF.md`、`ARCHITECTURE.md`、`DATABASE_SCHEMA.md`、`AI_WORKFLOW.md`、`COMMIT_RULES.md`、`SITE_ADAPTER_GUIDE.md`、`PROMPT.md`。
- 设计与审计：`docs/submission-monitoring-design.md`、`docs/renderer-structure-audit.md`、`docs/leetcode-realtime-verification.md`。
- 调研：`docs/site-adapter-refactor-research.md`、`docs/oj-platforms-submission-display-research.md`。
- ADR：`docs/adr/0001-use-webcontentsview.md`、`docs/adr/0002-cookie-vault.md`、`docs/adr/0003-event-log-and-analytics.md`。
- 主进程模块 README：`algo-electron/electron/adapters`、`ai`、`app`、`browser`、`cookies`、`db`、`notes`、`parsers`、`rating`、`scripts`、`shared`、`sites`、`submissions`、`tracking`。
- Renderer、测试与构建 README：`algo-electron/README.md`、`algo-electron/src/README.md`、`src/components/README.md`、`src/features/README.md`、`src/shared/README.md`、`algo-electron/tests/README.md`。

辅助与历史材料已纳入 `docs/README.md` 第 8 节：`spec.md`、`checklist.md`、`release_notes.md`、`debug-cloudflare-turnstile-loop.md`。这些材料只提供背景，不覆盖 `PROJECT_RULES.md`、`TASKS.md`、`AI_HANDOFF.md`、设计文档或 ADR。

## 4. 下一步推荐任务

Phase 6 进行中。P6-001、P6-002 已完成。

1. `P6-003`：提交记录关联代码片段或文件路径。
2. `P6-004`：建立 AI 上下文导出层。

## 5. 高风险区域

- `electron/main.ts` 已精简，`BrowserHost` 已独立，但后续仍需完善多标签页预留。
- Preload 已收紧为白名单 API，后续新增 API 必须保持白名单模式。
- Cookie 是敏感本地数据，不能写入普通日志。
- 数据库 schema 一旦开始实现，必须同步更新 `DATABASE_SCHEMA.md`。
- 多 Agent 不应同时修改浏览器核心、数据库迁移和 IPC 边界。

## 6. Agent 开发前检查清单

每次开始前：

- 已阅读 `PROJECT_RULES.md`。
- 已阅读 `ROADMAP.md`。
- 已阅读 `TASKS.md`。
- 已阅读 `ARCHITECTURE.md`。
- 已阅读 `DATABASE_SCHEMA.md`。
- 已阅读 `AI_WORKFLOW.md`。
- 如本次是审查任务，已阅读 `PROMPT.md`。
- 已确认本次任务编号。
- 已确认是否涉及数据库、IPC、Cookie、站点适配。

每次完成后：

- 更新 `TASKS.md`。
- 更新 `AI_HANDOFF.md`。
- 如果涉及架构，更新 `ARCHITECTURE.md`。
- 如果涉及数据库，更新 `DATABASE_SCHEMA.md`。
- 如果涉及站点，更新 `SITE_ADAPTER_GUIDE.md`。
- 给出中文提交信息建议。

## 7. 中文提交示例

```bash
feat: 迁移到 WebContentsView
feat: 添加 CookieVault 基础接口
docs: 完善全周期任务规划
fix: 修复 VJudge URL 识别
test: 添加 Codeforces URL 解析测试
```
