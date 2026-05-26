# 系统架构设计（ARCHITECTURE）

## 1. 架构目标

Algo Learning Platform 是本地优先的个人算法学习平台。架构必须服务于三个长期目标：

- 用户可以在桌面应用内长期刷题、登录、提交、查看历史。
- 系统可以稳定记录题目、提交、Rating、学习行为和统计结果。
- 多个 AI Agent 可以按模块协作，不因为职责混乱而互相污染。

当前项目已完成 Phase 0 文档与架构基线。下一步代码任务是进入 Phase 1，迁移旧的 `BrowserView` 实现，建立以 `WebContentsView` 为唯一浏览器基础的长期架构。

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

- 创建主窗口。
- 创建和管理 `WebContentsView`。
- 管理持久 session。
- 注册 IPC handler。
- 初始化 SQLite。
- 执行数据库迁移。
- 读取和保存 Cookie。
- 监听导航事件。
- 分发题目识别和学习行为事件。

`electron/main.ts` 只应保留启动编排逻辑，不应继续堆业务代码。

推荐拆分：

```text
algo-electron/electron/
  main.ts
  preload.ts
  electron-env.d.ts
  app/
    config.ts
  browser/
    BrowserHost.ts
  db/
    connection.ts
    migrate.ts
    migrations/
      001_initial.ts
      002_submissions.ts
      003_fix_codeforces_canonical_urls.ts
      004_fix_codeforces_gym_page_urls.ts
    repositories/
      problemRepository.ts
      submissionRepository.ts
  sites/
    siteRegistry.ts
    types.ts
    builtins/
      codeforces.ts
      acwing.ts
      nowcoder.ts
      vjudge.ts
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
  tracking/
    TrackingService.ts
  submissions/
    syncService.ts
    syncers/
      codeforces.ts
    scrapers/
      domScraper.ts
  shared/
    types.ts
    time.ts
```

## 4. WebContentsView 浏览器系统

### 4.1 基线决策

项目唯一浏览器方案是 `WebContentsView`。

禁止继续扩展旧的 `BrowserView` 实现。当前存在的 `BrowserView` 代码必须在 `P1-003` 中迁移。

### 4.2 BrowserHost 职责

`BrowserHost` 统一管理浏览器视图：

- 创建 `WebContentsView`。
- 设置 bounds 和 resize。
- 加载默认 URL。
- 执行 navigate、back、forward、reload。
- 监听 URL 变化。
- 监听页面标题变化。
- 绑定持久 session。
- 将导航事件交给 Parser 和 Tracking。
- 为未来多标签页预留 `BrowserTab`。

Renderer 不直接操作 `webContents`。

### 4.3 WebContents 安全设置

远程 OJ 页面必须使用安全默认值：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`（如兼容性允许）
- 不注入业务 Preload 到 OJ 页面。
- 默认拒绝摄像头、麦克风等无关权限。
- 弹窗和新窗口由 Browser System 统一处理。

### 4.4 多标签页预留

Phase 1 只实现单视图。未来多标签页使用：

```ts
type BrowserTab = {
  id: string
  siteId?: string
  url: string
  title?: string
  lastActiveAt: number
}
```

不要在 Phase 1 过早实现完整多标签页，但 `BrowserHost` 不应写死无法扩展的全局变量结构。

## 5. Session 与 CookieVault

### 5.1 持久 Session

浏览器视图使用持久 partition：

```text
persist:oj-main
```

它负责正常登录状态保存，让 Codeforces、AcWing、牛客、VJudge 重启后仍保持登录。

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

推荐形态：

```ts
window.algo = {
  browser: {
    navigate(url),
    goBack(),
    goForward(),
    reload(),
    onUrlChanged(callback)
  },
  problems: {
    listRecent(),
    updateStatus(input)
  },
  tracking: {
    getTodayStats()
  },
  settings: {
    getSites(),
    updateSite(input)
  }
}
```

### 6.2 IPC 命名规则

推荐命名：

- 请求：`domain:action`
- 事件：`domain:event`

示例：

- `browser:navigate`
- `browser:urlChanged`
- `problem:listRecent`
- `problem:detected`
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
    ModalLayer.tsx
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

- Zustand 存 UI 状态、筛选条件、当前页面数据缓存。
- SQLite 是真实数据源。
- 不把 Cookie 放入 Zustand。
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

内置站点：

- `codeforces`
- `acwing`
- `nowcoder`
- `vjudge`

后续站点：

- `pta`
- 用户手动新增站点

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
- 引入 `SiteAdapter` 作为代码级适配器扩展点，支持 URL 匹配 (`match`)、题目身份解析 (`parse`)、网页标题/元数据抓取脚本 (`extractTitleScript`)。
- 适配器由 `electron/parsers/registry.ts` 统一注册和管理。
- 匹配流程：对于每个启用的站点，如果该站点指定了 `adapter`（默认为站点 `id`），则优先调用对应的代码级适配器；若无适配器，则回退为通用的 `problemUrlPatterns` 配置模式解析。
- 标题抓取流程：主进程的标题抓取任务会根据当前 URL 获取关联的适配器，若适配器定义了 `extractTitleScript`，则执行其自定义的抓取脚本，否则执行通用的 `EXTRACT_PROBLEM_TITLE_SCRIPT`。

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

AI 功能在 Phase 6 后实现。

AI 可以：

- 读取本地学习数据摘要。
- 生成复习建议。
- 生成阶段总结。
- 生成复习计划。
- 保存 AI 输出。

AI 不可以：

- 直接修改题目状态。
- 直接修改提交记录。
- 直接修改 Rating。
- 读取或导出 Cookie。
- 把建议混入核心事实数据表。

## 14. 数据流

### 14.1 题目识别数据流

```text
用户打开网页
  ↓
WebContentsView 导航
  ↓
BrowserHost 监听 URL
  ↓
Site Registry 匹配站点
  ↓
Parser 解析 ProblemIdentity
  ↓
ProblemService upsert problems
  ↓
TrackingService 写入 activity_events / problem_visits
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

### 14.3 统计数据流

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

- `main.ts` 膨胀：尽快拆出 BrowserHost、IPC、DB 模块。
- 数据库失控：所有 schema 变更必须更新 `DATABASE_SCHEMA.md`。
- Cookie 泄露：禁止写日志、禁止默认导出、禁止同步。
- Parser 脆弱：每个站点必须有 URL 样例测试。
- Zustand 变垃圾桶：只存 UI 状态和缓存，不存核心事实。
- AI 污染数据：AI 输出单独存储，核心数据只由确定性逻辑写入。
