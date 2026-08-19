# 系统架构设计（ARCHITECTURE）

## 1. 架构目标

Algo Learning Platform 是本地优先的个人算法学习平台。架构必须服务于三个长期目标：

- 用户可以在桌面应用内长期刷题、登录、提交、查看历史。
- 系统可以稳定记录题目、提交、Rating、学习行为和统计结果。
- 多个 AI Agent 可以按模块协作，不因为职责混乱而互相污染。

当前项目已完成 WebContentsView 浏览器迁移、多标签页、持久 session、站点 adapter、提交监测、SQLite repository、AI 本地分析、笔记系统、用户脚本、打包配置和项目结构巩固。后续新增能力应沿用当前模块边界，不再把业务逻辑堆回 `electron/main.ts`、renderer 组件或通用 DOM 抓取脚本。

## 2. 总体分层

```text
Renderer React UI
  ↓ 只调用 preload 白名单 API
Preload API
  ↓ typed IPC
Electron Main Process
  ├─ Browser System
  ├─ Site Registry / Parser System
  ├─ CookieVault
  ├─ Tracking System
  ├─ Problem / Submission / Rating Services
  ├─ Analytics System
  └─ SQLite Repositories
        ↓
      SQLite 本地数据库
```

依赖方向必须保持单向：

- Renderer 依赖 Preload API。
- Preload 只转发白名单 IPC。
- Main Process 调用本地能力和数据库。
- 数据库 repository 不依赖 Renderer。
- Parser 不依赖 UI。
- Analytics 优先读取数据库，不直接驱动浏览器。

## 3. Electron Main Process

Main Process 是本地能力和系统边界的中心，负责：

- 通过 WindowManager 创建和登记完整浏览器壳窗口。
- 创建和管理 `WebContentsView`。
- 管理持久 session。
- 注册 IPC handler。
- 初始化 SQLite。
- 执行数据库迁移。
- 读取和保存 Cookie。
- 监听导航事件。
- 分发题目识别和学习行为事件。

`electron/main.ts` 只应保留启动编排逻辑，不应继续堆业务代码。

当前标准结构：

```text
algo-electron/electron/
  main.ts
  preload.ts
  electron-env.d.ts
  app/
    config.ts
    chromiumFlags.ts
    mainServices.ts
    recentSitePreconnect.ts
    startupSmoke.ts
  browser/
    TabManager.ts
    ojSession.ts
  windows/
    AppWindow.ts
    TabTransferCoordinator.ts
    WindowManager.ts
    ViewRegistry.ts
    windowBounds.ts
  db/
    connection.ts
    migrate.ts
    migrations/
      001_initial.ts
      002_submissions.ts
      ...
    repositories/
      problemRepository.ts
      submissionRepository.ts
      problem/
      submission/
      site/
      stats/
      account/
      userScript/
      aiOutput/
      aiContextSnapshot/
  ipc/
    registerMainIpc.ts
    registerBrowserShellIpc.ts
    registerProblemIpc.ts
    registerSubmissionsIpc.ts
    registerStatsIpc.ts
    registerAiIpc.ts
    registerNotesIpc.ts
    registerSitesIpc.ts
    registerScriptsIpc.ts
    registerConfigIpc.ts
    registerRatingIpc.ts
    registerCredentialsIpc.ts
  adapters/
    registry.ts
    shared/
    sites/
      codeforces/
      acwing/
      nowcoder/
      vjudge/
      pta/
      luogu/
      leetcode/
  sites/
    siteRegistry.ts
    types.ts
    builtins/
      codeforces.ts
      acwing.ts
      nowcoder.ts
      vjudge.ts
      pta.ts
      luogu.ts
      leetcode.ts
  parsers/
    types.ts
    registry.ts
    navigateUrl.ts
    titleValidation.ts
    extractProblemTitleScript.ts
    sites/
      codeforces.ts
      codeforcesUrls.ts
      acwing.ts
      nowcoder.ts
      vjudge.ts
  cookies/
    CookieVault.ts
  credentials/
    CredentialVault.ts
    credentialVaultCore.ts
  tracking/
    TrackingService.ts
  submissions/
    SubmissionWatcherCore.ts
    SubmissionBatchWriter.ts
    SubmissionProblemAttacher.ts
    syncService.ts
    scrapers/
    syncers/
  notes/
    NoteService.ts
    noteStorage.ts
    noteText.ts
  scripts/
    UserScriptService.ts
    UserScriptRuntime.ts
    userScriptRuntimeBridge.ts
    userscriptBootstrapPreload.ts
    userScriptMainWorldRuntime.ts
    userScriptConnectPolicy.ts
    UserScriptNetworkProxy.ts
    UserScriptHostPermissionBroker.ts
    UserScriptMenuRegistry.ts
  ai/
    contextExporter.ts
    recommendations/
      reviewRecommender.ts
      weaknessAnalyzer.ts
    summary/
  shared/
    types.ts
    time.ts
```

