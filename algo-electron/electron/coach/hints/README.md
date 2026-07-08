# Coach 提示库

## 1. 职责

`electron/coach/hints/` 是 AI Coach 的提示生成层，负责通用提示模板、verdict 到提示类别的映射、以及 Socratic Ladder 分级提示。本目录不调用 LLM，所有提示由本地规则与模板生成。

## 2. 当前实现程度

- `hintTemplates.ts`：34 条内置 TS 模板，10 类（复杂度/边界/数据范围/初始化/溢出/输入输出/特判/越界/循环/元认知）。MVP 为 TS 文件不入库，M7 再迁移为 SQLite 表。
- `HintSelector.ts`：verdict → 类别映射（WA→边界/特判/IO，TLE→复杂度，RE→越界/初始化），轮询选择模板，不依赖算法标签。
- `HintLadder.ts`：6 级 Socratic Ladder（L0 不提示 / L1 轻提醒 / L2 元认知 / L3 关键细节边界 / L4 策略 / L5 概念标签），L5 升级需二次确认。

## 3. 封装函数与核心类型

- `HintSelector.selectHint(event, context, feedbackStore)` → 返回候选提示。
- `HintLadder.requestHintUpgrade(eventId, isConfirmation)` → 返回升级后的干预或确认请求。
- `HintLadder.needsConfirmationForUpgrade()` → 判断是否需要二次确认。

## 4. 边界规则

- 不直接给完整答案，用户主动点"再给一点"才升级。
- 概念/标签置于最高层 L5（CP 中"想法即答案"）。
- L5 升级需二次确认。
- 升级冷却复用 `RuleEngine.requestHintUpgrade`，不重复实现。
- 不依赖算法标签作为唯一判断依据。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:coach
```

覆盖测试：31（hintTemplates）+ 45（HintSelector）+ 41（HintLadder）= 117 个单元测试。
