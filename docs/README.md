# 文档索引

`docs/README.md` 是项目文档总入口。它只负责导航和阅读顺序，不取代任务状态、交接现场或架构决策记录。

## 0. 索引边界

本索引覆盖项目内长期维护的 Markdown 文档，并按职责划分为契约、任务、交接、设计、模块说明、调研、ADR、辅助材料几类。

- 契约文档定义必须遵守的开发边界。
- 任务文档定义当前状态和验收标准。
- 交接文档记录当前工作现场和风险提示。
- 设计文档说明已落地或准备落地的实现方案。
- 模块 README 说明目录职责、封装边界和验证入口。
- 调研和辅助材料只提供背景，不能覆盖契约、任务、交接、设计或 ADR。

权威来源按优先级读取：

1. [PROJECT_RULES.md](../PROJECT_RULES.md)：最高开发规则。
2. [TASKS.md](../TASKS.md)：唯一任务状态源。
3. [AI_HANDOFF.md](../AI_HANDOFF.md)：当前交接现场和风险提示。
4. [docs/adr/](adr/)：不可逆或高影响架构决策。
5. 设计文档和模块 README：具体实现边界、测试入口和维护说明。
6. 调研记录：背景材料，不覆盖已落地设计。

## 1. 接手必读

新 Agent 或开发者接手项目前，先按这个顺序读：

| 顺序 | 文档 | 用途 |
|---|---|---|
| 1 | [PROJECT_RULES.md](../PROJECT_RULES.md) | 确认最高规则、技术栈禁令、Cookie 与隐私纪律。 |
| 2 | [AI_WORKFLOW.md](../AI_WORKFLOW.md) | 确认任务推进、验证、交接和多 Agent 协作方式。 |
| 3 | [TASKS.md](../TASKS.md) | 确认当前任务编号、状态、验收标准和建议提交。 |
| 4 | [AI_HANDOFF.md](../AI_HANDOFF.md) | 确认当前代码现场、已知风险和最近完成内容。 |
| 5 | [ARCHITECTURE.md](../ARCHITECTURE.md) | 理解 Main、Preload、Renderer、IPC、浏览器容器和数据流。 |
| 6 | [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) | 理解 SQLite schema、migration、repository 和写入约束。 |
| 7 | [SITE_ADAPTER_GUIDE.md](../SITE_ADAPTER_GUIDE.md) | 理解站点适配、提交监测和 parser 编写规范。 |

提交监测、站点 adapter、实时 hook 相关任务还必须阅读 [submission-monitoring-design.md](submission-monitoring-design.md)。

## 2. 按任务找文档

| 任务类型 | 必读文档 |
|---|---|
| 提交监测、实时 hook、提交入库 | [submission-monitoring-design.md](submission-monitoring-design.md)、[SITE_ADAPTER_GUIDE.md](../SITE_ADAPTER_GUIDE.md)、[electron/submissions/README.md](../algo-electron/electron/submissions/README.md)、[electron/adapters/README.md](../algo-electron/electron/adapters/README.md) |
| 新增或修改 OJ 站点 | [SITE_ADAPTER_GUIDE.md](../SITE_ADAPTER_GUIDE.md)、[electron/adapters/README.md](../algo-electron/electron/adapters/README.md)、[electron/sites/README.md](../algo-electron/electron/sites/README.md)、[electron/parsers/README.md](../algo-electron/electron/parsers/README.md) |
| 数据库、repository、migration | [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md)、[electron/db/README.md](../algo-electron/electron/db/README.md)、[adr/0003-event-log-and-analytics.md](adr/0003-event-log-and-analytics.md) |
| 浏览器容器、标签页、远程页面 preload | [ARCHITECTURE.md](../ARCHITECTURE.md)、[electron/browser/README.md](../algo-electron/electron/browser/README.md)、[adr/0001-use-webcontentsview.md](adr/0001-use-webcontentsview.md) |
| Cookie、登录态、CookieVault | [PROJECT_RULES.md](../PROJECT_RULES.md)、[electron/cookies/README.md](../algo-electron/electron/cookies/README.md)、[adr/0002-cookie-vault.md](adr/0002-cookie-vault.md) |
| Renderer 页面、组件拆分、UI 状态 | [renderer-structure-audit.md](renderer-structure-audit.md)、[algo-electron/src/README.md](../algo-electron/src/README.md)、[src/features/README.md](../algo-electron/src/features/README.md)、[src/components/README.md](../algo-electron/src/components/README.md)、[src/hooks/README.md](../algo-electron/src/hooks/README.md) |
| AI 建议、复习计划、学习摘要 | [electron/ai/README.md](../algo-electron/electron/ai/README.md)、[PROJECT_RULES.md](../PROJECT_RULES.md)、[ARCHITECTURE.md](../ARCHITECTURE.md) |
| 笔记、Markdown、附件路径 | [electron/notes/README.md](../algo-electron/electron/notes/README.md)、[src/features/README.md](../algo-electron/src/features/README.md) |
| 测试、构建、打包 | [algo-electron/README.md](../algo-electron/README.md)、[tests/README.md](../algo-electron/tests/README.md) |

