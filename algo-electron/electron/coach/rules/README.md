# Coach 规则引擎

## 1. 职责

`electron/coach/rules/` 是 AI Coach 的本地规则引擎，根据事件与会话判断是否触发干预，支持节流、防 hint abuse 冷却、难度自适应阈值与比赛模式硬关闭。本目录不调用 LLM。

## 2. 当前实现程度

> **接线状态：本目录在生产路径上是惰性的（2026-09 实测）。**
>
> `electron/` 下对 `ruleEngine` 的调用只有 4 处（`CoachOrchestrator.ts:267 / 803 / 809 / 1038`），
> 全部是**写**：`notifyNewSubmission` / `markNeverToday` / `markDismissed`。而这三者写的
> `lastTrigger` / `currentLevel` / `lastUpgradeAt`，读的地方只有 `handleEvent`（171、211 行）、
> `requestHintUpgrade`（243、247、248 行）和两个 `*ForTest` getter——**前两个方法都没有生产调用点**。
> 于是这些写入在生产中不产生可观察行为。
>
> 用户实际体验到的东西由别处提供：屏蔽走 `CoachFeedbackStore.shouldSuppress`
> （`markNeverToday` 自己的注释就写着"委托给 CoachFeedbackStore 持久化"），比赛硬关闭走
> `ContestGuard.isContestMode()`，提示等级走 `CoachOrchestrator.currentHintLevel`。
> 下面列的能力都**已实现且有测试**，但目前只有单测在驱动。原因不是坏了，而是"事件自动介入"
> 这条产品线还没接（见 `CoachOrchestrator.handleIntervention` 的注释与
> `docs/DESIGN/QUALITY_HARDENING_PLAN.md` §11）。

- `rules.ts`：规则表（5 条已实现 + 3 条 Stage 3 预留）+ 常量（`RULE_THROTTLE_MS` / `HINT_UPGRADE_COOLDOWN_MS` / `DEFAULT_TRIGGER_SCORE_THRESHOLD`）。
- `RuleEngine.ts`：规则引擎核心，支持：
  - 节流：同类型事件 30 分钟内不重复触发。
  - 防 hint abuse：升级冷却（每级 ≥ 2 分钟或需一次新提交）。**注意这条冷却只在
    `RuleEngine.requestHintUpgrade` 里，而 live 的升级走 `CoachOrchestrator` 的同名方法，
    所以它当前不生效**，不要据此以为点击已被限频。
  - 难度自适应：rating ≥ 1600 时阈值放宽。
  - 比赛模式硬关闭：构造时传 `getIsContestMode` 回调，返回 true 时 `handleEvent` 与
    `requestHintUpgrade` 都返回 null。（原文写的 `setContestMode(true)` 是不存在的方法，
    引擎不持有该开关，只读回调。）
  - never_today 屏蔽：清掉当前节流；当天不再触发由 `CoachFeedbackStore` 负责。

## 3. 关键函数

签名以源码为准，下面这几条以前对不上，已按实际改写；无生产调用点的标了「未接线」。

- `RuleEngine.handleEvent(event)` → `CoachIntervention | null`。**未接线**（不收 session；
  会话经构造时的 `getSession` 回调取）。
- `RuleEngine.requestHintUpgrade(eventType, currentInterventionId, event, isConfirmation?)`
  → 升级结果或 L5 确认请求。**未接线**（四个参数，不是 `(eventId, isConfirmation)`）。
- `RuleEngine.markNeverToday(eventType)` → 清当前节流；持久化屏蔽在 `CoachFeedbackStore`。
- `RuleEngine.markDismissed(eventType)` → 清该类型等级。live 有调用，但 `dismissHint`
  紧接着就把 `CoachOrchestrator.currentHintLevel` 归零，所以是冗余而非必需。
- `RuleEngine.notifyNewSubmission(_eventId)` → 把所有类型的解锁标志置 true。参数当前未使用。
- 比赛模式：无 setter，构造时传 `getIsContestMode?: () => boolean`。

## 4. 边界规则

- 比赛模式下规则引擎硬关闭，不可绕过。
- 卡壳判定宁可漏报不误报。
- 规则表可配置、可禁用。
- 不直接给完整答案。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:coach
```

覆盖测试：24 个单元测试，覆盖核心规则、节流、防 abuse、比赛硬关闭、never_today、难度自适应。
