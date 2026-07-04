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

Phase 1 到 Phase 7 已完成，Phase 8 已进入质量、文档、结构巩固和发布准备收尾。

当前优先顺序：

1. 保持 `P8-007` changelog 作为后续新增产物的持续维护标准，暂不标完成。
2. 保持 `P8-008` electron-builder 打包配置作为后续构建产物的持续维护标准，暂不标完成。
3. 等用户按 `docs/final-acceptance-checklist.md` 完成统一手测；只修复实际失败项，并补最近的自动测试。当前结构巩固证据以 `docs/project-hardening-evidence.md` 为准。
4. 发布前再处理 `P8-009` Windows 安装包发布和 `P8-012` v1.0 总验收。

禁止继续在 `BrowserView` 上新增功能；不要重新把 Nowcoder 或 VJudge 接回通用 DOM verdict observer 作为实时入库来源。

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

### DOC-011 新增提交监测设计文档

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P5-013、P6-012
涉及模块：文档、adapters、submissions
目标：为七站提交监测建立长期设计说明，明确实时 hook、submit intent、站点差异、adapter 分层和手测流程。
验收标准：

- 存在 `docs/submission-monitoring-design.md`。
- `docs/README.md` 已把该文档加入索引和阅读规则。
- `SITE_ADAPTER_GUIDE.md` 已指向该文档。
- 文档说明不改变数据库 schema、IPC/Preload API、Cookie 策略。

建议提交：`docs: 添加提交监测设计说明`

### DOC-012 完善文档总索引

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：DOC-011、P8-015
涉及模块：文档
目标：把根目录、`docs/`、主进程模块、Renderer、测试和辅助历史材料统一收敛到 `docs/README.md`，让新 Agent 能从一个入口判断权威来源、阅读顺序和维护边界。
验收标准：

- `docs/README.md` 覆盖契约、任务、交接、设计、模块 README、调研、ADR、辅助与历史材料。
- 漏索引检查不再发现未归类的根目录 Markdown 文档。
- 根 `README.md` 指向 `docs/README.md`，不再维护第二份研发阶段状态。
- `AI_HANDOFF.md` 同步记录文档索引现状和后续维护规则。

完成记录：已补齐 `spec.md`、`checklist.md`、`release_notes.md`、`PROMPT.md`、`debug-cloudflare-turnstile-loop.md` 的索引分类；辅助和历史材料已明确不能覆盖 `PROJECT_RULES.md`、`TASKS.md`、`AI_HANDOFF.md`、设计文档或 ADR。

建议提交：`docs: 完善文档总索引`

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
- 明确 renderer 状态只保存 UI 状态和远端返回缓存，不存核心事实数据。

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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

状态：已完成  
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

### P5-011 升级 Electron 到最新稳定浏览器基线

状态：已完成
优先级：P0
阶段：Phase 5
前置任务：P5-010
涉及模块：electron、build、browser、db、cookies
目标：将 Electron 从 30.5.1 升级到最新稳定版 42.x，获得 Chromium 148 / Node.js 24 的现代浏览器能力。
验收标准：
- Electron 升级到 42.x 最新稳定版。
- 应用可正常启动。
- WebContentsView 正常加载网页。
- BrowserHost 导航、URL 监听、新窗口处理正常。
- persist:oj-main session 正常。
- CookieVault 正常。
- better-sqlite3 rebuild 后可正常读写。
- 现有 parser / tracking / submission 流程不回退。
- 文档记录新的 Electron 最低版本基线。

建议提交：`chore: 升级 Electron 到最新稳定版`

### P5-012 验证 Tampermonkey 与用户脚本能力

状态：已完成
优先级：P0
阶段：Phase 5
前置任务：P5-011
涉及模块：browser、extensions、settings、cookies
目标：验证 Electron 42.x 下 Tampermonkey / 用户脚本能力是否能满足 Codeforces 页面增强需求。
验收标准：
- 可加载 Tampermonkey 或测试扩展。
- 可在 Codeforces 页面运行测试脚本。
- 脚本数据可随 session 保留。
- 不破坏 CookieVault、站点识别、提交同步。
- 文档记录 Electron 扩展支持限制。
- 如果 Tampermonkey 兼容性不足，明确是否改做内置用户脚本系统。

建议提交：`feat: 验证 Tampermonkey 用户脚本能力`

### P5-013 多标签页重构与 Chrome 级 UI

状态：已完成
优先级：P0
阶段：Phase 5
前置任务：P5-011
涉及模块：browser, renderer/features/browser, TabManager
目标：重构 BrowserHost 支持多标签页，实现类似 Chrome 的标签页栏，并支持拖拽为独立窗口。
验收标准：
- 支持同时开启多个页面，并通过标签页切换。
- 支持新开标签页默认加载首页。
- 支持从标签页剥离出独立窗口。
- 修复并验证 Codeforces 的 redirect 导航对跟踪和数据库的副作用。

建议提交：`feat: 实现多标签页重构与独立窗口支持`

## 9. Phase 6：AI 辅助学习任务

### P6-001 建立本地题解 Markdown 系统

状态：已完成  
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

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P6-001  
涉及模块：renderer/features/problems、notes  
目标：在题目详情页展示和编辑本地笔记入口。  
验收标准：

- 可创建、打开、重命名笔记。
- UI 清楚区分本地笔记和 AI 生成内容。

实现说明：经用户反馈，笔记入口从详情页内嵌改为独立浮层——题目列表每行「⋯」详情按钮左侧新增「✎」笔记按钮，点击打开独立弹窗面板。编辑器采用 @milkdown/crepe 所见即所得 Markdown 编辑器（输入 `## ` 自动渲染为二级标题），内置 400ms 防抖自动保存。notes 表新增 content/word_count 缓存字段（migration 011），文件与 DB 双存。

建议提交：`feat: 笔记独立浮层 + milkdown 所见即所得编辑器`

### P6-003 提交记录关联代码片段或文件路径

状态：已撤销（用户反馈手动维护成本高，AI 模块不依赖此表）  
优先级：P2  
阶段：Phase 6  
前置任务：P2-018、P6-001  
涉及模块：submissions、notes、db  
目标：允许提交记录关联本地代码片段或文件路径。  
验收标准：

- 可保存代码语言、摘要、文件路径。
- 不强制复制用户本地代码。
- 路径失效时有明确提示。

撤销说明：原 migration 012 建表 `submission_code_snippets` 已由 migration 013 物理删除。`codeSnippetRepository.ts`、IPC（snippets:*）、ProblemDetail 代码片段 UI、preload/electron-env.d.ts 接口、App.css 中 `.snippet-*` 样式均已移除。AI 上下文导出层（P6-004）直接读取原始 submissions 表，不受影响。

建议提交：`chore: 移除 P6-003 代码片段管理功能`

### P6-004 建立 AI 上下文导出层

状态：已完成  
优先级：P0  
阶段：Phase 6  
前置任务：P3-015、P6-001  
涉及模块：ai/context、analytics、ARCHITECTURE.md  
目标：把本地学习数据整理成可供 AI 使用的上下文。  
验收标准：

- 只导出必要学习数据。
- 默认不导出 Cookie、敏感路径和无关日志。
- 导出结构有版本号。

实现：`ai/contextExporter.ts` 聚合概览/趋势/错题/待复习/标签维度/活动，schema_version=1，严格剥离 Cookie/绝对路径/日志；提供 JSON 与 Markdown 双格式导出。

扩展（每日快照，migration 014）：新增 `ai_context_snapshots` 表，应用启动时自动调用 `ensureTodaySnapshot()` 生成当日快照存库，供 AI 模块按需消费历史轨迹。日期键使用 `todayBeijing()` 保证时区一致。repository：`aiContextSnapshotRepository.ts`，提供 ensureTodaySnapshot/getSnapshotByDate/listSnapshots。

建议提交：`feat: 添加 AI 上下文导出层 + 每日快照`

### P6-005 实现错题复习建议

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P3-013、P6-004  
涉及模块：ai/recommendations、analytics  
目标：基于错题和提交记录生成复习建议。  
验收标准：

- 推荐结果可追溯到具体题目和提交。
- AI 建议不直接修改题目状态。

实现：`ai/recommendations/reviewRecommender.ts` 本地规则引擎，评分维度=错误次数×8 + 遗忘风险(0.5/天上限25) + 访问重视(5/次上限15)；结果携带 `source` 字段（wrong_count/last_attempt/days_since/visit_count），纯只读不写库；Dashboard 渲染复习建议卡片。

建议提交：`feat: 生成错题复习建议`

### P6-006 实现薄弱标签分析

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P2-006、P3-015、P6-004  
涉及模块：ai/recommendations、analytics  
目标：分析用户在不同标签上的薄弱点。  
验收标准：

- 结合 AC 率、错误次数、停留时长。
- 结果解释使用本地统计依据。

实现：`ai/recommendations/weaknessAnalyzer.ts` 本地规则引擎，评分维度=(100-AC率)×0.5 + 错误提交×0.5(上限25) + 停留时长×0.01(上限25)；仅统计题量≥2 的标签；无标签数据时降级提示；Dashboard 渲染薄弱标签卡片。

建议提交：`feat: 分析薄弱算法标签`

### P6-007 实现阶段学习总结

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P3-015、P6-004  
涉及模块：ai/summary、analytics  
目标：按周、月或自定义周期生成学习总结。  
验收标准：

- 总结包含学习量、平台分布、AC、薄弱点。
- 用户可保存总结。

实现：`electron/ai/summary/periodSummary.ts` 基于 `ai_context_snapshots` 快照聚合周期统计，支持周/月/自定义日期范围，含与上一周期对比和可追溯依据。IPC: `ai:getPeriodSummary`、`ai:getPeriodSummaryMarkdown`。

建议提交：`feat: 生成阶段学习总结`

### P6-008 实现复习计划生成

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P6-005、P6-006、P6-007  
涉及模块：ai/planner、analytics  
目标：基于学习数据生成短期复习计划。  
验收标准：

- 计划能关联具体题目和标签。
- 用户可接受、忽略或调整计划。

实现：`electron/ai/recommendations/reviewPlanner.ts` 融合复习建议（P6-005）+ 薄弱标签（P6-006）生成短期复习计划，按优先级排序，含预估时间和可追溯依据。IPC: `ai:getReviewPlan`、`ai:getReviewPlanMarkdown`。

建议提交：`feat: 生成算法复习计划`

### P6-009 实现 AI 输出本地保存

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P6-005、P6-007、P6-008  
涉及模块：ai/storage、db、notes  
目标：保存 AI 建议、总结和计划。  
验收标准：

- AI 输出和核心数据分表或分目录存储。
- 每条 AI 输出保留生成时间、输入摘要和版本。

实现：migration 015 建 `ai_outputs` 表（与核心表完全隔离）；`electron/db/repositories/aiOutputRepository.ts` 提供 CRUD；IPC: `ai:saveOutput`、`ai:getOutput`、`ai:listOutputs`、`ai:deleteOutput`、`ai:updateOutput`。每条输出含 `output_type`、`content`、`content_markdown`、`input_summary_json`、`source_refs_json`、`model_info_json`。

建议提交：`feat: 保存 AI 学习建议`

### P6-010 限制 AI 修改核心数据

状态：已完成  
优先级：P0  
阶段：Phase 6  
前置任务：P6-004  
涉及模块：ai、PROJECT_RULES.md、ARCHITECTURE.md  
目标：明确 AI 只能建议，不能直接污染核心学习数据。  
验收标准：

- AI 输出必须写入独立区域。
- 修改题目状态、提交记录、Rating 必须由用户操作或确定性同步逻辑完成。
- 文档明确该边界。

实现：PROJECT_RULES.md 新增 3.6「AI 数据写入边界」条款（只读区/核心禁写/输出区/敏感隔离/本地优先/可追溯）；ARCHITECTURE.md 第 13 节扩展为模块结构 + 可以/不可以 + 可追溯性三小节，列出具体模块路径与禁止表。

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

### P6-012 接入洛谷默认站点配置与识别逻辑

状态：已完成  
优先级：P1  
阶段：Phase 6  
前置任务：P5-013  
涉及模块：sites/builtins、parsers/sites/luogu、submissions/scrapers、SITE_ADAPTER_GUIDE.md  
目标：为洛谷添加默认站点配置、URL识别及抓取逻辑。  
验收标准：

- 洛谷出现在内置站点列表并正确展示颜色和标签。
- 识别洛谷题目页面 URL，正确剥离标题前缀和标签。
- 支持洛谷提交记录 DOM 抓取，适应 Vue SPA 的 `_contentOnly=1` 数据刷新机制。
- 更新 SITE_ADAPTER_GUIDE.md 文档。

建议提交：`feat: 接入洛谷站点配置与适配逻辑`

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

状态：已完成
优先级：P0  
阶段：Phase 8  
前置任务：P1-001  
涉及模块：tooling、tsconfig、eslint  
目标：提高长期代码质量检查强度。  
验收标准：

- `npm run lint` 可稳定运行。
- TypeScript strict 不被关闭。
- 规则不与项目技术栈冲突。

完成记录：`npm run lint` 已可稳定运行；`tsconfig.json` 继续保持 `strict`、`noUnusedLocals`、`noUnusedParameters`；ESLint 保留 recommended、React hooks 和 `--max-warnings 0`，但对历史 DB row、网络 payload、测试 mock 等动态边界关闭 `@typescript-eslint/no-explicit-any`，避免规则与现有技术栈冲突。

