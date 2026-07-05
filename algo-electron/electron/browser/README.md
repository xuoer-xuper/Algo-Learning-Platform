# Browser 模块说明

## 1. 职责

`electron/browser/` 是内嵌 OJ 浏览器容器层，负责创建和管理 Electron `WebContentsView`，承接导航、标签页、页面脚本注入和提交监测桥接。

本模块不解析题目、不写数据库、不决定站点 adapter，也不直接处理提交结果。题目识别在 `electron/adapters/`，提交监测在 `electron/submissions/`，行为追踪在 `electron/tracking/`。

## 2. 当前实现程度

- 主线浏览器容器：`TabManager`，已接入 `main.ts`。
- 视图技术：统一使用 `WebContentsView`，遵守 `docs/ADR/ADR_0001_USE_WEBCONTENTSVIEW.md`。
- 会话隔离：OJ 页面使用 `partition: 'persist:oj-main'` 持久登录态。
- 多标签：最多 8 个标签，支持创建、关闭、切换、剥离为独立窗口。
- 壳层 IPC：browser/tab/window channel 由 `electron/ipc/registerBrowserShellIpc.ts` 注册，Browser 模块只暴露 `TabManager` 等运行期对象。
- OJ Session：`ojSession.ts` 配置持久 session、真实 Chrome UA、受控 CORS、早期实时提交 hook 和 stealth script。
- 实时提交桥：`ojPreload.ts` 暴露 `__algo_submission_v1.reportSubmission()`，并转发同页面/子 frame 的 `postMessage`。
- 反检测脚本：`STEALTH_SCRIPT` 在页面加载后注入，主线由 `TabManager` 执行。
- 保留单视图抽象：`BrowserHost` 仍在目录中，但当前生产主线使用 `TabManager`。

## 3. 文件职责

- `TabManager.ts`：多标签 `WebContentsView` 管理器，当前主线。
- `tabManagerTypes.ts`：`TabInfo` 和内部 managed tab 类型。
- `tabManagerConfig.ts`：标签数量、工具栏高度、tabbar 高度和 OJ preload 路径配置。
- `tabViewLayout.ts`：活动 tab view 的 bounds 计算、安全移除和 webContents 关闭 helper。
- `tabScriptExecution.ts`：按 URL 命中的标签页中，对主 frame 和子 frame 执行脚本。
- `urlMatching.ts`：同页 URL 匹配 helper，供按 URL 找 tab 的脚本执行路径使用。
- `BrowserHost.ts`：单视图浏览器宿主抽象，保留兼容能力。
- `DetachedWindow.ts`：将标签页 view 剥离到原生独立窗口。
- `ojPreload.ts`：OJ 页面 preload，暴露提交上报桥并转发 frame 消息。
- `ojBridge.ts`：提交上报桥的纯函数和 channel 常量。
- `ojSession.ts`：配置 OJ 持久 session 的 UA、CORS、实时 hook 和 stealth 注入。
- `stealthScript.ts`：反检测脚本字符串。

## 4. TabManager 封装

`TabManager` 负责主窗口里的 OJ 多标签体验：

- 标签生命周期
  - `createTab(url?)`
  - `closeTab(tabId)`
  - `switchTab(tabId)`
  - `detachTab(tabId)`
  - `destroy()`
- 导航控制
  - `navigate(url)`
  - `goBack()`
  - `goForward()`
  - `reload()`
- 状态读取
  - `getUrl()`
  - `getTitleForUrl(url)`
  - `getActiveTabId()`
  - `getTabList()`
  - `isViewVisible()`
- 布局和可见性
  - `setLeftOffset(offset)`
  - `hideView()`
  - `showView()`
  - `capturePreview()`
- 脚本执行
  - `executeScript(code)`：只在当前活动标签执行。
  - `executeScriptOnUrl(url, code)`：按 URL 找标签，并对主 frame 和子 frame 执行。
- 事件回调
  - `setUrlChangeCallback(callback)`
  - `setNavigateCallback(callback)`
  - `setTitleChangeCallback(callback)`
  - `setDomReadyCallback(callback)`
  - `setPageLoadedCallback(callback)`
  - `setTabListChangedCallback(callback)`
  - `addNavigateListener(callback)`
  - `addDomReadyListener(callback)`
  - `addActiveTabChangeListener(callback)`

`executeScriptOnUrl()` 会先写入 `window.__ALGO_TOP_PAGE_URL`，让站点 hook 在 iframe 中仍能知道顶层题目页 URL。

`TabManager.ts` 只保留多标签生命周期、事件绑定和视图管理；可复用类型、常量、URL 判断、view bounds 和跨 frame 脚本执行放在旁侧 helper，避免主类继续膨胀。

布局 helper 边界：

- `setTabViewBounds(view, contentSize, leftOffset)`：统一 toolbar/tabbar/sidebar 偏移计算。
- `safeRemoveChildView(window, view)`：切换、隐藏和销毁时安全移除 view。
- `safeCloseWebContents(view)`：销毁时安全关闭 webContents。

脚本执行 helper 边界：

- `executeScriptAcrossFrames(tab, topPageUrl, code)`：先在主 frame 执行，再尽力注入子 frame。
- 该 helper 只执行传入脚本，不解析提交结果、不读取 Cookie、不写数据库。

## 5. Preload 与提交桥

实时提交 hook 的安全边界：

```text
adapter hook in OJ page
  -> window.__algo_submission_v1.reportSubmission(payload)
  -> ojPreload.ts
  -> ipcRenderer.send('oj-submission:detected', payload)
  -> RealtimeSubmissionService
```

`installOjSubmissionMessageForwarder()` 只转发当前窗口或子 frame 发出的 `postMessage`，channel 必须是 `__algo_submission_v1`。

不得在站点注入脚本里直接 `require('electron')`，也不得通过该桥发送 Cookie、源码或完整请求体。

## 6. OJ Session

`configureOjSession(options)` 负责 `persist:oj-main` 会话初始化：

- 设置真实 Chrome User-Agent，并同步到 `app.userAgentFallback` 和 OJ session。
- 只为 XHR/fetch 和 OPTIONS 响应补受控 CORS 头，保留服务器已声明 credentials 的响应。
- 在 mainFrame 响应开始时按当前 URL 找实时 adapter，站点未禁用时提前注入 hook，避免编辑器提前缓存 fetch/XHR。
- 保持 stealth script 注入逻辑在 browser 层集中维护。

本模块不读取 Cookie、不写库、不解析提交结果；提交结果仍由 adapter 和 `RealtimeSubmissionService` 处理。

## 7. BrowserHost 状态

`BrowserHost` 是早期单视图浏览器宿主，提供 `navigate()`、`executeScript()`、`getUrl()`、`capturePreview()` 等基础能力。当前 `main.ts` 已使用 `TabManager` 作为生产主线；除非明确维护兼容路径，不应把新功能接回 `BrowserHost`。

## 8. 测试入口

Browser 相关自动测试目前主要覆盖提交桥和实时注入依赖：

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs
node tmp\browser-ojBridge.test.mjs
```

与实时提交联动的 TabManager 约束在 `tests/submissions/realtimeTabActivation.test.ts` 中覆盖。
