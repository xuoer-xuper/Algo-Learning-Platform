# 当前任务列表（TASKS）

## 0. 使用说明

本文件是 Algo Learning Platform 的主任务清单。任何 AI Agent 接手项目前，必须先阅读本文件，并按任务编号推进。

任务状态只使用：

- 未开始
- 进行中
- 已完成
- 阻塞
- 暂缓

任务优先级：

- P0：当前阶段必须优先完成，否则后续容易返工。
- P1：当前阶段核心功能。
- P2：当前阶段增强功能或下一阶段前置。
- P3：长期规划任务。

每次完成任务后必须：

- 更新本文件状态。
- 更新 `AI_HANDOFF.md`。
- 涉及架构时更新 `ARCHITECTURE.md`。
- 涉及数据库时更新 `DATABASE_SCHEMA.md`。
- 涉及站点适配时更新 `SITE_ADAPTER_GUIDE.md`。
- 给出中文 git commit 建议。

文档职责必须分清：

- `TASKS.md` 只管任务编号、状态、前置任务和验收标准。
- `ARCHITECTURE.md` 指导系统结构实现，不负责具体数据库字段。
- `DATABASE_SCHEMA.md` 指导数据库实现，只有数据库相关任务才按它改 schema。
- `docs/adr/` 解释关键决策原因，不作为任务状态来源。

## 1. 当前最高优先级

Phase 1、Phase 2、Phase 3 已完成。下一步进入 Phase 4：Rating 与竞赛。

下一步固定顺序：

1. 执行 `P4-001` 建立 platform_accounts 表。
2. 执行 `P4-002` 建立 rating_history 表。
3. 执行 `P4-004` 支持 Codeforces handle 绑定。
4. 执行 `P4-005` 同步 Codeforces 当前 Rating。

禁止继续在 `BrowserView` 上新增功能。

## 2. 文档体系任务

### DOC-001 重写 PROJECT_RULES.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：无  
涉及模块：文档  
目标：明确 WebContentsView、Cookie、本地优先、中文提交、Agent 修改边界。  
验收标准：

- 明确 `WebContentsView` 是唯一浏览器方案。
- 明确 Cookie 是本地一等能力。
- 明确 Renderer 不直接接触 SQLite、Cookie、文件系统。
- 明确 AI Agent 开发前后必须阅读和更新的文档。

建议提交：`docs: 完善项目规则`

### DOC-002 重写 ROADMAP.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001  
涉及模块：文档  
目标：按 Phase 0 到 Phase 8 规划长期路线。  
验收标准：

- 覆盖 MVP、学习行为分析、提交记录、Rating、站点扩展、AI、同步、发布。
- 每个阶段有目标、范围、退出标准。

建议提交：`docs: 完善长期路线图`

### DOC-003 重写 TASKS.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001、DOC-002  
涉及模块：文档  
目标：建立带任务编号、状态、前置条件、验收标准的全周期任务清单。  
验收标准：

- 文档任务、Phase 0 到 Phase 8 任务均有编号。
- 新 Agent 阅读后知道下一步从哪个任务开始。
- 每个任务都有建议中文提交信息。

建议提交：`docs: 建立全周期任务清单`

### DOC-004 重写 AI_HANDOFF.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001、DOC-002  
涉及模块：文档  
目标：记录当前 BrowserView 状态和下一步迁移要求。  
验收标准：

- 明确当前代码仍有 `BrowserView`。
- 明确下一步必须迁移 `WebContentsView`。
- 明确高风险区域和接手检查清单。

建议提交：`docs: 更新 AI 交接说明`

### DOC-005 新增 ARCHITECTURE.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001、DOC-002  
涉及模块：文档、架构  
目标：说明 Main、Preload、Renderer、WebContentsView、SQLite、IPC 职责。  
验收标准：

- 清楚描述进程边界。
- 清楚描述 Browser System、Parser System、Tracking System、CookieVault、Site Registry。
- 清楚描述数据流和禁止事项。

建议提交：`docs: 添加架构设计文档`

### DOC-006 新增 DATABASE_SCHEMA.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005  
涉及模块：文档、数据库  
目标：说明表结构、索引、迁移规则和预留字段。  
验收标准：

- 覆盖 Phase 1 必需表。
- 覆盖提交、Rating、统计、同步预留表。
- 明确 migration 规则。

建议提交：`docs: 添加数据库设计文档`

### DOC-007 新增 AI_WORKFLOW.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001、DOC-003  
涉及模块：文档、协作流程  
目标：说明 Cursor、Claude、GPT、Codex 多 Agent 协作流程。  
验收标准：

- 明确开发前检查。
- 明确任务声明格式。
- 明确修改后交接格式。
- 明确多 Agent 并行限制。

建议提交：`docs: 添加 AI 协作流程`

### DOC-008 新增 COMMIT_RULES.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001  
涉及模块：文档、Git  
目标：规定中文提交格式和提交粒度。  
验收标准：

- 明确提交信息使用中文。
- 明确 feat、fix、docs、chore、test、refactor、build 等类型。
- 明确禁止混合提交。

建议提交：`docs: 添加中文提交规范`

### DOC-009 新增 SITE_ADAPTER_GUIDE.md

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005  
涉及模块：文档、站点适配  
目标：说明如何添加 PTA 等新网站。  
验收标准：

- 明确站点配置字段。
- 明确 URL 规则写法。
- 明确何时需要 parser adapter。
- 明确新增站点测试要求。

建议提交：`docs: 添加站点适配指南`

### DOC-010 新增 ADR 目录和关键决策

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005、DOC-006  
涉及模块：文档、架构决策  
目标：记录 WebContentsView、CookieVault、事件日志等关键决策。  
验收标准：

- 存在 `docs/adr/0001-use-webcontentsview.md`。
- 存在 `docs/adr/0002-cookie-vault.md`。
- 存在 `docs/adr/0003-event-log-and-analytics.md`。

建议提交：`docs: 添加架构决策记录`

## 3. Phase 0：架构基线任务

### P0-001 确认唯一浏览器方案

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-001  
涉及模块：browser、文档  
目标：确认项目唯一浏览器方案为 `WebContentsView`。  
验收标准：

- 文档禁止继续扩展 `BrowserView`。
- `AI_HANDOFF.md` 明确下一步迁移。

建议提交：`docs: 确认 WebContentsView 浏览器方案`

### P0-002 定义 Main 进程模块边界

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005  
涉及模块：electron/main  
目标：定义 browser、ipc、db、parser、tracking、site、cookie、analytics 边界。  
验收标准：

- `ARCHITECTURE.md` 有明确模块职责。
- 后续 Agent 不需要猜 `main.ts` 应该放什么。

建议提交：`docs: 定义 Main 进程模块边界`

### P0-003 定义 Renderer 模块边界

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005  
涉及模块：renderer、文档  
目标：定义 features、stores、components、lib 的职责。  
验收标准：

- `ARCHITECTURE.md` 有 Renderer 目录建议。
- 明确 Zustand 只保存 UI 状态和远端返回缓存。

建议提交：`docs: 定义 Renderer 模块边界`

### P0-004 定义 Preload 白名单 API

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005  
涉及模块：preload、ipc  
目标：定义 Preload 只暴露白名单 API，不暴露通用 `ipcRenderer`。  
验收标准：

- `ARCHITECTURE.md` 有 API 分组。
- `PROJECT_RULES.md` 已禁止通用 `ipcRenderer`。

建议提交：`docs: 定义 Preload 白名单 API`

### P0-005 定义 typed IPC 规则

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005  
涉及模块：ipc、shared types  
目标：定义 IPC channel 命名、参数、返回值和事件订阅规则。  
验收标准：

- 请求类用 `invoke`。
- 事件类用 subscribe/unsubscribe。
- channel 命名清晰，例如 `browser:navigate`、`problem:listRecent`。

建议提交：`docs: 定义 typed IPC 规范`

### P0-006 定义数据库迁移规则

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-006  
涉及模块：db、文档  
目标：定义 migration 命名、执行、回滚说明和文档更新规则。  
验收标准：