建议提交：`chore: 完善代码检查配置`

### P8-002 增加 parser 单元测试

状态：已完成
优先级：P0  
阶段：Phase 8  
前置任务：P1-018、P1-019、P1-020、P1-021、P5-007  
涉及模块：tests/parsers  
目标：覆盖 URL 识别和题目身份解析。  
验收标准：

- 每个内置站点有有效和无效 URL 样例。
- 测试不依赖网络。
- 失败信息能定位站点规则。

完成记录：`tests/parsers/siteRules.test.ts` 已覆盖 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode CN 的有效/无效 URL 样例；每站补充关键 `platformProblemId`、`canonicalUrl`、`contestId`、`problemIndex` 或来源题号断言。

建议提交：`test: 添加 URL 解析单元测试`

### P8-003 增加数据库 repository 测试

状态：已完成
优先级：P0  
阶段：Phase 8  
前置任务：P1-030、P2-007、P3-001  
涉及模块：tests/db  
目标：测试数据库读写、upsert、迁移和约束。  
验收标准：

- 使用临时测试数据库。
- 覆盖重复题目、重复提交、聚合表写入。
- 不污染用户真实数据。

完成记录：新增 `tests/db/repositories.test.ts`，通过 `initDbAtPath()` 为每个用例创建独立临时 SQLite 数据库，覆盖迁移落库、题目 upsert 去重、提交 upsert 去重、唯一约束、首次 AC 更新和 `user_daily_stats` 聚合写入。由于 `better-sqlite3` 按 Electron ABI 编译，真实 DB 测试需 bundle 后用 `ELECTRON_RUN_AS_NODE=1` 的 Electron Node 执行。

建议提交：`test: 添加数据库仓储测试`

### P8-004 增加 IPC contract 测试

状态：已完成
优先级：P1  
阶段：Phase 8  
前置任务：P0-005、P1-023、P1-031  
涉及模块：tests/ipc、preload、ipc  
目标：验证 IPC channel 参数和返回值稳定。  
验收标准：

- 覆盖 browser、problem、tracking、settings 核心 channel。
- Renderer 无法调用未暴露 channel。

完成记录：新增 `tests/ipc/ipcContracts.test.ts`，静态验证 preload 核心 browser/problem/tracking/settings 方法到固定 channel 的映射、所有公开 send/invoke channel 均有主进程 handler、事件订阅 channel 有主进程发送源，并确认 preload 不暴露通用 `ipcRenderer`、不使用动态 channel、不给 renderer 暴露内部 `problem:detected` / `submissions:detected` / `oj-submission:detected` channel。

建议提交：`test: 添加 IPC 契约测试`

### P8-005 增加 Electron 启动 smoke test

状态：已完成
优先级：P1  
阶段：Phase 8  
前置任务：P1-003、P1-004  
涉及模块：tests/electron  
目标：验证应用能启动并加载默认页面。  
验收标准：

- 启动后主窗口存在。
- WebContentsView 加载默认 URL。
- 基础 IPC 可用。

完成记录：新增 `tests/electron/startupSmoke.test.ts`，测试脚本 bundle 真实 `electron/main.ts`、renderer preload 和 OJ preload，使用临时 `userData` 启动 Electron。Smoke 模式验证主窗口存在、preload `electronAPI` 可用、`getDefaultHomeUrl` 基础 IPC 返回临时默认 URL，并通过 `createTab(defaultUrl)` 让 WebContentsView 加载默认 URL 页面。生产启动行为不变，smoke 专用逻辑仅由 `ALGO_ELECTRON_SMOKE=1` 触发。

建议提交：`test: 添加 Electron 启动冒烟测试`

### P8-006 增加关键页面截图验收

状态：已完成
优先级：P2  
阶段：Phase 8  
前置任务：P1-032、P3-015、P5-001  
涉及模块：tests/ui、renderer  
目标：对核心 UI 页面进行视觉回归检查。  
验收标准：

- 覆盖题库侧栏、统计页、设置页。
- 截图不包含敏感 Cookie。
- 断言关键容器不横向越界，统计页平台分布图表必须实际渲染图形。

完成记录：新增 `tests/ui/rendererScreenshotHarness.tsx` 和 `tests/ui/rendererScreenshots.test.ts`。测试 bundle 真实 renderer 组件和 CSS，注入 mock `window.electronAPI`，用 Electron 捕获题库侧栏、统计页、设置页三张截图到 `tmp/ui-screenshots/`；截图前扫描页面文本，拒绝 `Cookie`、`Set-Cookie`、`sessionid`、`csrf`、`token` 等敏感字段，并校验图片尺寸、大小、关键容器横向边界和统计页平台分布 SVG 图形，避免空白图、裁切图或图表未绘制误通过。

建议提交：`test: 添加关键页面截图验收`

### P8-007 建立 changelog

状态：进行中
优先级：P1  
阶段：Phase 8  
前置任务：无  
涉及模块：文档  
目标：记录用户可见变化。  
验收标准：

- 建立 `CHANGELOG.md`。
- 按版本记录新增、修复、变更。
- 提交信息仍使用中文。

当前进展：已新增根目录 `CHANGELOG.md`，按“未发布 / 0.6.0 / 0.5.0”记录新增、变更和修复；`docs/README.md` 已加入正式 changelog 入口，并将 `release_notes.md` 标为历史版本说明草稿。该任务作为后续新增产物的持续标准，暂不标记为完成。

建议提交：`docs: 添加更新日志`

### P8-008 配置 electron-builder 打包

状态：进行中
优先级：P0  
阶段：Phase 8  
前置任务：P8-001、P8-005  
涉及模块：build、electron-builder  
目标：完善 Windows 打包配置。  
验收标准：

- 能生成 Windows 安装包。
- 应用图标、名称、输出目录合理。
- 打包不包含开发缓存和敏感数据。

当前进展：`electron-builder.json5` 已显式配置 `buildResources`、Windows `icon.ico`、NSIS x64 artifact 名称、输入白名单和 `better-sqlite3` 原生模块 `asarUnpack`；新增 `build/icon.ico`、`build/icon.png` 和 `npm run build:win`。已运行 `npm run build:win` 生成 `release/0.6.0/AlgoLearningPlatform-Windows-0.6.0-x64-Setup.exe`，并检查 asar 不包含 `tests/`、`tmp/`、`release/`、本地数据库或 `.env`。该任务作为后续新增构建产物的持续标准，暂不标记为完成。

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

状态：已完成
优先级：P1  
阶段：Phase 8  
前置任务：P1-040、P2-022、P3-017  
涉及模块：docs  
目标：记录登录失败、Cookie 失效、数据库损坏、同步失败等处理方法。  
验收标准：

- 新用户和 Agent 都能按文档定位常见问题。
- 不要求用户查看源码才能恢复。

完成记录：已新增 `docs/troubleshooting.md`，覆盖登录/Cookie、页面加载、提交监测、重复/错误提交、手动同步、数据库损坏、笔记图片、用户脚本、统计页和打包安装常见问题；已同步 `docs/README.md`、`AI_HANDOFF.md` 和 `docs/project-hardening-audit.md`。

建议提交：`docs: 添加故障排查文档`

### P8-011 建立数据迁移回滚文档

状态：已完成
优先级：P0  
阶段：Phase 8  
前置任务：P0-006、P7-003  
涉及模块：docs、db  
目标：说明数据库迁移失败和回滚策略。  
验收标准：

- 明确备份、迁移、失败恢复步骤。
- 每次 schema 变更都能挂靠该策略。

完成记录：已新增 `docs/database-migration-rollback.md`，说明 SQLite 数据文件、升级前备份、迁移失败识别、用户恢复、开发者定位、已发布版本回滚策略、新 migration 编写规则、数据修复 migration 和验证命令；已同步 `docs/README.md`、`AI_HANDOFF.md` 和 `docs/project-hardening-audit.md`。

建议提交：`docs: 添加数据库迁移回滚说明`

### P8-012 完成 v1.0 发布验收

状态：未开始  
优先级：P0  
阶段：Phase 8  
前置任务：P8-001 到 P8-011、P8-013、P8-014、P8-015、P8-016、P8-017、P8-018、P8-019、P8-020、P8-021、P8-022、P8-023、P8-024、P8-025、P8-026、P8-027、P8-028、P8-029、P8-030、P8-031、P8-032、P8-033、P8-034、P8-035、P8-036、P8-037、P8-038、P8-039
涉及模块：全项目、文档  
目标：完成 v1.0 发布前总验收。  
验收标准：

- Phase 1 到 Phase 8 的 P0 任务全部完成。
- 核心数据可备份恢复。
- 桌面端可稳定刷题、记录、分析。
- 文档和交接文件完整。

建议提交：`chore: 完成 v1.0 发布验收`

### P8-013 提交监测与站点 adapter 标准化

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：DOC-011、P5-013、P6-012
涉及模块：adapters、submissions、tests、文档
目标：把七站提交监测从零散站点逻辑整理为可测试、可交接、按职责拆分的 adapter 结构，并保留已手测通过的实时监测行为。
验收标准：

- `electron/adapters/registry.ts` 只负责注册和查找，不承载站点细节。
- 内置站点按 `adapters/sites/{site}/` 拆分 `index.ts`、`problem.ts`、必要的 `submissions.ts`/`tables.ts`/`urls.ts`。
- Nowcoder、VJudge 等高风险站点不依赖通用 DOM 文本作为实时入库来源。
- 提交监测行为变化有 adapter、submission core 或 scraper 测试。
- `docs/submission-monitoring-design.md`、`SITE_ADAPTER_GUIDE.md`、`AI_HANDOFF.md` 同步更新。

完成记录：registry 已改为消费 `builtinSiteAdapters`；Codeforces、AcWing、Nowcoder、VJudge、PTA、洛谷、LeetCode 已完成第一轮目录拆分；AcWing、PTA、VJudge 与洛谷提交解析已拆到 `submissions.ts`；Codeforces、Nowcoder、VJudge 与 LeetCode 实时 hook 已拆到 `hook.ts`；已新增 `electron/adapters/README.md`、`electron/submissions/README.md` 模块文档；七站已按手测通过收口，自动验证已覆盖 TypeScript、adapter 测试、submissions 测试和 diff 检查。

建议提交：`refactor: 标准化提交监测 adapter 结构`

### P8-014 主进程模块文档与边界标准化

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-013
涉及模块：electron 主进程模块、文档
目标：为主进程核心模块补齐模块级 README，说明职责边界、当前实现程度、关键封装函数、测试入口和禁止跨越的架构边界。
验收标准：

- `electron/adapters/README.md` 说明站点 adapter 职责、目录模型、实现程度、共享 helper 和测试入口。
- `electron/submissions/README.md` 说明提交采集写入链路、实时监听、手动同步、scraper、写入规则和测试入口。
- `electron/browser/README.md` 说明 TabManager、WebContentsView、preload 提交桥、反检测脚本和 BrowserHost 状态。
- `electron/db/README.md` 说明 SQLite 连接、迁移系统、repository 分层、写入规则和测试入口。
- `electron/ai/README.md`、`electron/tracking/README.md`、`electron/notes/README.md`、`electron/sites/README.md`、`electron/parsers/README.md`、`electron/rating/README.md`、`electron/cookies/README.md`、`electron/scripts/README.md`、`electron/app/README.md`、`electron/shared/README.md` 覆盖对应模块职责和边界。
- `docs/README.md` 索引所有模块级文档。
- `AI_HANDOFF.md` 同步当前模块文档覆盖范围和剩余缺口。

完成记录：主进程 `electron/` 下核心目录已补模块 README，并加入 `docs/README.md` 索引；覆盖 `adapters`、`ai`、`app`、`browser`、`cookies`、`db`、`notes`、`parsers`、`rating`、`scripts`、`shared`、`sites`、`submissions`、`tracking`。

建议提交：`docs: 补齐主进程核心模块说明`

### P8-015 Renderer、测试与构建层文档标准化

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-014
涉及模块：src、tests、构建脚本、文档
目标：继续补齐非主进程区域的模块级文档，说明 renderer 页面/组件分层、测试目录职责、构建脚本入口和验证命令。
验收标准：

- Renderer 主要目录有 README，说明页面、组件、状态、API 调用边界。
- `tests/` 有 README，说明 adapter、browser、db、integration、parsers、submissions 测试覆盖范围和运行方式。
- 构建/脚本相关目录或配置有文档入口，说明开发、测试、打包命令。
- `docs/README.md` 和 `AI_HANDOFF.md` 同步索引与剩余缺口。

完成记录：已补 `algo-electron/README.md`、`src/README.md`、`src/components/README.md`、`src/features/README.md`、`tests/README.md`，并加入 `docs/README.md` 索引。构建入口、renderer IPC 边界、组件/feature 分层、测试目录覆盖和运行方式已文档化。

建议提交：`docs: 补齐 renderer 和测试层说明`

### P8-016 Renderer 结构分离审计与后续重构

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-015
涉及模块：src、electron/preload、electron/electron-env.d.ts、文档
目标：在文档覆盖完成后，对 renderer 结构做实际分离审计，收敛 `App.tsx`、大型 feature 组件、重复平台常量和 IPC 类型散落问题。
验收标准：

- 输出 renderer 结构审计结论，列出需要拆分的组件、hooks、常量和 API helper。
- 对低风险项完成实际拆分，避免继续膨胀 `App.tsx` 和单个大型 feature。
- 抽出的 hooks/helper 有明确文件归属和 README 更新。
- TypeScript 和相关测试通过。