## 3. 根目录契约文档

| 文档 | 职责 |
|---|---|
| [README.md](../README.md) | 项目总览、功能介绍、基础安装运行说明。 |
| [PROJECT_RULES.md](../PROJECT_RULES.md) | 最高规则，普通任务不能覆盖。 |
| [ROADMAP.md](../ROADMAP.md) | 长期阶段规划。 |
| [TASKS.md](../TASKS.md) | 任务编号、状态、前置关系、验收标准和建议提交。 |
| [AI_HANDOFF.md](../AI_HANDOFF.md) | 当前交接现场、风险点和最近完成事项。 |
| [AI_WORKFLOW.md](../AI_WORKFLOW.md) | AI 协作流程、开发前后检查和交接模板。 |
| [COMMIT_RULES.md](../COMMIT_RULES.md) | 中文 Conventional Commits 规范。 |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | 系统结构、进程边界、IPC、浏览器、追踪、AI 边界。 |
| [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) | SQLite schema、migration、索引和写入规则。 |
| [SITE_ADAPTER_GUIDE.md](../SITE_ADAPTER_GUIDE.md) | 站点适配、提交抓取、parser、实时 hook 规范。 |
| [PROMPT.md](../PROMPT.md) | 架构审查提示，供审查型 Agent 使用，不覆盖项目规则和任务状态。 |
| [algo-electron/README.md](../algo-electron/README.md) | Electron 子项目目录边界、开发命令、构建配置。 |

## 4. 设计与验收文档

| 文档 | 职责 |
|---|---|
| [submission-monitoring-design.md](submission-monitoring-design.md) | 提交监测数据流、submit intent、站点差异、实时 hook 安全边界、自动测试和手测流程。 |
| [renderer-structure-audit.md](renderer-structure-audit.md) | Renderer 大文件、重复常量、IPC 边界和后续拆分顺序审计。 |
| [leetcode-realtime-verification.md](leetcode-realtime-verification.md) | LeetCode 实时提交监测验证记录。 |

## 5. 主进程模块文档

| 模块 | 文档 | 重点 |
|---|---|---|
| adapters | [electron/adapters/README.md](../algo-electron/electron/adapters/README.md) | 站点 adapter 职责、目录模型、共享 helper、测试入口。 |
| ai | [electron/ai/README.md](../algo-electron/electron/ai/README.md) | 本地 AI 上下文、复习建议、薄弱标签、阶段总结和规则边界。 |
| app | [electron/app/README.md](../algo-electron/electron/app/README.md) | 主进程轻量配置读写边界。 |
| browser | [electron/browser/README.md](../algo-electron/electron/browser/README.md) | BrowserHost、TabManager、WebContentsView、远程页面 preload。 |
| cookies | [electron/cookies/README.md](../algo-electron/electron/cookies/README.md) | CookieVault、持久 session、敏感信息边界。 |
| db | [electron/db/README.md](../algo-electron/electron/db/README.md) | SQLite 连接、migration、repository、写入规则。 |
| notes | [electron/notes/README.md](../algo-electron/electron/notes/README.md) | Markdown 笔记、图片附件、DB 缓存和路径安全。 |
| parsers | [electron/parsers/README.md](../algo-electron/electron/parsers/README.md) | 题目 URL 识别、标题清洗、自定义 pattern 和旧 parser 兼容层。 |
| rating | [electron/rating/README.md](../algo-electron/electron/rating/README.md) | Codeforces rating 抓取和格式化边界。 |
| scripts | [electron/scripts/README.md](../algo-electron/electron/scripts/README.md) | 用户脚本导入、匹配、注入、IPC 和文件存储。 |
| shared | [electron/shared/README.md](../algo-electron/electron/shared/README.md) | 主进程跨模块基础类型和时间工具。 |
| sites | [electron/sites/README.md](../algo-electron/electron/sites/README.md) | SiteConfig、内置站点清单、SiteRegistry。 |
| submissions | [electron/submissions/README.md](../algo-electron/electron/submissions/README.md) | 提交采集写入链路、实时监听、手动同步、scraper。 |
| tracking | [electron/tracking/README.md](../algo-electron/electron/tracking/README.md) | 题目访问追踪、停留时长、activity events、daily stats。 |