## 4. WebContentsView 浏览器系统

### 4.1 基线决策

项目唯一浏览器方案是 `WebContentsView`。

禁止继续扩展旧的 `BrowserView` 实现。当前代码应只在历史文档、注释或 ADR 背景中出现 `BrowserView`，不能新增运行时代码依赖。

### 4.2 TabManager 职责

`TabManager` 统一管理浏览器视图和标签：

- 管理有序的 web/internal 混合标签；内部页使用受校验的判别联合和 `algo://` 展示地址。
- 仅为 web 标签创建 `WebContentsView`，内部标签激活时不挂载 view。
- 设置 bounds 和 resize。
- 新标签和无恢复会话固定进入内部 home；内部标签导航到 HTTP/HTTPS 时保留稳定 ID 原位转成 web 标签。
- 执行 navigate、back、forward、reload。
- 以 `{windowId, tabId, webContentsId, url, isMainFrame, reason}` 发布逐页导航、标题和加载生命周期；iframe 导航只发事件，不覆盖标签顶层 URL。
- 对标题提取、用户脚本和实时提交提供精确 page owner 脚本执行 API；窗口、标签、webContents 或 URL 过期时 fail closed。
- 绑定持久 session。
- 仅把活动页导航交给 Parser 和 Tracking；后台页仍可独立完成标题、脚本和提交 hook 链路。
- 管理标签创建、切换、关闭、恢复和受控 popup 接管。

Renderer 不直接操作 `webContents`。

### 4.3 WebContents 安全设置

远程 OJ 页面必须使用安全默认值：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`（如兼容性允许）
- 远程 OJ 页面只允许注入受控 `ojPreload`/hook bridge，不暴露 Node、本地数据库或通用 IPC。
- 默认拒绝摄像头、麦克风等无关权限。
- 弹窗和新窗口由 Browser System 统一处理。

### 4.4 混合标签与内部页

- **主进程事实源**：`TabManager` 持有标签顺序、稳定 ID、活动项、关闭栈和会话快照；Renderer 不复制标签路由状态。
- **标签条**：`TabStrip` 渲染 favicon/loading/internal 图标，pointer 手势提交最终索引与屏幕坐标；主进程按落点执行同窗排序、跨壳过户或创建新壳。标签交互区为 `no-drag`，窗口拖动仅使用标题栏空白区。
- **Web 标签**：由 `WebContentsView` 承载，切换时动态 `addChildView` / `removeChildView`，使用 `persist:oj-main`。
- **内部标签**：首页、设置、统计、脚本、Coach 指标、题目详情和笔记由壳 React 内的 `ShellRouter` 渲染；`algo://...` 只是地址栏与会话标识，不注册本地资源协议。
- **壳资源**：生产 Renderer 仍只从可信 `app://shell/index.html` 加载；不得把 `algo://` 解析成任意本地路径。
- **浮层边界**：功能页面不再通过截图替身 modal 打开。内部页可使用 DOM Dialog/DropdownMenu；web 页菜单使用原生 `Menu.popup`，持久提示使用布局让位的 NoticeBar。
- **拆分窗口**：每个拆分目标都是完整 `AppWindow`；`TabTransferCoordinator` 统一处理拖出、右键“移到新窗口”、双击、拖回、每 tab 锁与过户回滚，不再存在裸 `DetachedWindow`。

