# 渲染进程代码规范审计报告（frontend-audit）

- 审计日期：2026-09-17
- 审计范围：`algo-electron/src/**`（68 个 ts/tsx + 16 个 css）、`algo-electron/electron/preload.ts`（325 行）、`algo-electron/electron/electron-env.d.ts`（1095 行）
- 唯一基准：`.trellis/spec/shared/{code-quality,typescript}.md`、`.trellis/spec/frontend/*.md`、`.trellis/spec/guides/{pre-implementation-checklist,code-reuse-thinking-guide,cross-layer-thinking-guide}.md`
- 方法：只读；所有数字来自 grep/wc 实测（命令在各条 (c) 中给出），不含估计值
- 优先级定义：**高** = 影响稳定性/可维护性；**中** = 风格一致性；**低** = 细节

---

## 0. 关键计数总表

| 指标 | 实测值 | 规范期望 |
| --- | --- | --- |
| preload 中 `ipcRenderer.invoke('` 字面量 | 139 | 0（用 `IPC_CHANNELS` 常量） |
| preload 中 `ipcRenderer.send('` 字面量 | 19 | 0 |
| preload 去重 channel 字符串 | 158 | — |
| `electron/ipc/*.ts` 中 `ipcMain.handle(` | 139（135 单行字面量 + 4 多行字面量） | 用常量 |
| `electron/` 中 `ipcMain.on(` | 21 | 用常量 |
| 集中 channel 常量文件 | **不存在**（仅 `registerCoachIpc.ts` 有局部 `COACH_PET_CHANNELS` Set） | `src/shared/constants/channels.ts` |
| `electron-env.d.ts` 声明的类型名 | 112 | 应在 `src/shared/types/` 中 import/export |
| 其中在 `electron/**/*.ts` 主进程里**再次** `export interface/type` 同名 | **72 / 112** | 0 |
| 其中在 `src/**` 渲染进程里再次声明同名 | 10 | 0 |
| `ipcRenderer.on` 订阅数 / 返回 unsubscribe 的数量 | 20 / 20 | 全部返回 |
| `window.electronAPI` 总调用 | 156（155 在 `*Api.ts` 适配层 + 1 在 `main.tsx`） | 组件内 0 |
| `.tsx` 组件文件中直接调用 `window.electronAPI` | **0**（仅 `main.tsx:12`，非组件） | 0 |
| renderer 直接 `import` electron / node 模块 | 0 | 0 |
| `alert(` / `confirm(` / `prompt(` / `window.open(` / `localStorage` | 0 / 0 / 0 / 0 / 0 | 0 |
| 非空断言 `!` | **2** | 0 |
| `: any` / `as any` / `@ts-ignore` | 0 / 0 / 0 | 0 |
| `eslint-disable` | 1 | 0 |
| `as X` 类型断言（src，排除 `as const`） | 6 | 尽量 0 |
| preload 中 `as Promise<…>` 断言 | 85（54 个 invoke 无断言） | — |
| 导出函数总数 / 缺显式返回类型 | 219 / **40** | 0 缺失 |
| `import type` + 内联 `type` 导入 / import 总行 | 42 + 10 / 266 | — |
| `use*.ts` hook 文件 | 4（无一在 `hooks/` 子目录内，见 §10） | 放 `hooks/` |
| `createContext` / `useContext` | **0 / 0** | Context 为状态方案 |
| react-query / zod 依赖 | 无 / 无 | 可选 / 推荐 |
| 组件 > 300 行 | **3**（SessionTimelineView 438、TabStrip 432、App.tsx 389） | 0 |
| hook > 150 行 | 1（useOmnibox 212） | 0 |
| CSS 文件 > 500 行 | **5** | 0 |
| CSS 入口数 | index.css、App.css、6 个组件旁 import（共 3 条链路） | 1 个 `styles/index.css` |
| `scrollbar-gutter` 出现次数 / `overflow(-y): auto` 容器数 | **0 / 17** | 滚动容器应设置 |
| BEM `__` 选择器 / 去重类选择器总数 | 0 / 463 | BEM |
| `className` 中 Tailwind 工具类命中 | **0 / 727** 静态 className | 简单样式用 Tailwind |
| 组件内 `useEffect` 直接取数且**无**变更订阅的组件 | 15 | 取数 hook 应订阅刷新事件 |
| 吞掉错误的 `catch(() => undefined/{})` / 空 catch | 9 | 0 |
| 重复定义的 SCREAMING 常量 | 1（`EVENT_TYPE_LABELS` ×2） | 0 |

---

## 1. 目录结构

### 1.1 缺少 `modules/` 层，领域模块混在 `features/`

- (a) 规范：`frontend/directory-structure.md` "Feature vs Module" —— `features/` 放横切关注点（auth、settings、navigation、layout），`modules/` 放领域功能（todos、documents…）；每个 module 内部为 `components/ hooks/ context/ constants.ts types.ts index.ts`。
- (b) 原因：把"基础设施"与"领域"分层后，领域模块只依赖 feature，不互相依赖，边界清晰、可独立迁移。
- (c) 实际：`src/` 下无 `modules/`；`src/features/{analytics,home,problems,scripts,coach}` 全是领域模块，`settings` 才是规范意义上的 feature。`ls src/features` = analytics coach home problems scripts settings。
- (d) 优先级：**中**。

### 1.2 feature 内部无 `components/` `hooks/` 子目录分层，无 `index.ts` 公共导出