- `DATABASE_SCHEMA.md` 有 migration 章节。
- 明确 schema 变更必须更新文档。

建议提交：`docs: 定义数据库迁移规则`

### P0-007 定义本地数据目录

状态：已完成  
优先级：P1  
阶段：Phase 0  
前置任务：DOC-005、DOC-006  
涉及模块：db、cookie、backup  
目标：定义数据库、Cookie、日志、导出文件所在位置。  
验收标准：

- 明确优先使用 Electron `app.getPath('userData')`。
- Cookie、数据库、导出、日志分目录。

建议提交：`docs: 定义本地数据目录`

### P0-008 定义站点扩展模型

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005、DOC-009  
涉及模块：sites、parsers  
目标：定义 site config + parser adapter 的扩展模型。  
验收标准：

- 内置站点和用户自定义站点都能套用。
- 说明何时用配置，何时写 adapter。

建议提交：`docs: 定义站点扩展模型`

### P0-009 定义学习行为事件模型

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-005、DOC-006  
涉及模块：tracking、analytics、db  
目标：定义原始事件和聚合统计分离的模型。  
验收标准：

- 明确 `activity_events` 是事实来源。
- 明确 `user_daily_stats` 可重算。
- 区分停留时长和活跃时长。

建议提交：`docs: 定义学习行为事件模型`

### P0-010 定义 Agent 接手流程

状态：已完成  
优先级：P0  
阶段：Phase 0  
前置任务：DOC-007  
涉及模块：文档、协作流程  
目标：定义读文档、声明任务、修改、验证、交接的完整流程。  
验收标准：

- `AI_WORKFLOW.md` 有可复制模板。
- `AI_HANDOFF.md` 能直接被下一位 Agent 使用。

建议提交：`docs: 定义 Agent 接手流程`

## 4. Phase 1：桌面 MVP 基础任务

### P1-001 初始化 TailwindCSS

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：DOC-001  
涉及模块：renderer、build  
目标：安装并配置 TailwindCSS。  
验收标准：

- Tailwind 配置文件存在。
- 全局样式接入 Tailwind。
- 现有页面可正常显示。

建议提交：`chore: 初始化 TailwindCSS`

### P1-002 清理默认模板 UI 和无关资源

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-001  
涉及模块：renderer、public  
目标：移除 Vite 模板痕迹，保留项目需要的最小 UI。  
验收标准：

- 不再展示默认 Vite/React 内容。
- 保留导航栏基础能力。
- 不删除 Electron 必需资源。

建议提交：`chore: 清理默认模板资源`

### P1-003 迁移 BrowserView 到 WebContentsView

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P0-001、DOC-005  
涉及模块：electron/browser、electron/main  
目标：移除 `BrowserView` 实现，使用 `WebContentsView` 作为浏览器视图基础。  
验收标准：

- 应用可正常打开默认网站。
- 前进、后退、刷新、URL 监听正常。
- 远程网页不具备 Node 权限。
- 不继续引用 `BrowserView`。
- `AI_HANDOFF.md` 已更新。

建议提交：`feat: 迁移到 WebContentsView`

### P1-004 抽离 BrowserHost

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-003、P0-002  
涉及模块：electron/browser、electron/main  
目标：由 `BrowserHost` 统一管理浏览器视图生命周期。  
验收标准：

- `main.ts` 不再直接堆浏览器管理逻辑。
- BrowserHost 管理创建、布局、导航、事件绑定。
- 后续多标签页有扩展点。

建议提交：`feat: 抽离浏览器宿主模块`

### P1-005 实现默认首页加载

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-004  
涉及模块：browser、settings  
目标：默认进入 Codeforces 或用户设置的首页。  
验收标准：

- 首次启动有默认首页。
- 后续可从设置读取默认首页。

建议提交：`feat: 添加默认首页加载`

### P1-006 实现导航栏

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-003  
涉及模块：renderer/features/browser、preload、ipc  
目标：实现输入 URL、前进、后退、刷新。  
验收标准：

- 输入域名可自动补全协议。
- 前进后退刷新可用。
- Renderer 只通过白名单 API 调用。

建议提交：`feat: 完善浏览器导航栏`

### P1-007 实现 URL 变化监听

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-003、P0-005  
涉及模块：browser、ipc、renderer  
目标：监听导航变化并通知 Renderer。  
验收标准：

- 普通跳转和页内跳转均可更新 URL。
- Renderer 能显示当前 URL。
- 事件订阅可取消。

建议提交：`feat: 添加 URL 变化监听`

### P1-008 实现 WebContentsView 自适应布局

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-003、P1-004  
涉及模块：browser、main window  
目标：窗口 resize 后浏览器视图布局正确。  
验收标准：

- 工具栏不被网页覆盖。
- 窗口大小变化后网页区域同步变化。

建议提交：`feat: 添加浏览器视图自适应布局`

### P1-009 实现 persist session

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-003  
涉及模块：browser、session、cookies  
目标：使用 `persist:oj-main` 保存登录状态。  
验收标准：

- WebContentsView 使用持久 session。
- 重启后 session 数据仍在。
- 不手动破坏平台登录状态。

建议提交：`feat: 添加持久登录会话`

### P1-010 验证 Codeforces 登录状态

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-009  
涉及模块：browser、session  
目标：验证 Codeforces 登录后重启仍保持登录。  
验收标准：

- 登录 Codeforces。
- 关闭并重启应用。
- 登录状态仍保留。

建议提交：`test: 验证 Codeforces 登录状态`

### P1-011 验证 AcWing 登录状态

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-009  
涉及模块：browser、session  
目标：验证 AcWing 登录后重启仍保持登录。  
验收标准：

- 登录 AcWing。
- 关闭并重启应用。
- 登录状态仍保留。

建议提交：`test: 验证 AcWing 登录状态`

### P1-012 验证牛客登录状态

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-009  
涉及模块：browser、session  
目标：验证牛客登录后重启仍保持登录。  
验收标准：

- 登录牛客。
- 关闭并重启应用。
- 登录状态仍保留。

建议提交：`test: 验证牛客登录状态`

### P1-013 验证 VJudge 登录状态

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-009  
涉及模块：browser、session  
目标：验证 VJudge 登录后重启仍保持登录。  
验收标准：

- 登录 VJudge。
- 关闭并重启应用。
- 登录状态仍保留。

建议提交：`test: 验证 VJudge 登录状态`

### P1-014 建立 CookieVault 模块

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-009、DOC-006  
涉及模块：cookies、db、ipc  
目标：按站点读取 Cookie，并为 VJudge 等功能提供查询能力。  
验收标准：

- 可按站点 id 查询 Cookie。
- 可按域名查询 Cookie。
- Cookie 值不写入普通日志。

建议提交：`feat: 添加 CookieVault 基础模块`

### P1-015 实现 Cookie 本地保存策略

状态：未开始  
优先级：P0  
阶段：Phase 1  
前置任务：P1-014  
涉及模块：cookies、db  
目标：保存必要 Cookie 元数据，默认仅本机使用，不参与同步。  
验收标准：

- Cookie 记录能关联站点。
- 标记 `sync_excluded` 或等价字段。
- UI 和日志不默认明文展示 Cookie。

建议提交：`feat: 添加 Cookie 本地保存策略`

### P1-016 实现 Cookie 查询 API

状态：未开始  
优先级：P1  
阶段：Phase 1  
前置任务：P1-014、P0-005  
涉及模块：cookies、ipc、preload  
目标：为后续 VJudge 提交和同步任务提供 Cookie 查询接口。  
验收标准：

- Main 内部可查询完整 Cookie。
- Renderer 仅能查看安全摘要或授权状态。
- API 有明确返回类型。

建议提交：`feat: 添加 Cookie 查询接口`

### P1-017 实现站点注册表

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P0-008  
涉及模块：sites、parsers  
目标：内置 Codeforces、AcWing、牛客、VJudge 配置。  
验收标准：

- 每个站点有 id、名称、域名、首页、URL 规则、Cookie 策略。
- 站点可启用或禁用。

