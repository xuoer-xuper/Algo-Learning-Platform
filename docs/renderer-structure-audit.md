# Renderer 结构审计

## 1. 目标

本审计对应 `P8-016 Renderer 结构分离审计与后续重构`，目标是找出 renderer 当前最需要分离的结构问题，并先完成低风险拆分。

审计范围：

- `algo-electron/src/App.tsx`
- `algo-electron/src/components/`
- `algo-electron/src/features/`
- `algo-electron/src/shared/`
- `electron/preload.ts`
- `electron/electron-env.d.ts`

## 2. 当前结构

Renderer 当前为三层：

```text
src/
  App.tsx
  components/
  features/
  shared/
```

- `App.tsx`：应用壳、地址栏、浏览器 view 显隐、modal 编排。
- `components/`：共享 UI，如 TabBar、WindowControls、ModalLayer、ErrorBoundary。
- `features/`：业务面板，如 home、analytics、problems、scripts、settings。
- `shared/`：跨 feature 的纯展示常量。

## 3. 主要问题

### 3.1 大型 feature 文件

当前较大的 renderer 文件：

- `features/settings/SettingsPage.tsx`：约 25 KB，混合首页设置、CF 同步、rating、实时提交诊断、站点导入导出、自定义站点表单。
- `features/analytics/Dashboard.tsx`：约 17 KB，混合统计概览、AI 建议、趋势图、rating 图、错题/复习列表。
- `features/scripts/UserScriptManager.tsx`：约 10 KB，混合导入、编辑、站点绑定、列表管理。
- `features/problems/NotePanelModal.tsx`：约 9 KB，混合笔记列表、编辑器状态、保存节流、删除、目录打开。
- `App.tsx`：约 7 KB，应用壳职责较多，但还没有到必须大拆的程度。

### 3.2 展示常量重复

首轮发现以下常量散落在多个 feature：

- 平台全名。
- 平台短标签。
- 平台首页 URL。
- 平台颜色。
- 题目状态文案和颜色。
- 提交 verdict 颜色。
- 图表颜色序列。

这些常量已抽到 `src/shared/display.ts`。

### 3.3 IPC 类型和调用仍较集中

`window.electronAPI` 的类型声明在 `electron/electron-env.d.ts`，实际暴露在 `electron/preload.ts`。Renderer 直接调用 `window.electronAPI.*`，当前尚未引入 renderer API helper。

短期保持现状，避免新增抽象影响全局 IPC；后续可按 feature 逐步抽取薄 helper。

## 4. 已完成低风险拆分

新增：

- `src/shared/display.ts`
- `src/shared/README.md`
- `features/home/homeApi.ts`
- `features/home/homeTypes.ts`
- `features/analytics/AiSuggestionsPanel.tsx`
- `features/analytics/DashboardListsPanel.tsx`
- `features/analytics/PlatformDistributionPanel.tsx`
- `features/analytics/RatingPanel.tsx`
- `features/analytics/analyticsApi.ts`
- `features/analytics/types.ts`
- `features/settings/AddSiteForm.tsx`
- `features/settings/CodeforcesSyncPanel.tsx`
- `features/settings/DefaultHomePanel.tsx`
- `features/settings/ImportPreviewPanel.tsx`
- `features/settings/LearningOverviewPanel.tsx`
- `features/settings/PlatformDistributionSummary.tsx`
- `features/settings/RealtimeSubmissionPanel.tsx`
- `features/settings/SiteManagementPanel.tsx`
- `features/settings/settingsApi.ts`
- `features/settings/settingsTypes.ts`
- `features/settings/siteManagementTypes.ts`
- `features/analytics/TrendPanel.tsx`
- `components/BrowserToolbar.tsx`
- `components/tabApi.ts`
- `components/windowApi.ts`
- `hooks/browserShellApi.ts`
- `hooks/useAppModalState.ts`
- `hooks/useBrowserNavigation.ts`
- `hooks/useBrowserViewVisibility.ts`
- `features/problems/NoteEditorPane.tsx`
- `features/problems/NoteList.tsx`
- `features/problems/notesTypes.ts`
- `features/problems/problemTypes.ts`
- `features/problems/problemsApi.ts`
- `features/problems/useDebouncedNoteTitleSave.ts`
- `features/scripts/UserScriptEditor.tsx`
- `features/scripts/UserScriptList.tsx`
- `features/scripts/scriptsApi.ts`
- `features/scripts/types.ts`

已替换重复常量的文件：

- `features/home/HomePage.tsx`
- `features/analytics/Dashboard.tsx`
- `features/settings/SettingsPage.tsx`
- `features/problems/ProblemDetail.tsx`
- `features/problems/ProblemSidebar.tsx`

行为不变，只把展示映射集中维护。

大型 feature 首轮拆分：

