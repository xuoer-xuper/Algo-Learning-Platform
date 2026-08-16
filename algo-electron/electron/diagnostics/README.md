# Browser Diagnostics

## 1. 职责

`electron/diagnostics/` 负责为导航/追踪、浏览器标题提取和用户脚本注入的静默降级提供统一诊断出口。

## 2. 当前实现

`BrowserDiagnostics` 是有界、可注入的状态日志。主进程持有一个实例，并通过只读 `browser:getDiagnostics` IPC 暴露快照；记录只包含状态元数据，不保存页面内容、凭据或脚本源码。

## 3. 封装入口与关键文件

- `BrowserDiagnostics.ts`：`record()`、`getSnapshot()`、`clear()` 和诊断条目类型。
- `mainServices.ts`：创建应用级实例。
- `registerBrowserShellIpc.ts`：提供 `browser:getDiagnostics` 读取入口。

## 4. 边界与维护规则

诊断对象只允许写入事件名、状态、脱敏 URL 和错误摘要；不得写入密码、Cookie、页面正文、请求体或用户脚本源码。快照最多保留 100 条，新增字段必须同步 preload 类型和安全测试。

## 5. 验证入口

```powershell
npx vitest run tests/diagnostics/browserDiagnostics.test.ts
```