建议提交：`feat: 添加内置站点注册表`

### P1-018 实现 Codeforces URL 识别

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-017、P1-022  
涉及模块：parsers/sites/codeforces  
目标：识别 Codeforces 题目 URL。  
验收标准：

- 支持 `/problemset/problem/{contestId}/{index}`。
- 支持 `/contest/{contestId}/problem/{index}`。
- 支持 `/gym/{contestId}/problem/{index}`。
- 返回统一 `ProblemIdentity`。

建议提交：`feat: 添加 Codeforces URL 识别`

### P1-019 实现 AcWing URL 识别

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-017、P1-022  
涉及模块：parsers/sites/acwing  
目标：识别 AcWing 题目 URL。  
验收标准：

- 支持 `/problem/content/{id}/`。
- 支持 `/problem/content/description/{id}/`。
- 返回统一 `ProblemIdentity`。

建议提交：`feat: 添加 AcWing URL 识别`

### P1-020 实现牛客 URL 识别

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-017、P1-022  
涉及模块：parsers/sites/nowcoder  
目标：识别牛客题目 URL。  
验收标准：

- 支持 `nowcoder.com/practice/{uuid}`。
- 支持 `nowcoder.com/questionTerminal/{uuid}`。
- 支持 `ac.nowcoder.com/acm/problem/{id}`。
- 支持常见竞赛题目 URL。

建议提交：`feat: 添加牛客 URL 识别`

### P1-021 实现 VJudge URL 识别

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-017、P1-022  
涉及模块：parsers/sites/vjudge  
目标：识别 VJudge 题目 URL。  
验收标准：

- 支持 `/problem/{OJ}-{problemId}`。
- 支持 contest hash 中的题目定位。
- 能保留 source OJ 和 source problem id。

建议提交：`feat: 添加 VJudge URL 识别`

### P1-022 定义统一 ProblemIdentity

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P0-008  
涉及模块：shared types、parsers  
目标：定义所有站点解析结果的统一结构。  
验收标准：

- 包含 platform、platformProblemId、canonicalUrl。
- 可选 contestId、problemIndex、sourcePlatform、sourceProblemId。
- 支持 confidence 字段。

建议提交：`feat: 定义统一题目标识`

### P1-023 发送 problem:detected 事件

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-007、P1-018、P1-019、P1-020、P1-021  
涉及模块：browser、parsers、ipc  
目标：URL 识别成功后发送题目识别事件。  
验收标准：

- 导航到题目页触发事件。
- 非题目页不写入题库。
- 事件数据符合 `ProblemIdentity`。

建议提交：`feat: 添加题目识别事件`

### P1-024 初始化 SQLite 和 better-sqlite3

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：DOC-006、P0-006  
涉及模块：db、build  
目标：引入 SQLite 本地数据库能力。  
验收标准：

- `better-sqlite3` 可正常安装和构建。
- 数据库位于本地 userData 目录。
- WAL 和基础 pragma 配置明确。

建议提交：`feat: 初始化 SQLite 数据库`

### P1-025 建立 schema_migrations 表

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-024  
涉及模块：db/migrations  
目标：建立数据库迁移记录表。  
验收标准：

- migration 可重复安全执行。
- 已执行迁移有版本记录。

建议提交：`feat: 添加数据库迁移表`

### P1-026 建立 problems 表

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-025、P1-022  
涉及模块：db、problem  
目标：存储题目主记录。  
验收标准：

- 支持平台、平台题号、规范 URL、状态、首次访问、最近访问。
- `(platform, platform_problem_id)` 唯一。

建议提交：`feat: 添加题目表`

### P1-027 建立 problem_visits 表

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-026、P0-009  
涉及模块：db、tracking  
目标：记录单题访问和停留。  
验收标准：

- 记录 entered_at、left_at、duration_seconds、active_seconds。
- 可关联 problem 和 study_session。

建议提交：`feat: 添加题目访问记录表`

### P1-028 建立 activity_events 表

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-025、P0-009  
涉及模块：db、tracking  
目标：记录原始学习行为事件。  
验收标准：

- 支持 event_type、at、platform、problem_id、url、payload_json。
- 可作为统计重算事实来源。

建议提交：`feat: 添加学习事件表`

### P1-029 建立 study_sessions 表

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-025、P0-009  
涉及模块：db、tracking  
目标：记录一次应用学习会话。  
验收标准：

- 记录 started_at、ended_at、active_seconds、duration_seconds。
- 异常退出后可修复未结束 session。

建议提交：`feat: 添加学习会话表`

### P1-030 实现 Problem upsert

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-026、P1-023  
涉及模块：problem、db  
目标：题目识别后写入或更新本地题库。  
验收标准：

- 首次识别创建记录。
- 再次访问更新 last_visited_at。
- 不重复创建同一平台题目。

建议提交：`feat: 实现题目自动写入`

### P1-031 实现最近访问列表

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-030  
涉及模块：problem、renderer  
目标：按最近访问时间读取题目列表。  
验收标准：

- 列表按 last_visited_at 降序。
- Renderer 通过 IPC 获取。

建议提交：`feat: 添加最近访问列表`

### P1-032 实现题库侧边栏

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-031  
涉及模块：renderer/features/problems  
目标：展示题目列表、平台和状态。  
验收标准：

- 能显示最近访问。
- 能显示平台。
- 空状态友好。

建议提交：`feat: 添加题库侧边栏`

### P1-033 点击题目跳转网页

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-032、P1-006  
涉及模块：renderer、browser ipc  
目标：侧边栏点击题目后浏览器跳转到 canonicalUrl。  
验收标准：

- 点击题目可打开对应页面。
- URL 栏同步更新。

建议提交：`feat: 支持题目点击跳转`

### P1-034 记录首次访问时间

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-030  
涉及模块：tracking、problem  
目标：进入题目页自动记录 first_seen_at。  
验收标准：

- 首次访问写入 first_seen_at。
- 后续访问不覆盖 first_seen_at。

建议提交：`feat: 记录题目首次访问时间`

### P1-035 结算单题停留时间

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-027、P1-030  
涉及模块：tracking  
目标：离开题目页或关闭应用时结算停留时间。  
验收标准：

- 题目切换能结束旧 visit。
- 应用关闭能结束当前 visit。
- duration_seconds 合理。

建议提交：`feat: 记录单题停留时间`

### P1-036 记录最近活跃时间

状态：已完成  
优先级：P1  
阶段：Phase 1  
前置任务：P1-028  
涉及模块：tracking、analytics  
目标：记录用户最近学习活跃时间。  
验收标准：

- 导航到题目、提交同步、有效学习事件可更新最近活跃。
- 非题目页浏览不误判为刷题活跃。

建议提交：`feat: 记录最近学习活跃时间`

### P1-037 实现基础平台分布统计

状态：已完成  
优先级：P2  
阶段：Phase 1  
前置任务：P1-026  
涉及模块：analytics、renderer  
目标：统计本地题库中各平台题目数量。  
验收标准：

- 返回平台和数量。
- Dashboard 或侧栏可展示。

建议提交：`feat: 添加平台分布统计`

### P1-038 实现今日刷题数量统计

状态：已完成  
优先级：P2  
阶段：Phase 1  
前置任务：P1-027、P1-028  
涉及模块：analytics、tracking  
目标：统计当天访问或解决的题目数量。  
验收标准：

- 使用本地日期。
- 同一题可按规则去重。

建议提交：`feat: 添加今日刷题数量统计`

### P1-039 实现基础设置页

状态：已完成  
优先级：P2  
阶段：Phase 1  
前置任务：P1-017、P1-014  
涉及模块：renderer/features/settings、settings  
目标：提供默认首页、启用站点、Cookie 管理入口。  
验收标准：

- 可查看内置站点启用状态。
- 可设置默认首页。
- 可查看 Cookie 授权状态摘要。

建议提交：`feat: 添加基础设置页`

### P1-040 Phase 1 回归测试和文档交接

