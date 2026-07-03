# Analytics Feature

## 1. 职责

`src/features/analytics/` 负责统计面板的 renderer 展示层，包括学习趋势、平台分布、Codeforces rating、错题/复访列表和本地 AI 建议。

本目录只编排 UI 状态和 preload 调用，不计算数据库事实口径，不直接访问 SQLite、文件系统、Cookie 或远程页面 DOM。

## 2. 当前实现程度

- `Dashboard.tsx` 是统计弹层入口，负责加载数据、控制刷新和组合各统计面板。
- `TrendPanel.tsx` 展示访问趋势和 AC 趋势。
- `PlatformDistributionPanel.tsx` 展示平台分布饼图、图例和柱图。
- `RatingPanel.tsx` 展示 Codeforces 当前 rating 和 rating 历史。
- `AiSuggestionsPanel.tsx` 展示复习建议和薄弱标签分析。
- `DashboardListsPanel.tsx` 展示错题、未复习、时间线和复访列表。
- `analyticsApi.ts` 集中封装本 feature 的 preload 调用。
- `types.ts` 收敛统计页展示类型。

## 3. API 封装

`analyticsApi.ts` 当前对外封装：

- `loadDashboardTrends(trendRange)`：并发读取访问趋势和 AC 趋势，并按本地日期补零。
- `loadDashboardCoreData()`：并发读取概览、连续天数、错题、未复习、时间线、复访和 Codeforces 账号。
- `loadDashboardAiSuggestions()`：读取本地规则 AI 建议；失败时降级为空列表和提示文案。
- `loadRatingHistory(account)`：按账号读取 rating 历史。
- `recomputeDashboardDailyStats()`：触发主进程重算日统计。
- `hideDashboardBrowserView()` / `showDashboardBrowserView()`：统计弹层打开期间控制浏览器 view 显隐。

## 4. 边界规则

- 统计口径以主进程 repository 和 service 为准，renderer 不重新推导事实数据。
- AI 建议在本 feature 中只能展示和降级，不能修改核心数据。
- 图表必须在截图测试中保持可绘制，避免动画导致 headless 截图为空；平台分布使用固定网格和独立图例，避免饼图 label 挤压或裁剪。
- 新增统计数据优先扩展 `analyticsApi.ts` 和 `types.ts`，不要在面板组件里散落 `window.electronAPI`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

涉及统计口径时还需要运行 repository 或 submissions 相关测试，并手测统计弹层、刷新按钮、空数据和 AI 建议降级。
