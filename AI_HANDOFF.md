# AI 开发交接（AI_HANDOFF）

## 1. 当前阶段

当前处于 Phase 1 起点：桌面 MVP 基础。

Phase 0 文档与架构基线已完成。项目已经具备“AI 可接手的项目操作系统”：后续 Cursor、Claude、GPT、Codex 应按同一套规则、任务编号和验收标准开发。

## 2. 当前代码状态

已知现状：

- 项目目录：`algo-electron/`
- Electron + React + TypeScript + Vite 已初始化。
- 当前 `electron/main.ts` 中存在旧的 `BrowserView` 实现。
- 当前已有基础导航、后退、前进、刷新、URL 变化通知。
- 当前 Preload 暴露了通用 `ipcRenderer`，这不符合长期安全规则。
- TailwindCSS、SQLite、CookieVault、站点注册表、学习行为追踪尚未实现。

重要决策：

- 后续不得继续在 `BrowserView` 上新增功能。
- 下一步代码任务必须迁移到 `WebContentsView`。
- 下一步安全任务必须移除通用 `ipcRenderer` 暴露，只保留白名单 API。

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
- `docs/adr/0001-use-webcontentsview.md`
- `docs/adr/0002-cookie-vault.md`
- `docs/adr/0003-event-log-and-analytics.md`

## 4. 下一步推荐任务

下一位 Agent 推荐从以下任务开始：

1. `P1-001`：初始化 TailwindCSS。
2. `P1-002`：清理默认模板 UI 和无关资源。
3. `P1-003`：迁移 `BrowserView` 到 `WebContentsView`。
4. `P1-004`：抽离 `BrowserHost`。
5. `P1-009`：实现 `persist:oj-main` 持久 session。

如果只做一个任务，优先做 `P1-003`。

## 5. 高风险区域

- `electron/main.ts` 容易继续膨胀，必须尽快拆出 `electron/browser/BrowserHost`。
- Preload 当前暴露通用 `ipcRenderer`，必须收紧。
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
