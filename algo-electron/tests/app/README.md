# App Resilience Tests

## 职责

覆盖主进程致命错误处理、启动失败退出语义和壳 renderer 崩溃恢复策略。这里的测试使用可注入的 logger、进程事件源和 WebContents 替身，不替代真实 Electron startup smoke。

## 当前实现

- `mainProcessErrors.test.ts`：验证全局异常只弹一次并退出，以及 smoke 模式跳过阻塞对话框。
- `shellRendererRecovery.test.ts`：验证卡死/崩溃记录、reload 条件和清理监听器。
- `mainResilience.test.ts`：守卫 `main.ts` 的启动失败与 renderer 恢复接线。

## 封装入口

被测关键文件是 `electron/app/mainProcessErrors.ts`、`electron/app/shellRendererRecovery.ts` 和 `electron/main.ts`。

## 边界规则

纯错误状态机使用 Vitest；真实 Electron 生命周期仍必须通过 `tests/electron/startupSmoke.test.ts` 验证。测试不得启动真实用户数据目录，也不得提交日志、Cookie 或安装包产物。

## 验证

```powershell
cd algo-electron
npx vitest run tests\app
npm run test:electron
```
