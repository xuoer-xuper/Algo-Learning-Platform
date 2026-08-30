# Electron Tests

## 1. 职责

`tests/electron/` 覆盖真实 Electron 启动链路、preload 白名单和 WebContentsView 基础可用性。

## 2. 当前覆盖

- `startupSmoke.test.ts`：bundle 真实 main/preload/OJ preload，使用临时 `userData` 与 localhost HTTP 服务启动 Electron，验证 `app://shell` origin、严格 CSP、初始内部 home、旧默认首页迁移、基础 IPC、默认/OJ session 权限拒绝、about:blank/GET/POST/OAuth opener/postMessage 弹窗接管，以及标签移入完整新壳后关闭原壳仍能保留页面与壳 IPC。
- `userScriptRuntimeSmoke.test.ts`：bundle 真实 userscript catalog/bootstrap preload 和一个普通 preload，使用一次性 localhost 页面验证 `document-start` 早于页面内联脚本、`document-end`/`document-idle` 真实阶段、页面无法捕获私有端口、SPA 重匹配，以及延迟 load 中的 generation 刷新不执行旧 end/idle 脚本；同时固定记录 Electron 43 普通 iframe 不触发 session frame preload、普通 preload 先于 userscript preload 的 best-effort 边界。
- `ojSubmissionBridgeSmoke.test.ts`：bundle 真实 `ojPreload`，在 `sandbox: true` 的窗口里通过 per-session `protocol.handle('https', ...)` 提供合成 https 页面（全局 `ignore-certificate-errors` 项目禁用），验证 document token 由 preload 主动 pull 而非 main 推送：document-start 直接调用暴露的 `reportSubmission`、同窗口 `postMessage`、子 frame 向 `window.top` 的 `postMessage` 都能送达，真实导航后 token 保持稳定（旧的 did-navigate 推送方案在此处会丢 token），未注册的 webContents 与 http 文档一律不发放 token。
- `electronDouble.test.ts`：Vitest 下的 Electron test-double 冒烟，覆盖命令行开关、BrowserWindow/WebContentsView 生命周期和 view bounds；`electronMock.ts` 还模拟可取消 `close`→`closed`、Chromium 预创建 popup `webContents` 及销毁后失效引用，真实 Electron ABI 仍由 `startupSmoke.test.ts` 覆盖。

`electronMock.ts` 里有两处专为 preload 模块级测试存在，改动时别当冗余删掉：

- `exposedMainWorld` 记下每次 `exposeInMainWorld` 的内容，**同时真的挂到 `globalThis`**。preload 是纯副作用模块，import 即执行、没有导出可断言，这个 Map 是唯一的观察点；而"真的挂上去"是因为 `userscriptBootstrapPreload` 先 expose 一个带随机 nonce 的桥，随后在 `executeInMainWorld` 里用 `globalThis[bridgeKey]` 取回并删掉——只记账不挂载，那条路径在替身下永远走不通，nonce 又是随机的，测试没法提前替它挂好。`resetElectronMock` 会把挂上去的键清掉。
- `ipcRenderer.invoke` 先 emit 一条 `'invoke'` 事件再执行 handler，与 `send` 对称。没注册 handler 时 invoke 的结果是 `undefined`，据此判断不出"到底有没有转发"，只能靠这条可观察事件。

- `mainResilience.test.ts`：守卫单实例 gate、致命错误/壳恢复，以及应用级会话存储初始化、全部窗口恢复先于壳加载、关窗/退出最终 flush 和最后壳清理桌宠后退出；禁止重新引入无条件 `warmup()` 或旧的单窗口 persistence runtime。

生产代码中依赖 Electron 的薄壳应保持可注入。Vitest 通过 `vitest.config.ts` 将 `electron` 解析到 `electronMock.ts`；需要真实 Electron、`safeStorage` 或 better-sqlite3 ABI 的边界，必须继续放在 `tests/verify.mjs` 的 Electron 专项测试中。

## 3. 运行方式

```powershell
cd algo-electron
npm run test:electron
```

## 4. 新增规则

修改启动顺序、窗口创建、IPC 注册时机、preload 路径、`TabManager` 初始化、app 协议、session 权限策略、弹窗接管、userscript frame 时序或 OJ preload 与主进程之间的握手方向时，需要扩展这里。三个 preload 本身的逻辑分支已由 Vitest 下的模块级测试覆盖（`tests/ipc/preloadSurface`、`tests/browser/ojPreloadModule`、`tests/scripts/userscriptBootstrapPreloadModule`），但那些跑在替身上：任何"main 与 preload 谁先就绪"的时序假设、以及 preload 与真实 Electron ABI 的耦合，仍然只能在这里用真实 preload 验证。测试必须使用临时目录和一次性 localhost 服务，不触碰真实登录态；Windows 文件锁清理使用有限重试，不得无限等待。
