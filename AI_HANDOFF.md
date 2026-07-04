# AI 开发交接（AI_HANDOFF）

## 1. 当前阶段

当前处于项目结构巩固收尾阶段。Phase 6 已完成并进入 Phase 8 质量、文档、测试和打包准备工作；本轮重点是把主进程、renderer、adapter、repository、测试和文档按职责收口成可维护结构。

当前任务状态以 `TASKS.md` 为准：P8-013 到 P8-081 的结构化拆分、文档覆盖、收尾审计、自动验证守卫、证据矩阵、人工验收记录模板和全量自动验证基线已完成；P8-007 changelog 和 P8-008 electron-builder 打包配置作为后续新增产物的持续标准，保持进行中；P8-009 Windows 安装包发布和 P8-012 v1.0 总验收仍未开始，不应随结构巩固自动标完成。

2026-07-04 补充：P1-015/P1-016 已完成。新增 `019_cookie_records` migration 和 `cookieRecordRepository`，只保存 Cookie 元数据，`value_encrypted` 当前保持为空且 `sync_excluded=1`；`CookieVault` 支持 main 内部按站点读取完整 Cookie，同时新增安全摘要方法。Preload 只暴露 `getCookieSummaryForSite()`、`getCookieSummaryForDomain()`，renderer 不能读取 Cookie value。已同步 `DATABASE_SCHEMA.md`、Cookie/IPC/DB README、`docs/README.md`、IPC contract 和 DB repository 测试；验证通过 `npm run test:db`、`npm run test:core`。

2026-07-04 补充：P6-011 已完成。新增 `tests/ai/traceability.test.ts`，使用临时 SQLite 数据库验证复习建议、薄弱标签和复习计划可回查本地题目、提交、访问和标签统计依据，并确认 AI context、Markdown 和建议产物不泄漏 Cookie header、源码路径或 `raw_json`。新增 `npm run test:ai`，并纳入 `npm run test:all`；已同步 AI recommendations README、tests README、`TASKS.md` 和 changelog。验证通过 `npm run test:ai`、`npm run test:docs`、`npm run test:core`。

2026-07-03 补充：P8-001 已完成，`npm run lint` 现在可稳定运行；TypeScript `strict` 未关闭。ESLint 保留 recommended、React hooks 和 `--max-warnings 0`，但当前阶段允许历史 DB row、网络 payload、测试 mock 等动态边界使用显式 `any`，后续应按模块逐步收窄，而不是一次性打开全局硬门槛。

2026-07-03 补充：P8-002 已完成，`tests/parsers/siteRules.test.ts` 现在覆盖 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode CN 的有效/无效 URL 样例，并对关键题目标识字段做精确断言。

2026-07-03 补充：P8-003 已完成，新增 `tests/db/repositories.test.ts` 和 `initDbAtPath(dbPath)`。Repository 测试每个用例使用独立临时 SQLite 文件，覆盖迁移落库、题目 upsert 去重、提交 upsert 去重、唯一约束、首次 AC 更新和每日统计聚合。真实 DB 测试需先 esbuild bundle，再用 `$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs` 运行，因为 `better-sqlite3` 当前按 Electron ABI 编译。

2026-07-03 补充：P8-004 已完成，新增 `tests/ipc/ipcContracts.test.ts`。该测试静态验证 preload 核心 browser/problem/tracking/settings 方法到固定 IPC channel 的映射、公开 send/invoke channel 都有主进程 handler、事件订阅 channel 有主进程发送源，并确认 renderer 不能拿到通用 `ipcRenderer` 或内部提交/题目检测 channel。

2026-07-03 补充：P8-005 已完成，新增 `tests/electron/startupSmoke.test.ts`。该测试 bundle 真实 `electron/main.ts`、renderer preload 和 OJ preload，使用临时 `userData` 启动 Electron；`ALGO_ELECTRON_SMOKE=1` 下主进程验证主窗口存在、preload `electronAPI` 可用、`getDefaultHomeUrl` 基础 IPC 可用，并通过 `createTab(defaultUrl)` 让 WebContentsView 加载临时默认 URL。生产启动行为不变，smoke 专用 preload 路径和用户目录只由环境变量触发。

2026-07-03 补充：P8-006 已完成，新增 `tests/ui/rendererScreenshotHarness.tsx` 和 `tests/ui/rendererScreenshots.test.ts`。截图测试 bundle 真实 renderer 组件和 CSS，注入 mock `window.electronAPI`，用 Electron 捕获题库侧栏、统计页、设置页三张图到 `tmp/ui-screenshots/`；截图前扫描页面文本并拒绝 Cookie/Set-Cookie/sessionid/csrf/token 等敏感字段，同时断言关键容器不横向越界、统计页平台分布饼图和柱状图已实际绘制。生成目录已由 `algo-electron/.gitignore` 忽略。

2026-07-03 补充：P8-007 已有阶段性进展但未收口为完成。已新增根目录 `CHANGELOG.md`，按“未发布 / 0.6.0 / 0.5.0”记录新增、变更和修复；`docs/README.md` 已加入正式 changelog 入口，`release_notes.md` 继续作为历史版本说明草稿。后续新增产物仍需继续维护该标准。

