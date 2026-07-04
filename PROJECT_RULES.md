# 项目规则（PROJECT_RULES）

## 1. 项目定位

项目名称：Algo Learning Platform

项目定位：本地优先的个人算法学习平台。

核心目标不是做一个简单题库，而是长期记录、分析和沉淀用户的算法学习行为。项目未来会由 Cursor、Claude、GPT、Codex 等多个 AI Agent 协作开发，因此所有代码和文档必须以长期维护、边界清晰、可交接为第一原则。

## 2. 固定技术栈

除非用户明确要求并更新架构文档，否则不得更换以下技术栈：

- 桌面端：Electron
- 浏览器内核承载：`WebContentsView`
- 前端：React + TypeScript
- 样式：TailwindCSS
- 数据库：SQLite
- SQLite 访问库：`better-sqlite3`
- Renderer 状态：React 本地 state、按 feature 拆分的 hooks/API helper
- 构建工具：Vite

## 3. 不可变架构原则

### 3.1 本地优先

- 核心数据默认保存在本机。
- 数据库、Cookie、学习事件、题目记录、提交记录、Rating 历史都以本地数据为准。
- 未来可以支持同步，但同步必须建立在本地数据模型之上。
- Cookie 默认不参与同步、导出和日志记录。

### 3.2 WebContentsView 是唯一浏览器方案

- 项目初期即使用 `WebContentsView` 奠定长期基础。
- 禁止继续在 `BrowserView` 上新增功能。
- 当前运行时代码不得重新引入 `BrowserView` 依赖；历史文档或 ADR 中出现 `BrowserView` 只能作为背景。
- 所有浏览器视图生命周期必须由 `BrowserHost` 或同等职责模块统一管理。

### 3.3 Cookie 是正式能力

- Cookie 不视为临时 hack，而是项目的一等本地能力。
- Electron 持久 session 负责正常登录状态。
- `CookieVault` 负责按站点提取、保存、查询 Cookie。
- Cookie 可用于 VJudge 提交、提交记录同步、平台数据同步。
- Cookie 值不得写入普通日志，不得在 UI 中默认明文展示。
- Renderer 只能查看 Cookie 安全摘要或授权状态，不得获取 Cookie value。
- Cookie 默认只留在本地，不进入 `sync_queue`、普通 JSON 导出或未来多端同步。

### 3.4 Renderer 不直接接触本地能力

- Renderer 只负责 UI、交互状态和展示。
- Renderer 禁止直接访问 SQLite、文件系统、Cookie、Electron session。
- 所有本地能力必须通过 Preload 暴露的白名单 API 调用。
- 禁止在 Preload 中暴露通用 `ipcRenderer`。

### 3.5 数据库必须可迁移

- 所有数据库结构变化必须有 migration。
- 所有 schema 变化必须同步更新 `DATABASE_SCHEMA.md`。
- 禁止直接在业务代码里散落 `CREATE TABLE`。
- 禁止修改数据库结构而不说明兼容影响。

### 3.6 AI 数据写入边界（P6-010）

AI 辅助学习功能（Phase 6）严格区分「只读分析」与「核心数据写入」：

- **AI 只读区**：`ai/contextExporter.ts`、`ai/recommendations/*` 仅查询本地数据生成建议，绝不写库。
- **核心数据禁写**：AI 建议不得直接修改 `problems.status`、`submissions`、`notes`、`problem_visits` 等核心表。
- **AI 输出区**：AI 产物（复习计划、阶段总结等）必须写入独立表 `ai_outputs`（P6-009 建表），与核心数据物理隔离，用户可一键清除。
- **敏感信息隔离**：AI 上下文导出严禁包含 Cookie、绝对文件路径、日志内容、用户私有代码正文。
- **本地优先**：复习建议、薄弱分析优先使用本地规则引擎，不强制调用大模型 API（最小化 token 消耗）。
- **可追溯**：所有 AI 建议必须携带 `source` 字段，可追溯到具体题目/提交/统计依据。

