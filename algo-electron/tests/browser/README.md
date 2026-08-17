# Browser Tests

## 1. 职责

`tests/browser/` 覆盖 OJ WebContents preload bridge、导航策略、权限策略和受管弹窗的纯逻辑及 Electron test-double 契约。

## 2. 当前覆盖

- `ojBridge.test.ts`：`__algo_submission_v1` channel、同窗口/子 frame message 转发和非法 message 忽略。
- `navigationPolicy.test.ts`：生产 HTTPS、受控 about:blank、开发 loopback HTTP 与未知协议拒绝。
- `permissionPolicy.test.ts`：敏感权限默认拒绝，以及默认/OJ session 的 permission check/request 双处理器安装。
- `tabManagerWindowOpen.test.ts`：接管 Chromium 创建的原始 `webContents`、前后台标签、销毁竞态与不安全协议拒绝。

## 3. 运行方式

```powershell
cd algo-electron
npx vitest run tests\browser
npm run test:electron
```

## 4. 新增规则

修改 `electron/browser/ojBridge.ts`、`ojPreload.ts`、导航/权限策略或 `setWindowOpenHandler` 接管流程时，在这里补测试。POST、OAuth 和 opener 等 Electron ABI 行为必须追加真实 startup smoke；fixture 不得包含真实站点响应、Cookie 或源码。
