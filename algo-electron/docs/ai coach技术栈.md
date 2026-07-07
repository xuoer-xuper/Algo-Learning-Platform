# AI Coach 技术栈

> 本文档记录 AI Coach 的技术选型、架构分层、取舍理由与扩展路线，作为开发参考。任务清单见 [TASKS.md](./TASKS.md)。

## 1. 总体结论

AI Coach MVP 推荐技术栈：

> **Electron 透明悬浮窗 + React + CSS/SVG/Rive 动画 + TypeScript 本地规则引擎 + better-sqlite3 + 可插拔 LLM Provider**

核心取舍：

- 视觉优先，本地规则优先，LLM/RAG 为可选增强。
- 不引入 Python 服务、不引入独立向量数据库服务、不引入重型 Agent 框架。
- 保持 Electron 单体应用形态，便于本地分发与离线使用。

## 2. 架构分层

```text
┌──────────────────────────────────────────────────────────────┐
│  数据源层（已有）                                              │
│  submissions / problem_visits / activity_events                │
│  user_daily_stats / ai_context_snapshots / ai_outputs          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Coach 事件层（新增）                                          │
│  ProblemSessionTracker / CoachEventBridge / ContestGuard      │
│  订阅 submissions:detected / problem:detected / 停留时间        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  本地规则引擎层（新增）                                        │
│  RuleEngine / HintSelector / HintLadder / ConstraintParser    │
│  默认不调用 LLM                                                │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────────┐
      │ 本地模板库    │ │ 知识库    │ │ LLM Provider │
      │ hintTemplates│ │ (可选)    │ │ (可选)       │
      └──────────────┘ └──────────┘ └──────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  桌宠展示层（新增）                                            │
│  CoachPetWindow (Electron transparent BrowserWindow)          │
│  CoachPet (React + CSS/SVG/Rive)                              │
│  CoachBubble / CoachActions                                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  用户反馈层（新增）                                            │
│  CoachFeedbackStore → SQLite                                  │
│  影响后续提示频率与升级                                         │
└──────────────────────────────────────────────────────────────┘
```

## 3. 前端视觉栈

### 3.1 阶段路线

| 阶段 | 方案 | 用途 |
|---|---|---|
| MVP | Electron 透明 BrowserWindow + React + CSS/SVG | 几何体科技感小人，状态切换 |
| 增强 | Rive 或 Lottie | 更丰富的状态动画 |
| 复赛 | 可选 Live2D | 表现力最强，但授权与资产成本高 |

### 3.2 桌宠窗口配置

```ts
new BrowserWindow({
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  resizable: false,
  webPreferences: { preload: join(__dirname, 'preload.mjs') }
})
```

- preload 复用主窗口的 `preload.mjs`（与 `main.ts` 中 `path.join(__dirname, 'preload.mjs')` 一致），只暴露白名单 API。
- 窗口内容加载与主窗口同源：开发环境 `loadURL(devServerUrl + '#/coach-pet')`，生产 `loadFile(index.html, { hash: 'coach-pet' })`，renderer 按 hash 分流渲染桌宠入口。
- 通过 `setIgnoreMouseEvents(true, { forward: true })` 实现点击穿透（`forward` 仅 Windows/macOS 支持，与“优先 Win 验证”一致）。
- 穿透与交互互斥：气泡/按钮等可交互区域 `mouseenter` 时经 IPC 临时关闭穿透，`mouseleave` 恢复，否则穿透状态下按钮无法点击。
- 拖拽移动通过监听鼠标事件 + `setPosition` 实现。
- 与主窗口生命周期绑定。

### 3.3 视觉风格

类 Codex 科技感，不是萌系宠物：

- 几何体组合：圆/方/三角，发光描边。
- 粒子环/数据流光。
- 冷感配色：青蓝/紫/单色高对比。
- 状态配色：
  - `idle`：低饱和呼吸。
  - `thinking`：粒子加速。
  - `alert`：橙色/红色描边。
  - `celebrate`：粒子爆发。
  - `sleep`：灰阶缓慢。
  - `focus`：高亮聚焦。

### 3.4 动画方案对比