2026-07-03 补充：P8-008 已有阶段性进展但未收口为完成。`electron-builder.json5` 已配置 Windows NSIS x64 打包、`build/icon.ico`、输入白名单和 `better-sqlite3` 原生模块 `asarUnpack`；`package.json` 新增 `build:win`、description、author，`package-lock.json` 根版本同步到 0.6.0。已运行 `npm run build:win`，产物为 `release/0.6.0/AlgoLearningPlatform-Windows-0.6.0-x64-Setup.exe`（release 目录被 gitignore 忽略）。asar 精确扫描未发现 `tests/`、`tmp/`、`release/`、本地数据库或 `.env`。后续新增构建产物仍需继续维护该标准；仍有非阻塞提示：`@electron/rebuild` devDependency 冗余、Vite 大 chunk warning。

2026-07-03 补充：提交监测七站当前已按用户手测通过收口（Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode）。本轮没有改数据库 schema、IPC/Preload API 或 Cookie 策略。实时提交监测的权威设计文档为 `docs/submission-monitoring-design.md`，后续修改提交监测、站点 adapter、实时 hook 前必须先读该文档。

提交监测 adapter 已开始按站点目录拆分，主线在 `algo-electron/electron/adapters/sites/`：

- `registry.ts` 只注册和查找 adapter，内置列表由 `adapters/sites/index.ts` 维护。
- 各站点 `index.ts` 负责组装 `SiteAdapter`；题目 URL/身份解析放 `problem.ts`；提交结果解析放 `submissions.ts`；提交表格解析放 `tables.ts`。
- 已拆分：Codeforces（problem/submissions/hook/urls）、AcWing（problem/submissions）、Nowcoder（problem/submissions/tables/hook）、VJudge（problem/submissions/hook）、PTA（problem/submissions）、洛谷（problem/submissions）、LeetCode（problem/submissions/hook）。
- 模块级说明已补：`algo-electron/electron/` 下主进程核心目录均已有 README，覆盖 `adapters`、`ai`、`app`、`browser`、`cookies`、`db`、`notes`、`parsers`、`rating`、`scripts`、`shared`、`sites`、`submissions`、`tracking`，并已加入 `docs/README.md` 索引。
- 2026-07-03 补充：模块文档覆盖已从一级目录扩展到所有当前 `algo-electron/src` 与 `algo-electron/electron` 子目录；新增 feature 子目录、adapter 子目录、各内置站点 adapter、DB migration/repository、submission scraper/syncer、AI recommendations/summary、parser sites 和内置站点配置 README，并已同步 `docs/README.md`。当前覆盖审计命令 `Get-ChildItem algo-electron\src,algo-electron\electron -Directory -Recurse | Where-Object { -not (Test-Path (Join-Path $_.FullName 'README.md')) }` 应返回空。
- 2026-07-03 补充：`electron/adapters/shared/genericSubmission.ts` 已拆成兼容导出入口，实际实现分到 `text.ts`、`tables.ts`、`frontendVerdictPayload.ts`、`frontendVerdictHook.ts`；`frontendVerdict.ts` 也保留为前端 verdict 兼容导出入口。外部 adapter import 路径暂时不变，后续如继续拆注入脚本，应重点复测 submit intent、pending 延迟和自测过滤。
- 2026-07-03 补充：已新增 `electron/ipc/` 模块文档，并把 `stats:*` IPC 注册从 `electron/main.ts` 抽到 `electron/ipc/registerStatsIpc.ts`，把 `ai:*` IPC 注册抽到 `electron/ipc/registerAiIpc.ts`，把 `notes:*` IPC 注册抽到 `electron/ipc/registerNotesIpc.ts`，把 `sites:*` IPC 注册抽到 `electron/ipc/registerSitesIpc.ts`，把 `rating:*` IPC 注册抽到 `electron/ipc/registerRatingIpc.ts`，把 `submissions:*` 手动同步 IPC 注册抽到 `electron/ipc/registerSubmissionsIpc.ts`，把 `problem:*` 和 `config:*` 分别抽到 `electron/ipc/registerProblemIpc.ts`、`electron/ipc/registerConfigIpc.ts`，并把 `browser:*`、`tab:*`、`window:*` 壳层 IPC 抽到 `electron/ipc/registerBrowserShellIpc.ts`。Channel 名称、preload 契约和 renderer helper 未变；`notes:create` 和 `problem:delete` 通过 `notifyProblemsUpdated` 回调通知题目列表刷新，`sites:*` 通过 `getParentWindow` 和 `notifyProblemsUpdated` 注入窗口/刷新依赖，`submissions:*` 通过 `getSyncService` 延迟读取同步服务，browser shell IPC 通过 `getWindow`、`getTabManager`、`getTrackingService` 注入窗口、标签页和题目追踪依赖。
- 2026-07-03 补充：启动 smoke 专用逻辑已从 `electron/main.ts` 抽到 `electron/app/startupSmoke.ts`，`main.ts` 只负责传入 `BrowserWindow`、`TabManager`、默认首页读取和清理回调。生产路径仍只在 `ALGO_ELECTRON_SMOKE=1` 时运行 smoke；未新增 IPC/Preload API。
- 2026-07-03 补充：`electron/main.ts` 继续收口，当前约 187 行。已新增 `electron/app/chromiumFlags.ts`、`electron/app/mainServices.ts`、`electron/app/recentSitePreconnect.ts`、`electron/browser/ojSession.ts`、`electron/ipc/registerMainIpc.ts`、`electron/notes/noteAssetProtocol.ts`、`electron/scripts/userScriptInjector.ts`、`electron/tracking/problemTitleTracking.ts`，分别承接 Chromium 启动开关、主进程服务初始化、最近站点预连接、OJ session/webRequest、IPC 组合注册、笔记附件协议、用户脚本注入和题目标题追踪。对应 `app`、`browser`、`ipc`、`notes`、`scripts`、`tracking` README 已同步；未新增数据库 schema、IPC/Preload API 或 Cookie 策略。
- 2026-07-03 补充：`tests/` 子目录文档已补齐，覆盖 adapters、browser、db、electron、integration、ipc、parsers、submissions、ui，并已加入 `docs/README.md` 索引。后续新增测试目录也必须同步子目录 README 和总索引。
- 2026-07-03 补充：统计页平台分布布局已修正为饼图 + 图例 + 柱图的稳定网格，移除饼图外圈 label 以避免裁剪/挤偏，并补 Dashboard 响应式降级。`tests/ui/rendererScreenshots.test.ts` 已通过，dashboard 截图确认饼图和柱图均正常显示。
- 2026-07-03 补充：`electron/browser/TabManager.ts` 已拆出基础 helper：`tabManagerTypes.ts`、`tabManagerConfig.ts`、`urlMatching.ts`，主类继续兼容导出 `TabInfo`，行为不变。
- 2026-07-03 补充：用户脚本边界已收口。`UserScriptService` 不再构造时注册 IPC，只负责启用脚本匹配和读取 metadata；`scripts:*` channel 迁到 `electron/ipc/registerScriptsIpc.ts`，由 `registerMainIpc.ts` 统一组合；userscript metadata 解析和 match 规则在 `electron/scripts/userScriptMetadata.ts`，新增 `tests/scripts/userScriptMetadata.test.ts` 和 `tests/scripts/README.md`。
- 2026-07-03 补充：统计 repository 内部职责已拆分。`electron/db/repositories/statsRepository.ts` 现在只保留兼容导出，实际实现分到 `electron/db/repositories/stats/types.ts`、`date.ts`、`trends.ts`、`insights.ts`、`recompute.ts`；新增 `stats/README.md`，并同步 DB README 与文档索引。未改变数据库 schema、IPC/Preload API、统计口径或 renderer 调用方式。
- 2026-07-03 补充：Notes 文件存储边界已拆分。`NoteService.ts` 保留 DB 查询/写入和服务编排；Markdown 文件、图片附件保存、`note-asset://` 路径解析和文件清理进入 `electron/notes/noteStorage.ts`，字数估算进入 `electron/notes/noteText.ts`。未改变数据库 schema、IPC/Preload API、`note-asset://` URL 格式或 renderer 调用方式。
- 2026-07-03 补充：AI 周期总结内部职责已拆分。`periodSummary.ts` 保持 `getPeriodSummary`、类型和 `renderSummaryAsMarkdown` 的稳定导出；类型、日期 helper、快照聚合和 Markdown 渲染分别进入 `periodSummaryTypes.ts`、`periodSummaryDates.ts`、`periodSummaryAggregation.ts`、`periodSummaryMarkdown.ts`。未改变数据库 schema、IPC/Preload API、AI 输出保存方式或总结口径。
- 2026-07-03 补充：AI recommendations 内部职责已拆分。`reviewRecommender.ts`、`weaknessAnalyzer.ts`、`reviewPlanner.ts` 保持原入口；公共类型、评分/阈值/优先级规则、标签解析和复习计划 Markdown 渲染分别进入 `types.ts`、`rules.ts`、`tagParsing.ts`、`reviewPlanMarkdown.ts`。新增 `tests/ai/recommendationRules.test.ts` 和 `tests/ai/README.md`，并同步测试索引。未改变数据库 schema、IPC/Preload API、AI 输出保存方式或建议口径。
- 2026-07-03 补充：AI 上下文导出边界已拆分。`contextExporter.ts` 保持 `AI_CONTEXT_VERSION`、`exportAIContext`、`AIContextExport` 和 `renderContextAsMarkdown` 稳定入口；脱敏上下文类型、标签统计聚合和 Markdown 渲染分别进入 `contextTypes.ts`、`contextTagStats.ts`、`contextMarkdown.ts`。未改变数据库 schema、IPC/Preload API、AI 快照 schema version、AI 输出保存方式或脱敏口径。
- 2026-07-03 补充：站点配置 repository 内部职责已拆分。`siteRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/site/types.ts`、`crud.ts`、`builtins.ts`、`importExport.ts`；新增 `site/README.md`，并补 `tests/db/repositories.test.ts` 覆盖 seed、内置保护、导入预览和覆盖导入。未改变数据库 schema、IPC/Preload API、Cookie 策略或站点配置导入导出口径。
- 2026-07-03 补充：Parser registry 内部职责已拆分。`registry.ts` 保持 `setEnabledSitesFetcher`、`registerAdapter`、`getAdapter`、`getAdapterForUrl`、`parseConfigUrl` 和 `parseUrl` 稳定入口；启用站点来源/域名匹配和用户配置 pattern URL 解析分别进入 `enabledSites.ts`、`configPattern.ts`。未改变数据库 schema、IPC/Preload API、提交监测逻辑或 URL 解析口径。
- 2026-07-03 补充：TabManager 布局与跨 frame 执行 helper 已拆分。`TabManager.ts` 保持标签生命周期、导航和事件绑定；view bounds/安全移除/关闭进入 `tabViewLayout.ts`，主 frame + 子 frame 脚本执行进入 `tabScriptExecution.ts`，并继续写入 `window.__ALGO_TOP_PAGE_URL`。`createView()` 中实时提交相关导航、iframe、DOM ready 事件绑定未迁移，避免影响源码回归。未改变数据库 schema、IPC/Preload API、提交监测逻辑、Cookie 策略或 TabManager 公开 API。
- 2026-07-03 补充：SubmissionBatchWriter 题目关联职责已拆分。`SubmissionBatchWriter.ts` 保持 `write(options)` 对外入口，只负责编排批量写入、首次 AC 和统计刷新；当前页面、rawJson、sourceUrl 和站点专用上下文字段到 `problemId` 的关联规则进入 `SubmissionProblemAttacher.ts`。未改变数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或写入口径。
- 2026-07-03 补充：题目 repository 内部职责已拆分。`problemRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/problem/types.ts`、`mutations.ts`、`queries.ts`、`overview.ts`；新增 `problem/README.md`。未改变数据库 schema、IPC/Preload API、题目状态计算口径或提交写入链路。
- 2026-07-03 补充：通用提交表格扫描器内部职责已拆分。`GenericTableScanner.ts` 保持 `hasSubmissionLikeTable`、`selectBestSubmissionTable`、`scanGenericSubmissionTable` 和类型导出兼容；通用表格类型、列识别/评分、提交 ID 提取、verdict/runtime/memory 归一化分别进入 `genericTableTypes.ts`、`genericTableColumns.ts`、`genericTableIds.ts`、`genericTableValueParsers.ts`。未改变数据库 schema、IPC/Preload API、提交监测 hook 或通用表格扫描口径。
- P8-013 已完成提交监测 adapter 标准化，P8-014 已完成主进程目录文档全覆盖，P8-015 已完成 renderer、测试、构建入口文档覆盖，P8-016 已完成 renderer 结构审计和首轮低风险拆分。新增 `docs/renderer-structure-audit.md`，并抽出 `src/shared/display.ts` / `src/shared/README.md`，集中平台名称、短标签、首页 URL、状态文案和颜色等展示常量。P8-017 已完成第一轮大型 feature 拆分：`SettingsPage.tsx` 抽出 `RealtimeSubmissionPanel.tsx`，`Dashboard.tsx` 抽出 `TrendPanel.tsx`。P8-018 已完成第二轮拆分：`Dashboard.tsx` 抽出 `AiSuggestionsPanel.tsx`。P8-019 已完成设置页站点管理拆分：`SettingsPage.tsx` 抽出 `SiteManagementPanel.tsx`。P8-020 已完成用户脚本管理器拆分：`UserScriptManager.tsx` 抽出 `UserScriptEditor.tsx`、`UserScriptList.tsx` 和 `types.ts`。P8-021 已完成笔记弹层拆分：`NotePanelModal.tsx` 抽出 `NoteList.tsx`、`NoteEditorPane.tsx` 和 `notesTypes.ts`。P8-022 已完成 Dashboard 图表拆分：`Dashboard.tsx` 抽出 `PlatformDistributionPanel.tsx` 和 `RatingPanel.tsx`。P8-023 已完成站点管理内部拆分：`SiteManagementPanel.tsx` 抽出 `AddSiteForm.tsx`、`ImportPreviewPanel.tsx` 和 `siteManagementTypes.ts`。P8-024 已完成 Dashboard 列表面板拆分：`Dashboard.tsx` 抽出 `DashboardListsPanel.tsx`，列表时间格式化、平台名称映射和列表项类型收敛到 analytics feature 内部。P8-025 已完成设置页首页与同步面板拆分：`SettingsPage.tsx` 抽出 `DefaultHomePanel.tsx`、`LearningOverviewPanel.tsx`、`PlatformDistributionSummary.tsx` 和 `CodeforcesSyncPanel.tsx`。P8-026 已完成笔记标题保存 hook 拆分：`NotePanelModal.tsx` 抽出 `useDebouncedNoteTitleSave.ts`，标题防抖、切换前 flush、卸载 flush 和删除 pending 清理均由 hook 负责。P8-027 已完成 App 浏览器工具栏拆分：`App.tsx` 抽出 `components/BrowserToolbar.tsx`，工具栏 UI 通过 props 接收导航、同步和全局面板入口回调。P8-028 已完成 App modal 状态 hook 拆分：`App.tsx` 抽出 `hooks/useAppModalState.ts`，设置、统计、脚本、题目详情、笔记弹层状态和浏览器预览背景由 hook 管理。P8-029 已完成 App 浏览器视图显隐 hook 拆分：`App.tsx` 抽出 `hooks/useBrowserViewVisibility.ts`，首页和 modal 背景驱动的 `WebContentsView` 显隐副作用由 hook 管理。P8-030 已完成 App 浏览器导航 hook 拆分：`App.tsx` 抽出 `hooks/useBrowserNavigation.ts`，URL 监听、地址栏跳转、导航按钮、侧栏宽度同步和当前页提交抓取 IPC 由 hook 管理。P8-031 已完成 Analytics 数据 helper 与类型收敛：`Dashboard.tsx` 抽出 `analyticsApi.ts` 和 `types.ts`，统计页核心数据、AI 建议降级、rating 历史、趋势补零、重算和浏览器 view 显隐 IPC 由 analytics helper 封装。P8-032 已完成用户脚本管理数据 helper 收敛：`UserScriptManager.tsx` 抽出 `scriptsApi.ts`，脚本列表、站点列表、导入、保存、启停、删除和打开目录调用由 scripts helper 封装。P8-033 已完成设置页数据 helper 与类型收敛：`SettingsPage.tsx`、`DefaultHomePanel.tsx`、`CodeforcesSyncPanel.tsx`、`SiteManagementPanel.tsx` 改用 `settingsApi.ts`，学习概览、实时诊断和 CF 账号类型收敛到 `settingsTypes.ts`。P8-034 已完成 Problems 数据 helper 与类型收敛：题目侧栏、详情、笔记弹层、Milkdown 图片上传和标题防抖保存改用 `problemsApi.ts`，题目详情和提交展示类型收敛到 `problemTypes.ts`。P8-035 已完成首页数据 helper 与类型收敛：`HomePage.tsx` 改用 `homeApi.ts`，首页概览、最近访问、复习建议和题目更新订阅类型收敛到 `homeTypes.ts`。P8-036 已完成 Renderer 业务 feature IPC helper 收口：`src/features` 下业务组件的 preload 调用均集中到本域 `*Api.ts`。P8-037 已完成共享组件窗口/标签 helper 收敛：`TabBar.tsx`、`WindowControls.tsx` 改用 `tabApi.ts` 和 `windowApi.ts`。P8-038 已完成应用壳 hooks 浏览器 helper 收敛：`useAppModalState.ts`、`useBrowserNavigation.ts`、`useBrowserViewVisibility.ts` 改用 `browserShellApi.ts`。P8-039 已完成 Renderer preload 类型细化：`electron-env.d.ts` 与 `preload.ts` 补齐主要 IPC 类型，移除本轮可处理的显式 `any` 和 helper 断言；DOC-012 已完成文档总索引补强：`docs/README.md` 现覆盖根目录契约、设计、模块 README、调研、ADR、辅助与历史材料，根 `README.md` 已改为指向文档总索引。
- 2026-07-03 补充：账号 repository 内部职责已拆分。`accountRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/account/types.ts`、`accounts.ts`、`ratingHistory.ts`；新增 `account/README.md`，并补 repository 临时数据库测试覆盖账号 upsert、当前/peak rating 更新、rating history 去重和 peak 计算。未改变数据库 schema、IPC/Preload API、rating 同步口径或提交监测逻辑。
- 2026-07-03 补充：用户脚本 repository 内部职责已拆分。`userScriptRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/userScript/types.ts`、`rowMapper.ts`、`queries.ts`、`mutations.ts`；新增 `userScript/README.md`，并补 repository 临时数据库测试覆盖用户脚本 CRUD、启停、删除和 `enabled` 布尔归一化。未改变数据库 schema、IPC/Preload API、用户脚本导入/注入策略或提交监测逻辑。
- 2026-07-03 补充：AI 输出 repository 内部职责已拆分。`aiOutputRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/aiOutput/types.ts`、`serialization.ts`、`queries.ts`、`mutations.ts`；新增 `aiOutput/README.md`，并补 repository 临时数据库测试覆盖 AI 输出保存、元信息 JSON 序列化、按类型列表、更新和删除。未改变数据库 schema、IPC/Preload API、AI 输出保存口径、AI 规则引擎或提交监测逻辑。
- 2026-07-03 补充：AI 上下文快照 repository 内部职责已拆分。`aiContextSnapshotRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/aiContextSnapshot/types.ts`、`serialization.ts`、`queries.ts`、`mutations.ts`；新增 `aiContextSnapshot/README.md`，并补 repository 临时数据库测试覆盖当日快照幂等创建、解析后 context 和列表元数据。未改变数据库 schema、IPC/Preload API、AI context schema version、阶段总结口径或提交监测逻辑。
- 2026-07-03 补充：提交 repository 内部职责已拆分。`submissionRepository.ts` 只保留兼容导出，实际实现分到 `electron/db/repositories/submission/types.ts`、`mutations.ts`、`queries.ts`、`firstAc.ts`；新增 `submission/README.md`，并补 repository 临时数据库测试覆盖按平台查询。未改变数据库 schema、IPC/Preload API、提交监测 hook、提交去重口径或首次 AC 口径。
- 2026-07-03 补充：项目结构巩固收尾审计已完成。新增 `docs/project-hardening-audit.md`，记录 README 覆盖审计命令当前无缺口、已完成结构收口、剩余大文件分类处置、自动验证清单和用户最终手测清单。剩余大文件中，站点 hook/scraper、`electron-env.d.ts` 和 `TabManager.ts` 已明确暂不为行数继续拆，避免影响已手测通过的提交监测和契约型类型文件。`P8-007`、`P8-008` 仍保持进行中；`P8-009` 和 `P8-012` 仍是后续发布验收任务。
- 2026-07-03 补充：P8-010 已完成，新增 `docs/troubleshooting.md`，覆盖登录/Cookie、页面加载、提交监测、重复/错误提交、手动同步、数据库损坏、笔记图片、用户脚本、统计页和打包安装常见问题；文档明确不记录 Cookie、源码、完整请求体或可复用登录态。
- 2026-07-03 补充：P8-011 已完成，新增 `docs/database-migration-rollback.md`，说明 SQLite 数据文件、升级前备份、迁移失败识别、用户恢复、开发者定位、已发布版本回滚策略、新 migration 编写规则、数据修复 migration 和验证命令。后续 schema 变更必须挂靠该策略。
- 2026-07-03 补充：根文档一致性已收口。`README.md` 已同步七站支持范围并移除不存在的 Zustand 技术栈描述；`PROJECT_RULES.md` 已同步当前 renderer state/hooks/API helper 口径；`ARCHITECTURE.md` 已更新为当前 WebContentsView、多标签、adapter、repository、AI 和实时提交监测架构；`DATABASE_SCHEMA.md` 已把早期“实现前确认项”改为当前数据库实现约束；历史调研文档已移除 `file:///` 本机绝对链接并补维护边界。
- 2026-07-04 补充：P8-062 已完成，新增 `tests/run-tests.mjs` 统一自动验证入口，并在 `package.json` 中提供 `typecheck`、`test:core`、`test:ai`、`test:adapters`、`test:submissions`、`test:db`、`test:electron`、`test:ui`、`test:all`。后续验证优先用 npm scripts，不再手抄 esbuild 循环命令。
- 2026-07-04 补充：P8-063 已完成，新增 `.github/workflows/ci.yml`，在 pull request 和 main/master push 上使用 Windows runner、Node.js 22、`npm ci` 与 `npm run test:all` 做自动验证。CI 不访问真实 OJ 登录态，不替代七站手测或安装包发布验收。
- 2026-07-04 补充：P8-064 已完成，新增 `CONTRIBUTING.md`，提供贡献流程、本地验证、修改边界、隐私禁区和 PR 检查清单；根 README 与 `docs/README.md` 已加入入口。
- 2026-07-04 补充：P8-065 已完成，新增 `.github/pull_request_template.md`、普通缺陷 issue 模板和提交监测专项 issue 模板；模板要求填写验证、手测、文档同步和敏感信息确认。
- 2026-07-04 补充：P8-066 已完成，新增 `.editorconfig` 和 `.gitattributes`，统一 UTF-8、2 空格缩进、LF 默认换行、Windows 脚本 CRLF 和常见二进制资源处理。后续不要为了换行批量重写无关文件。
- 2026-07-04 补充：P8-067 已完成，新增根目录 `LICENSE`（MIT License），并在 `algo-electron/package.json` 补 `license: MIT`；`docs/README.md` 已加入许可证入口。
- 2026-07-04 补充：P8-068 已完成，新增 `SECURITY.md`，集中说明安全与隐私报告边界、敏感信息禁区、安全问题范围和验证入口；根 README、贡献指南和文档索引已同步。
- 2026-07-04 补充：P8-069 已完成，新增 `docs/release-process.md`，收敛 Windows 发布前的版本/changelog、`npm run test:all`、`npm run build:win`、产物检查、安装升级卸载验收、敏感信息禁区和发布交接字段；已同步文档索引、贡献指南、最终手测清单、项目巩固审计、子项目 README、changelog 和 `TASKS.md`。该文档只是 `P8-009` 与 `P8-012` 的执行手册，不代表安装包发布或 v1.0 总验收完成。
- 2026-07-04 补充：P8-070 已完成，新增 `.github/README.md`、`.github/workflows/README.md`、`.github/ISSUE_TEMPLATE/README.md`、`algo-electron/build/README.md` 和 `algo-electron/public/README.md`，把 GitHub 协作配置、CI workflow、issue 模板、electron-builder 图标资源和 Vite public 静态资源纳入 README 覆盖；已同步文档索引、子项目 README、贡献指南、项目巩固审计和 `TASKS.md`。本地 `.idea/`、`.agents/`、`.claude/` 不作为项目交付文档覆盖对象。
- 2026-07-04 补充：P8-071 已完成，新增 `algo-electron/electron/README.md` 作为主进程总览，说明 `main.ts`、`preload.ts`、`electron-env.d.ts`、各主进程子目录、关键封装入口、实现程度、修改边界和验证入口；`docs/README.md`、`algo-electron/README.md`、`docs/project-hardening-audit.md` 和 `TASKS.md` 已同步。README 覆盖检查现在包含 `algo-electron/electron/` 根目录。
- 2026-07-04 补充：P8-072 已完成，新增 `tests/docs/check-docs.mjs`、`tests/docs/README.md` 和 `docs/adr/README.md`；`package.json` 新增 `test:docs`，`tests/run-tests.mjs` 新增 docs suite 并纳入 `test:all`。该检查覆盖 Markdown 相对链接、源码/测试/协作/资源/ADR 目录 README，后续文档结构变更优先运行 `npm run test:docs`。
- 2026-07-04 补充：P8-073 已完成，新增 `tests/architecture/check-architecture.mjs` 和 `tests/architecture/README.md`；`package.json` 新增 `test:architecture`，`tests/run-tests.mjs` 新增 architecture suite，并纳入 `test:core` 与 `test:all`。当前检查覆盖 Electron `BrowserView` 运行时依赖、renderer 直接访问 `ipcRenderer`、preload 通用 IPC 暴露、Nowcoder/VJudge 引用通用 DOM verdict observer 以及两站网络/强关联关键 token。
- 2026-07-04 补充：P8-074 已完成，新增 `tests/packaging/check-packaging.mjs` 和 `tests/packaging/README.md`；`package.json` 新增 `test:packaging`，`tests/run-tests.mjs` 新增 packaging suite 并纳入 `test:all`。该检查覆盖 electron-builder 输入白名单、`.env`/本地数据库/tmp/tests/release 排除、NSIS x64、图标、asar、better-sqlite3 `asarUnpack`、卸载保留用户数据和 build scripts；`electron-builder.json5` 已显式排除 `.env` 与 `.env.*`。这不代表 `P8-009` 或 `P8-012` 完成。
- 2026-07-04 补充：P8-075 已完成，新增 `tests/security/check-sensitive-files.mjs` 和 `tests/security/README.md`；`package.json` 新增 `test:security`，`tests/run-tests.mjs` 新增 security suite，并纳入 `test:core` 与 `test:all`。该检查使用 `git ls-files --cached --others --exclude-standard`，覆盖 tracked 和未忽略新增文件中的 `.env`、本地数据库、日志文件和高置信 Cookie/header/token 明文模式；普通文档描述不会误报。
- 2026-07-04 补充：P8-076 已完成，新增 `docs/project-hardening-evidence.md`，把“分离、分类、标准化大项目、每块文档、实现程度、封装函数、统一测试清单”逐项映射到当前证据和剩余验收项。该文档只证明结构巩固已具备验收形态，不代表 `P8-009` Windows 安装包发布或 `P8-012` v1.0 总验收完成。`docs/README.md`、`docs/project-hardening-audit.md`、`TASKS.md` 和 `tests/README.md` 已同步。
- 2026-07-04 补充：P8-077 已完成，`tests/docs/check-docs.mjs` 现在除 Markdown 链接和 README 覆盖外，还检查已纳入守卫的长期目录 README 是否说明职责、当前实现或覆盖范围、封装入口或关键文件、边界规则和验证入口。已补齐 `src/components`、`src/features`、`src/hooks`、`src/shared`、`electron/parsers/sites`、`electron/submissions/syncers`、`.github/ISSUE_TEMPLATE` 和 `docs/adr` README 的缺口；`npm run test:docs` 已通过。
- 2026-07-04 补充：P8-078 已完成，`tests/docs/check-docs.mjs` 现在还检查 `docs/README.md` 是否索引根目录长期 Markdown、`docs/` 设计/审计/验收/发布文档、`docs/adr/` ADR 和已纳入守卫的长期目录 README。当前 `docs/README.md` 已通过该总索引覆盖检查。
- 2026-07-04 补充：P8-079 已完成，`tests/docs/check-docs.mjs` 现在扫描 Markdown 中具体 `npm run <script>` 引用，并确认脚本存在于 `algo-electron/package.json`；`npm run test:*` 这类通配说明会跳过。当前 `npm run test:docs` 已通过。
- 2026-07-04 补充：P8-080 已完成，新增 `docs/manual-acceptance-report-template.md`，用于用户最终统一手测时记录自动验证、七站提交监测、手动同步、核心页面、打包产物、问题风险和最终结论。模板明确禁止记录 Cookie、session、csrf token、用户源码、完整请求体、本机数据库内容或可复用登录态，并可辅助判断是否允许标记 `P8-009` 和 `P8-012`。
- 2026-07-04 补充：P8-081 已完成，结构巩固当前自动验证基线已跑通，`npm run test:all` 通过。覆盖 typecheck、lint、architecture/security/docs/packaging guard、IPC contract、AI 规则与可追溯性、用户脚本 metadata、browser、parser、integration、adapter、submissions、DB repository、Electron startup smoke 和 renderer screenshot。该结果仍不替代七站真实提交、登录态、验证码/风控和安装包安装升级卸载手测。
- 高风险：Nowcoder 和 VJudge 已改为网络结果驱动或强身份关联，避免自测/公开状态行误入库；不要重新引入通用 DOM verdict observer 作为这两站的实时入库来源。

