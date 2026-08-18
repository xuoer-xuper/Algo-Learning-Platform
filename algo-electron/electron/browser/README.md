# Browser 模块说明

## 1. 职责

`electron/browser/` 是内嵌 OJ 浏览器容器层，负责创建和管理 Electron `WebContentsView`，承接导航、标签页、页面脚本注入和提交监测桥接。

本模块不解析题目、不写数据库、不决定站点 adapter，也不直接处理提交结果。题目识别在 `electron/adapters/`，提交监测在 `electron/submissions/`，行为追踪在 `electron/tracking/`。

## 2. 当前实现程度

- 主线浏览器容器：`TabManager`，已接入 `main.ts`。
- 视图技术：统一使用 `WebContentsView`，遵守 `docs/ADR/ADR_0001_USE_WEBCONTENTSVIEW.md`。
- 会话隔离：OJ 页面使用 `partition: 'persist:oj-main'` 持久登录态。
- 多标签：最多 16 个有序 web/internal 混合标签，支持创建、关闭、切换、恢复关闭和混合会话恢复；关闭活动标签优先激活右邻，关闭最后一个标签会创建内部 home，满额时拒绝创建并通知壳层。旧双击剥离入口在 B3 多窗口对等壳完成前临时禁用，双击仅通过既有工具栏消息区说明恢复计划。
- 弹窗接管：`window.open` / `target=_blank` 创建的 Chromium `webContents` 会被原样接管为受管标签，保留 about:blank、POST、OAuth 和 opener 语义；后台标签不会抢占活动标签。
- 导航边界：生产环境只允许 HTTPS 和受控 about:blank；开发与 smoke 额外允许 localhost/loopback HTTP，未知协议默认拒绝并通过 `ui:command` 通知壳层。
- 会话快照：`tabSessionSnapshot.ts` 对版本、字段白名单、标签顺序、活动项、内部页和可恢复 URL 做整份严格校验；拒绝 userinfo、敏感 query/hash、控制字符和未知字段，不部分抢救损坏数据，也不序列化 favicon、加载/崩溃状态、表单、密码或脚本源码。
- 会话恢复：正常启动严格读取 `browser-session.json`，按原顺序和稳定 ID 恢复 web/internal 标签，只为 web 标签创建 view，最后仅挂载活动 web view；任一同步创建失败会销毁本次全部 view 并回退内部 home。壳 renderer 先订阅列表事件再主动拉取当前列表，且用版本/卸载保护避免迟到响应覆盖新状态。
- 会话文件：`TabSessionStore` 使用同目录临时文件执行 write + fsync + close + rename，失败时清理临时文件并保留旧目标；`TabSessionPersistence` 对创建、关闭、切换、URL 和标题变化做 250ms 防抖，只保存最新快照，加载/favicon 状态不触发落盘。窗口 `close` 与 `before-quit` 在最终 flush 完成后继续关闭，startup smoke 禁用持久化。
- renderer 健康状态：web 标签 `render-process-gone` 后保留稳定 ID、URL、标题和顺序，摘除坏 view 并显示恢复页；原 view 已销毁时创建同配置替代 view，失败仍保留标签供后续重试。`unresponsive` 只影响运行时列表和活动 view bounds，NoticeBar 可继续等待、按 tabId 重载或关闭，`responsive` 后自动清理；这些状态不进入会话快照。
- 壳层 IPC：browser/tab/window channel 由 `electron/ipc/registerBrowserShellIpc.ts` 注册，Browser 模块只暴露 `TabManager` 等运行期对象。
- OJ Session：`ojSession.ts` 配置持久 session、真实 Chrome UA、受控 CORS、早期实时提交 hook 和 stealth script；默认 session 与 OJ session 同时安装 permission check/request 双处理器，敏感权限默认拒绝。
- 实时提交桥：`ojPreload.ts` 暴露 `__algo_submission_v1.reportSubmission()`，并转发同页面/子 frame 的 `postMessage`。
- 反检测脚本：`STEALTH_SCRIPT` 在页面加载后注入，主线由 `TabManager` 执行。

## 3. 文件职责

- `TabManager.ts`：多标签 `WebContentsView` 管理器，当前主线。
- `internalPage.ts`：受控内部页标题、`algo://` 展示地址和页面身份比较；这些地址只用于标签状态，不注册为资源协议。
- `tabManagerTypes.ts`：受校验的 `InternalPage` 判别联合、web/internal `TabInfo`、managed tab 与可序列化 session snapshot 类型。
- `tabManagerConfig.ts`：标签数量、工具栏高度、tabbar 高度和 OJ preload 路径配置。
- `browserLayout.ts`：主进程定义的标题栏/工具栏/NoticeBar 布局契约；preload 注入 renderer CSS 变量，避免 bounds 与 CSS 各自维护高度副本。
- `tabViewLayout.ts`：活动 tab view 的 bounds 计算、安全移除和 webContents 关闭 helper。
- `tabScriptExecution.ts`：按 URL 命中的标签页中，对主 frame 和子 frame 执行脚本。
- `urlMatching.ts`：同页 URL 匹配 helper，供按 URL 找 tab 的脚本执行路径使用。
- `navigationPolicy.ts`：HTTPS、localhost HTTP、about:blank 与未知协议的统一导航判定。
- `tabSessionSnapshot.ts`：严格解析/净化可恢复标签会话，限制 128 KiB JSON、16 个标签、ID/标题/URL 边界与敏感 URL 数据。
- `tabSessionStore.ts`：会话 JSON 的原子读取/写入、快速保存合并与可 flush/dispose 的防抖协调器，不记录原始 JSON 或 URL。
- `tabSessionLifecycle.ts`：窗口关闭前的异步会话 flush 门控；重复关闭只触发一次写入，完成或失败后再允许窗口销毁。
- `permissionPolicy.ts`：默认 session 与 OJ session 共用的最小权限白名单及双处理器安装函数。
- `DetachedWindow.ts`：将标签页 view 剥离到原生独立窗口。
- `ojPreload.ts`：OJ 页面 preload，暴露提交上报桥并转发 frame 消息。
- `ojBridge.ts`：提交上报桥的纯函数和 channel 常量。
- `ojSession.ts`：配置 OJ 持久 session 的 UA、CORS、实时 hook 和 stealth 注入。
- `stealthScript.ts`：反检测脚本字符串。

