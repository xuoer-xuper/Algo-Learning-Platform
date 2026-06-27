# AI 开发交接（AI_HANDOFF）

## 1. 当前阶段

Phase 6 进行中。P6-001 本地题解 Markdown 系统、P6-002 笔记独立浮层已完成。

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

## 3. 当前文档状态

已建立或更新的长期文档：

- `PROJECT_RULES.md`
- `ROADMAP.md`
- `TASKS.md`
- `AI_HANDOFF.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `AI_WORKFLOW.md`
- `COMMIT_RULES.md`
- `SITE_ADAPTER_GUIDE.md`
- `PROMPT.md`
- `docs/adr/0001-use-webcontentsview.md`
- `docs/adr/0002-cookie-vault.md`
- `docs/adr/0003-event-log-and-analytics.md`

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
