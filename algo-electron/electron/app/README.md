# App 模块说明

## 1. 职责

`electron/app/` 存放主进程应用级配置和启动期辅助逻辑。它不承担浏览器业务、数据库 repository 或站点适配逻辑；需要运行期对象时必须由 `main.ts` 注入。Renderer 访问配置的 IPC 注册在 `electron/ipc/registerConfigIpc.ts`。

## 2. 当前实现程度

当前包含：

- `config.ts`：轻量用户配置读写。
- `chromiumFlags.ts`：配置必须在 `app.whenReady()` 前设置的 Chromium 启动开关。
- `windowBounds.ts`：主窗口默认尺寸和最低支持尺寸的单一来源，供生产窗口与原生 viewport UI 测试共用。
- `mainServices.ts`：初始化主进程运行期服务并返回服务句柄。
- `recentSitePreconnect.ts`：启动后按最近访问站点做有限预连接。
- `startupSmoke.ts`：`ALGO_ELECTRON_SMOKE=1` 下的 Electron 启动冒烟验收。
- `appProtocol.ts`：注册生产 `app://shell` privileged scheme、静态资源 handler 和 CSP。
- `mainProcessErrors.ts`：统一处理 `uncaughtException`、`unhandledRejection` 与启动失败，记录致命错误并在生产环境弹框退出。
- `shellRendererRecovery.ts`：监听壳 renderer 卡死/崩溃事件，非退出阶段自动 reload 并记录恢复过程。
- `singleInstance.ts`：在任何协议、IPC 或数据库服务注册前获取单实例锁；后续启动通过注入 getter 唤醒并聚焦 `WindowManager` 当前最近活跃完整壳。

`config.ts`：

- 配置文件位置：`app.getPath('userData')/config.json`。
- 默认配置：`homeShortcuts = []`、搜索引擎为 Bing；新标签和无恢复会话的首页由 Browser 模块固定为内部 `algo://home`，不再由配置 URL 决定。
- 读取时会与默认配置合并；旧 `defaultHomeUrl` 仅在迁移入口读取，净化后并入 `homeShortcuts` 并尽力删除旧字段。
- 快捷入口只接受不含 userinfo 的 HTTP/HTTPS URL，迁移写回失败不会丢失已经加载到内存的配置。
- 搜索配置支持 Bing/Google/Baidu/custom；旧配置自动补 Bing，非法 custom 模板净化并写回默认值。custom 必须为无 userinfo、只含一个 `{query}` 且无其他占位符的 HTTPS URL，保存前会再次净化。
- 写入时保存格式化 JSON。

`startupSmoke.ts`：

- 根据 `ALGO_ELECTRON_SMOKE_USER_DATA` 切换临时 `userData` 目录。
- 验证主窗口、`app://shell` origin、preload 白名单 API、初始内部 home、旧首页 URL 迁移、基础 browser/tab/window IPC、显式 web 标签加载，以及拆分为完整壳后关闭原壳仍可继续使用页面和 IPC。
- 通过注入的 `cleanup()` 清理访问追踪和数据库连接，不直接持有业务服务。
- smoke 结束后由 disposable Electron 进程立即退出，外层测试对 Windows 临时目录做有限重试清理。

`appProtocol.ts`：

- `registerShellSchemeAsPrivileged()` 必须在 `app.whenReady()` 前调用。
- `registerShellProtocol(rendererDist)` 只服务 `app://shell` host，拒绝路径穿越，并给所有响应附加严格 CSP。
- 开发模式仍由 Vite localhost 提供资源；生产模式不得回退到 `file://`。

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

`main.ts` 启动前会初始化 `electron/shared/logger.ts`，并把 `app.whenReady()` 失败、壳 renderer `render-process-gone`/`unresponsive`、数据库迁移和服务启动异常统一写入落盘日志。

## 3. 函数说明

- `loadConfig()`
  - 懒加载配置文件。
  - 文件不存在或 JSON 解析失败时回退默认配置。
- `saveConfig(partial)`
  - 与当前配置合并后写回 `config.json`；只有落盘成功才发布新的内存配置。
- `getHomeShortcuts()`
  - 返回净化后的首页自定义快捷入口副本。
- `getSearchConfig()` / `saveSearchConfig(search)`
  - 读取副本或保存经严格净化的搜索引擎配置。
- `getCoachConfigForRenderer()`
  - 返回不含 `encrypted_api_key` envelope 的 Coach renderer 配置副本。
- `configureChromiumCommandLine()`
  - 设置 Chromium 启动开关，必须在 `app.whenReady()` 前调用。
- `MAIN_WINDOW_BOUNDS`
  - 默认窗口为 `1280×800`，最低支持窗口为 `800×600`；修改时必须同步通过 UI screenshot 测试。
- `initializeMainServices(getWindow)`
  - 初始化应用运行期服务；`getWindow` 延迟提供当前主窗口给实时提交服务。
- `preconnectRecentSiteOrigins()`
  - 根据访问历史预连接常用站点 origin，降低冷启动后的首次访问延迟。
- `applyStartupSmokeUserDataPath()`
  - 在 Electron ready 前应用 smoke 专用用户数据目录。
- `runStartupSmokeTest(options)`
  - 启动后运行 smoke 断言；通过 `getWindow`、`getTabManager`、`getAppWindows` 和 `cleanup` 读取运行期依赖。
- `installSingleInstanceLock(app, getMainWindow, options)`
  - 锁获取失败时立即请求退出，不安装 `second-instance` listener。
  - 锁获取成功后，后续启动会恢复最小化窗口，并依次执行 `show()` 与 `focus()`。

## 4. 边界规则

- 新增配置项必须给出默认值。
- 配置项不应保存 Cookie、token、用户源码或大体积数据。
- 配置 schema 如果变复杂，应补版本字段和迁移策略。
- 与数据库 schema 无关的轻量用户偏好可以放这里；事实数据必须进 SQLite repository。
- smoke 辅助只允许由 `ALGO_ELECTRON_SMOKE=1` 触发，不能改变生产启动路径。
- 生产壳不得使用 `loadFile(index.html)`；必须使用 `app://shell/index.html`，以建立稳定可信 origin。
- CSP 变化必须同步 `tests/security/trustedSender.test.ts` 和安全守卫；不得扩大到 `unsafe-eval` 或通配脚本源。
- smoke 模块不得新增 IPC/Preload API，只能验证已有白名单能力。
- Chromium 启动开关必须有明确兼容性或反检测原因，不能引入全局证书绕过。
- `mainServices.ts` 只做服务构造和启动接线，不注册 browser/tab/window 壳层 IPC，不创建窗口。
- 预连接只能使用站点 origin，不应携带 Cookie、请求体或用户源码。
- 单实例锁必须早于日志文件、privileged scheme、IPC、应用生命周期和运行期服务注册；失败实例不得写共享日志、打开数据库或创建窗口。

## 5. 测试入口

配置迁移由 `tests/app/configMigration.test.ts` 覆盖。修改该模块后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx vitest run tests/app/configMigration.test.ts
```

涉及 smoke 或启动顺序时追加：

```powershell
npx vitest run tests/app/singleInstance.test.ts tests/electron/mainResilience.test.ts tests/electron/electronDouble.test.ts
npx --yes tsx tests\electron\startupSmoke.test.ts
```
