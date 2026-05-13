# 项目路线图（ROADMAP）

## 1. 项目目标

Algo Learning Platform 是一个本地优先的个人算法学习平台。v1.0 的目标是完成一个可长期使用的桌面端：支持多平台刷题、自动识别题目、记录学习行为、记录提交与 Rating、分析学习轨迹，并为 AI 复习建议、同步和安卓端预留稳定基础。

## 2. 当前状态

当前项目已经有 Electron + React + TypeScript + Vite 骨架，并存在旧的 `BrowserView` 实现。根据最新架构决策，后续必须迁移到 `WebContentsView`，不得继续在 `BrowserView` 上叠加功能。

## 3. 阶段划分

### Phase 0：架构与协作基线

目标：先让项目“可被长期接手”。

范围：

- 明确 WebContentsView 为唯一浏览器方案。
- 明确 Main、Preload、Renderer、SQLite、IPC 边界。
- 明确 CookieVault、站点适配、学习行为事件模型。
- 完善 AI 协作流程和中文提交规范。
- 建立 `ARCHITECTURE.md`、`DATABASE_SCHEMA.md`、`AI_WORKFLOW.md`、`SITE_ADAPTER_GUIDE.md`、ADR。

退出标准：

- 所有核心文档存在。
- `TASKS.md` 包含全周期任务编号。
- 新 Agent 阅读文档后能知道下一步任务。

### Phase 1：桌面 MVP 基础

目标：做出真正可用的刷题桌面端。

范围：

- 初始化 TailwindCSS。
- 清理默认模板。
- 迁移到 `WebContentsView`。
- 建立 `BrowserHost`。
- 实现持久 session。
- 建立 CookieVault。
- 支持 Codeforces、AcWing、牛客、VJudge 登录和基础刷题。
- 建立站点注册表。
- 完成四个平台 URL 识别。
- 初始化 SQLite。
- 建立 Problem、ProblemVisit、ActivityEvent、StudySession。
- 实现题库侧边栏和基础统计。

退出标准：

- 用户能在应用内登录四个平台并正常刷题。
- 进入题目页能自动识别并写入本地数据库。
- 能查看最近访问和基础学习统计。
- Cookie 登录状态可在重启后保留。

### Phase 2：题目元数据与提交记录

目标：从“访问记录”升级为“题目和提交数据平台”。

范围：

- 抓取题目标题、难度、标签。
- 建立提交记录表。
- 同步 Codeforces、AcWing、牛客、VJudge 提交记录。
- 记录 AC、WA、TLE、RE、CE、语言、提交时间、提交次数、首次 AC。
- 实现题目详情页和提交详情页。

退出标准：

- 题目列表不只显示 URL，而能显示标题、状态、平台、标签、难度。
- 提交记录能与题目关联。
- 首次 AC 和题目状态能自动计算。

### Phase 3：学习行为分析

目标：把原始学习事件转为可解释的学习行为分析。

范围：

- 每日活跃时长。
- 刷题数量趋势。
- AC 趋势。
- 提交趋势。
- 平台分布。
- 单题停留时间。
- 学习轨迹时间线。
- 连续活跃天数。
- 错题列表。
- 长期未复习题目。
- 统计 Dashboard。

退出标准：

- 用户能看到自己的学习轨迹、活跃情况、平台分布和薄弱记录。
- 原始事件可重算聚合数据。

### Phase 4：Rating 与竞赛

目标：记录算法竞赛成长曲线。

范围：

- 平台账号绑定。
- Rating 历史。
- Peak rating。
- Contest rating delta。
- 比赛记录。
- VJudge contest 映射预留。

退出标准：

- 至少 Codeforces Rating 能同步和展示。
- Rating 趋势和比赛记录可追踪。

### Phase 5：站点扩展系统

目标：让项目能长期适配新 OJ。

范围：

- 站点管理页。
- 手动新增网站配置。
- 编辑域名、首页、题目 URL 规则。
- 启用/禁用站点。
- 导入导出站点配置。
- 新增 PTA 默认配置。
- adapter 扩展接口。
- 站点规则测试样例。

退出标准：

- 用户可以添加普通 OJ 站点并识别题目 URL。
- PTA 有默认配置或基础识别。
- 复杂站点可以通过 adapter 扩展。

### Phase 6：AI 辅助学习

目标：基于本地数据提供 AI 复习和学习建议。

范围：

- 本地题解 Markdown。
- 题目笔记。
- 提交代码关联。
- AI 上下文导出。
- 错题复习建议。
- 薄弱标签分析。
- 阶段学习总结。
- 复习计划生成。

退出标准：

- AI 可以基于本地数据生成可追溯建议。
- AI 输出不会直接污染核心学习数据。

### Phase 7：同步、备份与多端预留

目标：保证长期数据安全，并为安卓端预留。

范围：

- `sync_queue`。
- 本地数据库备份。
- JSON 导入导出。
- 冲突检测策略。
- Cookie 不同步规则。
- 安卓端只读数据接口设计。

退出标准：

- 用户能备份和恢复本地数据。
- 数据模型具备未来同步和安卓端读取基础。

### Phase 8：质量、发布与长期维护

目标：完成 v1.0 发布质量。

范围：

- ESLint / TypeScript 检查。
- Parser 单元测试。
- Repository 测试。
- IPC contract 测试。
- Electron smoke test。
- 关键页面截图验收。
- Windows 打包。
- Changelog。
- 故障排查文档。
- 数据迁移回滚文档。

退出标准：

- Windows 安装包可发布。
- v1.0 功能稳定。
- 后续 Agent 可以安全继续迭代。

## 4. 必须提前预留的架构

- 数据库迁移系统。
- 事件日志与聚合统计分离。
- CookieVault。
- Site Registry。
- Parser Adapter。
- Typed IPC。
- BrowserHost。
- Sync metadata。
- AI 上下文导出层。

