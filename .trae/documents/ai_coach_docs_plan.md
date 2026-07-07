# AI Coach 文档规划

## Summary

本计划用于在 `d:\Algo-Learning-Platform\algo-electron` 项目中新增两份规划文档：

1. `docs/TASKS.md`：AI Coach 从 MVP 到复赛创新的精细任务拆解。
2. `docs/ai coach技术栈.md`：AI Coach 的技术栈选型、架构分层、取舍理由与扩展路线。

用户已明确：

- 不再纠结 1.0，默认 1.0 已完成。
- AI Coach 方向优先级：**创新视觉效果优先**。
- 运行策略：**本地离线为主**，大模型只作为可选增强。
- 实时数据来源：平台能实时抓取提交记录，以提交结果为主。
- 代码分析方式：用户卡住时由用户自行上传代码/粘贴代码后再进入解题辅助。
- 视觉风格：类 Codex 的科技感小人/桌宠，不是普通聊天框。
- 形象生成：用户应容易生成自己喜欢的形象。
- 标签限制：部分平台不提供算法标签，标签仅供参考。
- 不接入大模型时：只做通用小提示，例如复杂度、边界、数据范围、初始化、溢出等。

本计划只创建规划文档，不实现代码。

## Current State Analysis

### 项目技术现状

实际探索确认项目为 Electron + Vite + React + TypeScript + SQLite 本地优先桌面应用：

- `d:\Algo-Learning-Platform\algo-electron\package.json`
  - Electron 主入口：`dist-electron/main.js`
  - 构建：`tsc && vite build && electron-builder`
  - 核心依赖：`electron`、`react`、`better-sqlite3`、`recharts`、`vite`、`typescript`

### Electron / IPC 模式

- `d:\Algo-Learning-Platform\algo-electron\electron\main.ts`
  - 初始化主窗口、TabManager、TrackingService、RealtimeSubmissionService、UserScriptService。
  - 启动时会尝试生成 AI 上下文快照。
- `d:\Algo-Learning-Platform\algo-electron\electron\ipc\registerMainIpc.ts`
  - 汇总注册各业务 IPC。
- `d:\Algo-Learning-Platform\algo-electron\electron\ipc\registerAiIpc.ts`
  - 已有 AI 上下文导出、复习建议、薄弱分析、周期总结、AI 输出保存等 IPC。
- `d:\Algo-Learning-Platform\algo-electron\electron\preload.ts`
  - 通过 `window.electronAPI` 暴露给 renderer。

文档中应要求未来 AI Coach IPC 延续上述模式：主进程实现，`registerAiIpc.ts` 或独立 `registerCoachIpc.ts` 注册，`preload.ts` 暴露，renderer 不直接访问 SQLite。

### 现有 AI / 本地规则基础

- `d:\Algo-Learning-Platform\algo-electron\electron\ai\contextTypes.ts`
  - 已有 `AIContextExport`，包含总题数、已通过、提交数、错题、未复习、标签统计、近期活动等。
- `d:\Algo-Learning-Platform\algo-electron\electron\ai\recommendations\weaknessAnalyzer.ts`
  - 已有纯本地规则薄弱标签分析。
  - 基于 AC 率、错误提交、停留时长。
  - 不调用大模型。
- `d:\Algo-Learning-Platform\algo-electron\src\features\analytics\AiSuggestionsPanel.tsx`
  - 已有复习建议/薄弱标签展示。
  - 明确展示“基于本地统计规则生成”。

AI Coach 文档应建立在“规则优先、LLM 可选”的基础上，而不是重做 chatbot。

### 实时提交基础

- `d:\Algo-Learning-Platform\algo-electron\electron\submissions\RealtimeSubmissionService.ts`
  - 监听 TabManager 的 DOM ready、navigate、active tab change。
  - 注入实时提交 hook。
  - 接收 `oj-submission:detected`。
- `d:\Algo-Learning-Platform\algo-electron\electron\submissions\SubmissionWatcher.ts`
  - 处理提交结果并通知 `problems:updated`、`submissions:detected`。
