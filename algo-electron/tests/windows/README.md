# Window Tests

## 1. 职责

`tests/windows/` 验证完整浏览器壳的窗口所有权、sender 归属、建窗/关窗竞态和 bounds 持久化，不启动第二个生产壳窗口，也不承担 B3.2 之后的服务多流语义。

## 2. 当前覆盖

- `ViewRegistry` 的 shell/tab 登记、重复 owner 拒绝、过户和按窗口清理。
- `WindowManager` 的窗口集合、最近聚焦窗口、shell/tab sender 解析和关闭注销。
- 应用级会话快照的 exact-shape、窗口/标签全局唯一性、数量/JSON 上限、敏感 URL 过滤、最近窗口引用与活动标签修复。
- 应用级会话存储的临时文件清理、write/fsync/close/rename 原子替换、快速写合并、防抖、退出 dispose、固定原因诊断和失败后恢复。
- `TabManager` 在创建、web/internal 转换、崩溃替换、会话恢复、关闭与 destroy 时维护 ViewRegistry。
- 缺失下载 source 的单窗口回退，以及非空未知 source 的 fail-closed 路由。
- 重叠建窗 single-flight、最近窗口显式恢复、任一窗口关闭后其他窗口及其 owner 保持有效。
- bounds 对负坐标副屏、显示器拔除、完全越界、损坏 JSON、并发原子写和 maximized normal bounds 的处理。

IPC 双发送方隔离测试位于 `tests/ipc/registerBrowserShellIpc.test.ts`，trusted sender owner 解析位于 `tests/security/trustedSender.test.ts`。

## 3. 关键文件

- `ViewRegistry.test.ts`、`WindowManager.test.ts`：应用级 owner 事实源和 sender/source 解析。
- `tabManagerViewRegistry.test.ts`：TabManager 的 view 生命周期登记。
- `WindowCreationGate.test.ts`：启动前建窗拒绝、重叠请求 single-flight 和退出时等待在途创建。
- `windowBounds.test.ts`：多显示器恢复、损坏回退与串行原子保存。
- `applicationSessionSnapshot.test.ts`、`applicationSessionStore.test.ts`：全窗口/标签快照安全边界、原子存储与应用退出 flush 基础层。

## 4. 维护规则

- 新增 webContents 创建、替换、过户或销毁路径时，必须补成对 register/unregister 断言。
- 不得用“最近窗口”掩盖非空未知 sender/source；缺失 source 的 fallback 必须保持单窗口限定。
- 并发测试必须使用可控 deferred 或临界区计数，不依赖不稳定的固定长等待。

## 5. 验证

```powershell
cd algo-electron
npx vitest run tests/windows
npm run test:core
```