## 4. TabManager 封装

`TabManager` 负责主窗口里的 OJ 多标签体验：

- 标签生命周期
  - `createTab(url?)`：有 URL 时创建 web 标签，无 URL 时创建内部 home。
  - `openInternalTab(page, options?)`：创建受控内部页标签，可按页面身份复用已有标签。
  - `closeTab(tabId)`
  - `switchTab(tabId)`
  - `detachTab(tabId)`
  - `destroy()`
- 导航控制
  - `navigate(url)`
  - `goBack()`
  - `goForward()`
  - `reload()`
  - `reloadTab(tabId)`：为故障态操作绑定明确标签，避免活动标签切换竞态。
  - `dismissUnresponsive(tabId)`：隐藏当前无响应提示并恢复 view bounds，但保留真实 unresponsive 状态直到 Electron 发出 `responsive`。
  - `closeActiveTab()`、`switchRelative(offset)`、`switchTabByIndex(index)`
  - `reopenClosedTab()`：按 LIFO 恢复最近关闭的 web URL 或内部页及标题。
  - `adjustZoom(delta)`、`resetZoom()`
- 状态读取
  - `getUrl()`
  - `getTitleForUrl(url)`
  - `getActiveTabId()`
  - `getTabList()`
  - `getSessionSnapshot()`：只返回稳定、安全、可序列化的标签字段。
  - `isViewVisible()`
- 会话生命周期
  - `restoreSession(snapshot)`：整份复验后恢复有序 web/internal 标签、稳定 ID、标题和活动项。
  - `ensureInitialTab()`：仅在无可恢复标签时创建内部 home。
  - `addSessionChangeListener(callback)`：只广播持久状态变化，不复用包含 favicon/loading 噪声的列表事件。
- 布局和可见性
  - `setLeftOffset(offset)`
  - 活动 internal 标签不挂载 view；切回 web 标签时由 `switchTab()` 恢复对应 view。
- 脚本执行
  - `executeScript(code, userGesture?)`：只在当前活动标签执行；`userGesture` 仅供需要模拟真实点击语义的受控主进程调用。
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
  - `addWebContentsUrlListener(callback)`：订阅每个裸 `webContents` 的 URL/销毁快照；订阅时回放当前集合，不受活动标签和 managed-tab 查找门控。
  - `setShortcutHandler(handler)`：为壳和 OJ view 注册同一套 browser shortcut dispatcher。
  - `setNavigationBlockedHandler(handler)`：向壳层报告被导航策略拒绝的原因。
  - `setTabLimitReachedHandler(handler)`：标签达到 16 个时向壳层报告，不再静默复用活动标签 ID。

`executeScriptOnUrl()` 会先写入 `window.__ALGO_TOP_PAGE_URL`，让站点 hook 在 iframe 中仍能知道顶层题目页 URL。

`TabManager.ts` 只保留多标签生命周期、事件绑定和视图管理；可复用类型、常量、URL 判断、view bounds 和跨 frame 脚本执行放在旁侧 helper，避免主类继续膨胀。

布局 helper 边界：

- `setTabViewBounds(view, contentSize, leftOffset, topInset?)`：统一 toolbar/tabbar/sidebar 偏移计算；活动标签显示 NoticeBar 时额外下移共享的 38px 高度。
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
- 为默认 session 和 `persist:oj-main` 同时安装 `setPermissionCheckHandler` 与 `setPermissionRequestHandler`；仅放行全屏、受净化剪贴板写入和存储访问，摄像头、麦克风、定位、通知等敏感权限默认拒绝。
- 只为 XHR/fetch 和 OPTIONS 响应补受控 CORS 头，保留服务器已声明 credentials 的响应。
- 在 mainFrame 响应开始时按当前 URL 找实时 adapter，站点未禁用时提前注入 hook，避免编辑器提前缓存 fetch/XHR。
- 保持 stealth script 注入逻辑在 browser 层集中维护。

本模块不读取 Cookie、不写库、不解析提交结果；提交结果仍由 adapter 和 `RealtimeSubmissionService` 处理。

## 7. 测试入口

Browser 相关自动测试覆盖提交桥、导航策略、权限策略、Chromium 弹窗接管、标签崩溃/无响应，以及会话快照安全边界、恢复回滚、防抖原子存储和关闭前 flush：

```powershell
cd algo-electron
npx vitest run tests\browser
npm run test:electron
```

真实 Electron smoke 使用临时 localhost 服务验证默认/ OJ session 权限拒绝，以及 about:blank、GET、POST、OAuth opener/postMessage 弹窗链路。`tabManagerHealth.test.ts` 覆盖活动/后台无响应、等待/恢复、崩溃 view 摘除/替换和关闭竞态；布局契约在 `tests/browser/browserLayout.test.ts` 中覆盖；与实时提交联动的 TabManager 约束在 `tests/submissions/realtimeTabActivation.test.ts` 中覆盖；ContestGuard 的后台标签与销毁聚合路径在 `tests/coach/contestUrlAggregator.test.ts` 中覆盖。