| 方案 | 优点 | 缺点 | License | 推荐 |
|---|---|---|---|---|
| CSS/SVG | 零依赖，可控 | 表现力一般 | 自有 | MVP |
| Rive | 交互式动画，运行时控制强，状态机原生支持 | 需学习 Rive 编辑器 | Rive runtime MIT（已核实），编辑器免费 | 增强阶段 |
| Lottie | 素材多，AE 工作流 | 交互性弱，状态切换需手动 | Lottie MIT，素材看授权 | 备选 |
| Live2D | 表现力最强，桌宠感强 | 模型制作成本高，发布需授权 | SDK 个人/小企业免费，扩展型应用需付费 | 复赛可选 |
| PixiJS + Spine | 游戏级 2D | 素材成本高，Spine 商业授权 | 需确认 | 不推荐 |

### 3.5 形象自定义

用户容易生成自己喜欢的形象：

- 内置参数化模板：形态 + 配色 + 粒子风格 + 发光强度。
- 导入 Rive/Lottie 文件。
- 导入/导出 JSON 配置。
- 不做云端服务，纯本地。

## 4. 本地规则栈

### 4.1 规则引擎

- 语言：TypeScript。
- 输入：CoachEvent + ProblemSession + LearnerProfile。
- 输出：是否触发干预 + 干预等级 + 候选提示。
- 特点：
  - 不调用大模型。
  - 不依赖算法标签。
  - 规则表可配置、可禁用。
  - 节流：同类型事件 30 分钟内不重复触发。
  - 阈值随题目难度自适应；卡壳判定基于有效活跃时间（focus/空闲三态），宁可漏报不误报。
  - 比赛模式（ContestGuard）下硬关闭，审计日志可证明赛时零介入。
  - 提示升级有冷却（防 hint abuse：每级 ≥ 2 分钟或需一次新提交）。
  - 结合 ConstraintParser 的题面约束（数据范围/时限）生成靶向提示，失败退化到通用提示。

### 4.2 规则示例

```ts
{
  id: 'multiple_wrong_submissions',
  condition: (event, session) =>
    event.session_id === session.session_id &&
    session.wrong_count >= 2,
  severity: 'medium',
  hintCategory: 'boundary',
  cooldownMinutes: 30
}
```

### 4.3 提示分级（Socratic Ladder）

| Level | 含义 | 示例 |
|---|---|---|
| 0 | 不提示，仅记录 | — |
| 1 | 轻提醒 | “要不要看一个方向提示？” |
| 2 | 元认知 | “先想清楚状态能否被复用？” |
| 3 | 关键细节/边界（不涉及算法思想） | “注意下标从 0/1 开始时边界不同。” |
| 4 | 策略 | “维护区间累计信息，O(1) 查询。” |
| 5 | 概念/标签（需二次确认，接近剧透） | “这题可能和前缀和有关。”（仅当有标签） |

原则：不直接给完整答案，用户主动点“再给一点”才升级。概念/标签在竞赛中“想法即答案”、比实现细节更剧透，故置于最高层。

## 5. AI/LLM 栈

### 5.1 设计原则

- 默认关闭。
- OpenAI-compatible Provider 抽象，支持多模型。
- 只在用户主动请求更具体提示或上传代码分析时调用。
- Token 节省优先。

### 5.2 Provider 抽象

```ts
interface LLMProvider {
  name: string
  generate(messages: ChatMessage[], options: GenerateOptions): Promise<string>
  isAvailable(): Promise<boolean>
}
```

### 5.3 候选 Provider

| Provider | 用途 | 备注 |
|---|---|---|
| DeepSeek | 低成本中文推理 | 推荐 |
| Qwen / 通义千问 | 中文、代码能力好 | 推荐 |
| OpenAI-compatible | 兼容接口 | 保持通用 |
| Ollama | 本地模型，离线 | 隐私卖点 |

### 5.4 Token 节省策略

三层决策：

1. 本地规则：不调用 LLM。
2. 模板库：不调用 LLM。
3. LLM/RAG：仅在以下场景调用：
   - 用户主动点“再给一点提示”。
   - 用户上传代码后主动请求分析。
   - 用户开启“智能模式”。

优化手段：

- 同一题同一层级提示缓存。
- 压缩上下文，不传全量历史。
- 不传完整提交历史。
- 输入只传：题面摘要、verdict、用户代码（用户主动上传时）。