- (a) 规范：`directory-structure.md` "Module Structure"；`hooks.md` "Hook Organization"（`hooks/index.ts` 重导出）；"Index File Patterns"（`modules/todos/index.ts` 只导出公共 API）。
- (b) 原因：目录即契约——外部只能 import `index.ts` 暴露的内容，内部文件可以自由重构。
- (c) 实际：`find src -name index.ts` 只有 `src/components/ui/index.ts` 1 个；6 个 feature 目录全部平铺（例：`src/features/problems/` 含 6 个 tsx + 3 个 ts 类型/api + 1 个 hook，无子目录）。跨 feature 引用直接深入文件：`src/App.tsx:2 import { ProblemSidebar } from './features/problems/ProblemSidebar'`；`src/components/ShellRouter.tsx:7-14` 8 处 `import('../features/…/XxxPage')`。
- (d) 优先级：**中**。

### 1.3 hook 放错位置；非 hook 文件放在 `hooks/` 与 `components/`

- (a) 规范：`directory-structure.md` Quick Reference "Where do hooks go? → In `hooks/` folder of relevant module or feature；global hooks → `src/renderer/src/hooks/`"；`code-reuse-thinking-guide.md` "React hooks → `renderer/hooks/`"。
- (b) 原因：按类型定位文件，减少"这个 hook 在哪"的搜索成本。
- (c) 实际（`find src -name "use*.ts*"`）：
  - `src/components/useOmnibox.ts`（212 行）—— hook 放在 `components/`
  - `src/features/coach/useCoachMouseCapture.ts`、`src/features/problems/useDebouncedNoteTitleSave.ts` —— 在 feature 根而非 `feature/hooks/`
  - `src/hooks/useBrowserNavigation.ts` —— 位置正确
  - 反向问题：`src/hooks/browserShellApi.ts`（176 行，纯 IPC 适配，不是 hook）放在 `hooks/`；`src/components/tabApi.ts`、`src/components/windowApi.ts`（IPC 适配）放在 `components/`。
- (d) 优先级：**中**。

### 1.4 缺少 `components/layout/`、`context/`、`lib/`

- (a) 规范：`directory-structure.md` 推荐结构 `components/{ui,layout}`、`context/`、`lib/`。
- (b) 原因：壳层布局组件与通用 UI 组件分开；工具函数有固定去处。
- (c) 实际：`src/components/` 平铺 `BrowserToolbar.tsx TabStrip.tsx WindowControls.tsx ShellRouter.tsx FindInPageBar.tsx Omnibox.tsx ErrorBoundary.tsx`（均为壳层布局件）与 `ui/` 并列；无 `context/`（因为 0 个 Context，见 §9）；工具文件 `src/browserLayout.ts`、`src/theme.ts`、`src/rendererErrors.ts` 散在 `src/` 根。
- (d) 优先级：**低**。

### 1.5 `src/shared` 不是跨进程 shared；跨进程类型落在 ambient `.d.ts`

- (a) 规范：`directory-structure.md` "`src/shared/` — Shared between main and renderer: `types/`、`constants/channels.ts`"；`type-safety.md` "Import Types from Shared Types"。
- (b) 原因：主进程与渲染进程共用同一份 import 得到的类型，编译器能在两端同时报错。
- (c) 实际：`src/shared/` 只有 `display.ts`、`errors.ts`（renderer 展示常量，README 明确"不访问 electronAPI"）；真正跨进程的类型在 `electron/electron-env.d.ts`（`grep -cE "^(import|export) "` = **0**，即全局脚本、无法被 import），主进程侧另有 `electron/shared/types.ts`（71 行，仅主进程用）。`src/` 中 22 个文件直接引用这些全局名（如 `src/App.tsx:46 ManagedDownloadResult`、`:47 CoachContestModePayload`）而无任何 import。
- (d) 优先级：**高**（与 §2.2 同根）。

### 1.6 类型文件命名不一致

- (a) 规范：`shared/code-quality.md` Naming "Type file → kebab-case 或 `types.ts`"。
- (b) 原因：统一命名便于 glob 与人眼定位。
- (c) 实际：`homeTypes.ts`、`notesTypes.ts`、`problemTypes.ts`、`settingsTypes.ts`、`siteManagementTypes.ts`（camelCase 后缀）与 `analytics/types.ts`、`scripts/types.ts` 并存。另注：spec 自身对工具文件命名不一致（`shared/code-quality.md` 要求 kebab `date-utils.ts`，`frontend/directory-structure.md` 要求 camelCase `formatDate.ts`），项目用 camelCase（`browserLayout.ts`、`computeMetrics.ts`），此点不计违规。
- (d) 优先级：**低**。

### 1.7 测试未与源码同目录

- (a) 规范：`shared/code-quality.md` "Test File Location — Co-located test（`date-utils.test.ts`）"。
- (b) 原因：改源码时测试就在旁边，不易遗漏。
- (c) 实际：`find src -name "*.test.*"` = 0；全部 178 个测试在 `algo-electron/tests/`（含 `tests/components/*.test.tsx`）。
- (d) 优先级：**低**（项目已有统一 tests/ 组织与 `test:architecture` 守卫，属有意选择）。

---

## 2. IPC 契约

### 2.1 channel 名全是散落字符串，无集中常量