当前验证入口：优先使用 `npm run typecheck`、`npm run test:core`、`npm run test:ai`、`npm run test:architecture`、`npm run test:security`、`npm run test:docs`、`npm run test:packaging`、`npm run test:adapters`、`npm run test:submissions`、`npm run test:db`、`npm run test:electron`、`npm run test:ui`；发布前可运行 `npm run test:all`。`npm run test:docs` 现在同时守卫 README 覆盖、README 最低内容质量、文档总索引覆盖和文档 npm script 引用。完整站点提交监测仍必须结合七站手测。

2026-07-04 本轮结构收口新增验证：`npm run test:all` 已通过；`git diff --check` 仅报告既有 LF/CRLF 提示。

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
- 站点注册表已建立（`electron/sites/siteRegistry.ts`），当前内置 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode。
- SQLite 已初始化（`electron/db/connection.ts`），使用 better-sqlite3，WAL 模式。
- SQLite schema 已通过 migration 持续演进，覆盖题目、访问、活动、提交、站点配置、用户脚本、笔记、AI 输出、AI 上下文快照和账号/rating 等核心数据。
- 统一 ProblemIdentity 类型已定义（`electron/shared/types.ts`）。
- 七个内置站点 URL 识别已实现（`electron/parsers/sites/` 与 `electron/adapters/sites/`），导航到题目页自动识别并写入 problems 表。
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
- Phase 1-7 已完成，Phase 8 进入质量、文档、测试和打包准备收口；真实站点登录态仍依赖本机持久 session 手测确认。
- 页面标题抓取已实现（page-title-updated 事件）。
- 七站提交同步和实时监测已实现，当前主线在 `electron/adapters/sites/` 与 `electron/submissions/`；Nowcoder、VJudge 等高风险站点实时入库不依赖通用 DOM 文本。
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
- 设计与审计：`docs/submission-monitoring-design.md`、`docs/renderer-structure-audit.md`、`docs/project-hardening-audit.md`、`docs/project-hardening-evidence.md`、`docs/final-acceptance-checklist.md`、`docs/manual-acceptance-report-template.md`、`docs/troubleshooting.md`、`docs/database-migration-rollback.md`、`docs/leetcode-realtime-verification.md`。
- 调研：`docs/site-adapter-refactor-research.md`、`docs/oj-platforms-submission-display-research.md`。
- ADR：`docs/adr/0001-use-webcontentsview.md`、`docs/adr/0002-cookie-vault.md`、`docs/adr/0003-event-log-and-analytics.md`。
- 主进程模块 README：`algo-electron/electron/adapters`、`ai`、`app`、`browser`、`cookies`、`db`、`notes`、`parsers`、`rating`、`scripts`、`shared`、`sites`、`submissions`、`tracking`。
- Renderer、测试与构建 README：`algo-electron/README.md`、`algo-electron/src/README.md`、`src/components/README.md`、`src/features/README.md`、`src/shared/README.md`、`algo-electron/tests/README.md`，以及 `tests/adapters`、`tests/browser`、`tests/db`、`tests/electron`、`tests/integration`、`tests/ipc`、`tests/parsers`、`tests/scripts`、`tests/submissions`、`tests/ui` 子目录 README。

