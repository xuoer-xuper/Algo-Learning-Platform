# AI Coach 架构

## 1. 职责与当前实现

AI Coach 是 ALP 的本地优先过程陪练模块。当前 `2.0.0-beta.2` 已覆盖桌宠窗口、会话跟踪、提交事件、本地规则、分级提示、比赛模式、反馈记录、过程复盘、效果指标和可选 LLM 增强。

核心目标不是自动解题，而是在用户刷题过程中提供可解释、可关闭、可审计的渐进式提示。没有网络或 API Key 时，本地规则与模板仍应完整可用。

## 2. 分层

- 事件层：`ProblemSessionTracker` 和 `CoachEventBridge` 将页面、会话和提交变化归一化为 Coach 事件。
- 合规层：`ContestGuard` 在正式比赛场景硬关闭提示与 LLM，并记录审计信息。
- 决策层：`RuleEngine` 负责评分、节流、难度适配、提示升级冷却和用户屏蔽偏好。
- 提示层：`HintSelector`、`HintLadder`、模板库和 `ConstraintParser` 生成本地分级提示。
- LLM 层：`ContextGatherer`、`PromptBuilder`、`ArkClient` 和 `LlmHintService` 提供可选增强与失败降级。
- 展示层：独立桌宠窗口、气泡、聊天面板、设置页、时间轴和效果指标页通过固定 preload API 交互。
- 数据层：Coach repository 只写 Coach 专属事件、干预和反馈表，不修改核心学习事实。

## 3. 数据流

1. 浏览器与提交监测产生题目访问、活跃状态和提交结果。
2. Coach 事件桥接器更新当前会话并向规则引擎提交标准事件。
3. 比赛模式优先裁决；命中时终止提示链路并记录审计状态。
4. 规则引擎决定是否干预及目标等级，本地提示始终是默认路径。
5. 仅在用户启用 LLM、配置有效且不处于比赛模式时，才收集脱敏上下文请求增强提示。
6. 结果通过固定 IPC 推送到桌宠，用户反馈写入 Coach 专属表并影响后续频率。

## 4. 合规与安全边界

- renderer 不得直接访问 SQLite、Electron IPC 原语或已保存的明文 API Key。
- LLM 上下文不得包含 Cookie、登录态、CSRF token、完整请求体、本机绝对路径或未授权源码。
- 比赛模式必须在主进程硬关闭本地干预和 LLM，renderer 设置不能绕过。
- L5 接近题解方向时必须二次确认；Coach 不自动提交代码或修改用户答案。
- LLM 超时、网络错误、空响应和解析失败必须回退到本地提示，不影响刷题主流程。
- 核心事实表只由既有跟踪和提交模块维护，Coach 不反向改写题目、提交、访问或统计事实。

## 5. 关键入口

- 主进程生命周期：`CoachOrchestrator.start()` / `stop()`。
- 比赛判定：`ContestGuard.isContestMode()`。
- 桌宠输出：`CoachPetWindow.setPetState()` / `showBubble()`。
- Renderer API：固定的 `window.electronAPI.coach*` 方法，不提供通用 IPC 通道。
- 持久化：migration 022-024 与 `electron/db/repositories/coach/`。

## 6. 验证

```powershell
cd algo-electron
npm run typecheck
npm run lint
npm run test:coach
npm run test:security
npm run test:db
npm run test:all
```

自动验证使用临时数据库、mock LLM 和截图 harness，不使用真实登录态、用户数据库或 API Key。涉及正式比赛页、窗口穿透和打包安装的行为仍需要 Windows 人工验收。

## 7. 维护规则

- 新增 Coach 事件、IPC 或数据表时必须同步类型、preload、主进程 handler、repository、文档和 contract 测试。
- 修改比赛模式、提示等级或反馈语义时必须补充对应单元测试。
- 新增 LLM Provider 不得改变本地提示默认路径，也不得降低脱敏和降级要求。