- (a) 规范：`ipc-electron.md` "Preload API Structure / How to Access Native Features step 1: Add channel (`src/shared/constants/channels.ts`, `IPC_CHANNELS.X.Y`)"；`quality.md` "IPC channels → `src/shared/constants/channels.ts`"；`pre-implementation-checklist.md` "Cross-layer usage? → shared/constants/"。
- (b) 原因：主进程 `handle` 与 preload `invoke` 用同一个常量，拼写错误在编译期暴露；改名只改一处。
- (c) 实际：
  - `grep -c "ipcRenderer.invoke('" electron/preload.ts` = **139**；`grep -c "ipcRenderer.send(" ` = **19**；去重 channel = 158。
  - `grep -rn "ipcMain.handle('" electron` = **135**（另 4 处多行写法 `ipcMain.handle(\n 'ai:saveOutput' …`）；`ipcMain.on(` = **21**。
  - 两侧 channel 集合 diff：主进程侧 `realtimeSubmission:getStatus` 用局部常量 `electron/submissions/RealtimeSubmissionService.ts:15 const STATUS_CHANNEL = '…'`，preload 却写字面量 `electron/preload.ts:94`——同一 channel 两种写法并存，正是规范要防的漂移。
  - `grep -rln "IPC_CHANNELS"` src electron = 0。
- (d) 优先级：**高**。

### 2.2 类型在 main / env.d.ts / renderer 三处重复定义

- (a) 规范：`ipc-electron.md` "Types should be defined in a shared location and used by both main and renderer"；`type-safety.md` "Bad - don't redefine"；`pre-implementation-checklist.md` "Never duplicate type definitions between main and renderer"；`code-reuse-thinking-guide.md` §2。
- (b) 原因：三份手写副本会静默漂移——主进程加字段/改可空性，渲染进程不报错，运行时才炸。
- (c) 实际：`electron-env.d.ts` 112 个类型名中 **72 个** 在 `electron/**/*.ts` 有同名 `export interface/type`（env.d.ts 是主进程模块的手抄镜像），`src/**` 又有 10 个同名重定义 + 若干"改名的结构副本"。具体例子（≥5）：

  | # | env.d.ts | 主进程定义 | renderer 定义 | 差异/风险 |
  | --- | --- | --- | --- | --- |
  | 1 | `RealtimeSubmissionStatus`（:28） | `electron/submissions/RealtimeSubmissionDiagnostics.ts:4` | `src/features/settings/settingsTypes.ts:8`（逐字段复制 27 行） | 三份全同结构手抄 |
  | 2 | `CoachConfig`（:629） | `electron/app/config.ts:37` | 通过 ambient 直接用（`src/features/settings/CoachPanel.tsx`） | 主进程与 .d.ts 各维护一份 |
  | 3 | `TabInfo`/`WebTabInfo`/`InternalTabInfo`/`InternalPage`（:364-396） | `electron/browser/tabManagerTypes.ts:3,75,79,84` | `src/components/tabApi.ts:1 export type TabStripTabInfo = TabInfo` | 别名再包一层 |
  | 4 | `ProblemRecord`（:10） | — | `src/features/problems/problemTypes.ts:1 SidebarProblemRecord`（8 字段全同）、`src/features/home/homeTypes.ts:8 HomeProblemRecord`（少 `submission_count`） | 一个实体三个名字 |
  | 5 | `OverviewStats`（:129） | `electron/db/repositories/problem/types.ts:70` | `homeTypes.ts:1 HomeOverviewStats`、`settingsTypes.ts:1 SettingsOverviewStats`（均 4 字段全同）；`analytics/types.ts:66` 又直接用 ambient `OverviewStats` | 同一实体 4 处 |
  | 6 | `ProblemVisitStats` / `SubmissionRecord` / `ProblemDetailRecord`（:145,136,152） | — | `problemTypes.ts:12,19,26` 同名重定义（`ProblemDetailRecord` 渲染侧多 `visitStats?`，主进程侧 `extends ProblemRecord`） | 同名不同结构 |
  | 7 | `ReviewRecommendation`（:549） | `electron/ai/recommendations/types.ts:1` | `analytics/types.ts:32`（缺 `score`、`source.last_attempt`、`source.has_ac`）、`homeTypes.ts:18 HomeRecommendation`（缺 `score`、`has_ac`） | 手工裁剪的子集 |
  | 8 | `TrendPoint`（:169） | `electron/db/repositories/stats/types.ts:11` | `analytics/types.ts:1` 同名同结构 | 三份 |
  | 9 | `UserScriptRecord`（:341） | — | `scripts/types.ts:1`（`site_ids_json` 可选性不同：env 为 `string \| null`，renderer 为 `?: string \| null`） | 同名不同可空性 |
  | 10 | `SiteConfigRecord`/`SiteImportConflict`/`SiteImportPreview`（:246,264,271） | — | `siteManagementTypes.ts:1 SiteConfigView`（`homeUrl?`、`isBuiltin?` 变可选）、`:17 ImportPreviewSite`（与 `SiteConfigRecord` 逐字段相同）、`:33 ImportConflict`、`:40 ImportPreview` | 同结构不同名 |
  | 11 | `NoteRecord`（:354） | — | `notesTypes.ts:14 NoteItem`（少 `problem_id`） | 子集副本 |
  | 12 | `PlatformAccount`（:219） | — | `analytics/types.ts:53 CodeforcesAccount`、`settingsTypes.ts:36 CodeforcesAccount`（两份 `CodeforcesAccount` 字段还不一样：前者 `id: string` 无 `handle`，后者 `id?` 有 `handle`） | 同名不同结构 |

  验证命令：`for t in $(names from env.d.ts); grep -rnE "^\s*export (interface|type) $t\b" electron src`。
- (d) 优先级：**高**。

### 2.3 `window.electronAPI` 而非 `window.api`；类型声明方式与规范不同

