# Shared Tests

## 职责

覆盖主进程共享基础设施。日志层已换成 `electron-log/main`（5.4.4），`electron/shared/logger.ts`
只负责：脱敏 hook、点分事件名的 scope 还原、保留 3 份归档的轮转、`ALGO_ELECTRON_LOG_STDERR`
终端镜像开关与 `getLogFilePath()`。早期启动不再有内存缓冲——electron-log 的文件 transport
在首次写入时懒初始化，`app.ready` 之前发出的日志直接落盘，由 `tests/electron/startupSmoke`
断言兜底。

## 当前实现

- `logger.test.ts`：验证脱敏 hook（URL 查询/锚点、敏感键、Bearer/Basic、`password=`、
  `cookie=`）、Error/循环引用序列化、scope → 点分事件名还原、轮转恰好保留 3 份归档。
- `time.test.ts`：验证显式 UTC+8 时间格式不依赖宿主系统时区。

## 关键文件

被测入口是 `electron/shared/logger.ts` 与 `electron/shared/time.ts`；日志默认写
`userData/logs/main.log`，终端镜像必须显式开启（`ALGO_ELECTRON_LOG_STDERR=1`）。

## 边界规则

共享测试只使用临时目录，不写入真实 `userData`；断言不得包含 Cookie、密码、token、请求体或用户脚本源码。日志写入失败必须保持静默降级，不能反向污染业务测试。

## 验证

```powershell
cd algo-electron
npx vitest run tests/shared
```
