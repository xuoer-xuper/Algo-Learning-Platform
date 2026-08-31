# App Resilience Tests

## 职责

覆盖应用配置迁移、主进程单实例启动、致命错误处理、启动失败退出语义和壳 renderer 崩溃恢复策略。这里的测试使用临时目录、可注入 logger、进程事件源、窗口与 WebContents 替身，不替代真实 Electron startup smoke。

## 当前实现

- `configMigration.test.ts`：验证旧默认首页迁入净化快捷入口、旧字段删除、去重/userinfo 拒绝、默认 Bing 搜索配置迁移、custom 模板净化和迁移写回失败时的内存回退。
- `mainProcessErrors.test.ts`：验证全局异常只弹一次并退出，以及 smoke 模式跳过阻塞对话框。
- `shellRendererRecovery.test.ts`：验证卡死/崩溃记录、reload 条件和清理监听器。
- `singleInstance.test.ts`：验证锁失败退出、第二次启动恢复/聚焦窗口和异常容错。
- `tests/electron/mainResilience.test.ts`：守卫 `main.ts` 的单实例启动门、启动失败与 renderer 恢复接线。

## 封装入口

被测关键文件是 `electron/app/singleInstance.ts`、`electron/app/mainProcessErrors.ts`、`electron/app/shellRendererRecovery.ts` 和 `electron/main.ts`。

## 边界规则

纯错误状态机使用 Vitest；真实 Electron 生命周期仍必须通过 `tests/electron/startupSmoke.test.ts` 验证。测试不得启动真实用户数据目录，也不得提交日志、Cookie 或安装包产物。

## 验证

```powershell
cd algo-electron
npx vitest run tests/app
npm run test:electron
```
