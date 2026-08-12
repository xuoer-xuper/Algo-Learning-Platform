# Coach LLM 模块

## 职责

`electron/coach/llm/` 提供 AI Coach 的可选大模型增强。模块负责收集脱敏上下文、构造提示词、调用 OpenAI 兼容接口并将失败降级为本地提示；它不绕过本地规则引擎，也不直接修改题目、提交或统计事实数据。

## 当前实现

当前覆盖火山方舟 OpenAI 兼容接口、结构化分级提示、自由聊天、连接测试和本地提示降级。LLM 默认关闭，未配置密钥时 Coach 仍可完整使用本地规则与模板。

## 组件

- `ContextGatherer.ts`：收集当前题目、会话、提交历史和本地学习画像。
- `PromptBuilder.ts`：构造分级提示和自由聊天消息。
- `ArkClient.ts`：调用火山方舟 OpenAI 兼容接口，处理超时、token 和结构化响应。
- `LlmConfigStore.ts`：保存模型、Base URL、启用状态和 API Key。
- `LlmHintService.ts`：编排上下文、请求和本地降级。
- `LlmHintTypes.ts`：模块内部请求、响应和配置类型。

## 配置与密钥

- LLM 默认关闭，没有 API Key 时不能启用。
- renderer 只能读取脱敏状态，不能读取已保存的明文 API Key。
- API Key 通过固定 IPC channel 传给主进程保存，不写入日志、导出文件或 SQLite 学习数据。
- 连接测试只使用用户当前输入或主进程已保存的 Key，返回成功状态、模型和延迟摘要。

## 降级与合规

- 网络错误、超时、空响应和 JSON 解析失败由 `LlmHintService` 捕获并降级到本地提示。
- 比赛模式由 `ContestGuard` 和 `CoachOrchestrator` 硬关闭，不能通过 renderer 或 LLM 配置绕过。
- LLM 提示继续受 Socratic Ladder 等级限制，不直接输出完整题解。
- 发送给模型的上下文必须经过脱敏，不包含 Cookie、登录态、完整请求体或本机绝对路径。

## 验证

```powershell
cd algo-electron
npm run typecheck
npm run lint
npm run test:coach
npm run test:security
npm run test:all
```

自动测试不使用真实 API Key 或真实网络请求。手动连接测试应使用测试 Key，并确认日志和导出文件中没有明文密钥。

`tests/coach/arkClient.test.ts` 通过注入内存 transport 覆盖结构化回复、自由聊天、token 统计、空回复、非法 JSON、连接失败和超时，并验证方舟 `thinking` 扩展参数的构造，不会访问真实服务。