## 6. 知识库/RAG 栈

### 6.1 阶段路线

| 阶段 | 方案 | 检索方式 |
|---|---|---|
| MVP | SQLite 结构化模板库 | 关键词 + 标签 + 难度 + verdict |
| 增强 | SQLite + 简单语义检索 | BM25 + 关键词 |
| 复赛 | 本地向量库 | 语义检索 |

### 6.2 知识库结构

```text
hint_templates       # 通用提示模板
concept_cards        # 算法概念卡
problem_patterns     # 题型模式
pitfall_cards        # 常见坑
coach_rules          # 规则配置
```

### 6.3 向量库对比

| 方案 | 优点 | 缺点 | License | 推荐 |
|---|---|---|---|---|
| vectra | 纯 JS，Electron 集成简单 | 大规模性能一般 | MIT（需确认） | 本地小知识库 |
| sqlite-vec / sqlite-vss | 与 SQLite 结合好 | 原生扩展打包复杂 | 需确认 | 后续评估 |
| LanceDB | 嵌入式向量库能力强 | Node 打包需验证 | Apache 2.0 | 数据量大后考虑 |
| Chroma / Qdrant | 功能强，生态好 | 需独立服务 | Apache 2.0 | 不推荐桌面应用 |

### 6.4 Embedding 来源

- 本地模型：如 `all-MiniLM-L6-v2`（需评估 Electron 打包）。
- API：如 OpenAI Embedding、智谱 Embedding。
- 离线优先时优先考虑本地模型。

## 7. 数据与隐私策略

| 数据类型 | 处理方式 |
|---|---|
| 提交结果 | 本地存储，可分析 |
| 题目访问会话 | 本地存储，聚合统计 |
| 用户代码 | 默认不上传，仅在用户主动上传且开启 LLM 时发送 |
| API Key | 本地安全保存，不明文日志 |
| Coach 反馈 | 本地存储 |
| 学习者画像 | 本地存储 |

原则：

- 本地优先，离线可用。
- 用户主动控制数据外发。
- 不在后台静默采集源码。
- LLM 调用前明确提示用户。

## 8. 与现有项目集成

### 8.1 IPC 模式

延续现有模式：

- 主进程实现 Coach 业务逻辑。
- 新增 `electron/ipc/registerCoachIpc.ts`。
- 在 `electron/ipc/registerMainIpc.ts` 中接入。
- `electron/preload.ts` 通过 `window.electronAPI` 暴露。
- renderer 不直接访问 SQLite。

### 8.2 数据库

- 沿用 `better-sqlite3`。
- 新增 migration 遵循 `electron/db/migrations/README.md` 约定：
  - 文件名：`022_add_xxx.ts`。
  - 必须加入 `connection.ts` 迁移列表。
- 新增 repository 放在 `electron/db/repositories/coach/`。
- 不污染核心事实表。

### 8.3 复用现有能力

| 现有能力 | 复用方式 |
|---|---|
| `contextExporter`（`electron/ai/contextExporter.ts`） | 作为 Coach 学习者画像输入 |
| `weaknessAnalyzer`（`electron/ai/recommendations/`） | 作为长期画像补充 |
| `RealtimeSubmissionService` / `SubmissionWatcher` | 主进程侧新增监听出口后订阅提交事件（现仅 `webContents.send('submissions:detected')` 发给 renderer，主进程无订阅点） |
| `TrackingService` | 复用题目访问会话 |
| `aiOutputRepository`（`electron/db/repositories/aiOutput/`） | 可保存 Coach 输出 |

## 9. 技术栈对比汇总

### 9.1 桌宠/视觉方案

| 方案 | 表现力 | 实现成本 | 授权风险 | 推荐 |
|---|---|---|---|---|
| CSS/SVG | 中 | 低 | 无 | MVP |
| Rive | 高 | 中 | 低 | 增强 |
| Lottie | 中 | 中 | 素材看授权 | 备选 |
| Live2D | 极高 | 高 | 中 | 复赛可选 |
| Spine | 高 | 高 | 商业授权 | 不推荐 |

### 9.2 Agent 编排方案