### 4.5 窗口与 view 所有权

- `AppWindow` 一一封装完整壳 `BrowserWindow` 与其 `TabManager`；`main.ts` 不再保留模块级 `win/tabManager` 单槽。
- `WindowManager` 持有 `Map<windowId, AppWindow>`，跟踪最近聚焦窗口、提供去重的最近窗口变化订阅，并在窗口关闭时清除该窗口的全部 view 归属。
- 应用级 `ViewRegistry` 记录 shell 与 web 标签的 `webContentsId -> windowId/tabId/view`；TabManager 在创建、popup、崩溃替换、web/internal 转换、关闭、恢复回滚和 destroy 时维护注册表。
- 普通 shell IPC 先由 `trustedSender` 校验 main frame、origin 和 payload，再从 sender 解析所属 `AppWindow`。窗口、标签、菜单和原生对话框不得使用最近活跃窗口作为隐式回退。
- 下载开始时捕获来源 `windowId`，完成通知只发回仍存活的来源窗口。
- 窗口 normal bounds 与 maximized 独立原子保存；恢复时保留合法负坐标副屏，显示器拔除或完全越界时校正到主屏 workArea。
- B3.2 已完成页面事件和核心服务多流语义；B3.3 已开放完整壳标签过户；B3.4 已完成 `problems:updated` 全壳广播、sender 绑定 DOM 同步、任一壳 focus 判定和比赛横幅。B3.5 使用应用级原子快照保存全部窗口、标签、活动项、normal bounds、maximized 与最近窗口；任一壳可独立关闭，最后壳退出应用，临时 transfer 空壳不进入快照。

### 4.6 用户脚本权限边界

- 固定 frame preload 使用主进程按 generation 生成的预编译 catalog，只向当前导航提供受限快照；sandbox preload 不编译用户源码，脚本源码、GM values 与网络响应不进入 shell renderer 或普通 IPC。
- 隔离 preload 不使用 `window.postMessage` 转交 DOM `MessagePort`，只短暂暴露随机 nonce 的 contextBridge send/subscribe 闭包，主世界运行器取得后立即删除桥接属性；页面消息监听器无法捕获或复用私有端口。
- `document-start` 在 Electron 43 中早于页面内联脚本但晚于普通 webPreferences preload，`document-end` 对齐页面 `DOMContentLoaded`，`document-idle` 由真实 frame load 事件回传；普通 iframe 的 session frame preload 在该版本不触发，已标记 best-effort。SPA 原位导航重算快照，script revision 与 runtime generation 共同阻止旧脚本、旧端口和延迟阶段回调复活。
- `GM_xmlhttpRequest` 由主进程 `UserScriptNetworkProxy` 执行。初始目标和每一跳重定向均重新经过 URL 规范化、`@connect` DNS label 匹配和脚本级精确 host permission；OJ session 不承担跨域放行职责。
- 首次 host 授权由 `UserScriptHostPermissionBroker` 路由到 webContents 当前所属窗口，复用文档流 NoticeBar；generation、owner 或窗口失效时请求与提示一起撤销。
- 请求/响应大小、header、超时、重定向、并发和菜单注册数均有上限；浏览器所有请求头和 `Set-Cookie` 不跨越脚本桥。
- 用户脚本菜单按活动端口绑定到页面原生右键菜单，端口关闭或 generation 更新即清理；剪贴板能力只写不读，所有特权 API 继续受 `@grant` 和 `@grant none` 双层校验。

## 5. Session 与 CookieVault

### 5.1 持久 Session

浏览器视图使用持久 partition：

```text
persist:oj-main
```

它负责正常登录状态保存，让 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode 等站点重启后尽量保持登录。具体站点是否仍登录以真实网页 session 和站点风控为准。

### 5.2 CookieVault 职责

CookieVault 是正式模块，不是临时脚本。

职责：

