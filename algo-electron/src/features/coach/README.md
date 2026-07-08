# Coach 渲染层

## 1. 职责

`src/features/coach/` 是 AI Coach 的 renderer 侧实现目录，负责桌宠视觉壳、气泡交互、时间轴复盘与干预效果指标页的渲染。本目录不直接访问 SQLite，所有数据通过 `window.electronAPI.coach*` IPC 获取。

## 2. 当前实现程度

- `CoachPet.tsx`：科技感小人（SVG + CSS 几何体 + 粒子环 + 发光描边），6 状态切换与拖拽。
- `petStates.ts`：6 状态枚举与冷感配色配置。
- `CoachBubble.tsx`：气泡组件（标题/消息/来源/等级/自动消失/手动关闭）。
- `CoachActions.tsx`：3 个交互按钮（给一点提示/先不用/今天别提醒）。
- `SessionTimelineView.tsx`：单题时间轴复盘视图，合并四类数据点按时间排序。
- `CoachMetricsView.tsx`：干预效果指标页（5 项指标 + 答辩核对面板）。
- `computeMetrics.ts`：纯函数指标计算。
- `mockMetricsBundle.ts`：答辩预演模拟数据。
- `coachDataApi.ts`：renderer 薄封装，走 IPC 拉数据。

## 3. 关键文件与封装入口

- 桌宠入口：`main.tsx` 按 hash `#/coach-pet` 分流渲染 `<CoachPet />`。
- 指标页入口：`App.tsx` 模态渲染 `<CoachMetricsView />`，工具栏机器人按钮打开。
- 时间轴入口：`ProblemDetail.tsx` 的 `view` 状态切换 `'timeline'` 子视图。
- 样式：`styles/pet.css` + `styles/bubble.css`。

## 4. 边界规则

- 不直接访问 SQLite，全部经 IPC。
- 不修改核心事实表。
- Demo 默认不接 LLM。
- L5 升级需二次确认，不直接给完整答案。

## 5. 验证入口

```powershell
cd algo-electron
npm run typecheck
npm run lint
npm run test:all
```

运行时手动验证：启动应用后桌宠出现在右下角，DevTools 调用 `window.electronAPI.coachSetPetState('celebrate')` 验证状态切换。