| 方案 | 优点 | 缺点 | 推荐 |
|---|---|---|---|
| 自研 TypeScript 规则引擎 | 轻量，可控，省 token | 复杂对话能力有限 | MVP |
| LangGraph | 状态机能力强 | 引入 Python/JS 复杂度 | 复赛可选 |
| LlamaIndex | RAG 能力强 | Agent 编排弱 | 知识库可选 |
| Dify | 可视化快速 | 部署重，不适合桌面 | 不推荐 |
| Coze | 原型快 | 依赖云端 | 不推荐 |

### 9.3 RAG 方案

| 方案 | 优点 | 缺点 | 推荐 |
|---|---|---|---|
| SQLite 模板库 | 与现有架构贴合 | 语义检索弱 | MVP |
| vectra | 纯 JS，Electron 友好 | 大规模一般 | 本地小库 |
| sqlite-vec | 与 SQLite 结合 | 打包复杂 | 后续评估 |
| LanceDB | 能力强 | 打包需验证 | 数据量大后 |
| Chroma/Qdrant | 功能强 | 需服务 | 不推荐 |

## 10. 最终推荐路线

### 10.1 MVP（M1-M3）

- Electron 透明悬浮窗 + React + CSS/SVG。
- TypeScript 规则引擎。
- SQLite 持久化。
- 本地模板提示库。
- 不接 LLM，不接向量库。

### 10.2 增强版（M4-M6）

- Rive/Lottie 动画。
- 形象自定义。
- 可选 LLM Provider（OpenAI-compatible）。
- 用户主动上传代码分析。
- Token 节省策略。

### 10.3 复赛版（M7-M8）

- 本地向量库（vectra 或 SQLite vector）。
- 错因归因。
- 学习者知识图谱。
- 情绪系统。
- Socratic Ladder 增强。
- 可选 Live2D。

## 11. 依赖清单

### 11.1 必须新增

| 依赖 | 用途 |
|---|---|
| 无（MVP 全部可用现有依赖实现） | — |

### 11.2 可选新增

| 依赖 | 用途 | 阶段 |
|---|---|---|
| `@rive-app/react-canvas` | Rive 动画 | 增强 |
| `lottie-react` | Lottie 动画 | 备选 |
| `openai` | OpenAI-compatible 客户端 | M6 |
| `vectra` | 本地向量库 | M7 |
| `better-sqlite3` 扩展 | 向量检索 | M7（待评估） |

### 11.3 不引入

- Python 运行时。
- 独立向量数据库服务（Chroma/Qdrant）。
- 重型 Agent 框架（LangGraph/LlamaIndex 直接依赖）。
- Docker。
- 云端 RAG 服务。

## 12. 性能与可扩展性

### 12.1 性能注意

- 事件采集分层，不记录每次按键。
- 停留时间按 30-60s 聚合。
- 规则判断节流，30s 一次。
- LLM 调用异步，不阻塞 UI。
- 桌宠窗口轻量，避免重渲染。

### 12.2 扩展性

- Provider 抽象支持新增模型。
- 规则表可配置。
- 提示库可扩展。
- 形象模板可导入。
- 知识库可 CRUD。
- 不耦合核心事实表，便于后续重构。

## 13. 风险与对策

| 风险 | 对策 |
|---|---|
| Electron 透明窗口跨平台差异 | 优先 Win 验证，macOS/Linux 后续适配 |
| Rive/Lottie 打包体积 | 按需加载，不强制 |
| LLM 调用成本 | 默认关闭，三层决策 |
| 标签缺失 | 所有 MVP 判断不依赖标签 |
| 用户代码隐私 | 主动上传，明示提示 |
| Live2D 授权 | 复赛阶段再评估 |
| 向量库打包 | 先用 vectra 验证 |
| 规则引擎维护成本 | 规则表化，可配置 |
| 停留信号效度（IDE 失焦/挂机误判卡壳） | focus/空闲三态计时 + 难度自适应阈值 + 小样本标定误报率 |
| rated 比赛合规（CF 2024-09 禁赛中 AI） | ContestGuard 硬关闭 + 审计日志，默认开启不可绕过 |
| 错误提示反噬信任（标签猜错误导方向） | 概念提示置于最高层且需二次确认；“没帮助”反馈立即降频 |
| 只在内嵌浏览器练习才有数据（用户部分练习在外部浏览器） | 数据口径如实标注；后续评估提交历史事后导入兜底 |