- 从 Electron session 中按站点读取 Cookie。
- 保存站点 Cookie 摘要或必要记录。
- 为 VJudge 提交、提交记录同步、平台同步提供 Cookie 查询接口。
- 记录 Cookie 最近刷新时间。
- 避免把 Cookie 明文写入普通日志。

CookieVault 不负责：

- 云同步 Cookie。
- 在 UI 默认明文展示 Cookie。
- 替代 Electron session 登录状态。

### 5.3 Cookie 数据原则

- Cookie 只在本地使用。
- Cookie 不进入 `sync_queue`。
- Cookie 不进入普通 JSON 导出。
- 如未来要导出 Cookie，必须单独设计加密和用户确认流程。

## 6. Preload 与 IPC

### 6.1 Preload 原则

Preload 只暴露白名单 API，不暴露通用 `ipcRenderer`。

凭据由 `CredentialVault` 在主进程使用异步 `safeStorage` 加密；壳 renderer 只接收 `credentialId/siteId/username/masked` 摘要。自动填充明文不得经过壳 IPC，只能由后续受限 OJ preload 通道消费。

当前形态：

```ts
window.electronAPI = {
  navigate(url),
  goBack(),
  goForward(),
  reload(),
  createTab(url),
  listRecentProblems(limit, platform, status),
  getProblemDetail(problemId),
  getOverviewStats(),
  getRealtimeSubmissionStatus(),
  listSiteConfigs(),
  importSiteConfigs(),
  exportSiteConfigs()
}
```

完整 preload 契约以 `algo-electron/electron/preload.ts` 和 `algo-electron/electron/electron-env.d.ts` 为准；IPC contract 测试负责防止 renderer 获得通用 `ipcRenderer`。

窗口敏感 IPC 必须使用 `trustedSender.getShellWindowOwner(event)` 定向解析 sender 所属 `AppWindow`；owner 缺失时 fail closed。数据查询可以共享应用级 service，但不得用全局主窗口 getter 处理窗口、标签、菜单或对话框。

### 6.2 IPC 命名规则

推荐命名：

- 请求：`domain:action`
- 事件：`domain:event`

示例：

- `browser:navigate`
- `browser:urlChanged`
- `problem:listRecent`
- `tracking:getTodayStats`
- `settings:listSites`
- `cookies:getSiteCookieSummary`

### 6.3 IPC 类型规则

每个 IPC 必须有：

- 参数类型。
- 返回值类型。
- 错误处理策略。
- 是否允许 Renderer 调用。

IPC 类型定义应放在共享类型文件或 `electron/ipc/channels.ts`，避免字符串散落。

## 7. Renderer 架构

Renderer 只负责界面。

推荐结构：

```text
algo-electron/src/
  App.tsx
  App.css
  main.tsx
  components/
    ShellRouter.tsx
    WindowControls.tsx
  features/
    home/
      HomePage.tsx
    problems/
      ProblemSidebar.tsx
      ProblemDetail.tsx
    settings/
      SettingsPage.tsx
```

Renderer 状态原则：

- React 本地 state 和 feature hooks 存 UI 状态、筛选条件和当前页面数据缓存。
- SQLite 是真实数据源。
- 不把 Cookie 或可复用登录态放入 renderer 状态。
- 不在 Renderer 里解析平台核心规则，URL 识别应在 Main/Parser 层完成。

## 8. Site Registry 与 Parser System

### 8.1 Site Registry

站点注册表管理所有平台：

```ts
type SiteConfig = {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  enabled: boolean
  problemUrlPatterns: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: 'session-only' | 'vault-readable'
  adapter?: string
}
```

当前内置站点：

- `codeforces`
- `acwing`
- `nowcoder`
- `vjudge`
- `pta`
- `luogu`
- `leetcode`

用户仍可通过站点管理新增自定义站点。自定义站点优先使用配置化 URL pattern；需要提交监测、特殊标题抓取或站点上下文关联时再新增 adapter。

### 8.2 Parser 输出

统一题目身份：