状态：已完成  
优先级：P0  
阶段：Phase 1  
前置任务：P1-001 到 P1-039  
涉及模块：全项目、文档  
目标：完成 MVP 基础功能回归和文档更新。  
验收标准：

- 四个平台基础登录与浏览验证完成。
- URL 识别和题目写入验证完成。
- `TASKS.md`、`AI_HANDOFF.md` 更新。

建议提交：`test: 完成 Phase 1 回归验证`

## 5. Phase 2：题目与提交数据任务

### P2-001 实现页面标题抓取接口

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P1-023、P1-030  
涉及模块：browser、parsers、metadata  
目标：在题目页加载完成后抓取标题等基础信息。  
验收标准：

- 抓取逻辑只在白名单站点执行。
- 抓取失败不影响题目记录。

建议提交：`feat: 添加题目页面信息抓取接口`

### P2-002 为 Codeforces 抓取题目元数据

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-001  
涉及模块：parsers/sites/codeforces  
目标：抓取 Codeforces 标题、难度、标签。  
验收标准：

- 能更新 problems.title、difficulty、tags。
- DOM 变化时失败可降级。

建议提交：`feat: 抓取 Codeforces 题目元数据`

### P2-003 为 AcWing 抓取题目元数据

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-001  
涉及模块：parsers/sites/acwing、db/problems  
目标：抓取 AcWing 题目标题和可用元数据。  
验收标准：

- 能更新题目标题。
- 缺少难度或标签时允许为空。
- 抓取失败写入可诊断事件，但不阻塞题目记录。

建议提交：`feat: 抓取 AcWing 题目元数据`

### P2-004 为牛客抓取题目元数据

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-001  
涉及模块：parsers/sites/nowcoder、db/problems  
目标：抓取牛客题目标题和可用元数据。  
验收标准：

- 支持 `nowcoder.com/practice`、`questionTerminal`、`ac.nowcoder.com` 题目页。
- 可更新标题、来源、可用标签。
- 抓取失败不影响 URL 识别结果。

建议提交：`feat: 抓取牛客题目元数据`

### P2-005 为 VJudge 抓取原始题目信息

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P2-001、P1-021  
涉及模块：parsers/sites/vjudge、db/problems  
目标：从 VJudge 题目页补全原始 OJ、原始题号、标题。  
验收标准：

- 能识别 `source_platform` 和 `source_problem_id`。
- VJudge contest 题目可保留 contest + index 映射。
- 无法补全原始 OJ 时不覆盖已有可靠字段。

建议提交：`feat: 抓取 VJudge 原始题目信息`

### P2-006 建立题目标签策略

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-002、P2-003、P2-004  
涉及模块：db/schema、db/problems、DATABASE_SCHEMA.md  
目标：确定 tags JSON 或 `problem_tags` 表策略。  
验收标准：

- 文档明确标签数据结构。
- 查询题目时可按标签筛选。
- 后续不同平台标签能保留来源。

建议提交：`feat: 建立题目标签存储策略`

### P2-007 建立 submissions 表

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P1-024、P1-026  
涉及模块：db/migrations、db/repositories、DATABASE_SCHEMA.md  
目标：建立提交记录表，支持多平台提交数据。  
验收标准：

- 包含平台提交 ID、题目 ID、verdict、语言、提交时间、运行时间、内存、原始 JSON。
- 建立唯一索引避免重复同步。
- 文档和 migration 同步更新。

建议提交：`feat: 添加提交记录数据表`

### P2-008 实现 Codeforces 提交记录同步

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-007、P1-014  
涉及模块：submissions/sync、cookies、sites/codeforces  
目标：同步 Codeforces 用户提交记录。  
验收标准：

- 可按 handle 或当前登录态获取提交记录。
- 新提交写入 `submissions`。
- 重复同步不会产生重复数据。

建议提交：`feat: 同步 Codeforces 提交记录`

### P2-009 实现 AcWing 提交记录同步

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-007、P1-014  
涉及模块：submissions/sync、cookies、sites/acwing  
目标：同步 AcWing 提交记录。  
验收标准：

- 使用本地登录态或 CookieVault 获取必要数据。
- 能关联已记录题目。
- 失败时记录同步错误并允许重试。

建议提交：`feat: 同步 AcWing 提交记录`

### P2-010 实现牛客提交记录同步

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-007、P1-014  
涉及模块：submissions/sync、cookies、sites/nowcoder  
目标：同步牛客提交记录。  
验收标准：

- 支持练习题和竞赛题的提交记录。
- 能记录 verdict、语言、提交时间。
- 能与本地题目建立关联。

建议提交：`feat: 同步牛客提交记录`

### P2-011 实现 VJudge 提交记录同步

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P2-007、P1-014、P1-016  
涉及模块：submissions/sync、cookies、sites/vjudge  
目标：使用本地 Cookie 支持 VJudge 提交记录同步。  
验收标准：

- 可读取 VJudge 登录 Cookie。
- 能同步 VJudge 提交状态、语言、时间。
- 可保留原始 OJ 和 VJudge 题目映射。

建议提交：`feat: 同步 VJudge 提交记录`

### P2-012 统一 verdict 标准

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P2-007  
涉及模块：submissions、shared/types、DATABASE_SCHEMA.md  
目标：统一 AC、WA、TLE、RE、CE 等 verdict 枚举。  
验收标准：

- 不同平台 verdict 能映射到统一枚举。
- 保留平台原始 verdict。
- 未知 verdict 不导致同步失败。

建议提交：`feat: 统一提交结果状态`

### P2-013 记录提交语言

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-007、P2-012  
涉及模块：submissions、db/submissions  
目标：记录每次提交使用的语言。  
验收标准：

- `submissions.language` 存储平台显示语言。
- 可按语言筛选提交记录。
- 未知语言允许为空。

建议提交：`feat: 记录提交语言`

### P2-014 记录提交时间

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P2-007  
涉及模块：submissions、db/submissions  
目标：统一记录提交时间。  
验收标准：

- 精确时间使用 UTC。
- 展示时使用本地时区。
- 按提交时间排序稳定。

建议提交：`feat: 记录提交时间`

### P2-015 记录同题提交次数

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-007、P2-012  
涉及模块：submissions、analytics  
目标：统计每道题的提交次数。  
验收标准：

- 题目详情页可显示提交次数。
- 同步重复数据不会增加次数。
- 支持按 verdict 分组统计。

建议提交：`feat: 统计单题提交次数`

### P2-016 识别首次 AC

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-012、P2-014、P2-015  
涉及模块：submissions、problems  
目标：识别每道题首次 AC 的提交。  
验收标准：

- 首次 AC 按提交时间计算。
- 题目表写入 `first_solved_at`。
- 后续同步更早提交时能修正结果。

建议提交：`feat: 识别题目首次 AC`

### P2-017 自动更新题目状态

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P2-012、P2-016  
涉及模块：problems、submissions  
目标：根据提交记录自动更新未做、尝试中、已通过状态。  
验收标准：

- 有非 AC 提交为尝试中。
- 有 AC 提交为已通过。
- 手动状态和自动状态冲突时规则有文档说明。

建议提交：`feat: 自动更新题目状态`

### P2-018 实现提交记录详情页

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-007、P2-012  
涉及模块：renderer/features/submissions  
目标：展示提交记录列表和单条提交详情。  
验收标准：

- 可按题目查看提交列表。
- 显示 verdict、语言、时间、平台。
- UI 只通过 IPC 读取数据。

建议提交：`feat: 添加提交记录详情页`

### P2-019 实现题目详情页

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P1-032、P2-017  
涉及模块：renderer/features/problems  
目标：展示题目基础信息、访问记录、提交摘要。  
验收标准：

- 展示标题、平台、状态、最近访问、首次 AC。
- 可跳转原题 URL。
- 可查看相关提交记录。

建议提交：`feat: 添加题目详情页`

### P2-020 实现题目筛选

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-006、P2-017、P2-019  
涉及模块：renderer/features/problems、db/problems  
目标：支持按平台、状态、标签、难度筛选题目。  
验收标准：