完成记录：已新增 `docs/renderer-structure-audit.md` 输出 renderer 结构审计结论；已抽取 `src/shared/display.ts` 和 `src/shared/README.md`，集中平台名称、短标签、首页 URL、颜色、状态文案、verdict 颜色和图表颜色；已替换 HomePage、Dashboard、SettingsPage、ProblemDetail、ProblemSidebar 中的重复展示常量；已同步 `src/README.md`、`src/features/README.md`、`docs/README.md`。

建议提交：`refactor: 梳理 renderer 模块结构`

### P8-017 Renderer 大型 feature 组件拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-016
涉及模块：src/features、src/components、src/shared、文档
目标：按 `docs/renderer-structure-audit.md` 的顺序继续拆分大型 renderer feature，降低 `SettingsPage.tsx`、`Dashboard.tsx`、`NotePanelModal.tsx` 等文件复杂度。
验收标准：

- `SettingsPage.tsx` 至少拆出实时提交诊断、站点管理或同步面板之一。
- `Dashboard.tsx` 至少拆出趋势图、AI 建议、Rating 面板或列表面板之一。
- 抽出的组件只接收 props，不直接复制大段业务状态。
- README 和审计文档同步更新完成进展。
- TypeScript 通过，相关页面手测入口明确。

完成记录：已从 `SettingsPage.tsx` 抽出 `RealtimeSubmissionPanel.tsx`，设置页只保留实时诊断状态加载和刷新函数；已从 `Dashboard.tsx` 抽出 `TrendPanel.tsx`，统计页只保留趋势数据加载和范围状态。新增组件只通过 props 接收数据与回调，不引入新的 IPC/Preload API，不触碰数据库、Cookie 或提交监测逻辑。已同步 `src/features/README.md` 与 `docs/renderer-structure-audit.md`，后续可继续拆 `SiteManagementPanel`、AI 建议卡片、Rating 面板和笔记弹层。

建议提交：`refactor: 拆分 renderer 大型 feature`

### P8-018 Renderer 大型 feature 二轮拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-017
涉及模块：src/features/analytics、文档
目标：继续降低 `Dashboard.tsx` 的展示复杂度，把 AI 建议展示区从统计页主容器中分离出来，为后续 Rating、平台分布和列表面板拆分留下清晰路径。
验收标准：

- `Dashboard.tsx` 不再内联复习建议和薄弱标签两组展示 JSX。
- 新组件只接收已加载数据和导航回调，不直接调用 `window.electronAPI`。
- README、renderer 审计文档和 `AI_HANDOFF.md` 同步记录拆分范围。
- TypeScript 通过，相关页面手测入口明确。

完成记录：已新增 `src/features/analytics/AiSuggestionsPanel.tsx`，承接复习建议和薄弱标签展示；`Dashboard.tsx` 继续负责调用 AI 本地规则 IPC、失败降级和状态管理。组件边界保持为 props 输入，不改变 AI 规则、数据库、IPC/Preload API 或提交监测逻辑。

建议提交：`refactor: 拆分 Dashboard AI 建议面板`

### P8-019 Settings 站点管理面板拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-017
涉及模块：src/features/settings、文档
目标：继续降低 `SettingsPage.tsx` 的职责密度，把站点启停、删除、导入导出和自定义站点表单收敛到独立 settings 面板。
验收标准：

- `SettingsPage.tsx` 不再持有站点列表、导入预览、自定义站点表单等状态。
- `SiteManagementPanel.tsx` 独立负责站点管理 UI 和现有 sites IPC 调用。
- 不新增 IPC/Preload API，不改变站点配置导入导出格式。
- README、renderer 审计文档和 `AI_HANDOFF.md` 同步记录拆分范围。
- TypeScript 通过，设置页手测入口明确。

完成记录：已新增 `src/features/settings/SiteManagementPanel.tsx`，承接站点列表加载、启停、删除、导入导出、自定义站点创建和导入冲突勾选；`SettingsPage.tsx` 只保留默认首页、学习概览、Codeforces 同步、rating 同步、实时监听诊断和平台分布。组件复用现有 `window.electronAPI` sites 能力，不触碰数据库 schema、IPC/Preload API、Cookie 或提交监测逻辑。

建议提交：`refactor: 拆分设置页站点管理面板`

### P8-020 用户脚本管理器组件拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-016
涉及模块：src/features/scripts、文档
目标：降低 `UserScriptManager.tsx` 复杂度，把脚本列表、脚本编辑表单和本 feature 内部类型拆分到独立文件，保持用户脚本导入、启停、站点绑定和删除行为不变。
验收标准：

- `UserScriptManager.tsx` 只负责加载数据、调用现有 scripts IPC 和维护当前编辑状态。
- `UserScriptEditor.tsx` 负责脚本名称、路径和站点绑定编辑 UI。
- `UserScriptList.tsx` 负责脚本列表、启停、配置、删除和空状态展示。
- `types.ts` 收敛脚本和站点展示类型，减少 `Record<string, unknown>` 在 JSX 中散落。
- 不新增 IPC/Preload API，不改变脚本文件存储、导入、注入或站点匹配策略。
- TypeScript 通过，脚本管理入口手测范围明确。

完成记录：已新增 `src/features/scripts/types.ts`、`UserScriptEditor.tsx`、`UserScriptList.tsx`；`UserScriptManager.tsx` 保留 `scriptsGetAll`、`scriptsImportFile`、`scriptsSave`、`scriptsToggle`、`scriptsDelete`、`scriptsOpenFolder` 调用和编辑状态编排，子组件只通过 props 接收数据与回调。

建议提交：`refactor: 拆分用户脚本管理器`

### P8-021 笔记弹层组件拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-016
涉及模块：src/features/problems、文档
目标：降低 `NotePanelModal.tsx` 复杂度，把笔记列表、编辑区和笔记展示常量拆分到独立文件，保持 Markdown 编辑、图片上传、标题防抖保存和笔记文件策略不变。
验收标准：

- `NotePanelModal.tsx` 只负责 notes IPC 调用、当前笔记状态、标题 flush、内容保存、类型更新、删除和打开目录编排。
- `NoteList.tsx` 负责笔记列表、空状态、选中状态、类型标签和删除按钮展示。
- `NoteEditorPane.tsx` 负责标题输入、类型选择、保存状态和 `MilkdownEditor` 承载。
- `notesTypes.ts` 收敛 `NoteItem` 类型和笔记类型展示常量。
- 不新增 IPC/Preload API，不改变 notes 表、Markdown 文件保存、图片上传或防抖保存策略。
- TypeScript 通过，笔记弹层手测范围明确。

完成记录：已新增 `src/features/problems/notesTypes.ts`、`NoteList.tsx`、`NoteEditorPane.tsx`；`NotePanelModal.tsx` 保留数据加载、标题防抖 flush、内容保存、类型切换、删除和打开目录逻辑，子组件只通过 props 接收数据与回调。

建议提交：`refactor: 拆分笔记弹层组件`

### P8-022 Dashboard 图表面板拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-018
涉及模块：src/features/analytics、文档
目标：继续降低 `Dashboard.tsx` 的图表展示复杂度，把平台分布图和 Codeforces Rating 面板拆分成独立展示组件。
验收标准：

- `Dashboard.tsx` 不再直接引入 Recharts 图表组件。
- `PlatformDistributionPanel.tsx` 负责平台分布饼图、柱状图和平台展示映射。
- `RatingPanel.tsx` 负责 Codeforces rating badges、rating 曲线和最近比赛列表。
- `Dashboard.tsx` 继续负责统计、rating 数据加载和页面级状态编排。
- 不新增 IPC/Preload API，不改变统计或 rating 数据口径。
- TypeScript 通过，统计页手测范围明确。

完成记录：已新增 `src/features/analytics/PlatformDistributionPanel.tsx` 和 `RatingPanel.tsx`；`Dashboard.tsx` 移除 Recharts 直接依赖，只把 `stats.platformDistribution`、`cfAccount` 和 `ratingHistory` 传给展示面板。

建议提交：`refactor: 拆分 Dashboard 图表面板`

### P8-023 站点管理面板内部拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-019
涉及模块：src/features/settings、文档
目标：继续降低 `SiteManagementPanel.tsx` 的职责密度，把自定义站点添加表单、导入预览和站点管理展示类型拆分到独立文件。
验收标准：

- `SiteManagementPanel.tsx` 不再内联自定义站点添加表单 JSX。
- `SiteManagementPanel.tsx` 不再内联导入预览 JSX。
- `AddSiteForm.tsx` 只负责自定义站点表单展示和字段变更回调。
- `ImportPreviewPanel.tsx` 只负责导入预览、冲突覆盖勾选和确认/取消回调。
- `siteManagementTypes.ts` 收敛站点列表、导入预览和新站点草稿类型。
- 不新增 IPC/Preload API，不改变站点配置导入导出格式或站点启停/删除行为。
- TypeScript 通过，设置页站点管理手测范围明确。

完成记录：已新增 `src/features/settings/AddSiteForm.tsx`、`ImportPreviewPanel.tsx` 和 `siteManagementTypes.ts`；`SiteManagementPanel.tsx` 保留 sites IPC 调用、导入导出流程、站点创建校验、站点刷新和启停/删除编排。

建议提交：`refactor: 拆分站点管理内部面板`

### P8-024 Dashboard 列表面板拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-022
涉及模块：src/features/analytics、文档
目标：继续降低 `Dashboard.tsx` 的展示复杂度，把学习轨迹、错题、未复习和复访最多四组列表抽成独立展示面板，并收敛列表项展示类型。
验收标准：

- `Dashboard.tsx` 不再内联学习轨迹、错题、未复习和复访最多列表 JSX。
- `DashboardListsPanel.tsx` 负责四组列表展示、时间格式化、平台名称映射和空状态。
- 列表数据类型在 analytics feature 内部收敛，减少 `any` 在 Dashboard 列表 JSX 中散落。
- 不新增 IPC/Preload API，不改变统计、复习、错题或复访数据口径。
- TypeScript 通过，统计页手测范围明确。

完成记录：已新增 `src/features/analytics/DashboardListsPanel.tsx`；`Dashboard.tsx` 保留 `getTimeline`、`getWrongProblems`、`getUnreviewedProblems`、`getRevisitStats` 数据加载和页面级状态编排，只向列表面板传递 props。

建议提交：`refactor: 拆分 Dashboard 列表面板`

### P8-025 设置页首页与同步面板拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-019、P8-023
涉及模块：src/features/settings、文档
目标：继续降低 `SettingsPage.tsx` 的职责密度，把默认首页、学习概览、平台分布、Codeforces 提交同步和 Rating 同步从设置页主容器中拆出。
验收标准：

- `SettingsPage.tsx` 不再内联默认首页保存表单、学习概览卡片、平台分布列表、Codeforces Rating 同步和 Codeforces 提交同步 JSX。
- `DefaultHomePanel.tsx` 独立负责默认首页读取、保存和保存提示状态。
- `LearningOverviewPanel.tsx` 和 `PlatformDistributionSummary.tsx` 只负责统计展示和空状态。
- `CodeforcesSyncPanel.tsx` 独立负责 Codeforces 提交同步、Rating 同步、账号读取和同步状态提示。
- 不新增 IPC/Preload API，不改变默认首页配置、提交同步、rating 同步或统计数据口径。
- TypeScript 通过，设置页手测范围明确。

完成记录：已新增 `src/features/settings/DefaultHomePanel.tsx`、`LearningOverviewPanel.tsx`、`PlatformDistributionSummary.tsx` 和 `CodeforcesSyncPanel.tsx`；`SettingsPage.tsx` 保留页面布局、`getOverviewStats` 刷新和实时监听诊断刷新。

建议提交：`refactor: 拆分设置页同步面板`

### P8-026 笔记标题保存 hook 拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-021
涉及模块：src/features/problems、文档
目标：继续降低 `NotePanelModal.tsx` 的状态机复杂度，把标题防抖保存、切换前 flush、卸载 flush 和删除时清理 pending 标题的逻辑抽成 feature 内部 hook。
验收标准：

- `NotePanelModal.tsx` 不再直接维护标题保存 timer、pending title ref 或卸载 flush effect。
- `useDebouncedNoteTitleSave.ts` 负责标题 600ms 防抖保存、手动 flush、卸载 flush 和按笔记清理 pending 标题。
- 保留关闭弹层、切换笔记、新建笔记时不丢失最近标题修改的行为。
- 不新增 IPC/Preload API，不改变 notes 表、Markdown 文件保存、内容保存或图片上传策略。
- TypeScript 通过，笔记弹层手测范围明确。

完成记录：已新增 `src/features/problems/useDebouncedNoteTitleSave.ts`；`NotePanelModal.tsx` 保留 notes IPC 调用、当前笔记状态、内容保存、类型更新、删除和打开目录编排，标题保存状态机由 hook 封装。

建议提交：`refactor: 抽出笔记标题保存 hook`

### P8-027 App 浏览器工具栏拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-016、P8-026
涉及模块：src/App.tsx、src/components、文档
目标：降低 `App.tsx` 壳层 JSX 密度，把顶部浏览器工具栏抽成共享 UI 组件，让 App 只保留 URL 状态、导航回调、当前页同步和全局面板打开编排。
验收标准：