## 4. 模块边界

Main Process 负责：

- `browser`：`WebContentsView`、导航、窗口布局、多标签页预留。
- `ipc`：typed IPC 注册和参数校验。
- `db`：SQLite 连接、迁移、repository。
- `parsers`：URL 识别、题目身份解析、页面元数据提取。
- `tracking`：学习行为事件、页面停留、活跃时长。
- `sites`：站点注册表、站点配置、扩展适配。
- `cookies`：CookieVault、Cookie 查询、Cookie 本地保存策略。
- `analytics`：统计聚合和只读分析。
- `ai`：AI 上下文导出、本地规则引擎建议（只读分析，产物隔离）。

Renderer 负责：

- `components` / `hooks`：导航栏、标签页 UI、当前 URL 展示和应用壳状态。
- `features/problems`：题库侧栏、题目列表、题目详情。
- `features/analytics`：学习统计 Dashboard。
- `features/settings`：站点、Cookie、默认首页等设置。
- `features/scripts`：用户脚本导入、编辑、启停和目标站点匹配。
- `shared`：跨 feature 展示常量和轻量 helper。
- feature 内部 `*Api.ts` / hooks：UI 状态、IPC 返回数据缓存和 preload 调用封装。

## 5. AI Agent 开发规则

任何 AI Agent 在修改项目前必须阅读：

1. `PROJECT_RULES.md`
2. `ROADMAP.md`
3. `TASKS.md`
4. `AI_HANDOFF.md`
5. `ARCHITECTURE.md`
6. `DATABASE_SCHEMA.md`
7. `AI_WORKFLOW.md`
8. `COMMIT_RULES.md`
9. 需要新增站点时阅读 `SITE_ADAPTER_GUIDE.md`
10. 做架构审查或代码审查时阅读 `PROMPT.md`

开始编码前必须说明：

- 本次任务编号。
- 本次只修改哪些模块。
- 是否涉及数据库 schema。
- 是否涉及 IPC 或 Preload API。
- 是否涉及 Cookie。

完成后必须更新：

- `TASKS.md`：标记任务状态，补充新增任务。
- `AI_HANDOFF.md`：写明完成内容、风险、下一步。
- 涉及架构则更新 `ARCHITECTURE.md`。
- 涉及数据库则更新 `DATABASE_SCHEMA.md`。
- 涉及站点适配则更新 `SITE_ADAPTER_GUIDE.md`。

## 6. 任务执行规则

- 每次只做一个明确任务或一个小任务组。
- 不允许一次性大规模重构。
- 不允许跨模块随意移动文件。
- 不允许为了当前小功能引入未来复杂架构。
- 不允许在没有文档说明的情况下改变数据结构。
- 不允许删除核心文档。
- 不允许修改无关代码。

## 7. Git 规则

- 提交信息使用中文。
- 每个提交只完成一个清晰任务。
- 推荐格式：`类型: 中文说明`。

示例：

```bash
feat: 迁移到 WebContentsView
feat: 添加 CookieVault 基础接口
docs: 完善数据库设计文档
fix: 修复 Codeforces URL 解析
chore: 初始化 TailwindCSS
test: 添加站点解析规则测试
```

详细规则见 `COMMIT_RULES.md`。

## 8. 禁止事项

- 禁止继续扩展 `BrowserView`。
- 禁止 Renderer 直连数据库。
- 禁止 Renderer 直接读取 Cookie。
- 禁止暴露通用 `ipcRenderer`。
- 禁止在远程 OJ 页面启用 Node 能力。
- 禁止 Cookie 明文写日志。
- 禁止未经说明修改数据库结构。
- 禁止 AI Agent 跳过文档直接写代码。
- 禁止多个 Agent 同时修改数据库 schema、浏览器核心和全局 IPC 边界。