- 筛选条件可组合。
- 查询性能对当前本地数据量足够稳定。
- 筛选状态保存在 UI store 中。

建议提交：`feat: 添加题目筛选功能`

### P2-021 实现提交同步失败重试

状态：已完成  
优先级：P1  
阶段：Phase 2  
前置任务：P2-008、P2-009、P2-010、P2-011  
涉及模块：submissions/sync、activity_events  
目标：同步失败后可记录错误并重试。  
验收标准：

- 失败原因可查看。
- 重试不会重复写入已存在提交。
- 网络或 Cookie 失效有明确提示。

建议提交：`feat: 添加提交同步重试机制`

### P2-022 Phase 2 数据一致性测试

状态：已完成  
优先级：P0  
阶段：Phase 2  
前置任务：P2-001 到 P2-021  
涉及模块：tests、db、submissions、文档  
目标：验证题目元数据和提交记录一致性。  
验收标准：

- 四个平台至少各有一组同步样例。
- 重复同步不产生重复数据。
- 文档和交接文件更新。

建议提交：`test: 完成 Phase 2 数据一致性测试`

## 6. Phase 3：学习行为分析任务

### P3-001 建立 user_daily_stats 聚合表

状态：已完成  
优先级：P0  
阶段：Phase 3  
前置任务：P1-028、P1-029  
涉及模块：db/migrations、analytics、DATABASE_SCHEMA.md  
目标：建立按本地日期聚合的学习统计表。  
验收标准：

- 包含活跃秒数、访问题数、提交数、AC 数、平台分布。
- 可从原始事件重算。
- 有必要索引。

建议提交：`feat: 添加每日学习统计表`

### P3-002 实现每日活跃时长统计

状态：已完成  
优先级：P0  
阶段：Phase 3  
前置任务：P3-001、P1-035  
涉及模块：tracking、analytics  
目标：统计每日活跃学习时长。  
验收标准：

- 区分停留时长和活跃时长。
- 窗口失焦或空闲时不计入活跃时长。
- 展示结果可从事件日志追溯。

建议提交：`feat: 统计每日活跃时长`

### P3-003 实现刷题数量趋势

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P3-001  
涉及模块：analytics、renderer/features/analytics  
目标：按日、周、月展示刷题数量趋势。  
验收标准：

- 能区分访问题目数和 AC 题目数。
- 支持最近 7 天、30 天、全年视图。

建议提交：`feat: 添加刷题数量趋势`

### P3-004 实现 AC 数量趋势

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P2-016、P3-001  
涉及模块：analytics、renderer/features/analytics  
目标：展示 AC 数量变化。  
验收标准：

- 基于首次 AC 时间统计。
- 与提交记录可交叉验证。

建议提交：`feat: 添加 AC 趋势统计`

### P3-005 实现提交数量趋势

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P2-007、P3-001  
涉及模块：analytics、renderer/features/analytics  
目标：展示提交数量变化。  
验收标准：

- 可按 verdict 分组。
- 可按平台过滤。

建议提交：`feat: 添加提交数量趋势`

### P3-006 实现平台分布图

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P1-037、P3-001  
涉及模块：analytics、renderer/features/analytics  
目标：展示不同平台的刷题、提交、AC 分布。  
验收标准：

- 支持 Codeforces、AcWing、牛客、VJudge。
- 未知或自定义站点归入对应 site id。

建议提交：`feat: 添加平台分布统计图`

### P3-007 实现单题停留时间分析

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P1-027、P1-035  
涉及模块：analytics、problem_visits  
目标：分析每道题的停留时长和活跃时长。  
验收标准：

- 可显示单次停留和累计停留。
- 极端异常时长有修正或标记策略。

建议提交：`feat: 添加单题停留时间分析`

### P3-008 实现学习轨迹时间线

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P1-028、P1-034、P1-035  
涉及模块：analytics、renderer/features/analytics  
目标：按时间展示访问、识别、提交、AC 等事件。  
验收标准：

- 能从 `activity_events` 还原。
- 支持按日期过滤。

建议提交：`feat: 添加学习轨迹时间线`

### P3-009 实现连续活跃天数计算

状态：已完成  
优先级：P0  
阶段：Phase 3  
前置任务：P3-001、P3-002  
涉及模块：analytics  
目标：计算当前连续活跃天数。  
验收标准：

- 明确有效活跃日判定规则。
- 使用本地日期计算。
- 与每日统计表一致。

建议提交：`feat: 计算连续活跃天数`

### P3-010 实现最长连续活跃天数

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P3-009  
涉及模块：analytics  
目标：计算历史最长连续活跃天数。  
验收标准：

- 可跨月份、跨年份计算。
- 数据重算后结果一致。

建议提交：`feat: 计算最长连续活跃天数`

### P3-011 实现最近活跃时间展示

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P1-036  
涉及模块：analytics、renderer/features/analytics  
目标：展示最近一次有效学习活动时间。  
验收标准：

- 最近活跃时间来自 tracking 事件。
- 展示本地时间。

建议提交：`feat: 展示最近活跃时间`

### P3-012 实现题目复访次数统计

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P1-027  
涉及模块：analytics、problem_visits  
目标：统计每道题被访问和复访的次数。  
验收标准：

- 同一题多次访问可正确累计。
- 可按最近复访排序。

建议提交：`feat: 统计题目复访次数`

### P3-013 实现错题列表

状态：已完成  
优先级：P1  
阶段：Phase 3  
前置任务：P2-012、P2-017  
涉及模块：analytics、renderer/features/problems  
目标：展示有错误提交或长期未 AC 的题目。  
验收标准：

- 可按 WA/TLE/RE/CE 筛选。
- 已 AC 题目仍可保留历史错误记录。

建议提交：`feat: 添加错题列表`

### P3-014 实现长期未复习题目列表

状态：已完成  
优先级：P2  
阶段：Phase 3  
前置任务：P1-036、P3-012  
涉及模块：analytics、renderer/features/problems  
目标：找出长时间未访问或未复习的题目。  
验收标准：

- 默认阈值可配置。
- 支持按平台和状态过滤。

建议提交：`feat: 添加长期未复习题目列表`

### P3-015 实现统计页 Dashboard

状态：已完成  
优先级：P0  
阶段：Phase 3  
前置任务：P3-002 到 P3-014  
涉及模块：renderer/features/analytics  
目标：集中展示学习行为统计。  
验收标准：

- 包含活跃、刷题、提交、平台、轨迹等核心模块。
- 加载失败有清晰空状态。

建议提交：`feat: 添加学习统计仪表盘`

### P3-016 实现原始事件重算聚合工具

状态：已完成  
优先级：P0  
阶段：Phase 3  
前置任务：P3-001、P3-015  
涉及模块：analytics、db/tools  
目标：从 `activity_events` 和 `problem_visits` 重算统计表。  
验收标准：

- 可重算指定日期范围。
- 重算前后数据一致。
- 不破坏原始事件。

建议提交：`feat: 添加学习统计重算工具`

### P3-017 Phase 3 统计准确性测试

状态：已完成  
优先级：P0  
阶段：Phase 3  
前置任务：P3-001 到 P3-016  
涉及模块：tests、analytics、文档  
目标：验证学习行为统计准确性。  
验收标准：

- 有跨天、空闲、重复访问、异常退出样例。
- Dashboard 与数据库统计一致。
- 文档和交接文件更新。

建议提交：`test: 完成 Phase 3 统计准确性测试`

## 7. Phase 4：Rating 与竞赛任务

### P4-001 建立 platform_accounts 表

状态：已完成  
优先级：P0  
阶段：Phase 4  
前置任务：P1-024  
涉及模块：db/migrations、accounts、DATABASE_SCHEMA.md  
目标：保存不同平台账号信息。  
验收标准：

- 支持 platform、handle、display_name、current_rating、peak_rating、last_synced_at。
- 同一平台 handle 唯一。

建议提交：`feat: 添加平台账号表`

### P4-002 建立 rating_history 表

