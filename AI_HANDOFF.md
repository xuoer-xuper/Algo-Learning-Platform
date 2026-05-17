# AI 开发交接（AI_HANDOFF）

## 1. 当前阶段

Phase 2 已完成。

四平台提交同步、题目详情、筛选、标题抓取、Gym 自动跳转均已实现。删除功能支持硬删除和重新导入。

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
- Phase 1 全部完成，四个平台登录验证通过。
- Phase 2 进行中。
- 页面标题抓取已实现（page-title-updated 事件）。
- 四平台提交同步已实现：Codeforces（API）、AcWing/牛客（DOM 抓取）、VJudge（DOM 抓取）。
- 同步自动关联题目、识别首次 AC、更新题目状态。
- 侧边栏支持按平台/状态筛选，显示提交次数。
- 题目详情页已实现：点击题目查看提交历史。
- 题目状态从 submissions 表实时计算。

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

Phase 2 已完成，进入 Phase 3：学习行为分析。

1. `P3-001`：建立 user_daily_stats 聚合表。
2. `P3-002`：实现每日活跃时长统计。
3. `P3-009`：计算连续活跃天数。
4. `P3-015`：统计页 Dashboard。

如果只做一个任务，优先做 `P3-001`。

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