## 6. Renderer、测试与构建文档

| 区域 | 文档 | 重点 |
|---|---|---|
| renderer 总览 | [src/README.md](../algo-electron/src/README.md) | React renderer 职责、App 数据流、IPC 边界和验证入口。 |
| 共享组件 | [src/components/README.md](../algo-electron/src/components/README.md) | TabBar、WindowControls、ModalLayer、ErrorBoundary 等共享 UI。 |
| 业务功能 | [src/features/README.md](../algo-electron/src/features/README.md) | home、analytics、problems、scripts、settings 的职责和 API 调用边界。 |
| 应用 hooks | [src/hooks/README.md](../algo-electron/src/hooks/README.md) | 应用壳和跨 feature 的轻量 React hook。 |
| renderer shared | [src/shared/README.md](../algo-electron/src/shared/README.md) | 跨 feature 展示常量和轻量 helper。 |
| 测试 | [tests/README.md](../algo-electron/tests/README.md) | adapter、browser、db、integration、parsers、submissions 测试覆盖范围和运行方式。 |

## 7. 调研记录

| 文档 | 用途 |
|---|---|
| [site-adapter-refactor-research.md](site-adapter-refactor-research.md) | 站点 adapter 架构整理调研。 |
| [oj-platforms-submission-display-research.md](oj-platforms-submission-display-research.md) | 各 OJ 提交结果展示与接口行为调研。 |

调研记录只能作为背景和证据，不能覆盖 [PROJECT_RULES.md](../PROJECT_RULES.md)、[TASKS.md](../TASKS.md)、ADR 或已落地设计文档。

## 8. 辅助与历史材料

| 文档 | 用途 | 读取边界 |
|---|---|---|
| [spec.md](../spec.md) | AI Coach 早期方案草稿和需求背景。 | 已落地状态以 [TASKS.md](../TASKS.md)、[AI_HANDOFF.md](../AI_HANDOFF.md) 和当前实现为准。 |
| [checklist.md](../checklist.md) | AI Coach 早期验收清单草稿。 | 不作为当前任务完成标准；当前验收以 [TASKS.md](../TASKS.md) 为准。 |
| [release_notes.md](../release_notes.md) | 历史版本说明草稿。 | 正式 changelog 任务仍见 `P8-007`；不要在这里维护任务状态。 |
| [debug-cloudflare-turnstile-loop.md](../debug-cloudflare-turnstile-loop.md) | Cloudflare Turnstile 调试记录。 | 只作为故障排查背景，不代表当前浏览器架构契约。 |

辅助与历史材料可以帮助理解背景，但不得用于推翻当前契约、设计或任务状态。涉及 AI Coach 的旧草稿尤其要先和当前代码、migration、`TASKS.md` 对齐。

## 9. ADR

| ADR | 决策 |
|---|---|
| [0001-use-webcontentsview.md](adr/0001-use-webcontentsview.md) | 统一使用 `WebContentsView`，禁止继续扩展 `BrowserView`。 |
| [0002-cookie-vault.md](adr/0002-cookie-vault.md) | CookieVault 作为本地一等能力及 Cookie 安全边界。 |
| [0003-event-log-and-analytics.md](adr/0003-event-log-and-analytics.md) | 学习行为采用“原始事件日志 + 聚合统计表”的设计。 |

修改浏览器容器、Cookie、学习事件或统计口径前，必须先读对应 ADR。

## 10. 文档维护规则

- 新增长期文档后，把它加入本索引，并说明它属于契约、设计、模块、调研还是 ADR。
- 新增一级模块 README 后，把它加入第 5 或第 6 节。
- 新增草稿、调试记录或历史材料后，把它加入第 8 节，并写清楚不能覆盖哪些权威文档。
- 任务状态只改 [TASKS.md](../TASKS.md)，不要在设计文档里维护第二份任务状态。
- 当前工作现场只改 [AI_HANDOFF.md](../AI_HANDOFF.md)，不要在索引里写临时进度。
- 数据库 schema 变化必须同步 [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md)。
- IPC/Preload API 变化必须同步 `electron/preload.ts`、`electron/electron-env.d.ts` 和相关模块 README。
- 提交监测、站点 adapter、实时 hook 变化必须同步 [submission-monitoring-design.md](submission-monitoring-design.md) 和 [SITE_ADAPTER_GUIDE.md](../SITE_ADAPTER_GUIDE.md)。
- 文档和示例不得记录 Cookie、用户源码、完整请求体或可复用的登录态信息。