状态：已完成  
优先级：P0  
阶段：Phase 4  
前置任务：P4-001  
涉及模块：db/migrations、rating、DATABASE_SCHEMA.md  
目标：保存 Rating 历史变化。  
验收标准：

- 包含 rating_before、rating_after、delta、contest_at。
- 支持按平台和账号查询。

建议提交：`feat: 添加 Rating 历史表`

### P4-003 建立 contest_results 表

状态：已完成  
优先级：P1  
阶段：Phase 4  
前置任务：P4-001  
涉及模块：db/migrations、contests、DATABASE_SCHEMA.md  
目标：保存比赛结果和排名信息。  
验收标准：

- 包含 contest_id、contest_name、rank、solved_count、penalty、raw_json。
- 可关联 rating_history。

建议提交：`feat: 添加比赛结果表`

### P4-004 支持 Codeforces handle 绑定

状态：未开始  
优先级：P0  
阶段：Phase 4  
前置任务：P4-001  
涉及模块：renderer/features/settings、accounts  
目标：允许用户绑定 Codeforces handle。  
验收标准：

- 可保存、修改、删除 handle。
- 输入校验清晰。
- 不影响浏览器登录态。

建议提交：`feat: 支持绑定 Codeforces 账号`

### P4-005 同步 Codeforces 当前 rating

状态：未开始  
优先级：P0  
阶段：Phase 4  
前置任务：P4-004  
涉及模块：rating/sync、accounts  
目标：同步 Codeforces 当前 Rating。  
验收标准：

- 成功后更新 `platform_accounts.current_rating`。
- 同步失败有提示和重试。

建议提交：`feat: 同步 Codeforces 当前 Rating`

### P4-006 同步 Codeforces rating history

状态：未开始  
优先级：P0  
阶段：Phase 4  
前置任务：P4-005、P4-002  
涉及模块：rating/sync、db/rating  
目标：同步 Codeforces Rating 历史。  
验收标准：

- 重复同步不重复插入。
- contest delta 与官方数据一致。

建议提交：`feat: 同步 Codeforces Rating 历史`

### P4-007 计算 peak rating

状态：未开始  
优先级：P1  
阶段：Phase 4  
前置任务：P4-006  
涉及模块：rating、analytics  
目标：计算并保存历史最高 Rating。  
验收标准：

- 从 rating_history 计算。
- 当前账号表 peak_rating 正确更新。

建议提交：`feat: 计算历史最高 Rating`

### P4-008 记录 contest rating delta

状态：未开始  
优先级：P1  
阶段：Phase 4  
前置任务：P4-002、P4-003  
涉及模块：rating、contests  
目标：记录每场比赛 Rating 变化。  
验收标准：

- 可按比赛查看 delta。
- 与 rating_history 关联稳定。

建议提交：`feat: 记录比赛 Rating 变化`

### P4-009 实现 Rating 趋势图

状态：未开始  
优先级：P1  
阶段：Phase 4  
前置任务：P4-006、P4-007  
涉及模块：renderer/features/analytics、rating  
目标：展示 Rating 曲线。  
验收标准：

- 展示当前 rating、peak rating、历史变化。
- 空数据有引导绑定账号。

建议提交：`feat: 添加 Rating 趋势图`

### P4-010 实现比赛记录列表

状态：未开始  
优先级：P1  
阶段：Phase 4  
前置任务：P4-003、P4-008  
涉及模块：renderer/features/contests  
目标：展示比赛历史和结果。  
验收标准：

- 显示比赛名称、时间、排名、solved、rating delta。
- 可跳转原平台比赛页。

建议提交：`feat: 添加比赛记录列表`

### P4-011 为 VJudge contest 预留映射

状态：未开始  
优先级：P2  
阶段：Phase 4  
前置任务：P4-003、P2-005  
涉及模块：sites/vjudge、contests  
目标：为 VJudge contest 与原始 OJ 题目建立映射预留。  
验收标准：

- 文档说明 VJudge contest 数据模型。
- 不强制实现完整 rating。

建议提交：`feat: 预留 VJudge 比赛映射`

### P4-012 Phase 4 Rating 数据校验

状态：未开始  
优先级：P0  
阶段：Phase 4  
前置任务：P4-001 到 P4-011  
涉及模块：tests、rating、文档  
目标：验证账号、Rating 和比赛数据一致性。  
验收标准：

- Codeforces 样例数据可重复同步。
- peak rating、delta、contest 关联正确。
- 文档和交接文件更新。

建议提交：`test: 完成 Phase 4 Rating 数据校验`

## 8. Phase 5：站点扩展系统任务

### P5-001 实现站点管理页

状态：未开始  
优先级：P0  
阶段：Phase 5  
前置任务：P1-017、P1-039  
涉及模块：renderer/features/settings、sites  
目标：提供站点查看、启用、禁用和编辑入口。  
验收标准：

- 可查看内置站点列表。
- 可查看站点域名、首页、启用状态。
- UI 只通过 IPC 调用站点服务。

建议提交：`feat: 添加站点管理页`

### P5-002 支持手动新增网站配置

状态：未开始  
优先级：P0  
阶段：Phase 5  
前置任务：P5-001  
涉及模块：sites、db/site_configs、renderer/features/settings  
目标：允许用户添加普通 OJ 网站配置。  
验收标准：

- 可填写站点 id、名称、域名、首页 URL。
- 站点 id 唯一。
- 新增站点默认不影响内置站点。

建议提交：`feat: 支持手动新增网站配置`

### P5-003 支持编辑站点 URL 规则

状态：未开始  
优先级：P0  
阶段：Phase 5  
前置任务：P5-002、P1-022  
涉及模块：sites、parsers/configurable  
目标：支持编辑域名、首页 URL、题目 URL 规则。  
验收标准：

- 支持正则或模板形式的题目 URL 规则。
- 保存前可以用样例 URL 测试。
- 无效规则不会写入启用状态。

建议提交：`feat: 支持编辑站点识别规则`

### P5-004 支持启用和禁用站点

状态：未开始  
优先级：P1  
阶段：Phase 5  
前置任务：P5-001  
涉及模块：sites、settings  
目标：允许用户控制站点是否参与识别。  
验收标准：

- 禁用站点后不再触发 URL 识别。
- 历史题目数据不被删除。
- 内置站点可禁用但不可破坏默认配置。

建议提交：`feat: 支持启用和禁用站点`

### P5-005 支持导入导出站点配置

状态：未开始  
优先级：P1  
阶段：Phase 5  
前置任务：P5-002、P5-003  
涉及模块：sites、settings、file-export  
目标：支持站点配置备份和迁移。  
验收标准：

- 可导出非敏感站点配置 JSON。
- 导出内容不包含 Cookie。
- 导入前做格式校验和冲突提示。

建议提交：`feat: 支持导入导出站点配置`

### P5-006 新增 PTA 默认站点配置

状态：未开始  
优先级：P1  
阶段：Phase 5  
前置任务：P5-003  
涉及模块：sites/builtins、SITE_ADAPTER_GUIDE.md  
目标：为 PTA 添加默认站点配置。  
验收标准：

- PTA 出现在内置站点列表。
- 配置包含常见域名和首页。
- 文档记录 PTA 适配限制。

建议提交：`feat: 添加 PTA 默认站点配置`

### P5-007 实现 PTA URL 识别

状态：未开始  
优先级：P1  
阶段：Phase 5  
前置任务：P5-006、P5-003  
涉及模块：parsers/sites/pta、tests/parsers  
目标：识别 PTA 题目页面 URL。  
验收标准：

- 至少支持常见 PTA 题目 URL 样例。
- 无法识别的 PTA 页面不误写入题库。
- 添加 URL 样例测试。

建议提交：`feat: 添加 PTA URL 识别`

### P5-008 提供 adapter 扩展接口

状态：未开始  
优先级：P0  
阶段：Phase 5  
前置任务：P5-003、P5-007  
涉及模块：sites、parsers、ARCHITECTURE.md  
目标：为配置无法解决的平台提供代码级 adapter 扩展点。  
验收标准：

