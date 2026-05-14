# Algo Learning Platform

本地优先的个人算法学习平台。

目标是长期记录、分析和沉淀算法学习行为：打开软件、进入 OJ、刷题、自动识别题目、记录本地数据库、分析学习行为，并逐步支持提交记录、Rating、AI 复习建议、同步和多端预留。

## 当前状态

Phase 0 文档与架构基线已完成。Phase 1 的浏览器基础已有初步实现，下一步进入登录状态、Cookie、站点识别和本地数据库能力。

默认下一步：

1. `P1-009` 建立 `persist:oj-main` 持久 session。
2. `P1-010` 到 `P1-013` 验证四个平台登录状态。
3. `P1-014` 建立 CookieVault。
4. `P1-017` 建立站点注册表。

## 必读文档

开发前按顺序阅读：

- `PROJECT_RULES.md`
- `ROADMAP.md`
- `TASKS.md`
- `AI_HANDOFF.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `AI_WORKFLOW.md`
- `COMMIT_RULES.md`
- 涉及站点适配时阅读 `SITE_ADAPTER_GUIDE.md`
- 做架构审查或代码审查时阅读 `PROMPT.md`

## 文档职责地图

- `README.md`：项目入口，告诉新 Agent 项目是什么、当前在哪个阶段、从哪里开始读。
- `PROJECT_RULES.md`：项目最高规则，固定技术栈、架构禁令、Cookie 原则和 AI 开发硬约束。
- `ROADMAP.md`：长期路线图，说明 Phase 0 到 Phase 8 每个阶段要达到什么结果。
- `TASKS.md`：主任务清单，所有开发都按任务编号推进，并记录状态、前置任务和验收标准。
- `AI_HANDOFF.md`：当前交接现场，记录现有代码状态、高风险区域和下一步推荐任务。
- `ARCHITECTURE.md`：系统实现指导。只负责模块边界、进程职责、IPC、BrowserHost、CookieVault、Tracking、Analytics 等系统结构；不定义具体表字段。
- `DATABASE_SCHEMA.md`：数据库实现契约。只负责 SQLite 表、字段、索引、迁移规则和数据约束；只有涉及数据库的任务才需要按它修改。
- `AI_WORKFLOW.md`：AI 协作流程，规定 Agent 开工声明、修改范围、完成后更新哪些文档。
- `COMMIT_RULES.md`：中文提交规范，规定提交格式、类型和提交粒度。
- `SITE_ADAPTER_GUIDE.md`：站点适配指南，说明如何新增 Codeforces/AcWing/牛客/VJudge/PTA 等站点规则。
- `PROMPT.md`：审查专用提示词，供 AI 做架构审查、代码审查、任务边界检查时使用。
- `docs/`：补充设计文档目录，目前主要是 ADR。ADR 解释关键决策的原因，不是任务清单。

## 核心规则

- 使用 Electron + React + TypeScript + TailwindCSS + SQLite + Zustand + Vite。
- 浏览器视图唯一方案是 `WebContentsView`。
- 禁止继续扩展 `BrowserView`。
- Cookie 是本地一等能力，由 CookieVault 管理。
- Renderer 不直接访问 SQLite、Cookie、文件系统。
- 提交信息使用中文。
