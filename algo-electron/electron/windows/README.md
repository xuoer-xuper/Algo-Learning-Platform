# Window Ownership

## 1. 职责

`electron/windows/` 是完整浏览器壳窗口的所有权层。它不实现标签业务、站点服务或 Renderer UI，只维护 `BrowserWindow`、`TabManager`、shell/OJ webContents 和持久窗口状态之间的确定归属。

## 2. 当前实现

- `AppWindow.ts`：封装一个完整壳窗口及其唯一 `TabManager`，提供销毁检查、定向事件发送和窗口状态 flush。
- `WindowManager.ts`：持有 `Map<windowId, AppWindow>`，跟踪最近注册/聚焦窗口，按 shell 或 tab webContents 解析所属窗口，并负责窗口注销时清除归属。
- `ViewRegistry.ts`：应用级 `webContentsId -> { windowId, tabId, view }` 事实源；shell 的 `tabId/view` 为 `null`，web 标签记录真实 `WebContentsView`。
- `WindowCreationGate.ts`：在主服务/session store 就绪前拒绝建窗，合并重叠请求，并在退出时停止且等待在途创建，避免启动 `activate` 双窗或退出后迟到注册。
- `WindowSessionRegistry.ts`：按 `windowId` 保存 session persistence runtime；重复 close 与并发 `before-quit` 复用同一个 dispose promise，最终 flush 完成后才移除。
- `windowBounds.ts`：版本化保存 normal bounds 与 maximized；读取时按现存显示器 workArea 校正，显示器拔除或完全越界时回到主屏；store 级队列串行执行共享临时文件的原子替换。

B3.1 仍只创建一个完整壳窗口。B3.2 完成服务多流语义、B3.3 完成标签过户前，拆分入口继续禁用。

## 3. 所有权规则

- 每个完整壳 `BrowserWindow` 必须对应一个 `AppWindow` 和一个 `TabManager`。
- shell webContents 与每个 web 标签必须登记到同一个 `ViewRegistry`；创建、崩溃替换、web/internal 转换、关闭、恢复回滚和 destroy 都要成对注册/注销。
- 普通 shell IPC 必须由 `trustedSender.getShellWindowOwner(event)` 从 sender 解析 `AppWindow`，不得回退最近活跃窗口或模块级全局 getter。
- 原生文件/确认对话框必须以发起 IPC 的 `AppWindow.browserWindow` 为 parent。
- 下载开始时捕获来源 `windowId`；完成时只通知仍存活的来源窗口，不改投其他窗口。
- `.user.js` 下载仅在 Electron 没有提供 source 且当前恰好一个完整壳窗口时回退；非空未知 source 必须拒绝路由。
- 窗口 close flush 在完成前必须持续拦截重复 close；应用退出同时等待 session 与 bounds flush。
- `WindowManager` 不接管 Coach 桌宠或历史 `DetachedWindow`；B3.3 会删除后者并让拆分窗口统一成为完整 `AppWindow`。

## 4. 验证

```powershell
cd algo-electron
npx vitest run tests/windows tests/ipc/registerBrowserShellIpc.test.ts tests/security/trustedSender.test.ts
npm run test:architecture
```