- adapter 接口包含 URL match、identity parse、metadata extract 可选能力。
- 内置站点和自定义站点可共存。
- 文档说明新增 adapter 步骤。

建议提交：`feat: 添加站点适配器扩展接口`

### P5-009 建立站点规则测试样例

状态：未开始  
优先级：P0  
阶段：Phase 5  
前置任务：P5-003、P5-008  
涉及模块：tests/parsers、sites  
目标：为内置和自定义规则建立测试样例。  
验收标准：

- 每个内置站点至少有有效样例和无效样例。
- 自定义规则测试可在不启动 Electron 的情况下运行。
- 测试失败能指出具体站点和 URL。

建议提交：`test: 添加站点规则测试样例`

### P5-010 新增普通 OJ 站点端到端验收

状态：未开始  
优先级：P0  
阶段：Phase 5  
前置任务：P5-001 到 P5-009  
涉及模块：sites、parsers、renderer、文档  
目标：验证用户能手动新增一个普通 OJ 并识别题目。  
验收标准：

- 从 UI 新增站点。
- 使用样例 URL 测试通过。
- 打开该站点题目页后能写入本地题库。
- 文档和交接文件更新。

建议提交：`test: 完成自定义站点端到端验收`

## 9. Phase 6：AI 辅助学习任务

### P6-001 建立本地题解 Markdown 系统

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P2-019  
涉及模块：notes、renderer/features/problems、db  
目标：支持为题目创建本地 Markdown 题解或笔记。  
验收标准：

- 每道题可关联一个或多个本地笔记。
- 笔记存储位置清晰。
- 删除题目不自动删除笔记文件，除非用户确认。

建议提交：`feat: 添加本地题解 Markdown 系统`

### P6-002 题目详情页关联本地笔记

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P6-001  
涉及模块：renderer/features/problems、notes  
目标：在题目详情页展示和编辑本地笔记入口。  
验收标准：

- 可创建、打开、重命名笔记。
- UI 清楚区分本地笔记和 AI 生成内容。

建议提交：`feat: 在题目详情页关联本地笔记`

### P6-003 提交记录关联代码片段或文件路径

状态：未开始  
优先级：P2  
阶段：Phase 6  
前置任务：P2-018、P6-001  
涉及模块：submissions、notes、db  
目标：允许提交记录关联本地代码片段或文件路径。  
验收标准：

- 可保存代码语言、摘要、文件路径。
- 不强制复制用户本地代码。
- 路径失效时有明确提示。

建议提交：`feat: 支持提交记录关联代码`

### P6-004 建立 AI 上下文导出层

状态：未开始  
优先级：P0  
阶段：Phase 6  
前置任务：P3-015、P6-001  
涉及模块：ai/context、analytics、ARCHITECTURE.md  
目标：把本地学习数据整理成可供 AI 使用的上下文。  
验收标准：

- 只导出必要学习数据。
- 默认不导出 Cookie、敏感路径和无关日志。
- 导出结构有版本号。

建议提交：`feat: 添加 AI 上下文导出层`

### P6-005 实现错题复习建议

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P3-013、P6-004  
涉及模块：ai/recommendations、analytics  
目标：基于错题和提交记录生成复习建议。  
验收标准：

- 推荐结果可追溯到具体题目和提交。
- AI 建议不直接修改题目状态。

建议提交：`feat: 生成错题复习建议`

### P6-006 实现薄弱标签分析

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P2-006、P3-015、P6-004  
涉及模块：ai/recommendations、analytics  
目标：分析用户在不同标签上的薄弱点。  
验收标准：

- 结合 AC 率、错误次数、停留时长。
- 结果解释使用本地统计依据。

建议提交：`feat: 分析薄弱算法标签`

### P6-007 实现阶段学习总结

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P3-015、P6-004  
涉及模块：ai/summary、analytics  
目标：按周、月或自定义周期生成学习总结。  
验收标准：

- 总结包含学习量、平台分布、AC、薄弱点。
- 用户可保存总结。

建议提交：`feat: 生成阶段学习总结`

### P6-008 实现复习计划生成

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P6-005、P6-006、P6-007  
涉及模块：ai/planner、analytics  
目标：基于学习数据生成短期复习计划。  
验收标准：

- 计划能关联具体题目和标签。
- 用户可接受、忽略或调整计划。

建议提交：`feat: 生成算法复习计划`

### P6-009 实现 AI 输出本地保存

状态：未开始  
优先级：P1  
阶段：Phase 6  
前置任务：P6-005、P6-007、P6-008  
涉及模块：ai/storage、db、notes  
目标：保存 AI 建议、总结和计划。  
验收标准：

- AI 输出和核心数据分表或分目录存储。
- 每条 AI 输出保留生成时间、输入摘要和版本。

建议提交：`feat: 保存 AI 学习建议`

### P6-010 限制 AI 修改核心数据

状态：未开始  
优先级：P0  
阶段：Phase 6  
前置任务：P6-004  
涉及模块：ai、PROJECT_RULES.md、ARCHITECTURE.md  
目标：明确 AI 只能建议，不能直接污染核心学习数据。  
验收标准：

- AI 输出必须写入独立区域。
- 修改题目状态、提交记录、Rating 必须由用户操作或确定性同步逻辑完成。
- 文档明确该边界。

建议提交：`docs: 明确 AI 数据写入边界`

### P6-011 Phase 6 AI 建议可追溯性测试

状态：未开始  
优先级：P0  
阶段：Phase 6  
前置任务：P6-001 到 P6-010  
涉及模块：tests、ai、文档  
目标：验证 AI 建议能追溯到本地数据来源。  
验收标准：

- 每条建议能找到题目、提交或统计依据。
- 不导出 Cookie 和敏感信息。
- 文档和交接文件更新。

建议提交：`test: 完成 AI 建议可追溯性测试`

## 10. Phase 7：同步、备份与多端预留任务

### P7-001 建立 sync_queue 表

状态：未开始  
优先级：P1  
阶段：Phase 7  
前置任务：P1-024、P3-001  
涉及模块：db/migrations、sync、DATABASE_SCHEMA.md  
目标：建立未来同步需要的变更队列表。  
验收标准：

- 记录 entity_type、entity_id、operation、created_at、status。
- Cookie 和敏感数据默认不进入队列。
- 文档说明同步暂不自动上传。

建议提交：`feat: 添加同步队列表`

### P7-002 为核心表增加同步字段

状态：未开始  
优先级：P1  
阶段：Phase 7  
前置任务：P7-001  
涉及模块：db/migrations、DATABASE_SCHEMA.md  
目标：为未来同步预留稳定字段。  
验收标准：

- 核心表包含 created_at、updated_at、deleted_at 或等价字段。
- 同步字段变更有 migration。
- 不改变 Cookie 不同步原则。

建议提交：`feat: 为核心表预留同步字段`

### P7-003 实现本地数据库备份

状态：未开始  
优先级：P0  
阶段：Phase 7  
前置任务：P1-024  
涉及模块：backup、db、settings  
目标：支持用户手动备份 SQLite 数据库。  
验收标准：

- 可选择备份目录。
- 备份文件带时间戳。
- 备份不包含 Cookie 明文导出，除非未来有单独授权设计。

建议提交：`feat: 添加本地数据库备份`

### P7-004 实现手动导出 JSON

状态：未开始  
优先级：P1  
阶段：Phase 7  
前置任务：P7-003  
涉及模块：backup、export  
目标：导出非敏感学习数据为 JSON。  
验收标准：

- 包含题目、访问、提交、统计、Rating。
- 不包含 Cookie。
- 导出结构有版本号。

建议提交：`feat: 导出学习数据 JSON`

### P7-005 实现手动导入 JSON

状态：未开始  
优先级：P1  
阶段：Phase 7  
前置任务：P7-004  
涉及模块：backup、import  
目标：从 JSON 恢复或合并学习数据。  
验收标准：

- 导入前校验版本和结构。
- 支持预览导入影响。
- 冲突不静默覆盖。

建议提交：`feat: 导入学习数据 JSON`

