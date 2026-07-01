# AI Coach Agent Spec

## Why

当前平台已完成 Phase 1-5（题目追踪、提交同步、行为分析、Rating、站点扩展），但 Phase 6（AI 辅助学习）几乎全部未开始。用户参赛需要一个创新点：**面向个人的 AI 算法教练**，不是刷题助手，而是长期陪伴成长的 Personal AI Agent。

现有 AI 产品只关注"这道题怎么解"，不记得用户是谁、走过什么路。本方案让 AI 拥有长期记忆、动态引导、工具调用能力，成为会陪伴、会记忆、会成长的算法教练。

## What Changes

### 前置基础（P6-001~004，AI Coach 数据接口）
- 新建 `notes` 表与本地 Markdown 笔记系统（P6-001）
- 题目详情页关联本地笔记入口（P6-002）
- 提交记录关联代码片段/文件路径（P6-003）
- AI 上下文导出层，统一导出学习数据摘要（P6-004）

### AI Coach 核心
- 新建 migration 010，创建 `ai_memory`、`knowledge_entries`、`coach_logs` 三张表
- 新增 `coach:*` IPC 命名空间，补全 preload 中未暴露的 `onProblemDetected` 订阅器
- 自研轻量三层记忆系统（短期/长期/风险，参考 Mem0 + DeepTutor L1/L2/L3）
- 规则引擎（0 token 决策）：监听 WA 次数、停留时长、同标签错题数
- 知识库 RAG：sqlite-vec 向量检索 + bge-small-zh 本地嵌入，导入用户 Markdown 模板
- LLM 双适配器：OpenAI 兼容（覆盖 DeepSeek/Qwen/硅基等）+ Anthropic，支持流式输出（SSE）
- 桌宠 UI：Framer Motion 驱动的浮层组件，支持 idle/thinking/worried/happy 状态切换
- 对话面板：Markdown 渲染 + 代码高亮 + 流式逐字显示
- 状态管理：引入 zustand 解耦 App.tsx（当前已有 9 个 useState）

### 省 Token 三层决策机制
- **L1 规则引擎**（0 token）：WA≥3、停留>15min、同标签错题≥5 → 本地提示
- **L2 知识库检索**（0 token）：sqlite-vec 检索相关模板/笔记
- **L3 LLM 深度分析**（花 token）：用户主动提问、复杂错误分析、训练计划

## Impact

- **Affected specs**: Phase 6 (P6-001~011) 被 AI Coach 升级替代；P6-005~011 不再单独做
- **Affected code**:
  - `electron/db/migrations/` — 新增 010（coach 表）、011（notes 表）、012（submissions 代码关联字段）
  - `electron/main.ts` — 新增 coach IPC 注册（扁平风格）
  - `electron/preload.ts` — 新增 coach 分组 + 补全 onProblemDetected
  - `electron/coach/` — 新增整个目录（CoachService、RuleEngine、KnowledgeBase、MemoryManager、LLMDispatcher）
  - `electron/notes/` — 新增笔记系统（P6-001）
  - `electron/ai/context/` — 新增 AI 上下文导出层（P6-004）
  - `src/features/coach/` — 新增桌宠 UI、对话面板、zustand store
  - `src/features/notes/` — 新增笔记编辑器组件（P6-002）
  - `src/App.tsx` — 挂载 CoachWidget，解耦部分状态到 zustand
  - `vite.config.ts` — 新增原生模块 external（sqlite-vec、onnxruntime-node）
  - `tailwind.config.js` — 扩展 theme.extend（动画 keyframes）、新增 typography 插件
  - `package.json` — 新增依赖

## ADDED Requirements

### Requirement: 本地笔记系统（P6-001）
系统 SHALL 为每道题目提供本地 Markdown 笔记管理能力，笔记文件存储在 `userData/notes/` 目录下，数据库 `notes` 表记录元数据。

#### Scenario: 创建笔记
- **WHEN** 用户在题目详情页点击"新建笔记"
- **THEN** 在 `userData/notes/` 下创建 `{problem_id}_{timestamp}.md` 文件
- **AND** 在 `notes` 表插入记录（problem_id、title、file_path、note_type='manual'）
- **AND** 笔记编辑器打开

#### Scenario: 关联多个笔记
- **WHEN** 一道题已有笔记，用户再次新建
- **THEN** 允许创建第二个笔记，题目详情页列出所有关联笔记

### Requirement: 题目详情页笔记入口（P6-002）
题目详情页 SHALL 展示该题关联的所有本地笔记列表，并提供创建/打开/重命名/删除入口。

#### Scenario: 查看笔记列表
- **WHEN** 用户打开题目详情页
- **THEN** 显示"本地笔记"区域，列出该题所有 notes（标题 + 更新时间）
- **AND** 区分本地笔记 vs 未来 AI 生成内容

### Requirement: 提交记录代码关联（P6-003）
submissions 表 SHALL 新增 `code_file_path`、`code_summary`、`code_language` 字段，记录用户提交代码的本地路径和摘要（不强制复制代码内容）。

#### Scenario: 关联代码文件
- **WHEN** 用户在提交详情页选择"关联本地代码"
- **THEN** 弹出文件选择器，选择 .cpp/.py/.java 等文件
- **AND** 记录文件路径到 submissions.code_file_path
- **AND** 若文件路径失效，详情页显示警告提示

### Requirement: AI 上下文导出层（P6-004）
系统 SHALL 提供 `AIContextExporter`，导出用户学习数据摘要供 AI 使用，不导出 Cookie、敏感路径等隐私数据。