- (a) 规范：`ipc-electron.md` "Using window.api"，preload 内 `declare global { interface Window { api: … } }` 并 import shared 类型。
- (b) 原因：模板一致性；`declare global` + import 让 preload 成为唯一契约文件，类型可从 shared 引用。
- (c) 实际：`contextBridge.exposeInMainWorld('electronAPI', …)`（`preload.ts:4`）；类型在独立 ambient 文件 `electron-env.d.ts:887-1095 interface ElectronAPI`，preload 本身依赖 85 处 `as Promise<X>` 断言（`grep -c "as Promise<" preload.ts`）来"对齐" .d.ts，另 54 个 invoke 无断言、返回 `Promise<any>` 靠 .d.ts 兜底——两处一旦不一致编译器不会发现（preload.ts 里 `ipcRenderer.invoke` 返回 `Promise<any>`，任何断言都合法）。
- (d) 优先级：**中**（命名本身低；断言式对齐属中）。

### 2.4 preload 事件订阅 —— 符合

- (a) 规范：`ipc-electron.md` "Return unsubscribe function in preload → Prevent memory leaks"。
- (c) 实际：`grep -n "ipcRenderer.on(" preload.ts` = 20 处，每处均返回 `() => ipcRenderer.off(channel, handler)`（:18-24、:25-31、…、:312-324）。**符合**。
- (d) —

### 2.5 renderer 无 electron/node 导入 —— 符合

- (c) `grep -rnE "from ['\"](electron|fs|path|os|node:)" src` = 0。**符合**。

---

## 3. 数据获取与刷新订阅

### 3.1 无取数 hook 封装，组件在 `useEffect` 里直接 await

- (a) 规范：`hooks.md` "Custom Hook with IPC" —— 取数封装为 `useData()` 返回 `{data,isLoading,error,refetch}`；`type-safety.md` "Hook with Generic Return Type"；`code-reuse-thinking-guide.md` Red Flag "Similar fetch patterns → Create shared hook"。
- (b) 原因：loading/error/cancel/refetch 逻辑写一次；组件只管渲染。
- (c) 实际：`grep -rnE "export (function|const) use[A-Z]"` 仅 4 个 hook，**没有一个是取数 hook**。取数全部在组件 `useEffect` 内：`SessionTimelineView.tsx:110-130`、`CoachMetricsView.tsx:83-100`、`CredentialsPage.tsx:54-83`、`Dashboard.tsx:46-90`、`SiteManagementPanel.tsx:44-52`、`HomePage.tsx:34-56`、`ProblemDetail.tsx:34-38`、`SettingsPage.tsx`、`UserScriptManager.tsx:38-51`、`NotePanelModal.tsx:35-47` 等；"cancelled/disposed" 竞态保护在 `App.tsx:106-189` 重复了 4 次同样 15 行的模板（`let disposed=false; let receivedLiveUpdate=false; subscribe…; void get…().then(…)`）。
  - 好的一面：`*Api.ts` 适配层把 `window.electronAPI` 隔离在 9 个文件（`browserShellApi.ts:36、settingsApi.ts:32、coachDataApi.ts:24、problemsApi.ts:18、analyticsApi.ts:13、tabApi.ts:12、scriptsApi.ts:10、homeApi.ts:5、windowApi.ts:5`），组件 `.tsx` 中直接调用为 **0**。
- (d) 优先级：**中**。

### 3.2 15 个取数组件无数据变更订阅

- (a) 规范：`ipc-electron.md` "Data Refresh Subscription Pattern — All hooks that fetch data via IPC **should** subscribe to data change events"；`hooks.md` "CRITICAL: Subscribe to data refresh events"。
- (b) 原因：后台同步（`syncCodeforces`、实时提交监听）写库后，不订阅的页面会显示陈旧数据直到手动刷新。
- (c) 实际：preload 只暴露 1 个数据变更事件 `onProblemsUpdated`（`preload.ts:82`），无通用 `DataRefreshContext`。订阅了的：`HomePage.tsx:51`、`ProblemSidebar.tsx:39`（+ 壳层 TabStrip/CoachPet/WindowControls/App 订阅的是 UI 事件）。**未订阅但在 useEffect 取数的组件 15 个**：`Dashboard`、`CoachMetricsView`、`SessionTimelineView`、`NotePanelModal`、`ProblemDetail`、`UserScriptInstallPage`、`UserScriptManager`、`AppearancePanel`、`CoachPanel`、`CodeforcesSyncPanel`、`CredentialsPage`、`LlmConfigPanel`、`SearchEnginePanel`、`SettingsPage`、`SiteManagementPanel`（脚本：对每个含 useEffect 的 tsx 统计 `load*/get*(` 与 `subscribe*` 出现次数）。其中 `Dashboard`（错题/未复习/时间线来自 problems/submissions 表）和 `ProblemDetail`（提交记录）在 `problems:updated` 触发后不会刷新。
- (d) 优先级：**高**（Dashboard/ProblemDetail），其余 **中**。

---

## 4. 浏览器 API 限制 —— 符合

- (a) 规范：`electron-browser-api-restrictions.md` "NEVER use prompt/alert/confirm"、"File.path not available"。
- (c) 实测：`grep -rnE "\balert\(|\bconfirm\(|\bprompt\(|window\.open\(|localStorage|sessionStorage" src` = **0**。`\.path\b` 唯一命中 `src/features/settings/BackupPanel.tsx:27 result.path` 是 IPC 返回的 `DatabaseBackupResult.path`，不是 `File.path`。删除确认已用 `ConfirmDialog`（`SiteManagementPanel.tsx:41` 注释"替代原生 confirm"）。**全部符合**。
- (d) —

---

## 5. React 陷阱（抽查 App.tsx 389、TabStrip 432、SessionTimelineView 438、CoachMetricsView 291、SiteManagementPanel 250、CredentialsPage 237、HomePage 237、ProblemDetail 224、Dashboard 188、UserScriptManager 209）

