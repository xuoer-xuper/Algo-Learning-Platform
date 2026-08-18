# Shared Tests

## 职责

覆盖主进程共享基础设施，当前包括滚动文件 logger 的早期缓冲、隐私遮蔽、错误容错和日志轮转。

## 当前实现

- `logger.test.ts`：验证启动前缓冲、URL 查询参数清理、敏感字段遮蔽、循环对象和轮转归档。
- `time.test.ts`：验证显式 UTC+8 时间格式不依赖宿主系统时区。

## 关键文件

被测入口是 `electron/shared/logger.ts` 与 `electron/shared/time.ts`；日志默认只写 `userData/logs/main.log`，终端镜像必须显式开启。

## 边界规则

共享测试只使用临时目录，不写入真实 `userData`；断言不得包含 Cookie、密码、token、请求体或用户脚本源码。日志写入失败必须保持静默降级，不能反向污染业务测试。

## 验证

```powershell
cd algo-electron
npx vitest run tests\shared
```
