# AI 开发交接（AI_HANDOFF）

## 1. 当前阶段

当前处于 Phase 1 起点：桌面 MVP 基础。

Phase 0 文档与架构基线已完成。项目已经具备“AI 可接手的项目操作系统”：后续 Cursor、Claude、GPT、Codex 应按同一套规则、任务编号和验收标准开发。

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
- CookieVault、学习行为追踪尚未实现。

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

下一位 Agent 推荐从以下任务开始：

1. `P1-010` 到 `P1-013`：验证 Codeforces、AcWing、牛客、VJudge 登录状态。
2. `P1-014`：建立 CookieVault。
3. `P1-025`：建立 schema_migrations 表。
4. `P1-022`：定义统一 ProblemIdentity。
5. `P1-018` 到 `P1-021`：实现四个平台 URL 识别。

如果只做一个任务，优先做 `P1-010`（Codeforces 登录验证）。

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