### 5.1 `useState` 存函数 —— 符合
- (c) `grep -rnE "useState<\(?\(.*\) =>"` = 0；`TabStrip.tsx:108 useState<Set<string>>(() => new Set())` 惰性初始化正确。**无违规**。

### 5.2 对象/Date 依赖稳定性 —— 符合
- (c) `new Date(` 在 tsx 仅 2 处，均在纯格式化函数内（`CoachMetricsView.tsx:72`、`SessionTimelineView.tsx:84`），不进依赖数组。`useMemo` 8 处（CoachMetricsView 3、SessionTimelineView 2、UserScriptInstallPage 2、CredentialsPage 1）依赖均为 state。**无违规**。轻微：`HomePage.tsx:58-67` 每次渲染重建 `builtInUrls` Set 与 `customShortcuts`（未 `useMemo`），属 `quality.md` "Avoid Unnecessary Re-renders" 的低优先级项。

### 5.3 初次加载与 refetch 未区分（refetch 闪骨架）
- (a) 规范：`react-pitfalls.md` "Loading State Patterns — Only show skeleton on initial load; refetch after edit/delete → keep showing data"。
- (b) 原因：改名/删除后整页闪一下骨架屏，体验割裂。
- (c) 实际：
  - `src/features/settings/CredentialsPage.tsx:54-55 const loadData = async () => { setLoading(true) …`；`:100`、`:109` 在重命名/删除成功后 `await loadData()` → 整个凭据列表回到 `<Skeleton rows={3}>`（`:148`）。
  - `src/features/coach/CoachMetricsView.tsx:83-84 loadReal … setLoading(true)`，`:158` 按钮"切回真实数据"再次调用 → 图表全部消失显示骨架。
  - 反例（符合）：`HomePage.tsx:27-30`、`Dashboard.tsx:30-34`、`ProblemSidebar.tsx:16-18` 用 `null = 未读到 / [] = 已读到` 区分，refetch 不改 null，不闪。
- (d) 优先级：**中**。

### 5.4 加载态与空态混同
- (a) 规范：同上 + `components.md` "Loading States / Skeleton"。
- (c) 实际：`SiteManagementPanel.tsx:32 useState<SiteConfigView[]>([])` 无 loading 状态、无 `Skeleton`/`Empty`（`grep -n "Skeleton\|Empty\|loading"` = 0）；`UserScriptManager.tsx:22 useState<UserScriptRecord[]>([])` 同样无列表级 loading——首屏读取期间与"没有站点/脚本"渲染完全相同。
- (d) 优先级：**中**。

### 5.5 `eslint-disable react-hooks/exhaustive-deps`
- (a) 规范：`quality.md` "pnpm lint — 0 errors, 0 warnings"；`typescript.md` "Don't ignore TypeScript errors"（同理不应屏蔽 lint）。
- (c) `src/features/problems/MilkdownEditor.tsx:137 // eslint-disable-next-line react-hooks/exhaustive-deps`（编辑器初始化 effect `[]` 依赖，通过 ref 读最新值属常见做法，但仍是唯一的 disable）。另 `eslint.config.js:51 'react-hooks/set-state-in-effect': 'off'` 全局关闭了一条 hooks 规则。
- (d) 优先级：**低**。

---

## 6. 组件规范

### 6.1 `scrollbar-gutter: stable` 完全缺失
- (a) 规范：`components.md` "Preventing Scrollbar Layout Shift — Use `scrollbar-gutter: stable`"；`index.md` Core Rules "Use scrollbar-gutter: stable for scrollable containers"。
- (b) 原因：列表从 8 条变 30 条时滚动条出现，内容左移 10px。
- (c) `grep -rn "scrollbar-gutter\|scrollbarGutter" src` = **0**；`overflow(-y): auto` 容器 **17** 处（`app-shell.css:250,306,495,685`、`dashboard.css:18`、`notes.css:75,406`、`problem-detail.css:6,121`、`scripts.css:66,259`、`settings.css:20`、`coach.css:16,285`、`ui.css:269`、`Omnibox.css:17`、`bubble.css:325`），且全局滚动条宽 10px（`index.css:217-220`）。
- (d) 优先级：**中**。

### 6.2 滚动条不是"默认隐藏、hover 淡入"
- (a) 规范：`components.md` "Scrollbar Auto-Hide (Notion-inspired)"、`css-design.md` "Scrollbars"。
- (c) `src/index.css:221-224` thumb 始终 `var(--color-scrollbar-thumb)` 可见，无 `.scrollable:hover` 淡入逻辑。
- (d) 优先级：**低**。

### 6.3 语义 HTML —— 基本符合
- (c) `role="button"` 仅 `src/components/ui/ListRow.tsx:40`，带 `tabIndex={0}` + `onKeyDown`（Enter/Space）+ 注释说明为何不用 `<button>`（嵌套 IconButton），落在规范 "Exception: Nested Interactive Elements" 允许范围内。裸 `<div onClick>` 仅 `ConfirmDialog.tsx:97` 遮罩层（规范 dialog 示例同款）。TabStrip 用 `<button role="tab">`。`Empty` 组件在 12 个文件 17 处使用，`Skeleton` 20 处。**符合**。
- 备注：`components.md` 的 Toast 模式（`useToast`）——项目 `src/components/ui/Toast.tsx` 存在但 `grep -rn "useToast\|<Toast" src` 排除自身 = **0** 使用；反馈统一走 `NoticeBar`（14 处）和 `setStatus` 文本 + `setTimeout(…,3000)`（`SiteManagementPanel.tsx:72,81,92`）。**低**。