- `App.tsx` 不再内联浏览器工具栏 JSX。
- `BrowserToolbar.tsx` 负责首页、前进后退、刷新、地址栏、当前页提交抓取和设置/统计/脚本入口展示。
- `BrowserToolbar.tsx` 通过 props 接收所有回调，不直接查询题目、提交、统计、Cookie 或数据库。
- 不新增 IPC/Preload API，不改变导航、当前页提交抓取、设置/统计/脚本入口行为。
- TypeScript 通过，浏览器工具栏手测范围明确。

完成记录：已新增 `src/components/BrowserToolbar.tsx`；`App.tsx` 保留 `url`、`syncMsg`、导航/同步函数、modal 打开函数和 `WebContentsView` 显隐编排。

建议提交：`refactor: 拆分 App 浏览器工具栏`

### P8-028 App modal 状态 hook 拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-027
涉及模块：src/App.tsx、src/hooks、文档
目标：继续降低 `App.tsx` 壳层状态复杂度，把设置、统计、脚本、题目详情、笔记弹层的开关状态和浏览器预览背景管理抽成应用级 hook。
验收标准：

- `App.tsx` 不再直接维护 `showSettings`、`showDashboard`、`showScripts`、`selectedProblemId`、`notesProblemId` 和 `modalBackdrop` 状态。
- `useAppModalState.ts` 负责打开 modal 前捕获浏览器预览、隐藏真实 `WebContentsView`、关闭 modal 时清理背景并恢复 view。
- 保持设置、统计、脚本、题目详情、笔记弹层打开/关闭行为不变。
- `src/hooks/README.md` 说明 hooks 目录职责、当前实现和边界。
- 不新增 IPC/Preload API，不改变导航、modal 内容、提交同步、题目详情或笔记行为。
- TypeScript 通过，modal 与浏览器 view 显隐手测范围明确。

完成记录：已新增 `src/hooks/useAppModalState.ts` 和 `src/hooks/README.md`；`App.tsx` 保留 URL、首页状态、当前页同步、侧栏宽度和 modal 渲染接线。

建议提交：`refactor: 抽出 App modal 状态 hook`

### P8-029 App 浏览器视图显隐 hook 拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-028
涉及模块：src/App.tsx、src/hooks、文档
目标：继续降低 `App.tsx` 壳层副作用密度，把首页状态和 modal 预览背景驱动的 `WebContentsView` 显隐逻辑抽成应用级 hook。
验收标准：

- `App.tsx` 不再直接维护 `hideView` / `showView` 的 `useEffect`。
- `useBrowserViewVisibility.ts` 负责首页隐藏浏览器 view、非首页且没有 modal 背景时恢复浏览器 view。
- 保持首页、普通网页、打开 modal、关闭 modal 的浏览器 view 显隐行为不变。
- `src/hooks/README.md` 说明该 hook 的职责和边界。
- 不新增 IPC/Preload API，不改变导航、modal 内容、提交同步、题目详情或笔记行为。
- TypeScript 通过，首页/网页/modal view 显隐手测范围明确。

完成记录：已新增 `src/hooks/useBrowserViewVisibility.ts`；`App.tsx` 保留 `isHome` 与 `modalBackdrop` 状态接线，但显隐副作用由 hook 封装。

建议提交：`refactor: 抽出浏览器视图显隐 hook`

### P8-030 App 浏览器导航 hook 拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-027、P8-029
涉及模块：src/App.tsx、src/hooks、文档
目标：继续降低 `App.tsx` 壳层状态和 IPC 调用密度，把 URL 监听、地址栏跳转、首页/前进/后退/刷新、侧栏宽度同步和当前页提交抓取封装为应用级 hook。
验收标准：

- `App.tsx` 不再直接维护 `url`、`syncMsg`、`sidebarWidth`、`isHome` 状态或浏览器导航相关 effect。
- `useBrowserNavigation.ts` 负责 URL 状态、首页判断、URL 变化监听、侧栏宽度同步、导航按钮和当前页提交抓取提示。
- 保持首页、地址栏跳转、侧栏跳转、统计页跳转、当前页提交抓取和工具栏按钮行为不变。
- `src/hooks/README.md` 说明该 hook 的职责和边界。
- 不新增 IPC/Preload API，不改变导航、modal 内容、提交同步、题目详情或笔记行为。
- TypeScript 通过，浏览器导航与当前页同步手测范围明确。

完成记录：已新增 `src/hooks/useBrowserNavigation.ts`；`App.tsx` 保留布局、各 feature 面板渲染和 hook 接线。

建议提交：`refactor: 抽出 App 浏览器导航 hook`

### P8-031 Analytics 数据 helper 与类型收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-024、P8-030
涉及模块：src/features/analytics、文档
目标：在 Dashboard 展示组件拆分完成后，把统计页的数据读取、趋势补零和内部展示类型收敛到 analytics feature 内部 helper，降低 `Dashboard.tsx` 对 `window.electronAPI` 与散落 `any` 类型的直接依赖。
验收标准：

- `Dashboard.tsx` 不再直接调用统计、AI 建议、rating 历史和重算相关 IPC。
- `analyticsApi.ts` 只封装已有 `window.electronAPI` 能力，不新增 IPC/Preload API，不改变统计、rating 或 AI 建议数据口径。
- `types.ts` 收敛趋势、列表、AI 建议、rating 和平台分布展示类型，展示组件不再彼此导出数据类型。
- 保留 AI 建议失败时降级为空列表/提示的行为。
- TypeScript 通过，统计页手测范围明确。

完成记录：已新增 `src/features/analytics/analyticsApi.ts` 和 `src/features/analytics/types.ts`；`Dashboard.tsx` 只保留页面级 state、加载编排和渲染接线，趋势补零、核心统计读取、AI 建议降级、rating 历史读取和重算调用由 analytics helper 封装。

建议提交：`refactor: 抽出 Dashboard 数据 helper`

### P8-032 用户脚本管理数据 helper 收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-020、P8-031
涉及模块：src/features/scripts、文档
目标：在用户脚本管理 UI 拆分完成后，把脚本列表、站点列表、导入、保存、启停、删除和打开目录的 renderer IPC 调用收敛到 scripts feature 内部 helper，降低 `UserScriptManager.tsx` 对 `window.electronAPI` 的直接依赖。
验收标准：

- `UserScriptManager.tsx` 不再直接调用 scripts/sites 相关 `window.electronAPI`。
- `scriptsApi.ts` 只封装已有 scripts/sites IPC，不新增 IPC/Preload API，不改变脚本导入、保存、启停、删除、注入或站点绑定策略。
- `UserScriptManager.tsx` 继续负责编辑状态、错误提示、删除确认和站点勾选状态。
- TypeScript 通过，脚本管理入口手测范围明确。

完成记录：已新增 `src/features/scripts/scriptsApi.ts`；`UserScriptManager.tsx` 只保留脚本管理页面状态和 UI 编排，数据读取与脚本操作调用由 scripts helper 封装。

建议提交：`refactor: 抽出脚本管理数据 helper`

### P8-033 设置页数据 helper 与类型收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-019、P8-025、P8-032
涉及模块：src/features/settings、文档
目标：在设置页面板拆分完成后，把默认首页、学习概览、实时监听诊断、Codeforces 同步、Rating 同步和站点管理的 renderer IPC 调用收敛到 settings feature 内部 helper，并把跨设置面板的展示类型收敛到独立类型文件。
验收标准：

- settings feature 中除 `settingsApi.ts` 外不再直接调用 `window.electronAPI`。
- `settingsApi.ts` 只封装已有 config、stats、realtime diagnostics、Codeforces、sites IPC，不新增 IPC/Preload API，不改变默认首页、同步、导入导出或站点增删改策略。
- `settingsTypes.ts` 收敛学习概览、实时监听诊断和 Codeforces 账号展示类型，展示组件不再导出跨组件数据类型。
- `SettingsPage.tsx`、`DefaultHomePanel.tsx`、`CodeforcesSyncPanel.tsx`、`SiteManagementPanel.tsx` 继续只负责 UI 状态、错误提示、确认动作和面板编排。
- TypeScript 通过，设置页手测范围明确。

完成记录：已新增 `src/features/settings/settingsApi.ts` 和 `src/features/settings/settingsTypes.ts`；设置页各面板改为通过 helper 读取和写入已有主进程能力，未改 preload、数据库、Cookie、提交监测或站点 adapter。

建议提交：`refactor: 抽出设置页数据 helper`

### P8-034 Problems 数据 helper 与类型收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-021、P8-026、P8-033
涉及模块：src/features/problems、文档
目标：在题目详情、侧边栏和笔记弹层拆分完成后，把题目列表、题目详情、访问统计、删除、导航、笔记 CRUD、笔记图片上传等 renderer IPC 调用收敛到 problems feature 内部 helper，并补齐题目详情与提交展示类型。
验收标准：

- problems feature 中除 `problemsApi.ts` 外不再直接调用 `window.electronAPI`。
- `problemsApi.ts` 只封装已有 problem、stats、notes、browser navigation IPC，不新增 IPC/Preload API，不改变题目删除、笔记保存、图片上传、侧栏刷新或导航行为。
- `problemTypes.ts` 收敛侧栏题目、题目详情、访问统计和提交展示类型，减少 `any` 在题目详情 JSX 中散落。
- `ProblemSidebar.tsx`、`ProblemDetail.tsx`、`NotePanelModal.tsx`、`MilkdownEditor.tsx` 和 `useDebouncedNoteTitleSave.ts` 继续负责 UI 状态、确认动作、编辑器生命周期和防抖状态机。
- TypeScript 通过，题目侧栏、详情弹层和笔记弹层手测范围明确。

完成记录：已新增 `src/features/problems/problemsApi.ts` 和 `src/features/problems/problemTypes.ts`；题目侧栏、详情、笔记弹层、Milkdown 图片上传和标题防抖保存均改为调用 problems helper，未改 preload、数据库、Cookie、提交监测或站点 adapter。

建议提交：`refactor: 抽出题目与笔记数据 helper`

### P8-035 首页数据 helper 与类型收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-031、P8-034
涉及模块：src/features/home、文档
目标：把首页学习概览、最近访问、复习建议和题目更新订阅的 renderer IPC 调用收敛到 home feature 内部 helper，并补齐首页展示类型。
验收标准：

- `HomePage.tsx` 不再直接调用 `window.electronAPI`。
- `homeApi.ts` 只封装已有 overview、recent problems、review recommendations、problems updated 订阅 IPC，不新增 IPC/Preload API，不改变首页数据口径或复习建议失败降级行为。
- `homeTypes.ts` 收敛首页概览、最近题目和复习建议展示类型，移除首页中的散落 `any`。
- `HomePage.tsx` 继续负责 UI 状态和导航回调。
- TypeScript 通过，首页手测范围明确。

完成记录：已新增 `src/features/home/homeApi.ts` 和 `src/features/home/homeTypes.ts`；首页学习概览、最近访问、复习建议和题目更新订阅改为通过 home helper 获取。

建议提交：`refactor: 抽出首页数据 helper`

### P8-036 Renderer 业务 feature IPC helper 收口

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-031、P8-032、P8-033、P8-034、P8-035
涉及模块：src/features、文档
目标：在各业务 feature helper 抽取完成后，检查并收口 `src/features` 下非 helper 组件直接调用 `window.electronAPI` 的遗留点，明确后续 renderer feature 的 IPC 调用边界。
验收标准：

- `src/features` 下业务组件不再直接调用 `window.electronAPI`，调用集中在各 feature 的 `*Api.ts` helper。
- Dashboard 的浏览器 view 显隐调用也收敛到 `analyticsApi.ts`。
- `src/features/README.md` 明确新增 feature 应优先使用本域 helper 封装已有 preload 能力。
- TypeScript 通过，`rg "window\.electronAPI" algo-electron/src/features -n` 只显示 README 说明和 feature helper 文件。

完成记录：已把 `Dashboard.tsx` 中的 `hideView/showView` 包到 `analyticsApi.ts`；home、analytics、settings、scripts、problems 五个业务 feature 的直接 IPC 调用均集中在本域 helper。

建议提交：`refactor: 收口 renderer feature IPC helper`

### P8-037 共享组件窗口/标签 helper 收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-027、P8-036
涉及模块：src/components、文档
目标：把共享组件中的窗口控制和标签管理 preload 调用收敛到 components 层 helper，让 `TabBar.tsx` 和 `WindowControls.tsx` 只负责 UI 状态与交互。
验收标准：

- `TabBar.tsx` 不再直接调用 `window.electronAPI`，标签订阅、创建、关闭、切换和剥离由 `tabApi.ts` 封装。
- `WindowControls.tsx` 不再直接调用 `window.electronAPI`，窗口最大化状态订阅和最小化/最大化/关闭由 `windowApi.ts` 封装。
- 不新增 IPC/Preload API，不改变多标签、剥离窗口或窗口控制行为。
- `src/components/README.md` 说明共享组件 helper 边界和当前封装函数。
- TypeScript 通过，标签栏和窗口控制手测范围明确。

完成记录：已新增 `src/components/tabApi.ts` 和 `src/components/windowApi.ts`；`TabBar.tsx`、`WindowControls.tsx` 改为通过组件层 helper 访问已有 preload 能力。

建议提交：`refactor: 抽出窗口和标签组件 helper`

### P8-038 应用壳 hooks 浏览器 helper 收敛

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-028、P8-029、P8-030、P8-037
涉及模块：src/hooks、文档
目标：把应用壳 hooks 中的浏览器预览、WebContentsView 显隐、URL 监听、导航、侧栏宽度和当前页提交抓取 preload 调用收敛到 hooks 层 helper，让 hooks 保持状态机和 UI 编排职责。
验收标准：

