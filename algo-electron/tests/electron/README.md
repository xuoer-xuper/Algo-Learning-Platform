# Electron Tests

## 1. 职责

`tests/electron/` 覆盖真实 Electron 启动链路、preload 白名单和 WebContentsView 基础可用性。

## 2. 当前覆盖

- `startupSmoke.test.ts`：bundle 真实 main/preload/OJ preload，使用临时 `userData` 与 localhost HTTP 服务启动 Electron，验证 `app://shell` origin、严格 CSP、初始内部 home、旧默认首页迁移、基础 IPC、默认/OJ session 权限拒绝、about:blank/GET/POST/OAuth opener/postMessage 弹窗接管，以及标签移入完整新壳后关闭原壳仍能保留页面与壳 IPC。
- `userScriptRuntimeSmoke.test.ts`：bundle 真实 userscript catalog/bootstrap preload 和一个普通 preload，使用一次性 localhost 页面验证 `document-start` 早于页面内联脚本、`document-end`/`document-idle` 真实阶段、页面无法捕获私有端口、SPA 重匹配，以及延迟 load 中的 generation 刷新不执行旧 end/idle 脚本；同时固定记录 Electron 43 普通 iframe 不触发 session frame preload、普通 preload 先于 userscript preload 的 best-effort 边界。
- `electronDouble.test.ts`：Vitest 下的 Electron test-double 冒烟，覆盖命令行开关、BrowserWindow/WebContentsView 生命周期和 view bounds；`electronMock.ts` 还模拟可取消 `close`→`closed`、Chromium 预创建 popup `webContents` 及销毁后失效引用，真实 Electron ABI 仍由 `startupSmoke.test.ts` 覆盖。
- `mainResilience.test.ts`：守卫单实例 gate、致命错误/壳恢复，以及应用级会话存储初始化、全部窗口恢复先于壳加载、关窗/退出最终 flush 和最后壳清理桌宠后退出；禁止重新引入无条件 `warmup()` 或旧的单窗口 persistence runtime。

生产代码中依赖 Electron 的薄壳应保持可注入。Vitest 通过 `vitest.config.ts` 将 `electron` 解析到 `electronMock.ts`；需要真实 Electron、`safeStorage` 或 better-sqlite3 ABI 的边界，必须继续放在 `tests/verify.mjs` 的 Electron 专项测试中。

## 3. 运行方式

```powershell
cd algo-electron
npm run test:electron
```

## 4. 新增规则

修改启动顺序、窗口创建、IPC 注册时机、preload 路径、`TabManager` 初始化、app 协议、session 权限策略、弹窗接管或 userscript frame 时序时，需要扩展这里。测试必须使用临时目录和一次性 localhost 服务，不触碰真实登录态；Windows 文件锁清理使用有限重试，不得无限等待。