- `d:\Algo-Learning-Platform\algo-electron\electron\submissions\README.md`
  - 明确实时提交数据流。
  - 持久化提交必须经过 `SubmissionBatchWriter`。
  - 不写入 Cookie、用户源码或完整请求体。

AI Coach 文档应将“提交结果”作为主要触发信号，而不是假设能持续读取用户代码。

### 数据库 / Repository 约定

- `d:\Algo-Learning-Platform\algo-electron\electron\db\connection.ts`
  - 使用 `better-sqlite3`，显式 import migration001 到 migration021。
- `d:\Algo-Learning-Platform\algo-electron\electron\db\migrate.ts`
  - 通过 `schema_migrations` 串行执行迁移。
- `d:\Algo-Learning-Platform\algo-electron\electron\db\migrations\README.md`
  - 新 migration 命名：`022_add_xxx.ts`。
  - 新 migration 必须加入 `connection.ts`。
- `d:\Algo-Learning-Platform\algo-electron\electron\db\repositories\README.md`
  - repository 只负责 SQLite 读写。
  - 不做网络请求、浏览器脚本、Electron session。

文档中应把未来 AI Coach 持久化表设计为后续任务，而不是本次直接创建。

### 文档现状

只读探索确认：

- `d:\Algo-Learning-Platform\algo-electron\docs` 当前不存在。
- 项目现有文档主要是模块内 `README.md`。
- 但迁移说明中曾引用 `docs/DESIGN/DATABASE_SCHEMA.md`，说明根级 docs 目录可以作为长期设计文档位置。

由于用户明确要求“在 docs 目录中创建”，本次执行应新增 `d:\Algo-Learning-Platform\algo-electron\docs` 目录，并写入两份文档。

## Proposed Changes

### 1. 新增 `d:\Algo-Learning-Platform\algo-electron\docs\TASKS.md`

用途：作为后续开发 AI Coach 的详细执行路线图。

文档结构建议：

1. 标题与目标
   - 明确 AI Coach 是“科技感视觉桌宠 + 本地学习教练 + 可选 LLM/RAG”的组合，不是聊天框。
2. 产品原则
   - 视觉优先。
   - 本地离线优先。
   - 提交结果驱动。
   - 用户主动上传代码后才分析代码。
   - 标签仅供参考。
   - 无大模型时只给通用提示。
3. 里程碑拆分
   - M0：文档与架构确认。
   - M1：桌宠视觉壳与状态系统。
   - M2：Coach 事件与本地规则触发。
   - M3：通用提示库与低 token 交互。
   - M4：用户主动上传代码分析入口。
   - M5：个性化形象生成/导入。
   - M6：可选 LLM Provider。
   - M7：知识库/RAG。
   - M8：复赛创新增强。
4. 精细任务清单
   - 每个任务包含：目标、涉及文件、实现要点、完成标准、验证方式、优先级。
5. 推荐实施顺序
   - 先视觉原型，再事件触发，再提示库，再 LLM。
6. 不做事项
   - 不默认上传代码。
   - 不直接给完整答案。
   - 不依赖标签作为唯一判断。
   - 不把 Coach 做成普通聊天框。

重点任务内容应包括：

- 创建 Coach 视觉系统任务：透明窗口、桌宠状态、气泡、交互按钮。
- 创建本地事件任务：从 `submissions:detected`、错题、停留时间、提交次数构造 CoachEvent。
- 创建提示规则任务：复杂度、边界、数据范围、初始化、溢出、特判、数组越界、循环条件、输入输出格式。
- 创建“用户上传代码分析”任务：手动入口、隐私提示、本地保存策略、可选大模型分析。
- 创建“用户自定义形象”任务：Rive/Lottie/SVG 模板导入、主题色、头像/身体/粒子效果组合。
- 创建后续 RAG 任务：模板库、题型卡、算法卡、本地检索、可选向量库。

### 2. 新增 `d:\Algo-Learning-Platform\algo-electron\docs\ai coach技术栈.md`

用途：记录 AI Coach 技术选型，方便后续照着开发。

文档结构建议：