```ts
type ProblemIdentity = {
  platform: string
  platformProblemId: string
  canonicalUrl: string
  contestId?: string
  problemIndex?: string
  sourcePlatform?: string
  sourceProblemId?: string
  confidence: 'url' | 'content' | 'manual'
}
```

### 8.3 Parser 规则

- URL 解析必须先 normalize。
- 不确定时不写入核心题目表。
- VJudge 需要保留 VJudge 身份和原始 OJ 身份。
- 新站点优先通过配置解决，配置无法解决再写 adapter。
- 代码级站点能力主线在 `electron/adapters/sites/{site}/`，按站点目录拆分题目身份解析、提交解析、实时 hook、表格解析和 URL helper。
- `electron/adapters/registry.ts` 只负责注册和查找 adapter，不承载站点细节。
- `electron/parsers/registry.ts` 保留 URL 识别和配置 pattern 兼容层；新增提交监测能力必须优先放到 adapters 主线。
- Nowcoder、VJudge 等高风险站点的实时入库必须依赖官方提交/状态接口或强身份关联，不能重新使用通用 DOM 文本 verdict observer 作为写入来源。

## 9. 数据库访问层

SQLite 只在 Main Process 使用。

推荐分层：

- `connection.ts`：打开数据库、设置 WAL、关闭连接。
- `migrate.ts`：执行迁移。
- `repositories/`：按聚合根访问数据。
- `services/`：业务编排。

禁止：

- Renderer 直接导入数据库模块。
- 业务代码中散落 SQL 建表。
- 没有 migration 的 schema 变更。

## 10. 本地数据目录

本项目所有用户数据优先存放在 Electron 的 `app.getPath('userData')` 下。不要把用户数据写入项目源码目录。

推荐结构：

```text
userData/
  data/
    algo-learning.sqlite
    backups/
  cookies/
    cookie-vault.sqlite 或 cookie-vault.json
  logs/
    app.log
    sync.log
  exports/
  notes/
  cache/
```

目录职责：

- `data/`：主 SQLite 数据库和数据库备份。
- `cookies/`：CookieVault 本地敏感数据或摘要。
- `logs/`：运行日志和同步日志，禁止写入 Cookie 明文。
- `exports/`：用户手动导出的 JSON 或报告。
- `notes/`：本地 Markdown 题解和复习笔记。
- `cache/`：可删除缓存，不存核心学习数据。

原则：

- 数据库和 Cookie 分目录。
- 导出文件不包含 Cookie。
- 日志不包含 Cookie 明文。
- 备份流程优先备份 `data/`，Cookie 备份需另行设计用户授权。

## 11. Tracking System

Tracking System 负责学习行为记录。

核心事件：

- 应用启动。
- 浏览器导航。
- 题目识别成功。
- 进入题目页。
- 离开题目页。
- 窗口聚焦/失焦。
- 用户空闲/恢复。
- 提交同步。
- 统计重算。

核心原则：

- 原始事件保存在 `activity_events`。
- 页面停留保存在 `problem_visits`。
- `TrackingService` 按 `windowId` 并行维护活动 visit，同一窗口同题导航去重，关闭页面或窗口只结束对应 `visitId`。
- visit 的 problem upsert、`problem_visits` 和 `activity_events` 写入由 tracking repository 在同一事务完成。
- 删除题目时 submissions、visits、activity 和 problem 在同一事务删除，并重算所有受影响日期；提交后的统计重算失败只记录诊断，不把成功删除误报为失败。
- 长会话保存在 `study_sessions`。
- Dashboard 使用聚合表，但聚合结果必须可从原始事件重算。

## 12. Analytics System

Analytics 只读或重算统计，不直接改变浏览器状态。

统计范围：

- 每日活跃时长。
- 刷题数量。
- AC 数量。
- 提交数量。
- 平台分布。
- 单题停留时间。
- 连续活跃天数。
- 错题列表。
- 长期未复习题目。

## 13. AI System 边界

AI 功能已完成本地上下文导出、错题复习建议、薄弱标签分析、复习计划、周期总结、AI 输出保存和上下文快照。核心原则：**只读分析 + 产物隔离 + 本地优先**。

