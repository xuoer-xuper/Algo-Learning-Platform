# App 模块说明

## 1. 职责

`electron/app/` 存放主进程应用级配置和启动期辅助逻辑。它不承担浏览器业务、数据库 repository 或站点适配逻辑；需要运行期对象时必须由 `main.ts` 注入。Renderer 访问配置的 IPC 注册在 `electron/ipc/registerConfigIpc.ts`。

## 2. 当前实现程度

当前包含：

- `config.ts`：轻量用户配置读写。
- `chromiumFlags.ts`：配置必须在 `app.whenReady()` 前设置的 Chromium 启动开关。
- `mainServices.ts`：初始化主进程运行期服务并返回服务句柄。
- `recentSitePreconnect.ts`：启动后按最近访问站点做有限预连接。
- `startupSmoke.ts`：`ALGO_ELECTRON_SMOKE=1` 下的 Electron 启动冒烟验收。

`config.ts`：

- 配置文件位置：`app.getPath('userData')/config.json`。
- 默认配置：`defaultHomeUrl = https://codeforces.com`。
- 读取时会与默认配置合并。
- 写入时保存格式化 JSON。

`startupSmoke.ts`：

- 根据 `ALGO_ELECTRON_SMOKE_USER_DATA` 切换临时 `userData` 目录。
- 验证主窗口、preload 白名单 API、默认首页配置、基础 browser/tab/window IPC 和 `WebContentsView` 默认页加载。
- 通过注入的 `cleanup()` 清理访问追踪和数据库连接，不直接持有业务服务。

`chromiumFlags.ts`：

- 禁用容易导致本地代理/防火墙握手失败的 Chromium TLS 特性组合。
- 禁用 `AutomationControlled` blink 特性，减少 Cloudflare / Turnstile 对 Electron 自动化痕迹的早期识别。
- 明确不启用全局 `ignore-certificate-errors`。

`recentSitePreconnect.ts`：

- 查询最近 7 天访问过的平台，最多取 3 个。
- 只对仍启用且配置了首页的站点做 `session.defaultSession.preconnect()`。
- 失败静默忽略，不阻塞启动。

`mainServices.ts`：

- 初始化 SQLite、内置站点 seed 和 parser enabled-sites fetcher。
- 创建 `SiteRegistry`、`CookieVault`、`TrackingService`、`SyncService`、`RealtimeSubmissionService` 和 `UserScriptService`。
- 为 Nowcoder 同步提供现有题目 ID 搜索回调。
- 返回 `MainServices`，由 `main.ts` 负责保存并注入窗口、IPC 和 smoke cleanup。

## 3. 函数说明

- `loadConfig()`
  - 懒加载配置文件。
  - 文件不存在或 JSON 解析失败时回退默认配置。
- `saveConfig(partial)`
  - 与当前配置合并后写回 `config.json`。
- `getDefaultHomeUrl()`
  - 返回默认首页 URL。
- `configureChromiumCommandLine()`
  - 设置 Chromium 启动开关，必须在 `app.whenReady()` 前调用。
- `initializeMainServices(getWindow)`
  - 初始化应用运行期服务；`getWindow` 延迟提供当前主窗口给实时提交服务。
- `preconnectRecentSiteOrigins()`
  - 根据访问历史预连接常用站点 origin，降低冷启动后的首次访问延迟。
- `applyStartupSmokeUserDataPath()`
  - 在 Electron ready 前应用 smoke 专用用户数据目录。
- `runStartupSmokeTest(options)`
  - 启动后运行 smoke 断言；通过 `getWindow`、`getTabManager`、`getDefaultHomeUrl` 和 `cleanup` 读取运行期依赖。

## 4. 边界规则

- 新增配置项必须给出默认值。
- 配置项不应保存 Cookie、token、用户源码或大体积数据。
- 配置 schema 如果变复杂，应补版本字段和迁移策略。
- 与数据库 schema 无关的轻量用户偏好可以放这里；事实数据必须进 SQLite repository。
- smoke 辅助只允许由 `ALGO_ELECTRON_SMOKE=1` 触发，不能改变生产启动路径。
- smoke 模块不得新增 IPC/Preload API，只能验证已有白名单能力。
- Chromium 启动开关必须有明确兼容性或反检测原因，不能引入全局证书绕过。
- `mainServices.ts` 只做服务构造和启动接线，不注册 browser/tab/window 壳层 IPC，不创建窗口。
- 预连接只能使用站点 origin，不应携带 Cookie、请求体或用户源码。

## 5. 测试入口

当前没有独立 app 配置测试。修改该模块后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及 smoke 或启动顺序时追加：

```powershell
npx --yes tsx tests\electron\startupSmoke.test.ts
```
