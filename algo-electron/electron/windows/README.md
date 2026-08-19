# Window Ownership

## 1. 职责

`electron/windows/` 是完整浏览器壳窗口的所有权层。它不实现标签业务、站点服务或 Renderer UI，只维护 `BrowserWindow`、`TabManager`、shell/OJ webContents 和持久窗口状态之间的确定归属。

## 2. 当前实现

- `AppWindow.ts`：封装一个完整壳窗口及其唯一 `TabManager`，提供销毁检查和定向事件发送。
- `TabTransferCoordinator.ts`：按稳定 tabId 串行过户；根据屏幕落点执行同窗排序、跨壳接纳或创建空的完整壳，并在失败时关闭目标、回滚源标签。
- `WindowManager.ts`：持有 `Map<windowId, AppWindow>`，跟踪最近注册/聚焦窗口，按 shell 或 tab webContents 解析所属窗口，并负责窗口注销时清除归属。
- `ViewRegistry.ts`：应用级 `webContentsId -> { windowId, tabId, view }` 事实源；shell 的 `tabId/view` 为 `null`，web 标签记录真实 `WebContentsView`；begin/move/complete/rollback/discard transfer handle 保证过户期间不会被窗口注销误删。
- `WindowCreationGate.ts`：在主服务/session store 就绪前拒绝建窗，合并重叠请求，并在退出时停止且等待在途创建，避免启动 `activate` 双窗或退出后迟到注册。
- `applicationSessionSnapshot.ts`：严格校验应用级窗口/标签快照，保存窗口顺序、normal bounds、maximized、活动标签和最近窗口；全局拒绝重复 window/tab ID、敏感 URL 与超限数据。
- `applicationSessionStore.ts`：把全部可恢复窗口作为一份快照防抖、合并并原子落盘；正常关窗、退出和最近窗口变化都刷新同一事实源，旧单窗口标签会话只用于一次性迁移。
- `windowBounds.ts`：提供 bounds 默认值与多显示器合法化；应用级快照恢复时按现存显示器 workArea 校正，显示器拔除或完全越界时回到主屏。

B3.2 已完成页面事件、Tracking、ContestGuard、实时提交和 Coach 的多窗口语义，B3.3 已完成完整壳标签过户，B3.4 已完成全窗口服务广播。B3.5 由应用级快照和浏览器化关闭语义收尾：任一壳可独立关闭，最后壳退出应用，重启恢复全部合法窗口及最近窗口。

## 3. 所有权规则

- 每个完整壳 `BrowserWindow` 必须对应一个 `AppWindow` 和一个 `TabManager`。
- shell webContents 与每个 web 标签必须登记到同一个 `ViewRegistry`；创建、崩溃替换、web/internal 转换、关闭、恢复回滚和 destroy 都要成对注册/注销。
- 普通 shell IPC 必须由 `trustedSender.getShellWindowOwner(event)` 从 sender 解析 `AppWindow`，不得回退最近活跃窗口或模块级全局 getter。
- 原生文件/确认对话框必须以发起 IPC 的 `AppWindow.browserWindow` 为 parent。
- 下载开始时捕获来源 `windowId`；完成时只通知仍存活的来源窗口，不改投其他窗口。
- `.user.js` 下载仅在 Electron 没有提供 source 且当前恰好一个完整壳窗口时回退；非空未知 source 必须拒绝路由。
- 窗口 close flush 在完成前必须持续拦截重复 close；应用退出等待应用级快照最终 flush。临时 transfer 空壳不得进入持久快照。
- `WindowManager` 不接管 Coach 桌宠；桌宠由 Coach 编排层跟随最近活跃完整壳，并在父壳关闭前解绑。拆分窗口统一由 `AppWindow` 表示，`TabTransferCoordinator` 负责过户编排。
- `WindowManager` 提供去重的最近窗口变化订阅，供 Coach 单会话防抖跟随；业务服务仍自行维护 attach/detach，不把服务状态塞入所有权层。

## 4. 验证

```powershell
cd algo-electron
npx vitest run tests/windows tests/ipc/registerBrowserShellIpc.test.ts tests/security/trustedSender.test.ts
npm run test:architecture
```