- `useAppModalState.ts`、`useBrowserNavigation.ts`、`useBrowserViewVisibility.ts` 不再直接调用 `window.electronAPI`。
- `browserShellApi.ts` 只封装已有浏览器壳层 preload 能力，不新增 IPC/Preload API，不改变导航、modal 预览、view 显隐、侧栏宽度或当前页提交抓取行为。
- `src/hooks/README.md` 说明 `browserShellApi.ts` 的封装函数和边界。
- TypeScript 通过，首页/网页/modal/导航/当前页同步手测范围明确。

完成记录：已新增 `src/hooks/browserShellApi.ts`；应用壳 modal、浏览器导航和 view 显隐 hook 均改为通过该 helper 访问已有 preload 能力。

建议提交：`refactor: 抽出应用壳浏览器 helper`

### P8-039 Renderer preload 类型细化

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-036、P8-037、P8-038
涉及模块：electron/electron-env.d.ts、electron/preload.ts、src、文档
目标：在 renderer preload 调用收敛到 helper 后，细化 `electron-env.d.ts` 的主要 IPC 返回类型，减少 renderer helper 内部断言和显式 `any`。
验收标准：

- `electron-env.d.ts` 覆盖题目、统计、rating、站点、脚本、笔记、AI 建议和 AI 输出的主要 preload 类型。
- `preload.ts` 中站点、脚本、标签、笔记、AI 输出相关参数和返回 cast 不再使用显式 `any`。
- renderer helper 中不再依赖旧的 preload `Promise<any>` 断言。
- 修正站点导入预览 renderer 类型与主进程真实 payload 的差异。
- TypeScript 通过，`rg "Promise<any|: any|any\\[\\]|Record<string, any>|preview\\?: any|data: any" electron-env/preload/src` 不再命中代码中的显式 any。

完成记录：已细化 `electron/electron-env.d.ts` 和 `electron/preload.ts`；移除 home/scripts/problems/settings helper 中不必要的类型断言；修正 AI 推荐 `problem_id`、推荐标题、脚本站点 `homeUrl`、站点导入冲突 `incoming.domains` 等被旧 `any` 掩盖的类型问题。

建议提交：`refactor: 细化 renderer preload 类型`

### P8-040 主进程入口职责收口

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-004、P8-014、P8-039
涉及模块：electron/main.ts、electron/app、electron/browser、electron/ipc、electron/notes、electron/scripts、electron/tracking、文档
目标：继续降低 `electron/main.ts` 职责密度，把启动开关、服务初始化、OJ session、笔记附件协议、用户脚本注入、题目标题追踪和 IPC 组合注册拆到对应模块。
验收标准：

- `main.ts` 保留应用装配、窗口创建和生命周期接线，不再内联业务 IPC、OJ session webRequest、用户脚本注入、笔记附件协议或题目标题兜底抓取细节。
- 新增模块均有所属 README 说明职责、实现程度、封装函数和边界。
- 不新增 IPC/Preload API，不改变数据库 schema、Cookie 策略或提交监测入库规则。
- TypeScript、IPC contract、Electron startup smoke 和 lint 通过。

完成记录：已新增 `electron/app/chromiumFlags.ts`、`mainServices.ts`、`recentSitePreconnect.ts`、`electron/browser/ojSession.ts`、`electron/ipc/registerMainIpc.ts`、`electron/notes/noteAssetProtocol.ts`、`electron/scripts/userScriptInjector.ts`、`electron/tracking/problemTitleTracking.ts`；`main.ts` 已降到约 187 行，作为应用装配入口。

建议提交：`refactor: 收口主进程入口职责`

### P8-041 测试子目录文档覆盖

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-015
涉及模块：tests、docs、文档
目标：为 `tests/` 下各测试域补齐子目录 README，让新增测试能明确归属、运行方式和安全边界。
验收标准：

- `tests/adapters`、`browser`、`db`、`electron`、`integration`、`ipc`、`parsers`、`submissions`、`ui` 均有 README。
- `docs/README.md` 索引测试子目录文档。
- README 说明当前覆盖文件、运行方式、新增规则和敏感数据边界。

完成记录：已补齐九个测试子目录 README，并同步 `docs/README.md` 与 `AI_HANDOFF.md`。文档覆盖审计命令对 `electron`、`src`、`tests` 子目录返回空。

建议提交：`docs: 补齐测试子目录说明`

### P8-042 统计页平台分布布局修正

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-006、P8-022
涉及模块：src/features/analytics、src/App.css、tests/ui、文档
目标：修复统计页平台分布视觉不稳定问题，恢复清晰的饼图 + 柱图布局，并避免小窗口下图表和文本错位。
验收标准：

- `PlatformDistributionPanel.tsx` 同时渲染饼图、图例和柱图。
- 饼图不依赖外圈 label，避免被裁剪或挤偏。
- Dashboard 图表区域有稳定 grid 尺寸和移动端降级规则。
- Renderer 截图测试通过，并实际检查平台分布图形绘制。

完成记录：平台分布改为左侧饼图和图例、右侧柱图的稳定网格；`tests/ui/rendererScreenshots.test.ts` 已通过，dashboard 截图中饼图和柱图均正常显示。

建议提交：`fix: 修正统计页平台分布布局`

### P8-043 Browser TabManager 类型与配置拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-040
涉及模块：electron/browser、文档
目标：继续收口 Browser 模块，把 `TabManager.ts` 中的类型、布局配置、OJ preload 路径和 URL 同页匹配 helper 拆到独立文件。
验收标准：

- `TabManager.ts` 保留多标签生命周期、事件绑定和视图管理。
- `tabManagerTypes.ts` 提供 `TabInfo` 和内部 tab 结构类型，并保持 `TabManager.ts` 对 `TabInfo` 的兼容导出。
- `tabManagerConfig.ts` 收敛最大标签数、toolbar/tabbar 高度和 OJ preload 路径。
- `urlMatching.ts` 收敛同页 URL 判断。
- TypeScript 通过，实时 tab 激活回归通过。

完成记录：已新增 `electron/browser/tabManagerTypes.ts`、`tabManagerConfig.ts`、`urlMatching.ts`，并同步 `electron/browser/README.md`。

建议提交：`refactor: 拆分 TabManager 基础 helper`

### P8-044 用户脚本 IPC 与 metadata 拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-040
涉及模块：electron/scripts、electron/ipc、tests/scripts、文档
目标：移除 `UserScriptService` 构造时注册 IPC 的副作用，把用户脚本管理型 IPC 统一迁入 `electron/ipc/`，并把 userscript metadata 解析抽成纯 helper。
验收标准：

- `UserScriptService` 只负责启用脚本匹配和读取 metadata，不注册 IPC。
- `registerScriptsIpc.ts` 注册 `scripts:*` channel，并由 `registerMainIpc.ts` 组合调用。
- `userScriptMetadata.ts` 提供 `parseScriptMetadata` 和 `matchRuleToRegExp`。
- 新增 `tests/scripts/userScriptMetadata.test.ts` 覆盖 metadata 解析和 `*://*.domain/*` 匹配。
- TypeScript、IPC contract、lint 和新脚本测试通过。

完成记录：已新增 `electron/ipc/registerScriptsIpc.ts`、`electron/scripts/userScriptMetadata.ts`、`tests/scripts/` README 和测试；`scripts` 与 `ipc` README、`tests/README.md`、`docs/README.md` 已同步。

建议提交：`refactor: 拆分用户脚本 IPC 和 metadata`

### P8-045 统计 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、docs、文档
目标：降低 `statsRepository.ts` 职责密度，把统计类型、日期 helper、趋势查询、洞察查询和日统计重算拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `statsRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `electron/db/repositories/stats/` 按 `types`、`date`、`trends`、`insights`、`recompute` 拆分统计实现。
- 新增子目录 README，说明职责、实现程度、封装函数、边界和验证入口。
- 不改变数据库 schema、IPC/Preload API、统计口径或 renderer 调用方式。
- TypeScript、lint 和 repository 临时数据库测试通过。

完成记录：已新增 `electron/db/repositories/stats/` 子目录并拆分实现；`statsRepository.ts` 保持原导出函数兼容。`electron/db/README.md`、`electron/db/repositories/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分统计仓库职责`

### P8-046 Notes 文件存储边界拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-040
涉及模块：electron/notes、文档
目标：降低 `NoteService.ts` 职责密度，把 Markdown 文件、图片附件、路径解析和字数估算从 DB 编排服务中拆出。
验收标准：

- `NoteService.ts` 保留 notes DB 查询/写入和服务编排，不再直接拼接附件路径或操作图片文件。
- `noteStorage.ts` 负责笔记根目录、Markdown 文件读写、图片附件保存、附件路径解析和文件清理。
- `noteText.ts` 负责笔记字数估算。
- `electron/notes/README.md` 说明新文件职责、封装函数、安全边界和验证入口。
- 不改变数据库 schema、IPC/Preload API、`note-asset://` 协议格式或 renderer 调用方式。
- TypeScript 和 lint 通过。

完成记录：已新增 `electron/notes/noteStorage.ts` 和 `electron/notes/noteText.ts`，`NoteService.ts` 改为调用 helper；`electron/notes/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分笔记文件存储边界`

### P8-047 AI 周期总结内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-040
涉及模块：electron/ai/summary、文档
目标：降低 `periodSummary.ts` 职责密度，把周期总结类型、日期计算、快照聚合和 Markdown 渲染拆成独立 helper。
验收标准：

- `periodSummary.ts` 保持 `getPeriodSummary`、`PeriodSummary`、`PeriodSummaryInput` 和 `renderSummaryAsMarkdown` 对外入口稳定。
- `periodSummaryTypes.ts` 承接输入、输出和聚合类型。
- `periodSummaryDates.ts` 承接本地日期、上一周期和周期类型计算。
- `periodSummaryAggregation.ts` 承接快照筛选和聚合。
- `periodSummaryMarkdown.ts` 承接 Markdown 输出。
- 不改变数据库 schema、IPC/Preload API、AI 输出保存方式或总结口径。
- TypeScript、lint 和 AI IPC contract 通过。

完成记录：已新增 `periodSummaryTypes.ts`、`periodSummaryDates.ts`、`periodSummaryAggregation.ts`、`periodSummaryMarkdown.ts`，`periodSummary.ts` 保留稳定入口；`electron/ai/summary/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分 AI 周期总结实现`

### P8-048 AI 建议规则内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-047
涉及模块：electron/ai/recommendations、tests/ai、文档
目标：降低复习建议、薄弱标签和复习计划文件职责密度，把公共类型、评分规则、标签解析和 Markdown 渲染拆到独立 helper。
验收标准：

- `reviewRecommender.ts`、`weaknessAnalyzer.ts`、`reviewPlanner.ts` 保持原导出函数稳定。
- `types.ts` 承接复习建议、薄弱标签、复习计划和内部聚合类型。
- `rules.ts` 承接评分、阈值、优先级、预估时间和计划天数归一化。
- `tagParsing.ts` 承接 `tags_json` 安全解析。
- `reviewPlanMarkdown.ts` 承接复习计划 Markdown 渲染。
- 新增 `tests/ai/recommendationRules.test.ts` 和 `tests/ai/README.md`，覆盖纯规则 helper。
- 不改变数据库 schema、IPC/Preload API、AI 输出保存方式或建议口径。
- TypeScript、lint、AI 规则测试和 IPC contract 通过。

完成记录：已新增 recommendations 的 `types.ts`、`rules.ts`、`tagParsing.ts`、`reviewPlanMarkdown.ts`，旧入口文件保持函数导出兼容；新增 `tests/ai/` 纯规则测试，并同步文档索引、测试 README、AI recommendations README 和 `AI_HANDOFF.md`。

建议提交：`refactor: 拆分 AI 建议规则实现`

### P8-049 AI 上下文导出边界拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-048
涉及模块：electron/ai、文档
目标：降低 `contextExporter.ts` 职责密度，把 AI 上下文类型、标签统计聚合和 Markdown 渲染拆到独立 helper，同时保持原导出入口稳定。
验收标准：

- `contextExporter.ts` 保持 `AI_CONTEXT_VERSION`、`exportAIContext`、`AIContextExport` 和 `renderContextAsMarkdown` 对外入口稳定。
- `contextTypes.ts` 承接脱敏上下文 schema 和标签统计类型。
- `contextTagStats.ts` 承接标签维度聚合，复用统一标签解析 helper。
- `contextMarkdown.ts` 承接上下文 Markdown 渲染。
- 不改变数据库 schema、IPC/Preload API、AI 快照 schema version、AI 输出保存方式或上下文脱敏口径。
- TypeScript、lint 和 AI IPC contract 通过。

完成记录：已新增 `contextTypes.ts`、`contextTagStats.ts`、`contextMarkdown.ts`，`contextExporter.ts` 保留稳定入口并只负责上下文编排；`electron/ai/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分 AI 上下文导出边界`