### P7-006 实现冲突检测策略

状态：未开始  
优先级：P0  
阶段：Phase 7  
前置任务：P7-005  
涉及模块：sync、import、DATABASE_SCHEMA.md  
目标：定义并实现基础数据冲突检测。  
验收标准：

- 同一平台同一题目不会重复。
- 同一提交不会重复。
- 冲突处理策略写入文档。

建议提交：`feat: 添加数据冲突检测`

### P7-007 明确 Cookie 不进入同步

状态：未开始  
优先级：P0  
阶段：Phase 7  
前置任务：P7-001、P1-014  
涉及模块：cookies、sync、PROJECT_RULES.md  
目标：在代码和文档中强制 Cookie 不参与同步。  
验收标准：

- 同步队列不会记录 Cookie 实体。
- 导入导出不会包含 Cookie。
- 文档明确该规则。

建议提交：`docs: 明确 Cookie 不参与同步`

### P7-008 设计安卓端只读数据接口

状态：未开始  
优先级：P2  
阶段：Phase 7  
前置任务：P7-004、P7-006  
涉及模块：docs、sync、api-design  
目标：为未来安卓端读取学习数据预留接口设计。  
验收标准：

- 定义只读数据格式。
- 明确安卓端不直接读取桌面端 Cookie。
- 不要求当前实现安卓应用。

建议提交：`docs: 设计安卓端只读数据接口`

### P7-009 实现同步兼容性文档

状态：未开始  
优先级：P1  
阶段：Phase 7  
前置任务：P7-001 到 P7-008  
涉及模块：docs、sync  
目标：说明同步字段、导入导出、冲突策略和限制。  
验收标准：

- 新 Agent 可根据文档继续做同步功能。
- 明确哪些表可同步，哪些表不可同步。

建议提交：`docs: 添加同步兼容性说明`

### P7-010 完成备份恢复测试

状态：未开始  
优先级：P0  
阶段：Phase 7  
前置任务：P7-001 到 P7-009  
涉及模块：tests、backup、文档  
目标：验证备份、导出、导入和冲突检测。  
验收标准：

- 备份文件可恢复。
- JSON 导入导出不丢核心数据。
- Cookie 不出现在导出数据中。

建议提交：`test: 完成备份恢复测试`

## 11. Phase 8：质量、发布与长期维护任务

### P8-001 完善 ESLint 和 TypeScript 检查

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P1-001  
涉及模块：tooling、tsconfig、eslint  
目标：提高长期代码质量检查强度。  
验收标准：

- `npm run lint` 可稳定运行。
- TypeScript strict 不被关闭。
- 规则不与项目技术栈冲突。

建议提交：`chore: 完善代码检查配置`

### P8-002 增加 parser 单元测试

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P1-018、P1-019、P1-020、P1-021、P5-007  
涉及模块：tests/parsers  
目标：覆盖 URL 识别和题目身份解析。  
验收标准：

- 每个内置站点有有效和无效 URL 样例。
- 测试不依赖网络。
- 失败信息能定位站点规则。

建议提交：`test: 添加 URL 解析单元测试`

### P8-003 增加数据库 repository 测试

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P1-030、P2-007、P3-001  
涉及模块：tests/db  
目标：测试数据库读写、upsert、迁移和约束。  
验收标准：

- 使用临时测试数据库。
- 覆盖重复题目、重复提交、聚合表写入。
- 不污染用户真实数据。

建议提交：`test: 添加数据库仓储测试`

### P8-004 增加 IPC contract 测试

状态：未开始  
优先级：P1  
阶段：Phase 8  
前置任务：P0-005、P1-023、P1-031  
涉及模块：tests/ipc、preload、ipc  
目标：验证 IPC channel 参数和返回值稳定。  
验收标准：

- 覆盖 browser、problem、tracking、settings 核心 channel。
- Renderer 无法调用未暴露 channel。

建议提交：`test: 添加 IPC 契约测试`

### P8-005 增加 Electron 启动 smoke test

状态：未开始  
优先级：P1  
阶段：Phase 8  
前置任务：P1-003、P1-004  
涉及模块：tests/electron  
目标：验证应用能启动并加载默认页面。  
验收标准：

- 启动后主窗口存在。
- WebContentsView 加载默认 URL。
- 基础 IPC 可用。

建议提交：`test: 添加 Electron 启动冒烟测试`

### P8-006 增加关键页面截图验收

状态：未开始  
优先级：P2  
阶段：Phase 8  
前置任务：P1-032、P3-015、P5-001  
涉及模块：tests/ui、renderer  
目标：对核心 UI 页面进行视觉回归检查。  
验收标准：

- 覆盖题库侧栏、统计页、设置页。
- 截图不包含敏感 Cookie。

建议提交：`test: 添加关键页面截图验收`

### P8-007 建立 changelog

状态：未开始  
优先级：P1  
阶段：Phase 8  
前置任务：无  
涉及模块：文档  
目标：记录用户可见变化。  
验收标准：

- 建立 `CHANGELOG.md`。
- 按版本记录新增、修复、变更。
- 提交信息仍使用中文。

建议提交：`docs: 添加更新日志`

### P8-008 配置 electron-builder 打包

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P8-001、P8-005  
涉及模块：build、electron-builder  
目标：完善 Windows 打包配置。  
验收标准：

- 能生成 Windows 安装包。
- 应用图标、名称、输出目录合理。
- 打包不包含开发缓存和敏感数据。

建议提交：`chore: 配置 Windows 应用打包`

### P8-009 发布 Windows 安装包

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P8-008  
涉及模块：release  
目标：发布可安装的 Windows 版本。  
验收标准：

- 安装、启动、卸载流程正常。
- 用户数据目录不会因升级丢失。

建议提交：`chore: 发布 Windows 安装包`

### P8-010 建立故障排查文档

状态：未开始  
优先级：P1  
阶段：Phase 8  
前置任务：P1-040、P2-022、P3-017  
涉及模块：docs  
目标：记录登录失败、Cookie 失效、数据库损坏、同步失败等处理方法。  
验收标准：

- 新用户和 Agent 都能按文档定位常见问题。
- 不要求用户查看源码才能恢复。

建议提交：`docs: 添加故障排查文档`

### P8-011 建立数据迁移回滚文档

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P0-006、P7-003  
涉及模块：docs、db  
目标：说明数据库迁移失败和回滚策略。  
验收标准：

- 明确备份、迁移、失败恢复步骤。
- 每次 schema 变更都能挂靠该策略。

建议提交：`docs: 添加数据库迁移回滚说明`

### P8-012 完成 v1.0 发布验收

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P8-001 到 P8-011  
涉及模块：全项目、文档  
目标：完成 v1.0 发布前总验收。  
验收标准：

- Phase 1 到 Phase 8 的 P0 任务全部完成。
- 核心数据可备份恢复。
- 桌面端可稳定刷题、记录、分析。
- 文档和交接文件完整。

建议提交：`chore: 完成 v1.0 发布验收`

## 12. 状态维护规则

- 每个任务开始时，将状态从“未开始”改为“进行中”。
- 每个任务完成时，将状态改为“已完成”，并在 `AI_HANDOFF.md` 记录完成内容。
- 任务阻塞时，状态改为“阻塞”，并写明阻塞原因和需要用户决定的事项。
- 新增任务必须使用同样字段：状态、优先级、阶段、前置任务、涉及模块、目标、验收标准、建议提交。
- 不允许删除历史任务；如果任务不再做，标记为“暂缓”并说明原因。

## 13. 下一位 Agent 的固定起点

如果没有用户指定任务，下一位 Agent 默认从以下顺序继续：

1. 检查所有文档是否存在并互相一致。
2. 执行 `P1-009` 建立 `persist:oj-main` 持久 session。
3. 执行 `P1-010` 到 `P1-013` 验证四个平台登录状态。
4. 执行 `P1-014` 建立 CookieVault。
5. 执行 `P1-017` 建立站点注册表。

任何情况下都禁止继续在 `BrowserView` 上新增功能。
