# Coach 规则引擎

## 1. 职责

`electron/coach/rules/` 是 AI Coach 的本地规则引擎，根据事件与会话判断是否触发干预，支持节流、防 hint abuse 冷却、难度自适应阈值与比赛模式硬关闭。本目录不调用 LLM。

## 2. 当前实现程度

- `rules.ts`：规则表（5 条已实现 + 3 条 Stage 3 预留）+ 常量（`RULE_THROTTLE_MS` / `HINT_UPGRADE_COOLDOWN_MS` / `DEFAULT_TRIGGER_SCORE_THRESHOLD`）。
- `RuleEngine.ts`：规则引擎核心，支持：
  - 节流：同类型事件 30 分钟内不重复触发。
  - 防 hint abuse：升级冷却（每级 ≥ 2 分钟或需一次新提交）。
  - 难度自适应：rating ≥ 1600 时阈值放宽。
  - 比赛模式硬关闭：`setContestMode(true)` 后 `handleEvent` 返回 null。
  - never_today 屏蔽：用户标记后当天同类事件不触发。

## 3. 关键函数

- `RuleEngine.handleEvent(event, session)` → `CoachIntervention | null`。
- `RuleEngine.requestHintUpgrade(eventId, isConfirmation)` → 升级结果或确认请求。
- `RuleEngine.setContestMode(active)` → 比赛模式开关。
- `RuleEngine.markNeverToday(eventType)` → 当天屏蔽。
- `RuleEngine.notifyNewSubmission(eventId)` → 解锁升级冷却。

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