### P8-050 站点配置 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、tests/db、文档
目标：降低 `siteRepository.ts` 职责密度，把站点配置类型/row 映射、CRUD、内置 seed、导入导出预览拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `siteRepository.ts` 只作为兼容导出口，不再承载 SQL 或导入预览细节。
- `electron/db/repositories/site/types.ts` 承接站点配置类型、SQLite row 映射和导入 payload 清理。
- `site/crud.ts` 承接站点列表、查询、创建、更新、启停和删除非内置站点。
- `site/builtins.ts` 承接内置站点 seed，且不覆盖用户启停状态。
- `site/importExport.ts` 承接配置导出、导入预览、冲突识别和确认导入。
- 新增子目录 README，并补充 repository 临时数据库测试覆盖 seed、内置保护、导入预览和覆盖导入。
- 不改变数据库 schema、IPC/Preload API、Cookie 策略或站点配置导入导出口径。
- TypeScript、lint、repository 临时数据库测试和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/site/` 子目录并拆分实现；`siteRepository.ts` 保持原导出函数兼容。`tests/db/repositories.test.ts` 已补站点配置测试；`electron/db/README.md`、`electron/db/repositories/README.md`、`docs/README.md`、`tests/db/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分站点配置仓库`

### P8-051 Parser registry 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-013
涉及模块：electron/parsers、tests/parsers、文档
目标：降低 `registry.ts` 职责密度，把启用站点来源/域名匹配和用户配置 pattern URL 解析拆到独立 helper，同时保持 parser registry 对外 API 稳定。
验收标准：

- `registry.ts` 保持 `setEnabledSitesFetcher`、`registerAdapter`、`getAdapter`、`getAdapterForUrl`、`parseConfigUrl` 和 `parseUrl` 对外入口稳定。
- `enabledSites.ts` 承接内置兜底站点、启用站点 fetcher、域名匹配和按 URL 找站点。
- `configPattern.ts` 承接 `problemUrlPatterns` 的路径/查询占位符解析和题目标识组装。
- `electron/parsers/README.md` 说明新 helper 职责、边界和测试入口。
- 不改变数据库 schema、IPC/Preload API、提交监测逻辑或 URL 解析口径。
- TypeScript、lint 和 parser 测试通过。

完成记录：已新增 `electron/parsers/enabledSites.ts` 和 `electron/parsers/configPattern.ts`，`registry.ts` 继续作为兼容入口；`electron/parsers/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分 parser registry helper`

### P8-052 TabManager 布局与跨 frame 执行 helper 拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-043
涉及模块：electron/browser、tests/submissions、文档
目标：继续降低 `TabManager.ts` 职责密度，把 view bounds/安全移除/关闭和跨 frame 脚本执行拆到独立 helper，同时保持多标签公开 API 和实时提交事件行为稳定。
验收标准：

- `TabManager.ts` 保持标签生命周期、导航、事件绑定和公开方法稳定。
- `tabViewLayout.ts` 承接 view bounds 计算、安全移除和 webContents 安全关闭。
- `tabScriptExecution.ts` 承接主 frame + 子 frame 脚本执行，并继续写入 `window.__ALGO_TOP_PAGE_URL`。
- `createView()` 中的导航、iframe、DOM ready、title、stealth 注入事件绑定不迁移，避免影响实时提交源码回归。
- 不改变数据库 schema、IPC/Preload API、提交监测逻辑、Cookie 策略或 TabManager 公开 API。
- TypeScript、lint、实时 tab 激活回归和 Electron startup smoke 通过。

完成记录：已新增 `electron/browser/tabViewLayout.ts` 和 `electron/browser/tabScriptExecution.ts`，`TabManager.ts` 改为调用 helper；`electron/browser/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分 TabManager 视图 helper`

### P8-053 SubmissionBatchWriter 题目关联职责拆分

状态：已完成
优先级：P0
阶段：Phase 8
前置任务：P8-013
涉及模块：electron/submissions、tests/submissions、文档
目标：降低 `SubmissionBatchWriter.ts` 职责密度，把提交写入编排和站点题目关联规则拆开，同时保持写入行为和对外 API 稳定。
验收标准：

- `SubmissionBatchWriter.ts` 保持 `write(options)`、依赖接口和返回结构稳定。
- `SubmissionBatchWriter` 只负责编排批量写入、首次 AC 更新和统计刷新。
- `SubmissionProblemAttacher.ts` 承接当前页面、rawJson、sourceUrl 和站点专用上下文字段到 `problemId` 的关联规则。
- Codeforces、PTA、Luogu、Nowcoder、VJudge 既有关联逻辑不改变。
- `electron/submissions/README.md` 说明新文件职责、封装函数和边界。
- 不改变数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或写入口径。
- TypeScript、lint 和 `submissionBatchWriter` 回归通过。

完成记录：已新增 `electron/submissions/SubmissionProblemAttacher.ts`，`SubmissionBatchWriter.ts` 改为调用 attacher；`electron/submissions/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分提交题目关联逻辑`

### P8-054 题目 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、tests/db、文档
目标：降低 `problemRepository.ts` 职责密度，把题目类型、写入、查询和概览统计拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `problemRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `problem/types.ts` 承接最近题目、题目详情、提交行、平台分布和概览返回类型。
- `problem/mutations.ts` 承接 `upsertProblem` 和 `deleteProblem`。
- `problem/queries.ts` 承接 `getRecentProblems` 和 `getProblemDetail`。
- `problem/overview.ts` 承接题目总数、今日访问、平台分布、最近活跃和概览聚合。
- 新增子目录 README，并保持 repository 临时数据库测试通过。
- 不改变数据库 schema、IPC/Preload API、题目状态计算口径或提交写入链路。
- TypeScript、lint、repository 临时数据库测试和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/problem/` 子目录并拆分实现；`problemRepository.ts` 保持原导出函数兼容。`electron/db/README.md`、`electron/db/repositories/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分题目仓库职责`

### P8-055 通用提交表格扫描器内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-013
涉及模块：electron/submissions/scrapers、tests/submissions、文档
目标：降低 `GenericTableScanner.ts` 职责密度，把通用表格类型、列识别、提交 ID 提取和字段归一化拆到独立 helper，同时保持扫描入口稳定。
验收标准：

- `GenericTableScanner.ts` 保持 `hasSubmissionLikeTable`、`selectBestSubmissionTable`、`scanGenericSubmissionTable` 和类型导出兼容。
- `genericTableTypes.ts` 承接通用表格、行和扫描选项类型。
- `genericTableColumns.ts` 承接列关键字、verdict 列推断和最佳表评分。
- `genericTableIds.ts` 承接提交 ID 提取。
- `genericTableValueParsers.ts` 承接 verdict、运行时间、内存和文本归一化。
- 不改变数据库 schema、IPC/Preload API、提交监测 hook 或通用表格扫描口径。
- TypeScript、lint、`genericTableScanner` 和当前页面 DOM 同步回归通过。

完成记录：已新增 `genericTableTypes.ts`、`genericTableColumns.ts`、`genericTableIds.ts`、`genericTableValueParsers.ts`，`GenericTableScanner.ts` 保持兼容入口；`electron/submissions/scrapers/README.md` 与 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分通用提交表扫描器`

### P8-056 账号 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、tests/db、文档
目标：降低 `accountRepository.ts` 职责密度，把账号资料、rating history 和类型拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `accountRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `account/types.ts` 承接平台账号行、rating history 输入和 rating history 行类型。
- `account/accounts.ts` 承接账号 upsert、账号查询、当前 rating 和 peak rating 更新。
- `account/ratingHistory.ts` 承接 rating history 去重写入、历史查询和 peak rating 计算。
- 新增子目录 README，并保持 repository 临时数据库测试通过。
- 不改变数据库 schema、IPC/Preload API、rating 同步口径或提交监测逻辑。
- TypeScript、lint、repository 临时数据库测试和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/account/` 子目录并拆分实现；`accountRepository.ts` 保持原导出函数兼容。`tests/db/repositories.test.ts` 已补账号 upsert、rating 更新、history 去重和 peak 计算覆盖；`electron/db/README.md`、`electron/db/repositories/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分账号仓库职责`

### P8-057 用户脚本 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、electron/scripts、tests/db、文档
目标：降低 `userScriptRepository.ts` 职责密度，把用户脚本类型、数据库行映射、查询和写入拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `userScriptRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `userScript/types.ts` 承接用户脚本对外记录、数据库行和写入/更新输入类型。
- `userScript/rowMapper.ts` 承接 SQLite `enabled` 0/1 到布尔值的归一化。
- `userScript/queries.ts` 承接脚本列表、启用脚本列表和按 ID 查询。
- `userScript/mutations.ts` 承接脚本创建、部分更新、启停和删除。
- 新增子目录 README，并保持 scripts IPC、UserScriptService 和 repository 临时数据库测试通过。
- 不改变数据库 schema、IPC/Preload API、用户脚本导入/注入策略或提交监测逻辑。
- TypeScript、lint、scripts metadata 测试、repository 临时数据库测试和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/userScript/` 子目录并拆分实现；`userScriptRepository.ts` 保持原导出函数和类型兼容。`tests/db/repositories.test.ts` 已补用户脚本 CRUD、启停、删除和 `enabled` 布尔归一化覆盖；`electron/db/README.md`、`electron/db/repositories/README.md`、`electron/scripts/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分用户脚本仓库职责`

### P8-058 AI 输出 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、electron/ai、tests/db、文档
目标：降低 `aiOutputRepository.ts` 职责密度，把 AI 输出类型、元信息序列化、查询和写入拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `aiOutputRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `aiOutput/types.ts` 承接 AI 输出类型、保存输入、元信息对象和更新输入类型。
- `aiOutput/serialization.ts` 承接 `input_summary`、`source_refs`、`model_info` 到 JSON 字段的序列化。
- `aiOutput/queries.ts` 承接按 ID 读取和按类型/数量列出输出。
- `aiOutput/mutations.ts` 承接保存、更新和删除 AI 输出。
- 新增子目录 README，并保持 AI IPC 和 repository 临时数据库测试通过。
- 不改变数据库 schema、IPC/Preload API、AI 输出保存口径、AI 规则引擎或提交监测逻辑。
- TypeScript、lint、AI 规则测试、repository 临时数据库测试和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/aiOutput/` 子目录并拆分实现；`aiOutputRepository.ts` 保持原导出函数和类型兼容。`tests/db/repositories.test.ts` 已补 AI 输出保存、元信息 JSON 序列化、按类型列表、更新和删除覆盖；`electron/db/README.md`、`electron/db/repositories/README.md`、`electron/ai/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分 AI 输出仓库职责`

### P8-059 AI 上下文快照 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、electron/ai、tests/db、文档
目标：降低 `aiContextSnapshotRepository.ts` 职责密度，把快照类型、JSON context 序列化/解析、查询和幂等写入拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `aiContextSnapshotRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `aiContextSnapshot/types.ts` 承接快照原始行、快照元数据和解析后快照类型。
- `aiContextSnapshot/serialization.ts` 承接 `AIContextExport` 到 `context_json` 的序列化和快照 context 解析。
- `aiContextSnapshot/queries.ts` 承接按日期读取原始行、按日期读取解析后快照和列表查询。
- `aiContextSnapshot/mutations.ts` 承接 `ensureTodaySnapshot()` 的幂等创建。
- 新增子目录 README，并保持 main 启动路径、阶段总结和 repository 临时数据库测试通过。
- 不改变数据库 schema、IPC/Preload API、AI context schema version、阶段总结口径或提交监测逻辑。
- TypeScript、lint、AI 规则测试、repository 临时数据库测试、启动 smoke 和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/aiContextSnapshot/` 子目录并拆分实现；`aiContextSnapshotRepository.ts` 保持原导出函数和类型兼容。`tests/db/repositories.test.ts` 已补当日快照幂等创建、解析后 context 和列表元数据覆盖；`electron/db/README.md`、`electron/db/repositories/README.md`、`electron/ai/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分 AI 快照仓库职责`

### P8-060 提交 repository 内部职责拆分

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003
涉及模块：electron/db/repositories、electron/submissions、tests/db、文档
目标：降低 `submissionRepository.ts` 职责密度，把提交行类型、去重写入、查询和首次 AC 更新拆到独立子模块，同时保持对外导入路径稳定。
验收标准：

- `submissionRepository.ts` 只作为兼容导出口，不再承载 SQL 细节。
- `submission/types.ts` 承接提交行和首次 AC 查询行类型。
- `submission/mutations.ts` 承接按 `(platform, platform_submission_id)` 去重写入提交。
- `submission/queries.ts` 承接按题目和平台查询提交。
- `submission/firstAc.ts` 承接最早 AC 查询和题目 `first_solved_at` 更新。
- 新增子目录 README，并保持 `SubmissionBatchWriter` 写入链路和 repository 临时数据库测试通过。
- 不改变数据库 schema、IPC/Preload API、提交监测 hook、提交去重口径或首次 AC 口径。
- TypeScript、lint、repository 临时数据库测试、submissionBatchWriter 测试和 IPC contract 通过。

完成记录：已新增 `electron/db/repositories/submission/` 子目录并拆分实现；`submissionRepository.ts` 保持原导出函数兼容。`tests/db/repositories.test.ts` 已补按平台查询覆盖；`electron/db/README.md`、`electron/db/repositories/README.md`、`electron/submissions/README.md`、`docs/README.md` 和 `AI_HANDOFF.md` 已同步。

建议提交：`refactor: 拆分提交仓库职责`

### P8-061 项目结构巩固收尾审计

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-013 到 P8-060
涉及模块：docs、TASKS、AI_HANDOFF、electron、src、tests
目标：对本轮项目结构标准化做收尾审计，确认 README 覆盖、已拆分模块、剩余大文件处置和最终验收清单，避免继续无限机械拆分。
验收标准：