### 6.4 组件超过 300 行
- (a) 规范：`quality.md` "Components: Max ~300 lines. Split if larger."
- (c) `find src -name "*.tsx" | xargs wc -l | awk '$1>300'`：`SessionTimelineView.tsx` 438、`TabStrip.tsx` 432、`App.tsx` 389。`App.tsx` 里 8 个 `useEffect` + 7 个 NoticeBar 分支（`:262-360`），本身是 "通知条编排 + 壳布局" 两件事。
- (d) 优先级：**中**。

---

## 7. 类型安全

### 7.1 非空断言 2 处
- (a) 规范：`shared/code-quality.md` "NEVER use non-null assertions"；`quality.md` Forbidden Patterns。
- (c) `src/main.tsx:9 const rootEl = document.getElementById('root')!`；`src/features/coach/computeMetrics.ts:123 const earliest = earliestInterventionByProblem.get(pid)!`。
- (d) 优先级：**中**（数量少但规范为"NEVER"）。

### 7.2 `as` 类型断言 6 处
- (a) 规范：`type-safety.md` "Avoid type assertions (`as`)"，枚举应由 Zod `.options` 驱动。
- (c) `DropdownMenu.tsx:83 event.target as Node`、`:112 document.activeElement as HTMLButtonElement`、`AppearancePanel.tsx:58 event.target.value as ThemePreference`、`CoachPanel.tsx:131 as CoachConfig['bubbleFrequency']`、`:148 as CoachPinMode`、`SearchEnginePanel.tsx:124 as SearchEngineId`。后 4 处是 `<select>` 值直接断言为联合类型，无运行时校验（项目无 zod：`grep -c '"zod"' package.json` = 0）。
- (d) 优先级：**低**。

### 7.3 40 个导出函数缺显式返回类型
- (a) 规范：`shared/typescript.md` / `type-safety.md` "Always use explicit return types for exported functions"。
- (c) `grep -rnE "^export (async )?function \w+\([^)]*\)\s*\{"` = **40**，全部是 React 组件（如 `HomePage.tsx:25`、`TabStrip.tsx:106`、`CoachPet.tsx:37`）和 2 个 hook（`useCoachMouseCapture.ts:4`、`useBrowserNavigation.ts:14`）。`*Api.ts` 适配层、`shared/*.ts`、多行签名函数（15 处）均已显式标注。
- (d) 优先级：**低**（组件返回 `JSX.Element` 惯例上常省略；hook 的返回类型建议补）。

### 7.4 `import type` —— 符合
- (c) `^import type` 42 处 + 内联 `type` 10 处；`import {…} from '…Types'` 不带 `type` 的 = 0。`tsconfig.json:18-20 strict / noUnusedLocals / noUnusedParameters` 全开。**符合**。

### 7.5 ESLint 未配置规范要求的禁止项
- (a) 规范：`quality.md` "pnpm lint — 0 errors, 0 warnings"，Forbidden: `!`、`any`。
- (c) `eslint.config.js` 未启用 `@typescript-eslint/no-non-null-assertion`、`no-explicit-any`、`consistent-type-imports`、`explicit-module-boundary-types`（`grep -nE "no-explicit-any|no-non-null|consistent-type-imports"` = 0）；当前 0 违规靠自觉而非工具。
- (d) 优先级：**中**。

### 7.6 无路径别名
- (a) 规范：`type-safety.md` "Recommended Path Alias Setup (`@/`、`@shared/`)"。
- (c) `grep -n "paths" tsconfig.json vite.config.ts` = 0；深层相对路径如 `src/features/analytics/Dashboard.tsx:2 '../../components/ui'`。
- (d) 优先级：**低**（规范用词为 Recommended）。

---

## 8. CSS

### 8.1 三条 CSS 入口链路，无 `styles/index.css` 单入口
- (a) 规范：`css-design.md` / `directory-structure.md` "`styles/index.css` is the single CSS entrypoint imported by the renderer bootstrap"，结构 `tokens.css / base.css / components/ / layout/ / pages/`。
- (b) 原因：层叠顺序在一个文件里可见、可审；组件旁 import 的 CSS 加载顺序取决于 JS 模块图（lazy import 会改变顺序）。
- (c) 实际 import 图（`grep -rn "import .*\.css"` + `grep -rn "@import"`）：
  1. `main.tsx:7 → src/index.css`（250 行：`@import "tailwindcss"` + `@theme` token + `:root` 别名 + base + 滚动条）
  2. `App.tsx:42 → src/App.css` → `@import` 8 个 `styles/*.css`（app-shell 708、settings 665、home 321、problem-detail 187、dashboard 640、notes 497、coach 401、scripts 427）
  3. 组件旁：`Omnibox.tsx:9 → Omnibox.css`、`TabStrip.tsx:14 → TabStrip.css`、`components/ui/index.ts:1 → ui.css`（659）、`CoachActions.tsx:11` 与 `CoachChatPanel.tsx:6` 都 import `coach/styles/bubble.css`、`CoachPet.tsx:17-18 → tokens.css + pet.css`、`MilkdownEditor.tsx:3-4` 两个第三方主题 css。
  - `styles/` 下无 `tokens.css / base.css / components/ / layout/ / pages/` 子目录。`App.css` 被 `RendererRoot` lazy import（`RendererRoot.tsx:3`），CoachPet 窗口不加载它——这是有意的分窗策略，但规范的"单入口"不成立。
- (d) 优先级：**中**。