### 13.1 模块结构

```
ai/
  contextExporter.ts          # 上下文导出层（脱敏聚合，可导出 JSON/Markdown）
  recommendations/
    reviewRecommender.ts      # 错题复习建议（本地规则引擎）
    weaknessAnalyzer.ts       # 薄弱标签分析（本地规则引擎）
    reviewPlanner.ts          # 复习计划生成
  summary/
    periodSummary.ts          # 周期学习总结
```

### 13.2 AI 可以

- 读取本地学习数据摘要（通过 `contextExporter`，已脱敏）。
- 生成复习建议（`reviewRecommender`，纯只读查询）。
- 生成薄弱标签分析（`weaknessAnalyzer`，纯只读查询）。
- 生成阶段总结和复习计划。
- 保存 AI 输出到独立表 `ai_outputs`。
- 保存每日 AI 上下文快照到独立表 `ai_context_snapshots`。

### 13.3 AI 不可以

- 直接修改 `problems.status`、`submissions`、`notes`、`problem_visits` 等核心事实数据。
- 直接修改 Rating、账户、Cookie 等核心数据。
- 读取或导出 Cookie、绝对文件路径、日志内容、用户私有代码正文。
- 把建议混入核心事实数据表（AI 产物只能进 `ai_outputs`）。
- 强制调用大模型 API（本地规则引擎优先，最小化 token 消耗）。

### 13.4 可追溯性

所有 AI 建议结果必须携带 `source` 字段，记录本地统计依据（题目 ID、提交次数、停留时长、AC 率等），便于用户核对与审计。

## 14. 数据流

### 14.1 题目识别数据流

```text
用户打开网页
  ↓
WebContentsView 导航或标签激活
  ↓
TabManager 发布精确 BrowserPageEvent
  ↓
Site Registry 匹配站点
  ↓
Parser 解析 ProblemIdentity
  ↓
ProblemService upsert problems
  ↓
TrackingService 按 windowId 调用 tracking repository 写入 activity_events / problem_visits
  ↓
Renderer 通过 IPC 展示题库和统计
```

### 14.2 提交同步数据流

```text
用户触发同步或系统定时同步
  ↓
SubmissionSyncService 读取站点配置
  ↓
CookieVault 提供必要 Cookie
  ↓
站点同步器获取提交记录
  ↓
统一 verdict / language / submitted_at
  ↓
submissions upsert
  ↓
ProblemService 更新题目状态和首次 AC
```

### 14.3 实时提交监测数据流

```text
用户在支持站点正式提交
  ↓
站点 hook 记录 submit intent / 官方提交接口结果
  ↓
站点 adapter 解析最终网络状态或强关联状态
  ↓
SubmissionWatcherCore 过滤 pending / testing / unknown / duplicate
  ↓
SubmissionBatchWriter 关联题目并 upsert submissions
  ↓
ProblemService 更新首次 AC 与题目状态
  ↓
Renderer 诊断面板展示 hook / 解析 / 写入结果
```

### 14.4 统计数据流

```text
activity_events / problem_visits / submissions
  ↓
AnalyticsService 聚合
  ↓
user_daily_stats
  ↓
Renderer Dashboard
```

## 15. 长期风险控制

- `main.ts` 回流膨胀：新业务应进入 `electron/ipc/`、`electron/browser/`、`electron/submissions/`、`electron/db/repositories/` 或对应服务目录。
- 数据库失控：所有 schema 变更必须更新 `docs/DESIGN/DATABASE_SCHEMA.md`。
- Cookie 泄露：禁止写日志、禁止默认导出、禁止同步；文档和测试也不得记录 Cookie、用户源码、完整请求体或可复用登录态。
- Parser 脆弱：每个站点必须有 URL 样例测试。
- Renderer 状态膨胀：只存 UI 状态和缓存，不存核心事实。
- 实时提交误抓：Nowcoder、VJudge 等站点不能退回通用 DOM verdict observer 作为入库来源。
- AI 污染数据：AI 输出单独存储，核心数据只由确定性逻辑写入。
