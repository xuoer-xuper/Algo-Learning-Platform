# Coach 模块

## 1. 职责

`electron/coach/` 是 AI Coach 的主进程侧实现目录，承载"视觉差异化"与"过程数据资产"两大叙事的桌面端入口。负责桌宠透明窗口、事件触发、本地规则引擎、比赛模式硬保障、提示生成与题面约束解析。

本模块不修改核心事实表（submissions / problem_visits / activity_events / user_daily_stats），只读取；不调用 LLM（Demo 默认关闭）；不在 renderer 直接访问 SQLite。

## 2. 当前实现程度（阶段 1-4）

### 阶段 1：桌宠视觉壳
- `CoachPetWindow.ts`：透明桌宠窗口封装（BrowserWindow 配置、点击穿透、拖拽、生命周期、状态/气泡/配置推送）；默认作为普通子窗口跟随最近活跃完整壳，并在父壳关闭前解绑，不以全局置顶窗口维持应用进程。
- `petPinPolicy.ts`（B5.5 / D30）：置顶策略纯逻辑。三档 `follow`/`always`/`dock`，输入「模式 + 是否有活跃壳 + 该壳是否聚焦」，输出「alwaysOnTop / level / 是否绑 parent」。不 import electron，在 node 环境直接测；`CoachPetWindow` 只负责把决策设到窗口上。

### 阶段 2：事件触发 + 比赛模式
- `ProblemSessionTracker.ts`：三态计时（读题/写码/卡壳），active_seconds 只在任一完整应用壳聚焦且系统未空闲时累计。
- `CoachEventBridge.ts`：订阅提交事件，转为 CoachEvent（multiple_wrong / same_error / first_ac）。
- `rules/RuleEngine.ts` + `rules.ts`：规则引擎（节流、防 hint abuse、难度自适应、比赛硬关闭、never_today）。
- `ContestGuard.ts`：比赛模式硬保障（URL 识别、时间窗、审计日志）。
- `ContestUrlAggregator.ts`：聚合所有 `webContents` 的 URL 快照，任一 view 在比赛页即维持全局比赛模式；安装 helper 独立于 `CoachOrchestrator`。
- `coach:contestModeChanged`：广播到全部壳并驱动布局让位的 NoticeBar；新建/重载壳会回放当前比赛状态，renderer 订阅后再通过 `coach:getState` 补读快照以消除加载竞态。
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
- `CoachPetWindow.followWindow()`：更新桌宠归属到最近活跃完整壳；切换与父壳 close/focus/blur 监听成对清理。是否真的设 parent 由当前置顶模式决定。
- **`follow` 档的失焦解绑必须延后复核，不能相信单次 blur 事件**：`setParentWindow` 在 Windows 上改 owner 关系并会扰动焦点，而 follow 档的决策又是焦点的纯函数，两者首尾相接会让桌宠在两个 z 序间持续振荡（真机表现：桌宠闪烁、壳的任务栏按钮反复闪、主窗口点不动）。`handleFollowedWindowBlur` 因此延后 `BLUR_DETACH_VERIFY_MS` 再复核 `isFocused()` 的事实；聚焦方向是安全方向，立即生效并顺带撤销在途复核。判据是持续时间：自扰动的失焦一两帧内被抵消，真的原生菜单/对话框会持续几百毫秒。
- `setIgnoreMouseEvents()` 与 `applyPinDecision()` 都对「结论未变」短路：重设命中测试会打断进行中的鼠标捕获（拖拽中断），重设 owner/z 序会被用户看见。注意这层只挡「结论相同的重复调用」，挡不住「结论反复翻面」——后者只能靠上一条的延后复核。
- `CoachPetWindow.setPinMode()`：切换置顶模式，即时重设窗口；持久化由 `coach:saveConfig` → `saveCoachConfig` 负责，本方法不写盘。`notifyConfigChanged()` 会顺带把配置里的模式重新应用一次。
- `CoachOrchestrator.start()` / `stop()`：服务生命周期入口，在 `main.ts` 的 `app.whenReady` 后调用。
- `CoachOrchestrator` 的手动提示、自动提示、聊天和直接 LLM 提示都捕获请求时的 generation 与会话。进入比赛、切题、切换同 URL 的另一标签、切窗请求、页面/窗口销毁及停止服务会作废旧 generation；比赛或页面往返也不能恢复旧请求。迟到结果不展示、不落干预记录、不消耗每日升级额度，也不再降级成本地提示。
- `ContestGuard.isContestMode()`：比赛模式状态查询。
- `installContestNavigationTracking()`：把 TabManager 的裸 `webContents` URL/销毁快照接入 ContestGuard，不复用活动标签导航槽。
- IPC channel：`coach:getState` / `coach:triggerHint` / `coach:dismissHint` / `coach:feedback` / `coach:getSession` / `coach:getMetrics` / `coach:exportAuditLog` / `coach:getProblemTimeline` / `coach:getMetricsBundle`。

## 4. 边界规则

- 不修改核心事实表 schema，只读取。
- 不在 renderer 直接访问 SQLite。
- Demo 默认不接 LLM，所有提示由本地规则 + 模板 + ConstraintParser 生成。
- 比赛模式硬关闭不可绕过，审计日志可导出。
- `coach:testHint`、`coach:showBubble` 和 `coach:triggerHint` 的演示分支也必须检查全局比赛状态；停止服务仅补比赛结束审计，不展示赛后气泡。
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
npx vitest run tests/coach/coachOrchestratorLifecycle.test.ts
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
