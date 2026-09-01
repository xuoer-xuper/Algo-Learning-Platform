# Coach 提示库

## 1. 职责

`electron/coach/hints/` 是 AI Coach 的提示生成层，负责通用提示模板、verdict 到提示类别的映射、以及 Socratic Ladder 分级提示。本目录不调用 LLM，所有提示由本地规则与模板生成。

## 2. 当前实现程度

- `hintTemplates.ts`：34 条内置 TS 模板，10 类（复杂度/边界/数据范围/初始化/溢出/输入输出/特判/越界/循环/元认知）。MVP 为 TS 文件不入库，M7 再迁移为 SQLite 表。
- `HintSelector.ts`：verdict → 类别映射（WA→边界/特判/IO，TLE→复杂度，RE→越界/初始化），轮询选择模板，不依赖算法标签。
- `HintLadder.ts`：6 级 Socratic Ladder（L0 不提示 / L1 轻提醒 / L2 元认知 / L3 关键细节边界 / L4 策略 / L5 概念标签），L5 升级需二次确认。

## 3. 封装函数与核心类型

- `HintSelector.selectHint(event, context, feedbackStore)` → 返回候选提示。
- `HintLadder.getMessageForLevel(level, context)` → `LadderHintContent`（含 `rejected` / `rejectReason`，L0 走这条拒绝分支）。这是 `CoachOrchestrator.requestLocalHintUpgrade` 唯一调用的入口。
- `HintLadder.needsConfirmationForUpgrade(currentLevel, eventType)` → 判断是否需要二次确认。
- L5 状态机：`markL5Pending` / `confirmL5` / `resetL5State`。

  这一节原先列的是 `HintLadder.requestHintUpgrade(eventId, isConfirmation)`。**该方法不存在**，
  `HintLadder` 上从来没有过它；升级由 `CoachOrchestrator.requestHintUpgrade` 决定等级后，
  再向本层要该等级的文案。

## 4. 边界规则

- 不直接给完整答案，用户主动点"再给一点"才升级。
- 概念/标签置于最高层 L5（CP 中"想法即答案"）。
- L5 升级需二次确认（live 路径上由 `CoachOrchestrator.l5PendingConfirmed` 实现，不是本层的 l5State）。
- 不依赖算法标签作为唯一判断依据。

> 这里原先写着"升级冷却复用 `RuleEngine.requestHintUpgrade`，不重复实现"。**两半都不成立**：
> `CoachOrchestrator.requestHintUpgrade` 自己重做了等级推进与 L5 确认，没有复用引擎那个；
> 而 `HINT_UPGRADE_COOLDOWN_MS`（2 分钟）只长在引擎那个方法里，它没有任何生产调用点。
> 结果是 live 路径上**没有升级频次限制**，只有一个防并发的 `hintInProgress`。
> 补不补这个冷却是产品决定（挡住用户的显式点击有 UX 代价），已记入
> `docs/DESIGN/QUALITY_HARDENING_PLAN.md` §11 待拍板，不在文档里假装它存在。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:coach
```

覆盖测试：31（hintTemplates）+ 45（HintSelector）+ 41（HintLadder）= 117 个单元测试。