- 新增结构巩固收尾审计文档，说明审计目标、README 覆盖命令和当前结果。
- 记录已完成的主进程、DB repository、AI、adapter/submissions、Renderer 结构收口。
- 对剩余大文件进行分类，明确哪些暂不继续拆分及原因。
- 给出自动验证清单和用户最终手测清单。
- 同步 `docs/README.md`、`TASKS.md` 和 `AI_HANDOFF.md`。
- 不改变数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或业务行为。

完成记录：已新增 `docs/project-hardening-audit.md`，记录 README 覆盖审计、已完成结构收口、剩余大文件分类处置、自动验证清单和用户手测清单；已新增 `docs/final-acceptance-checklist.md`，作为最终统一手测清单；`docs/README.md` 与 `AI_HANDOFF.md` 已同步。`P8-007`、`P8-008` 仍保持进行中；`P8-010`、`P8-011` 已补齐发布恢复文档；`P8-009`、`P8-012` 仍未自动完成。

建议提交：`docs: 增加项目结构巩固收尾审计`

### P8-062 统一自动验证入口

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-003、P8-004、P8-005、P8-006、P8-013
涉及模块：tests、package.json、docs
目标：把分散在文档里的测试命令收敛为统一 npm scripts，降低接手和发布前验证成本。
验收标准：

- 新增统一测试 runner，封装现有 typecheck、lint、IPC、adapter、submissions、DB、Electron smoke 和 UI screenshot 测试。
- `package.json` 提供 `test:core`、`test:adapters`、`test:submissions`、`test:db`、`test:electron`、`test:ui`、`test:all` 等入口。
- `tests/README.md`、`algo-electron/README.md`、最终验收清单和项目审计文档同步更新。
- 不改变现有测试断言、数据库 schema、IPC/Preload API、Cookie 策略或提交监测行为。

完成记录：已新增 `tests/run-tests.mjs`，按 suite 编排现有测试；`package.json` 新增 `typecheck` 与 `test:*` scripts；测试 README、子项目 README、`docs/final-acceptance-checklist.md` 和 `docs/project-hardening-audit.md` 已同步。

建议提交：`test: 统一自动验证入口`

### P8-063 建立 CI 自动验证工作流

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-062
涉及模块：.github、tests、docs
目标：把本地统一验证入口接入仓库级 CI，让 pull request 和主分支 push 自动运行标准验证。
验收标准：

- 新增 GitHub Actions workflow。
- CI 使用锁文件安装依赖。
- CI 运行统一验证入口，不访问真实 OJ 登录态，不读取 Cookie，不写入本地用户数据。
- 同步交接和审计文档。

完成记录：已新增 `.github/workflows/ci.yml`，在 `pull_request` 和 `main`/`master` push 时使用 Windows runner、Node.js 22、`npm ci` 和 `npm run test:all` 完成自动验证；未新增数据库 schema、IPC/Preload API 或 Cookie 策略。

建议提交：`ci: 添加自动验证工作流`

### P8-064 建立贡献指南

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-061、P8-062、P8-063
涉及模块：文档、README、docs
目标：为后续开发者和 Agent 提供根目录贡献入口，统一本地开发、验证、修改边界、隐私要求和 PR 检查清单。
验收标准：

- 新增 `CONTRIBUTING.md`。
- 文档只做入口和清单，不复制任务状态或架构细节。
- 覆盖本地开发命令、`npm run test:*` 验证入口、数据库/IPC/Cookie/站点边界、隐私禁区和 PR 检查项。
- 同步根 `README.md` 和 `docs/README.md`。

完成记录：已新增 `CONTRIBUTING.md`，并在根 README 与文档总索引中加入入口；未改变数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或业务行为。

建议提交：`docs: 添加贡献指南`

### P8-065 建立 PR 和 Issue 模板

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-063、P8-064
涉及模块：.github、文档
目标：把验证、隐私和提交监测手测要求固化到 GitHub 协作入口，减少后续 issue/PR 信息缺失和敏感信息泄漏。
验收标准：

- 新增 pull request 模板。
- 新增普通缺陷 issue 模板。
- 新增提交监测专项 issue 模板。
- 模板必须提醒不要上传 Cookie、用户源码、完整请求体、本机数据库内容或可复用登录态。
- 同步贡献指南、文档索引、交接和审计文档。

完成记录：已新增 `.github/pull_request_template.md`、`.github/ISSUE_TEMPLATE/bug_report.yml`、`.github/ISSUE_TEMPLATE/submission_monitoring.yml` 和 `.github/ISSUE_TEMPLATE/config.yml`；PR 模板覆盖变更边界、测试、手测和文档同步；Issue 模板分别覆盖普通缺陷和提交监测问题，并强制敏感信息确认。

建议提交：`docs: 添加 PR 和 Issue 模板`

### P8-066 建立仓库格式约束

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-062、P8-063
涉及模块：.editorconfig、.gitattributes、文档
目标：统一编辑器缩进、换行和 Git 文本/二进制处理策略，降低 Windows 本地开发与 CI 之间的格式噪音。
验收标准：

- 新增 `.editorconfig`。
- 新增 `.gitattributes`。
- 默认文本文件使用 LF；Windows 脚本保留 CRLF；图片、图标、PDF、压缩包、SQLite 等按 binary 处理。
- 同步贡献指南、交接和审计文档。

完成记录：已新增 `.editorconfig` 和 `.gitattributes`；默认 UTF-8、2 空格缩进、LF、末尾换行和 trailing whitespace 规则；Markdown 保留行尾空格以兼容换行；Windows 脚本设置 CRLF；二进制资源和本地数据库扩展按 binary 处理。

建议提交：`chore: 添加仓库格式约束`

### P8-067 补齐许可证文件

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-064
涉及模块：LICENSE、package.json、文档
目标：补齐 README 已声明的 MIT License 文件和包元数据，避免发布时许可证声明不完整。
验收标准：

- 根目录存在 `LICENSE`。
- `algo-electron/package.json` 有 `license` 字段。
- 文档索引能找到许可证文件。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略或提交监测逻辑。

完成记录：已新增根目录 `LICENSE`，采用 MIT License；`algo-electron/package.json` 已补 `license: MIT`；`docs/README.md` 已加入许可证入口。

建议提交：`docs: 补齐 MIT 许可证`

### P8-068 建立安全与隐私政策

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-064、P8-065
涉及模块：SECURITY、文档
目标：提供根目录安全与隐私报告入口，集中说明敏感信息禁区、安全问题范围和验证边界。
验收标准：

- 新增 `SECURITY.md`。
- 明确 Cookie、session、用户源码、完整请求体、本机数据库和可复用登录态不得公开提交。
- 明确哪些问题按安全报告处理，哪些按普通 bug 或提交监测 issue 处理。
- 同步 README、贡献指南、文档索引、交接和审计文档。

完成记录：已新增 `SECURITY.md`，覆盖适用范围、禁止提交内容、安全报告流程、非安全报告场景、开发安全要求和验证入口；根 README、`CONTRIBUTING.md`、`docs/README.md`、`AI_HANDOFF.md` 与 `docs/project-hardening-audit.md` 已同步。

建议提交：`docs: 添加安全与隐私政策`

### P8-069 建立发布流程文档

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-007、P8-008、P8-061、P8-062
涉及模块：docs、TASKS、AI_HANDOFF、CHANGELOG、algo-electron
目标：把 Windows 发布前的版本、changelog、自动验证、打包、产物检查、安装升级卸载验收和交接要求收敛成可执行流程，作为 `P8-009` 和 `P8-012` 的前置操作手册。
验收标准：

- 新增 `docs/release-process.md`。
- 文档明确它是发布执行手册，不代表 `P8-009` 或 `P8-012` 已完成。
- 覆盖版本号、changelog、`npm run test:all`、`npm run build:win`、产物内容检查、安装/升级/卸载验收和发布交接字段。
- 明确不得发布或记录 Cookie、session、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态。
- 同步 `docs/README.md`、`CONTRIBUTING.md`、`docs/final-acceptance-checklist.md`、`docs/project-hardening-audit.md`、`algo-electron/README.md`、`CHANGELOG.md` 和 `AI_HANDOFF.md`。
- 不改变数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook、站点 adapter 或业务行为。

完成记录：已新增 `docs/release-process.md`，并同步文档索引、贡献指南、最终手测清单、项目巩固审计、子项目 README、changelog 和交接文档。`P8-009` Windows 安装包发布与 `P8-012` v1.0 总验收仍未自动完成，必须等真实产物发布和用户总验收后再更新。

建议提交：`docs: 添加发布流程文档`

### P8-070 补齐协作与资源目录 README

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-063、P8-065、P8-069
涉及模块：.github、build、public、docs、TASKS、AI_HANDOFF
目标：为非源码但长期维护的协作、CI、打包资源和静态资源目录补齐 README，明确职责、实现程度、敏感信息边界和验证入口。
验收标准：

- `.github/README.md` 说明 workflow、PR 模板、issue 模板和协作边界。
- `.github/workflows/README.md` 说明 CI 触发条件、运行环境、验证范围和不覆盖内容。
- `.github/ISSUE_TEMPLATE/README.md` 说明普通缺陷、提交监测 issue 模板和敏感信息边界。
- `algo-electron/build/README.md` 说明 electron-builder 图标资源、打包配置关联和验证入口。
- `algo-electron/public/README.md` 说明 Vite 静态资源、默认首页、权限边界和验证入口。
- 同步 `docs/README.md`、`algo-electron/README.md`、`CONTRIBUTING.md`、`docs/project-hardening-audit.md` 和 `AI_HANDOFF.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增 `.github/README.md`、`.github/workflows/README.md`、`.github/ISSUE_TEMPLATE/README.md`、`algo-electron/build/README.md` 和 `algo-electron/public/README.md`；文档索引、子项目 README、贡献指南、项目巩固审计和交接文档已同步。

建议提交：`docs: 补齐协作与资源目录说明`

### P8-071 补齐主进程总览 README

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-014、P8-061、P8-070
涉及模块：electron、docs、TASKS、AI_HANDOFF
目标：为 `algo-electron/electron/` 主进程根目录补齐总览 README，避免只依赖子目录 README 而缺少主进程整体职责说明。
验收标准：

- 新增 `algo-electron/electron/README.md`。
- 文档说明主进程职责、根文件、子目录分类、关键封装入口、实现程度、修改边界和验证入口。
- 同步 `docs/README.md`、`algo-electron/README.md`、`docs/project-hardening-audit.md` 和 `AI_HANDOFF.md`。
- README 覆盖检查包含 `algo-electron/electron/` 根目录。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增 `algo-electron/electron/README.md`，覆盖 `main.ts`、`preload.ts`、`electron-env.d.ts`、主进程子目录分类、关键封装入口、实现程度、边界和验证入口；文档索引、子项目 README、项目巩固审计和交接文档已同步。

建议提交：`docs: 补齐主进程总览说明`

### P8-072 建立文档一致性自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-061、P8-062、P8-070、P8-071
涉及模块：tests、docs、package.json、TASKS、AI_HANDOFF
目标：把 Markdown 相对链接检查和 README 覆盖检查固化为 npm 验证入口，避免结构巩固成果依赖手工命令和记忆维护。
验收标准：

- 新增 `tests/docs/check-docs.mjs`。
- 新增 `tests/docs/README.md`。
- 新增 `docs/adr/README.md`，说明 ADR 目录职责、新增规则和维护要求。
- `package.json` 提供 `npm run test:docs`。
- `tests/run-tests.mjs` 支持 `docs` suite，并把 docs suite 纳入 `test:all`。
- 检查覆盖 Markdown 相对链接、`src`/`electron`/`tests` 根目录及子目录 README、`.github`、CI、issue 模板、`build`、`public` 和 `docs/adr` README。
- 同步 `tests/README.md`、`algo-electron/README.md`、`docs/README.md`、`CONTRIBUTING.md`、`docs/final-acceptance-checklist.md`、`docs/release-process.md`、`docs/project-hardening-audit.md`、`CHANGELOG.md` 和 `AI_HANDOFF.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增 `tests/docs/check-docs.mjs`、`tests/docs/README.md` 和 `docs/adr/README.md`；`npm run test:docs` 已接入统一 runner，`npm run test:all` 已包含文档一致性检查；相关文档、任务和交接已同步。

建议提交：`test: 添加文档一致性检查`

### P8-073 建立架构红线自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-004、P8-013、P8-062、P8-072
涉及模块：tests、package.json、electron、src、docs、TASKS、AI_HANDOFF
目标：把项目最高规则中最容易回归的架构红线固化为自动检查，避免后续重构重新引入旧浏览器容器、通用 IPC 暴露或 Nowcoder/VJudge 实时入库误抓路径。
验收标准：