1. 总体结论
   - MVP 推荐：Electron 透明悬浮窗 + React/Rive 或 CSS/SVG 动画 + TypeScript 本地规则引擎 + SQLite + 可插拔 LLM Provider。
2. 架构图
   - 提交结果 / 停留时间 / 用户上传代码 → Coach Event → 本地规则引擎 → 提示策略 → 桌宠展示 → 用户反馈 → 本地画像。
3. 前端视觉栈
   - 第一阶段：Electron BrowserWindow 透明窗 + React + CSS/SVG。
   - 第二阶段：Rive 或 Lottie。
   - 第三阶段：可选 Live2D，但说明授权和资产成本。
4. 本地规则栈
   - TypeScript rule engine。
   - SQLite 持久化。
   - 不依赖标签。
5. AI/LLM 栈
   - 默认关闭。
   - OpenAI-compatible Provider 抽象。
   - 支持 DeepSeek/Qwen/Ollama 等。
   - 只在用户主动请求更具体提示或上传代码分析时调用。
6. 知识库/RAG 栈
   - 第一阶段：SQLite 结构化模板库。
   - 第二阶段：关键词 + 标签 + 难度 + verdict 检索。
   - 第三阶段：本地向量库，如 vectra / SQLite vector 方案，需后续验证。
7. 数据与隐私策略
   - 不默认上传用户代码。
   - 提交结果可以本地分析。
   - 用户粘贴/上传代码时明确提示。
   - API Key 本地安全保存。
8. 技术栈对比表
   - 桌宠方案：CSS/SVG、Rive/Lottie、Live2D。
   - Agent 方案：自研规则引擎、LangGraph、Dify/Coze。
   - RAG 方案：SQLite 模板库、vectra、Chroma/Qdrant。
9. 最终推荐路线
   - MVP、增强版、复赛版三阶段。

### 3. 目录创建

由于当前 `docs` 目录不存在，执行阶段需要先创建：

- `d:\Algo-Learning-Platform\algo-electron\docs`

再写入：

- `d:\Algo-Learning-Platform\algo-electron\docs\TASKS.md`
- `d:\Algo-Learning-Platform\algo-electron\docs\ai coach技术栈.md`

## Assumptions & Decisions

1. 文档目录创建在 `algo-electron/docs`，不是仓库根目录 `d:\Algo-Learning-Platform\docs`。
   - 理由：探索确认 `package.json` 和项目主体位于 `algo-electron`，用户说“这个项目”通常指当前 Electron 项目。
2. 本次只创建文档，不改代码。
3. 文档会把“标签不可用”视为核心约束，所有 MVP 判断不得依赖标签。
4. 本地离线为默认模式；LLM、RAG、向量库均为增强项。
5. 用户上传代码分析是主动入口，不做后台自动采集源码。
6. 视觉路线优先科技感和可自定义，MVP 不直接绑定 Live2D，避免模型制作和授权复杂度拖慢开发。
7. 后续如果需要数据库表，文档只给建议表，不在本次创建 migration。

## Verification Steps

执行完成后验证：

1. 确认文件存在：
   - `d:\Algo-Learning-Platform\algo-electron\docs\TASKS.md`
   - `d:\Algo-Learning-Platform\algo-electron\docs\ai coach技术栈.md`
2. 阅读两份文档，确认包含用户明确要求：
   - 创新视觉效果优先。
   - 本地离线为主。
   - 实时提交结果为主。
   - 用户主动上传代码后再分析。
   - 类 Codex 科技感。
   - 用户容易生成/自定义喜欢的形象。
   - 标签仅供参考。
   - 无大模型时只给通用提示。
3. 确认文档引用的现有文件路径基于实际探索，不虚构。
4. 不运行构建或测试，因为本次只新增文档。

## Implementation Notes for Executor

用户确认计划后，执行者应：

1. 创建 `d:\Algo-Learning-Platform\algo-electron\docs` 目录。
2. 写入 `TASKS.md`，内容要足够细，可作为后续 issue/task board 使用。
3. 写入 `ai coach技术栈.md`，内容要包含明确技术取舍和推荐路线。
4. 不修改代码文件。
5. 最终回复简短说明两份文档已创建，并提供 clickable file links。
