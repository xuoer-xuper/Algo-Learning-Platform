# Diagnostics Tests

## 1. 职责

`tests/diagnostics/` 负责验证浏览器诊断记录的边界，以及标题追踪和用户脚本注入的失败/跳过出口。

## 2. 当前覆盖

`browserDiagnostics.test.ts` 覆盖有界快照、序列化元数据、标题提取降级和用户脚本服务缺失路径。

## 3. 关键文件与边界

测试通过注入 `BrowserDiagnostics` 观察状态，不启动真实站点，不保存页面内容、凭据或脚本源码；真实 Electron ABI 边界仍由 `tests/electron/` 覆盖。

## 4. 验证入口

```powershell
npx vitest run tests/diagnostics/browserDiagnostics.test.ts
```
