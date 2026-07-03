# Features 模块说明

## 1. 职责

`src/features/` 按业务域组织 renderer 页面和面板。每个 feature 负责本域 UI、局部状态和调用 `window.electronAPI` 获取数据。

业务规则、数据库写入、网页解析、Cookie 读取、提交监测等逻辑不应放在 renderer feature 中。

## 2. 当前功能域

- `analytics/`
  - `Dashboard.tsx`
  - `AiSuggestionsPanel.tsx`
  - `DashboardListsPanel.tsx`
  - `PlatformDistributionPanel.tsx`
  - `RatingPanel.tsx`
  - `TrendPanel.tsx`
  - 学习统计、趋势、Codeforces rating、复习建议、薄弱标签、错题和复访列表。
- `home/`
  - `HomePage.tsx`
  - 首页快捷入口、学习概览、复习建议、最近访问。
- `problems/`
  - `ProblemSidebar.tsx`
  - `ProblemDetail.tsx`
  - `NotePanelModal.tsx`
  - `NoteList.tsx`
  - `NoteEditorPane.tsx`
  - `MilkdownEditor.tsx`
  - `notesTypes.ts`
  - `useDebouncedNoteTitleSave.ts`
  - 题目列表、题目详情、提交记录展示、Markdown 笔记和图片上传。
- `scripts/`
  - `UserScriptManager.tsx`
  - `UserScriptEditor.tsx`
  - `UserScriptList.tsx`
  - `types.ts`
  - 用户脚本导入、启用、站点绑定和管理。
- `settings/`
  - `SettingsPage.tsx`
  - `AddSiteForm.tsx`
  - `CodeforcesSyncPanel.tsx`
  - `DefaultHomePanel.tsx`
  - `ImportPreviewPanel.tsx`
  - `LearningOverviewPanel.tsx`
  - `PlatformDistributionSummary.tsx`
  - `RealtimeSubmissionPanel.tsx`
  - `SiteManagementPanel.tsx`
  - `siteManagementTypes.ts`
  - 首页设置、Codeforces 同步、rating 同步、实时提交诊断、站点配置导入导出和自定义站点。

## 3. API 调用边界

Feature 只能通过 `window.electronAPI` 调主进程。常见分组：

- `home`：overview、recent problems、review recommendations。
- `analytics`：stats、rating、AI rules、navigation。
- `problems`：problem detail、visit stats、notes、delete problem。
- `scripts`：scripts IPC、sites list。
- `settings`：config、sites、rating、submission sync、realtime diagnostics。

新增 feature 时，先确认主进程是否已有 service/repository 能力；不要在 renderer 中复制持久化逻辑。

跨 feature 共享的平台名称、颜色、状态文案等纯展示映射应使用 `src/shared/display.ts`。

## 4. 状态规则

- 局部 UI 状态留在组件内 `useState`。
- 跨 feature 的持久事实数据来自主进程和数据库，不在 renderer 做长期缓存。
- 主进程发出的 `problems:updated`、`tab:listChanged` 等事件必须在 effect cleanup 中取消订阅。
- Dashboard/Home 的 AI 建议失败应降级为空或提示，不阻塞核心统计展示。

## 5. UI 规则

- 运营型界面保持信息密度和可扫描性。
- 弹层应通过 `ModalLayer`，避免 `WebContentsView` 覆盖 React UI。
- 题目/提交/统计页面不要直接展示 Cookie、源码或完整请求体。
- 长文本和表格状态需要考虑窄屏宽度和滚动。

## 6. 验证入口

修改 feature 后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及具体页面时启动：

```powershell
npm run dev
```

然后手测对应入口、IPC 调用、空数据状态、错误降级和 modal 关闭。
