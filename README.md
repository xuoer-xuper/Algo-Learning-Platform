# Algo Learning Platform

本地优先的个人算法学习平台。

目标是长期记录、分析和沉淀算法学习行为：打开软件、进入 OJ、刷题、自动识别题目、记录本地数据库、分析学习行为，并逐步支持提交记录、Rating、AI 复习建议、同步和多端预留。

## 当前状态

Phase 0 文档与架构基线已完成。下一步进入 Phase 1 桌面 MVP 基础开发。

默认下一步：

1. `P1-001` 初始化 TailwindCSS。
2. `P1-002` 清理默认模板 UI。
3. `P1-003` 迁移 `BrowserView` 到 `WebContentsView`。
4. `P1-004` 抽离 `BrowserHost`。

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

## 核心规则

- 使用 Electron + React + TypeScript + TailwindCSS + SQLite + Zustand + Vite。
- 浏览器视图唯一方案是 `WebContentsView`。
- 禁止继续扩展 `BrowserView`。
- Cookie 是本地一等能力，由 CookieVault 管理。
- Renderer 不直接访问 SQLite、Cookie、文件系统。
- 提交信息使用中文。