- `HomePage.tsx` 已抽出 `homeApi` 和 `homeTypes.ts`，首页学习概览、最近访问、复习建议和题目更新订阅 IPC 调用集中到 helper，首页展示类型集中维护。
- `SettingsPage.tsx` 已抽出 `RealtimeSubmissionPanel`，设置页保留实时状态加载，诊断卡片只接收 props。
- `SettingsPage.tsx` 已抽出 `SiteManagementPanel`，设置页不再持有站点列表、导入导出和自定义站点表单状态。
- `SettingsPage.tsx` 已抽出 `DefaultHomePanel`、`LearningOverviewPanel`、`CodeforcesSyncPanel` 和 `PlatformDistributionSummary`，设置页主文件只保留布局、概览刷新和实时诊断刷新。
- `SiteManagementPanel.tsx` 已抽出 `AddSiteForm`、`ImportPreviewPanel` 和 `siteManagementTypes`，站点管理容器保留表单、预览、确认和刷新编排。
- `settings` feature 已抽出 `settingsApi` 和 `settingsTypes.ts`，默认首页、学习概览、实时监听诊断、Codeforces 同步、Rating 同步和站点管理 IPC 调用集中到 helper，跨面板展示类型集中维护。
- `Dashboard.tsx` 已抽出 `TrendPanel`，统计页保留趋势数据加载和范围状态，趋势图只接收 props。
- `Dashboard.tsx` 已抽出 `AiSuggestionsPanel`，统计页保留 AI 本地规则结果加载和失败降级，建议面板只接收 props。
- `Dashboard.tsx` 已抽出 `PlatformDistributionPanel` 和 `RatingPanel`，统计页主文件不再直接承载 Recharts 图表 JSX。
- `Dashboard.tsx` 已抽出 `DashboardListsPanel`，统计页主文件不再内联学习轨迹、错题、未复习和复访列表 JSX。
- `Dashboard.tsx` 已抽出 `analyticsApi` 和 `types.ts`，统计页主文件不再直接调用统计、AI 建议、rating 历史、重算和浏览器 view 显隐 IPC，趋势补零与 analytics 内部展示类型集中维护。
- `NotePanelModal.tsx` 已抽出 `NoteList`、`NoteEditorPane`、`notesTypes` 和 `useDebouncedNoteTitleSave`，弹层容器保留当前笔记状态和内容保存编排。
- `problems` feature 已抽出 `problemsApi` 和 `problemTypes.ts`，题目列表、题目详情、访问统计、删除、导航、笔记 CRUD、笔记图片上传等 IPC 调用集中到 helper，题目详情和提交展示类型集中维护。
- `UserScriptManager.tsx` 已抽出 `UserScriptEditor`、`UserScriptList`、`types.ts` 和 `scriptsApi.ts`，管理器保留编辑状态、错误提示、删除确认和站点勾选编排，脚本与站点 IPC 调用由 helper 封装。
- `App.tsx` 已抽出 `BrowserToolbar`，应用壳保留 URL 状态、导航回调、当前页同步和全局面板打开编排。
- `TabBar.tsx` 和 `WindowControls.tsx` 已抽出 `tabApi.ts`、`windowApi.ts`，标签管理与窗口控制的 preload 调用集中在 components 层 helper。
- `App.tsx` 已抽出 `useAppModalState`，应用壳不再直接维护设置、统计、脚本、题目详情、笔记弹层状态或 modal 预览背景。
- `App.tsx` 已抽出 `useBrowserViewVisibility`，应用壳不再直接维护首页和 modal 背景驱动的 `WebContentsView` 显隐 effect。
- `App.tsx` 已抽出 `useBrowserNavigation`，应用壳不再直接维护 URL 监听、地址栏跳转、首页/前进/后退/刷新、侧栏宽度同步和当前页提交抓取 IPC。
- `hooks` 已抽出 `browserShellApi.ts`，应用壳 hook 的浏览器预览、view 显隐、导航、URL 监听、侧栏宽度和当前页提交抓取 preload 调用集中维护。
- `electron-env.d.ts` 已细化题目、统计、rating、站点、脚本、笔记、AI 建议和 AI 输出的主要 renderer preload 类型；`preload.ts` 与 renderer helper 已移除本轮可处理的显式 `any` 和旧断言。

## 5. 后续拆分顺序

建议按风险从低到高继续：

1. 页面复杂度
   - home、analytics、scripts、settings 和 problems 已完成一轮薄 helper；后续继续拆分时优先处理具体页面复杂度，不跨 feature 共享业务 helper。

2. 类型细化
   - Renderer 主要业务和应用壳 preload 调用已收敛到本域 helper，主要 preload 类型已细化。后续新增 IPC 时必须同步 `electron-env.d.ts`，并避免在 helper 中重新引入 `any`。

## 6. 边界规则

- Renderer 拆分只移动 UI、局部 state、展示常量和轻量 helper。
- 数据库、Cookie、提交监测、站点解析、AI 规则不进入 renderer。
- `window.electronAPI` 新增或改名必须同步 `preload.ts`、`electron-env.d.ts` 和文档。
- 大型 feature 拆分时每步都要保持可运行，避免一次性重写页面。

## 7. 验证记录

首轮拆分验证：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

大型 feature 首轮拆分验证：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs
node tmp\browser-ojBridge.test.mjs
```

后续涉及 parser/browser/submission 交互时，继续按 `tests/README.md` 运行对应测试。