#### Scenario: 导出上下文
- **WHEN** AI Coach 需要用户上下文
- **THEN** 调用 `coach:getContext`，返回 JSON 包含：最近错题、薄弱标签、活跃趋势、当前题目信息
- **AND** 返回结构带 `version` 字段，便于未来兼容

### Requirement: AI Coach 三层记忆系统
系统 SHALL 实现三层记忆：短期工作记忆（当前对话）、长期记忆（跨 session，sqlite-vec 向量库）、风险记忆（危险操作/错误模式记录）。

#### Scenario: 记忆智能更新
- **WHEN** LLM 分析用户对话后发现新事实（如"用户擅长 DP 但薄弱图论"）
- **THEN** 触发 ADD/UPDATE/DELETE/NONE 决策
- **AND** ADD 插入 ai_memory 表，UPDATE 更新已有记录，DELETE 标记过时
- **AND** 仅在关键节点触发（非每次对话都调 LLM 更新记忆）

#### Scenario: 记忆检索
- **WHEN** 用户提问或触发规则
- **THEN** 用 sqlite-vec 向量检索相关长期记忆（Top-5）
- **AND** 注入到 LLM 上下文中

### Requirement: 规则引擎（0 token 决策）
系统 SHALL 监听学习行为事件，纯本地规则判断是否需要主动提示，不消耗 token。

#### Scenario: WA 多次提示
- **WHEN** 同一题目 WA 次数 ≥ 3
- **THEN** 桌宠切换为 worried 状态，弹出气泡"注意一下边界情况，或者换个思路？"
- **AND** 记录到 coach_logs（trigger_type='rule', token_used=0）

#### Scenario: 停留过长提示
- **WHEN** 用户在某题停留 > 15 分钟且无新提交
- **THEN** 桌宠弹出"要不要换个角度试试？或者看看相关模板"

#### Scenario: 同标签错题预警
- **WHEN** 同一算法标签的错题累计 ≥ 5 道
- **THEN** 桌宠弹出"你在{标签}上错题较多，要不要系统复习一下？"

### Requirement: 知识库 RAG
系统 SHALL 支持导入用户的 Markdown 算法模板，向量化后用 sqlite-vec 检索，0 token 返回相关模板。

#### Scenario: 导入模板
- **WHEN** 用户选择"导入模板目录"
- **THEN** 读取所有 .md 文件，按标题分块
- **AND** 用 bge-small-zh 本地嵌入，存入 knowledge_entries.embedding_blob
- **AND** 记录 entry_type='template'、source_path、tags_json

#### Scenario: 检索模板
- **WHEN** 用户卡题或主动查询
- **THEN** 查询文本 → 嵌入 → sqlite-vec 余弦相似度检索 Top-3
- **AND** 桌宠提示"你之前记过相关笔记，要看看吗？"

### Requirement: LLM 双适配器与流式输出
系统 SHALL 提供 OpenAI 兼容适配器 + Anthropic 适配器，用户配置 base_url + api_key + model 即可切换。LLM 回复 SHALL 支持流式输出（SSE），逐字显示。

#### Scenario: OpenAI 兼容调用
- **WHEN** 用户配置 base_url=`https://api.deepseek.com`、api_key、model=`deepseek-chat`
- **THEN** 通过 OpenAI SDK 调用，正常工作
- **AND** 流式返回，对话面板逐字显示

#### Scenario: Anthropic 调用
- **WHEN** 用户配置 provider='anthropic'、api_key、model=`claude-3-5-sonnet`
- **THEN** 通过 Anthropic SDK 调用，原生 Prompt Caching 生效

### Requirement: 桌宠 UI
系统 SHALL 在应用右下角显示一个桌宠浮层组件，支持状态切换和拖拽。

#### Scenario: 状态切换
- **WHEN** 用户导航到新题目 → 桌宠 idle
- **WHEN** 检测到 WA 多次 → 桌宠 worried
- **WHEN** 用户 AC → 桌宠 happy
- **WHEN** LLM 正在生成 → 桌宠 thinking

#### Scenario: 对话面板
- **WHEN** 用户点击桌宠
- **THEN** 展开对话面板，显示对话历史
- **AND** 用户可输入问题，LLM 流式回复

#### Scenario: z-index 层级
- **WHEN** 模态层（设置/仪表盘）打开
- **THEN** 桌宠浮层低于 modal-panel，但高于 content-area
- **AND** 刷题时桌宠始终可见

## MODIFIED Requirements

### Requirement: Phase 6 任务范围调整
原 P6-005~011（错题建议、薄弱分析、总结、计划、AI 输出保存、限制修改、可追溯性）被 AI Coach 的规则引擎、记忆系统、LLM 分析能力升级替代，不再单独实现。

## Assumptions & Decisions

1. **TrackingService 不大改**：当前只追踪 `visit_start`。提交/WA 数据通过轮询 `submissions` 表或提交同步后查询获取，不修改 TrackingService 同步语义。
2. **桌宠用浮层组件**：Sprint 1 用 `position: fixed` 浮层，不搞独立窗口。复杂度低，大赛演示足够。
3. **嵌入模型本地运行**：`@huggingface/transformers` 的 bge-small-zh，首次加载约 100MB，缓存在 `userData/cache/models/`。
4. **工具调用初赛自研**：设计为可插拔抽象层，复赛升级 MCP 标准协议。
5. **Prompt Caching 利用**：用户成长历史作为系统提示词缓存，命中后成本降低 10 倍。
6. **迁移编号**：010=coach 表，011=notes 表，012=submissions 代码关联字段。按依赖顺序执行。
