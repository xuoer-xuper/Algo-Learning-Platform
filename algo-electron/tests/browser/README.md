# Browser Tests

## 1. 职责

`tests/browser/` 覆盖 OJ WebContents preload bridge、导航策略、权限策略和受管弹窗的纯逻辑及 Electron test-double 契约。

## 2. 当前覆盖

- `ojBridge.test.ts`：`__algo_submission_v1` channel、同窗口/子 frame message 转发和非法 message 忽略。
- `navigationPolicy.test.ts`：生产 HTTPS、受控 about:blank、开发 loopback HTTP 与未知协议拒绝。
- `permissionPolicy.test.ts`：敏感权限默认拒绝，以及默认/OJ session 的 permission check/request 双处理器安装。
- `tabManagerTypes.test.ts`：内部页判别联合的严格参数白名单与长度边界。
- `tabManagerWindowOpen.test.ts`：接管 Chromium 创建的原始 `webContents`、前后台标签、销毁竞态与不安全协议拒绝。
- `tabManagerLifecycle.test.ts`：关闭后右邻激活、最后标签重置、URL/标题恢复关闭栈和 16 标签满额通知。
- `browserLayout.test.ts`：验证主进程布局契约的 36/42/78 派生关系，以及 renderer CSS 变量注入。
- `tabSessionSnapshot.test.ts`：会话 exact-shape/版本/数量/ID/标题/内部页/活动项校验，HTTPS 与开发 loopback URL、敏感 query/hash、损坏/超限 JSON，以及序列化字段白名单和活动项邻位回退。
- `tabSessionStore.test.ts`：缺失与陈旧临时文件、严格恢复 fallback、快速保存合并，以及 write/sync/close/rename 失败时清理临时文件并保留旧目标。

## 3. 运行方式

```powershell
cd algo-electron
npx vitest run tests\browser
npm run test:electron
```

## 4. 新增规则

修改 `electron/browser/ojBridge.ts`、`ojPreload.ts`、导航/权限/会话策略或 `setWindowOpenHandler` 接管流程时，在这里补测试。POST、OAuth 和 opener 等 Electron ABI 行为必须追加真实 startup smoke；会话 fixture 不得包含真实 URL 凭据、表单、密码、Cookie 或脚本源码。
