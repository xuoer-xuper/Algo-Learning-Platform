# Browser Tests

## 1. 职责

`tests/browser/` 覆盖 OJ WebContents preload bridge 的纯逻辑，重点验证页面脚本如何把提交 payload 安全转发给主进程。

## 2. 当前覆盖

- `ojBridge.test.ts`：`__algo_submission_v1` channel、同窗口/子 frame message 转发和非法 message 忽略。

## 3. 运行方式

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs
node tmp\browser-ojBridge.test.mjs
```

## 4. 新增规则

修改 `electron/browser/ojBridge.ts`、`ojPreload.ts` 或实时提交桥安全边界时，在这里补测试。不要把真实站点响应、Cookie 或源码写进 fixture。