- 新增 `tests/architecture/check-architecture.mjs`。
- 新增 `tests/architecture/README.md`。
- `package.json` 提供 `npm run test:architecture`。
- `tests/run-tests.mjs` 支持 `architecture` suite，并把 architecture guard 纳入 `test:core` 和 `test:all`。
- 检查运行时代码不得导入或实例化 Electron `BrowserView`。
- 检查 renderer 源码不得直接访问 `ipcRenderer`。
- 检查 `preload.ts` 不暴露通用 `ipcRenderer`、`send` 或 `invoke` 能力。
- 检查 Nowcoder/VJudge 站点目录不得引用通用 DOM verdict observer，并保留网络/强关联关键 token。
- 同步 `tests/README.md`、`algo-electron/README.md`、`docs/README.md`、`CONTRIBUTING.md`、`docs/final-acceptance-checklist.md`、`docs/project-hardening-audit.md`、`CHANGELOG.md` 和 `AI_HANDOFF.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增 architecture guard 和说明文档；`npm run test:architecture` 已通过，`test:core` 与 `test:all` 已默认执行该检查；相关文档、任务和交接已同步。

建议提交：`test: 添加架构红线检查`

### P8-074 建立打包配置自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-008、P8-062、P8-069、P8-072
涉及模块：tests、package.json、electron-builder、docs、TASKS、AI_HANDOFF
目标：把 Windows 发布前最关键的打包配置边界固化为自动检查，避免后续改动把开发目录、敏感文件、本地数据库或原生模块配置误带入安装包。
验收标准：

- 新增 `tests/packaging/check-packaging.mjs`。
- 新增 `tests/packaging/README.md`。
- `package.json` 提供 `npm run test:packaging`。
- `tests/run-tests.mjs` 支持 `packaging` suite，并把 packaging suite 纳入 `test:all`。
- 检查 `electron-builder.json5` 使用显式输入白名单、`asar: true`、`release/${version}` 输出、`build/icon.ico`、NSIS x64 和 `deleteAppDataOnUninstall: false`。
- 检查打包输入排除日志、本地数据库、`.env`、`tmp/`、`tests/` 和 `release/`。
- 检查 `better-sqlite3` 原生 `.node` 文件保持 `asarUnpack`。
- 检查 `build` 和 `build:win` scripts 保持标准命令。
- 同步 `tests/README.md`、`algo-electron/README.md`、`docs/README.md`、`CONTRIBUTING.md`、`docs/final-acceptance-checklist.md`、`docs/release-process.md`、`docs/project-hardening-audit.md`、`CHANGELOG.md` 和 `AI_HANDOFF.md`。
- 不发布安装包，不标记 `P8-009` 或 `P8-012` 完成。

完成记录：已新增 packaging guard 和说明文档；`electron-builder.json5` 已显式排除 `.env` 与 `.env.*`；`npm run test:packaging` 已通过，`test:all` 已默认执行该检查；相关文档、任务和交接已同步。

建议提交：`test: 添加打包配置检查`

### P8-075 建立敏感文件自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-063、P8-065、P8-068、P8-072
涉及模块：tests、package.json、SECURITY、docs、TASKS、AI_HANDOFF
目标：把仓库级敏感文件和高置信敏感文本检查固化为自动验证，避免 `.env`、本地数据库、日志或 Cookie/header 明文材料进入可提交文件。
验收标准：

- 新增 `tests/security/check-sensitive-files.mjs`。
- 新增 `tests/security/README.md`。
- `package.json` 提供 `npm run test:security`。
- `tests/run-tests.mjs` 支持 `security` suite，并把 security guard 纳入 `test:core` 和 `test:all`。
- 检查输入基于 `git ls-files --cached --others --exclude-standard`，只覆盖 tracked 和未忽略的新增文件。
- 检查禁止提交 `.env`、`.env.*`、`.sqlite`、`.sqlite3`、`.db` 和 `.log`。
- 检查高置信 `Cookie:`、`Set-Cookie:`、`Authorization: Bearer ...`、session/csrf token 赋值模式。
- 普通文档描述 `Cookie`、`session`、`csrf token` 等词汇不应误报。
- 同步 `tests/README.md`、`algo-electron/README.md`、`docs/README.md`、`CONTRIBUTING.md`、`SECURITY.md`、`docs/final-acceptance-checklist.md`、`docs/project-hardening-audit.md`、`CHANGELOG.md` 和 `AI_HANDOFF.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增 security guard 和说明文档；`npm run test:security` 已通过，`test:core` 与 `test:all` 已默认执行该检查；相关文档、任务和交接已同步。

建议提交：`test: 添加敏感文件检查`

### P8-076 建立项目巩固证据矩阵

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-061、P8-062、P8-072、P8-073、P8-074、P8-075
涉及模块：docs、TASKS、AI_HANDOFF、tests
目标：把用户提出的“分离、分类、标准化大项目、每块文档、实现程度、封装函数、统一测试清单”拆成可核查证据，避免把结构巩固、发布验收和最终总验收混在一起。
验收标准：

- 新增证据矩阵文档，逐项对应用户目标、当前证据和完成判定。
- 文档明确结构巩固已具备验收形态，但不代表 `P8-009` Windows 安装包发布或 `P8-012` v1.0 总验收完成。
- 文档列出自动测试入口、各入口证明范围和不能证明的内容。
- 文档列出新增长期目录 README 的最低内容要求：职责、当前实现程度、关键封装入口或函数、边界规则和验证入口。
- 同步 `docs/README.md`、`docs/project-hardening-audit.md`、`AI_HANDOFF.md` 和 `tests/README.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增 `docs/project-hardening-evidence.md`，并同步文档索引、结构巩固审计和交接说明；同时修正 `tests/README.md` 中关于 UI 自动化测试的过期描述，明确截图测试已存在但完整交互仍需手测。

建议提交：`docs: 添加项目巩固证据矩阵`

### P8-077 建立 README 内容质量自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-072、P8-076
涉及模块：tests/docs、docs、README、AI_HANDOFF、CHANGELOG
目标：把“每块文档必须讲清职责、实现程度、封装入口、边界和验证入口”从人工约定升级为自动检查，避免后续新增目录只补空壳 README。
验收标准：

- `tests/docs/check-docs.mjs` 在 README 覆盖基础上检查 README 内容质量。
- 检查覆盖已纳入文档守卫的 `src`、`electron`、`tests`、`.github`、workflow、issue template、`build`、`public` 和 `docs/adr` README。
- 内容质量规则允许不同标题写法，但必须能识别职责、当前实现或覆盖范围、封装入口或关键文件、边界规则和验证入口。
- 修正现有不达标 README，使 `npm run test:docs` 通过。
- 同步 `tests/docs/README.md`、`tests/README.md`、`docs/README.md`、`docs/project-hardening-audit.md`、`docs/project-hardening-evidence.md`、`AI_HANDOFF.md` 和 `CHANGELOG.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已扩展 `tests/docs/check-docs.mjs` 的 README 内容质量检查，并补齐 `src/components`、`src/features`、`src/hooks`、`src/shared`、`electron/parsers/sites`、`electron/submissions/syncers`、`.github/ISSUE_TEMPLATE` 和 `docs/adr` README 的实现程度、关键文件或验证入口描述；`npm run test:docs` 已通过。

建议提交：`test: 添加 README 内容质量检查`

### P8-078 建立文档总索引覆盖自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-072、P8-076、P8-077
涉及模块：tests/docs、docs、TASKS、AI_HANDOFF、CHANGELOG
目标：把 `docs/README.md` 作为文档总入口的维护要求自动化，避免新增长期 Markdown、ADR 或模块 README 后漏索引。
验收标准：

- `tests/docs/check-docs.mjs` 检查 `docs/README.md` 是否索引根目录长期 Markdown。
- 检查 `docs/README.md` 是否索引 `docs/` 下设计、审计、验收和发布文档。
- 检查 `docs/README.md` 是否索引 `docs/adr/` ADR 文档。
- 检查 `docs/README.md` 是否索引已纳入 README 覆盖守卫的长期目录 README。
- 当前索引通过新检查。
- 同步 `tests/docs/README.md`、`tests/README.md`、`docs/README.md`、`docs/project-hardening-audit.md`、`docs/project-hardening-evidence.md`、`AI_HANDOFF.md` 和 `CHANGELOG.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已在 `tests/docs/check-docs.mjs` 中新增 `docs/README.md` 总索引覆盖检查，覆盖根目录 Markdown、`docs/` Markdown、ADR 和已纳入守卫的 README；当前 `npm run test:docs` 已通过。

建议提交：`test: 添加文档总索引检查`

### P8-079 建立文档 npm script 引用自动验证

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-062、P8-072、P8-078
涉及模块：tests/docs、package.json、docs、TASKS、AI_HANDOFF、CHANGELOG
目标：把文档中的 `npm run <script>` 验证入口和 `algo-electron/package.json` 绑定，避免脚本改名后文档保留过期命令。
验收标准：

- `tests/docs/check-docs.mjs` 扫描仓库 Markdown 中的具体 `npm run <script>` 引用。
- 引用的具体 script 必须存在于 `algo-electron/package.json`。
- `npm run test:*` 这类通配说明不作为具体脚本校验。
- 当前文档引用通过新检查。
- 同步 `tests/docs/README.md`、`tests/README.md`、`docs/README.md`、`docs/project-hardening-audit.md`、`docs/project-hardening-evidence.md`、`AI_HANDOFF.md` 和 `CHANGELOG.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已在 `tests/docs/check-docs.mjs` 中新增 npm script 引用检查；当前文档中真实 `npm run` 命令均能在 `package.json` 找到，`npm run test:docs` 已通过。

建议提交：`test: 检查文档中的 npm 脚本引用`

### P8-080 增加最终人工验收记录模板

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-061、P8-069、P8-076
涉及模块：docs、TASKS、AI_HANDOFF、CHANGELOG
目标：在最终手测清单之外提供可填写的人工验收记录模板，方便用户统一记录自动验证、七站提交监测、核心页面、打包产物和剩余风险。
验收标准：

- 新增 `docs/manual-acceptance-report-template.md`。
- 模板覆盖基本信息、自动验证、七站提交监测、手动同步、核心页面、打包产物、问题风险和最终结论。
- 模板明确不得记录 Cookie、session、csrf token、用户源码、完整请求体、本机数据库内容或可复用登录态。
- 模板能辅助判断是否允许标记 `P8-009` 和 `P8-012`。
- 同步 `docs/README.md`、`docs/final-acceptance-checklist.md`、`docs/release-process.md`、`docs/project-hardening-audit.md`、`docs/project-hardening-evidence.md`、`AI_HANDOFF.md` 和 `CHANGELOG.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：已新增最终人工验收记录模板，并在最终手测清单、发布流程、项目巩固审计、证据矩阵和文档总索引中加入引用；后续用户统一手测可按该模板记录结果。

建议提交：`docs: 添加最终人工验收记录模板`

### P8-081 记录结构巩固全量自动验证基线

状态：已完成
优先级：P1
阶段：Phase 8
前置任务：P8-062、P8-073、P8-074、P8-075、P8-080
涉及模块：tests、docs、AI_HANDOFF、CHANGELOG
目标：在结构巩固收口后运行并记录一次全量自动验证基线，确认当前工程规范、文档守卫、架构守卫、打包守卫、核心逻辑和 UI 截图能够一起通过。
验收标准：

- 在 `algo-electron/` 下运行 `npm run test:all`。
- 验证通过 typecheck、lint、architecture guard、security guard、IPC contract、AI 规则、用户脚本 metadata、browser、parser、integration、adapter、submissions、DB repository、docs、packaging、Electron startup smoke 和 renderer screenshot。
- 明确该验证不替代真实 OJ 登录态、七站正式提交、验证码/风控、安装包真实安装升级卸载和用户最终手测。
- 同步 `docs/project-hardening-evidence.md`、`docs/project-hardening-audit.md`、`docs/manual-acceptance-report-template.md`、`AI_HANDOFF.md` 和 `CHANGELOG.md`。
- 不改变业务行为、数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter。

完成记录：2026-07-04 已运行 `npm run test:all` 并通过；全量自动验证结果已写入项目巩固证据、审计、人工验收模板和交接文档。`git diff --check` 仍仅有既有 LF/CRLF 规范提示。

建议提交：`test: 记录结构巩固全量验证基线`

## 12. 状态维护规则

- 每个任务开始时，将状态从“未开始”改为“进行中”。
- 每个任务完成时，将状态改为“已完成”，并在 `AI_HANDOFF.md` 记录完成内容。
- 任务阻塞时，状态改为“阻塞”，并写明阻塞原因和需要用户决定的事项。
- 新增任务必须使用同样字段：状态、优先级、阶段、前置任务、涉及模块、目标、验收标准、建议提交。
- 不允许删除历史任务；如果任务不再做，标记为“暂缓”并说明原因。

## 13. 下一位 Agent 的固定起点

如果没有用户指定任务，下一位 Agent 默认从以下顺序继续：

1. 先读 `docs/README.md`、`AI_HANDOFF.md`、`docs/project-hardening-audit.md`、`docs/project-hardening-evidence.md`、`docs/final-acceptance-checklist.md` 和 `docs/manual-acceptance-report-template.md`，确认当前结构巩固现场；新增目录 README 必须满足 `npm run test:docs` 的内容质量守卫，新增长期 Markdown/ADR/README 必须进入 `docs/README.md` 总索引，文档中的具体 `npm run` 命令必须存在于 `package.json`。
2. 核对工作区是否已有用户未提交改动；不要撤回提交监测、UI 或文档的既有修复。
3. 运行 `docs/project-hardening-audit.md` 第 6 节的自动验证基线；提交监测相关改动还必须追加 adapter/submissions 全量测试。
4. 等用户按 `docs/final-acceptance-checklist.md` 手测后，只修复实际失败项，并补最近的自动测试。
5. 发布前再处理 `P8-009` Windows 安装包发布和 `P8-012` v1.0 总验收；`P8-007` 和 `P8-008` 作为持续标准保持进行中。

任何情况下都禁止继续在 `BrowserView` 上新增功能，也不要重新把 Nowcoder 或 VJudge 接回通用 DOM verdict observer 作为实时入库来源。