### 8.2 design tokens 未独立成 `tokens.css`；deprecated 别名占多数
- (a) 规范：`css-design.md` "`tokens.css` — `:root` tokens + `.dark` overrides"。
- (c) tokens 在 `src/index.css:11 @theme {…}`（Tailwind v4 语法）+ `:root` 兼容别名（`:100-129`）+ 暗色 `:root[data-theme="dark"]`（`:142`，非 `.dark`）；Coach 独立 token 在 `features/coach/styles/tokens.css` 的 `.pet-root {}` 作用域；`app-shell.css:340` 还有一个 `:root {view-transition-name:none}`。使用统计：旧别名 `var(--bg|--text|--primary|--border…)` **372** 次 vs 语义 token `var(--color-*)` **137** 次——`index.css:7-8` 自述"旧变量名作为兼容别名保留"，但实际是主流用法。裸 hex 仅出现在 `index.css`（51）与 `coach/styles/tokens.css`（20）——由 `tests/architecture/guards.mjs countBareHex` 守卫，**这点符合**。
- (d) 优先级：**低**（token 唯一源已存在，只是文件位置和别名迁移未完成）。

### 8.3 CSS 文件超 500 行 5 个
- (a) 规范：`quality.md` "CSS files: Max ~500 lines"；`css-design.md` "If a file grows beyond ~300-500 lines, split it"。
- (c) `app-shell.css` 708、`settings.css` 665、`ui.css` 659、`dashboard.css` 640、`bubble.css` 517。
- (d) 优先级：**中**。

### 8.4 Tailwind 实际使用率 0%
- (a) 规范：`index.md` Tech Stack "Styling: Tailwind CSS + CSS Modules (optional)"；`css-design.md` "Simple components, one-off styles → Tailwind utility classes；Complex/reusable → BEM + CSS file"。
- (c) `package.json` 装了 `tailwindcss 4.3.3` + `@tailwindcss/vite`；`index.css:1 @import "tailwindcss"`。但 727 个静态 `className="…"` 中匹配常见工具类正则（`flex|grid|p-N|px-N|text-sm|bg-*-N|w-full|gap-N|rounded|items-center|justify-*|hidden|absolute|truncate…`）= **0**（4 个误命中是自定义 `stats-grid`/`ai-suggest-grid`/`scripts-site-grid`/`ui-visually-hidden`）。Tailwind 在本项目只充当 `@theme` token 引擎，未用其工具类。
- (d) 优先级：**低**（属"不用"而非"错用"；但打包了未使用的运行时）。

### 8.5 类名不是 BEM
- (a) 规范：`css-design.md` "Use BEM naming convention (`.block__element--modifier`)"，明确把 `.sidebar-dropdown-menu` 式写法列为 Bad。
- (c) 463 个去重类选择器中含 `__` 的 = **0**；实际风格为 `block-element-sub`（`.tab-strip-tabs`、`.dashboard-header-actions`、`.note-item-type--solution`——修饰符用了 `--` 但元素没用 `__`）。`ui.css` 有 55 个 `ui-*` 前缀类，是一致的自有约定。
- (d) 优先级：**中**（风格一致性；项目内部是自洽的）。

---

## 9. 状态管理

### 9.1 零 Context；跨层回调靠 props drilling
- (a) 规范：`index.md` "State: React Context + React Query (optional)"；`state-management.md` Layout/Preferences/Tabs Context 模式；`react-pitfalls.md` "State Lifecycle — lift to parent"。
- (b) 原因：Context 让壳层状态（activeTab、导航回调、主题）不必穿过每一层 props。
- (c) `grep -rn "createContext\|useContext(" src` = **0 / 0**；无 react-query/zustand。抽样 props 链：
  - `onNavigate`（30 处引用）：`App.tsx:369 → ShellRouter:377 → Dashboard:174 → DashboardListsPanel:72 → ProblemListSection:39 → ListRow onActivate`，5 层；同链路 `HomePage`、`ProblemSidebar`、`AiSuggestionsPanel`。
  - `onClose`（65 处引用）：`App.tsx:378 handleCloseActiveTab → ShellRouter:171-192` 注入 9 个页面。
  - `App.tsx` 自身持有 8 个 `useState`（`:45-52`）+ 8 个 `useEffect`，是事实上的"全局状态容器"。
  - 主题/偏好：`theme.ts` 用 `data-theme` 属性 + 主进程 `nativeTheme`，无 `AppPreferencesContext`（规范要求 localStorage 持久化，项目改为主进程持久化，属有意设计，不计违规）。
  - Tabs 单一真相源在主进程 `TabManager`，renderer 通过 `onTabListChanged` 订阅——与规范 "Tabs as single source of truth" 精神一致，只是真相源在 main 而非 `TabsContext`。
- (d) 优先级：**中**。

---

## 10. hooks 命名与位置清单

| 文件 | 行数 | 位置评价 | 命名评价 |
| --- | --- | --- | --- |
| `src/hooks/useBrowserNavigation.ts` | 109 | 全局 hook，位置正确 | `use{Feature}` 符合 |
| `src/components/useOmnibox.ts` | **212**（>150） | 应在 `hooks/` 或 `features/browser/hooks/` | 符合 |
| `src/features/coach/useCoachMouseCapture.ts` | 74 | 应在 `features/coach/hooks/` | 符合 |
| `src/features/problems/useDebouncedNoteTitleSave.ts` | 68 | 应在 `features/problems/hooks/` | 符合 |

- 规范 `hooks.md` Naming `use{Entity}` / `use{Entity}List` / `useCreate{Entity}` 的取数/变更 hook：**0 个**（见 §3.1）。
- 非 hook 文件占用 hook 目录：`src/hooks/browserShellApi.ts`。
- 优先级：**中**。

---

