# Coach 模块

## 1. 职责

`electron/coach/` 是 AI Coach 的主进程侧实现目录，承载"视觉差异化"与"过程数据资产"两大叙事的桌面端入口。负责桌宠透明窗口、事件触发、本地规则引擎、比赛模式硬保障、提示生成与题面约束解析。

本模块不修改核心事实表（submissions / problem_visits / activity_events / user_daily_stats），只读取；不调用 LLM（Demo 默认关闭）；不在 renderer 直接访问 SQLite。

## 2. 当前实现程度（阶段 1-4）

### 阶段 1：桌宠视觉壳
- `CoachPetWindow.ts`：透明悬浮窗口封装（BrowserWindow 配置、点击穿透、拖拽、生命周期、状态/气泡/配置推送）。

### 阶段 2：事件触发 + 比赛模式
- `ProblemSessionTracker.ts`：三态计时（读题/写码/卡壳），active_seconds 只累计有效活跃时间。
- `CoachEventBridge.ts`：订阅提交事件，转为 CoachEvent（multiple_wrong / same_error / first_ac）。
- `rules/RuleEngine.ts` + `rules.ts`：规则引擎（节流、防 hint abuse、难度自适应、比赛硬关闭、never_today）。
- `ContestGuard.ts`：比赛模式硬保障（URL 识别、时间窗、审计日志）。
- `CoachOrchestrator.ts`：服务编排，黏合 tracker/bridge/ruleEngine/contestGuard/repositories/petWindow。

### 阶段 3：通用提示 + 靶向提示
- `hints/hintTemplates.ts`：34 条内置模板，10 类。
- `hints/HintSelector.ts`：verdict → 类别映射。
- `hints/HintLadder.ts`：6 级 Socratic Ladder，L5 二次确认。
- `CoachFeedbackStore.ts`：反馈持久化与频率影响。
- `problemFacts/ConstraintParser.ts`：题面约束解析，零 LLM 靶向提示。

### 阶段 4：过程复盘 + 答辩数据
- `CoachOrchestrator.getProblemTimeline()`：合并四表数据生成时间轴。
- `CoachOrchestrator.getMetricsBundle()`：聚合 30 天窗口指标。

## 3. 封装入口与关键文件

- `types.ts`：模块共享类型（CoachPetState / CoachBubblePayload / CoachEvent / ProblemSession / CoachIntervention / ContestAuditRecord）。
- `CoachPetWindow.setPetState()` / `showBubble()`：规则引擎驱动桌宠的主入口。
- `CoachOrchestrator.start()` / `stop()`：服务生命周期入口，在 `main.ts` 的 `app.whenReady` 后调用。
- `ContestGuard.isContestMode()`：比赛模式状态查询。
- IPC channel：`coach:getState` / `coach:triggerHint` / `coach:dismissHint` / `coach:feedback` / `coach:getSession` / `coach:getMetrics` / `coach:exportAuditLog` / `coach:getProblemTimeline` / `coach:getMetricsBundle`。

## 4. 边界规则

- 不修改核心事实表 schema，只读取。
- 不在 renderer 直接访问 SQLite。
- Demo 默认不接 LLM，所有提示由本地规则 + 模板 + ConstraintParser 生成。
- 比赛模式硬关闭不可绕过，审计日志可导出。
- 不直接给完整答案，L5 升级需二次确认。
- 卡壳判定宁可漏报不误报。
- `coach_interventions` 表同时承载干预记录与比赛模式审计日志。

## 5. 验证入口

```powershell
cd algo-electron
npm run typecheck
npm run lint
npm run test:coach
npm run test:all
```

运行时手动验证：
- 启动应用后桌宠出现在右下角。
- DevTools 调用 `window.electronAPI.coachSetPetState('celebrate')` 验证状态切换。
- 进入 CF 比赛页验证零提示与审计日志。
- `await window.electronAPI.coachGetState()` 返回当前会话/比赛模式快照。
- `await window.electronAPI.coachExportAuditLog()` 返回比赛审计记录。

## 跨模块依赖

- `electron/app/config.ts`：`loadCoachConfig` / `saveCoachConfig`。
- `electron/ipc/registerCoachIpc.ts`：IPC 注册（接入 `registerMainIpc.ts`）。
- `electron/preload.ts`：`electronAPI.coach*` 暴露。
- `electron/main.ts`：初始化入口与生命周期绑定。
- `electron/submissions/SubmissionWatcher.ts`：EventEmitter 出口。
- `electron/db/repositories/coach/`：数据仓库。
- `src/features/coach/`：渲染层。