辅助与历史材料已纳入 `docs/README.md` 第 8 节：`spec.md`、`checklist.md`、`release_notes.md`、`debug-cloudflare-turnstile-loop.md`。这些材料只提供背景，不覆盖 `PROJECT_RULES.md`、`TASKS.md`、`AI_HANDOFF.md`、设计文档或 ADR。

## 4. 下一步推荐任务

当前不建议继续为了行数机械拆分已手测稳定的提交监测 hook、站点 scraper、`electron-env.d.ts` 或 `TabManager.ts`。后续工作按发布前收口推进：

1. 先提交当前结构巩固、验证守卫和文档批次，建议提交信息：`chore: 完善工程规范、文档覆盖与自动验证体系`。
2. 用户按 `docs/final-acceptance-checklist.md` 统一手测七站提交监测、手动同步、统计页、题目页、设置页、用户脚本和打包产物，并可用 `docs/manual-acceptance-report-template.md` 记录结果。
3. 若手测发现 UI 或站点回归，按对应模块修复并补最近的自动测试；不要扩大到无关重构。
4. 发布前按 `docs/release-process.md` 处理 P8-009 和 P8-012；只有安装、启动、卸载、升级数据保留和总验收全部通过后才能标完成。

## 5. 高风险区域

- Nowcoder 和 VJudge 当前依赖网络结果驱动或强身份关联；不要重新启用通用 DOM verdict observer 作为这两站实时入库来源。
- 已手测稳定的提交监测 hook、站点 scraper 和实时入库链路不要为了拆行数继续改动；如必须改，先补更细的 adapter/submissions 测试。
- Preload 已收紧为白名单 API，后续新增 API 必须同步 `electron/preload.ts`、`electron/electron-env.d.ts` 和 IPC contract 测试。
- Cookie、用户源码、完整请求体和可复用登录态都是敏感数据，不能写入普通日志、文档或测试快照。
- 数据库 schema 变化必须同步 `DATABASE_SCHEMA.md`，并按 `docs/database-migration-rollback.md` 的备份、迁移和回滚策略处理。
- 多 Agent 不应同时修改浏览器核心、数据库迁移、IPC 边界和提交监测 hook。

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