## 11. 其他（code-quality / code-reuse）

### 11.1 吞错 9 处
- (a) 规范：`shared/code-quality.md` "Never Swallow Errors"。
- (c) `App.tsx:115,141,160,183,211 .catch(() => undefined)`；`HomePage.tsx:53 .catch(() => {})`；`MilkdownEditor.tsx:132 catch { /* ignore */ }`、`:134 crepe.destroy().catch(() => {})`；`ProblemDetail.tsx:55 catch { /* 查询失败时按无笔记处理 */ }`。其中 ProblemDetail/HomePage 有注释说明降级理由；App.tsx 5 处无说明。
- (d) 优先级：**中**。

### 11.2 重复常量 `EVENT_TYPE_LABELS`
- (a) 规范：`quality.md` "Duplicate constant definitions → Use shared constants"；`type-safety.md` "Module-Level UI Constants → `constants.ts`"；`pre-implementation-checklist.md` §1。
- (c) `src/features/coach/CoachMetricsView.tsx:39` 与 `src/features/coach/SessionTimelineView.tsx:55` 各定义一份 `const EVENT_TYPE_LABELS: Record<string,string>`；全项目 `find src -iname "*constant*"` = 0（`shared/display.ts`、`notesTypes.ts:1 NOTE_TYPE_LABELS`、`settingsSections.ts` 承担了部分职责，但常量放在 types 文件里）。
- (d) 优先级：**中**。

### 11.3 布尔命名无 `is/has/should/can` 前缀 33 处
- (a) 规范：`shared/code-quality.md` "Boolean Variables — Use is/has/should/can prefixes；Bad: `const loading = true`"。
- (c) `grep -rnE "useState(<boolean>)?\((true|false)\)" src | grep -vE "\[(is|has|should|can)[A-Z]"` = **33**：`loading`（×6）、`saving`、`dirty`、`open`、`collapsed`、`maximized`、`deleting`、`busy`、`enabled`、`saved`、`testing`、`recomputing` 等。
- (d) 优先级：**低**。

### 11.4 无 Zod 运行时校验（renderer）
- (a) 规范：`shared/typescript.md` "Use Zod for all external data validation"；`type-safety.md` 枚举下拉用 `schema.options`。
- (c) 项目无 zod；主进程有自研 `electron/ipc/payloadSchema.ts`（属后端范围）；renderer 对 IPC 返回值零校验，`<select>` 值靠 `as` 断言（§7.2）。
- (d) 优先级：**低**（主进程已有等价机制；renderer 端是信任边界内）。

---

## 12. 符合规范的亮点

1. **IPC 隔离彻底**：`window.electronAPI` 156 次调用中 155 次收口在 9 个 `*Api.ts` 适配文件，`.tsx` 组件里 **0** 次直接调用；renderer **0** 次 import electron/node 模块。
2. **preload 订阅全部返回 unsubscribe**：20/20 个 `ipcRenderer.on` 配对 `ipcRenderer.off`；renderer 端 `useEffect` 均在 cleanup 中调用（`App.tsx:116-119`、`TabStrip.tsx:158-167`、`CoachPet.tsx:58-61`）。
3. **浏览器 API 限制零违规**：无 alert/confirm/prompt/window.open/localStorage/File.path；确认流程用 `ui/ConfirmDialog`，反馈用 `ui/NoticeBar`。
4. **类型纪律**：`: any`/`as any`/`@ts-ignore` 全为 0；`import type` 使用规范（type 文件导入 100% 带 `type`）；`tsconfig` strict + noUnusedLocals/Parameters 全开；非空断言仅 2 处。
5. **React 陷阱两大 CRITICAL 项无违规**：无 `useState(fn)` 误用；无 Date/对象进依赖数组；`TabStrip.tsx:108` 正确用惰性初始化。
6. **加载态/空态区分做得好的样板**：`HomePage`、`Dashboard`、`ProblemSidebar` 用 `null / []` 三态（注释还记录了修复缘由），失败时把 `null` 落到 `[]` 防"永远加载"（`Dashboard.tsx:74-82`）。
7. **竞态保护**：`TabStrip.tsx:118-156` 用 `listRevision` 防初始列表覆盖实时推送；`App.tsx:106-189` 用 `disposed/receivedLiveUpdate` 双旗标；`UserScriptManager.tsx` 用 `codeRequestRef` 递增 id 丢弃过期响应；`SessionTimelineView.tsx:111-129` `cancelled` 旗标。
8. **可访问性**：`ui/ListRow` 把 `role="button" + tabIndex + Enter/Space` 一次写对并复用（含设计说明），`TabStrip` 用 `<button role="tab">` + 方向键导航，设置页导航用 `<nav aria-current="page">`。
9. **懒加载**：`RendererRoot.tsx` 按窗口 hash 分流 `App`/`CoachPet`；`ShellRouter.tsx:7-14` 8 个内部页 `lazy()` + `Suspense` 骨架。
10. **架构守卫自动化**：`tests/architecture/guards.mjs` 有 `countBareHex / countBareControls / countUnschemadIpc` 棘轮；裸 hex 只允许出现在 token 文件（实测确实只有 `index.css`、`coach/styles/tokens.css`）。
11. **错误通道统一**：`rendererErrors.ts` + `shared/errors.ts errorMessage()` 替代各处 `e instanceof Error ? e.message : String(e)`，并有 `ErrorBoundary`；README 记录了动机。
12. **每个目录都有 README** 说明职责与边界（14 个），与规范 "Comments explain WHY" 精神一致；`MilkdownEditor.tsx:127-133` 卸载前 flush 未保存修改的注释即为范例。
