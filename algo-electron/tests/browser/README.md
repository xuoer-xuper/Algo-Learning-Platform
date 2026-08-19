# Browser Tests

## 1. 职责

`tests/browser/` 覆盖 OJ WebContents preload bridge、导航策略、权限策略和受管弹窗的纯逻辑及 Electron test-double 契约。

## 2. 当前覆盖

- `ojBridge.test.ts`：`__algo_submission_v1` channel、同窗口/子 frame message 转发和非法 message 忽略。
- `navigationPolicy.test.ts`：生产 HTTPS、受控 about:blank、开发 loopback HTTP 与未知协议拒绝。
- `internalPage.test.ts`：canonical `algo://` 地址正反向互逆，以及额外路径/参数/hash/userinfo/非 canonical 编码拒绝。
- `omnibox.test.ts`：内部页/HTTPS URL/搜索三分流、bare host 推断、开发 loopback、稳定阻断原因、内置搜索 URL 与 custom HTTPS 模板校验。
- `permissionPolicy.test.ts`：敏感权限默认拒绝，以及默认/OJ session 的 permission check/request 双处理器安装。
- `tabManagerTypes.test.ts`：内部页判别联合的严格参数白名单与长度边界。
- `tabManagerWindowOpen.test.ts`：接管 Chromium 创建的原始 `webContents`、前后台标签、销毁竞态与不安全协议拒绝。
- `tabManagerLifecycle.test.ts`：关闭后右邻激活、B2 默认最后标签重置为内部 home、B3 浏览器生命周期下最后标签委托所属壳关闭、web/internal 恢复关闭栈、内部页原位转 web 和 16 标签满额通知。
- `browserLayout.test.ts`：验证主进程布局契约的 36/42/38/38/78 派生关系，以及 renderer CSS 变量注入。
- `tabSessionSnapshot.test.ts`：会话 exact-shape/版本/数量/ID/标题/内部页/活动项校验，HTTPS 与开发 loopback URL、敏感 query/hash、损坏/超限 JSON，以及序列化字段白名单和活动项邻位回退。
- `tabSessionStore.test.ts`：缺失与陈旧临时文件、严格恢复 fallback、快速保存合并，write/sync/close/rename 失败保旧，以及防抖 schedule、flush/dispose、在途最新快照和固定原因诊断恢复。
- `tabManagerSession.test.ts`：有序 web/internal 混合标签的稳定 ID/标题/活动项恢复、只挂载活动 web view、持久状态事件边界、精确快照字段、创建中途失败全回滚、新 ID 冲突规避，以及崩溃 view 替换创建失败后的标签保留和重试。
- `tabManagerHealth.test.ts`：活动/后台标签崩溃与无响应、38px NoticeBar 布局让位、继续等待与 responsive 清理、destroyed view 替换、原 URL 恢复和关闭后的迟到失败隔离。
- `tabManagerFindZoom.test.ts`：查找 requestId/结果隔离、下载通知与查找条 bounds 累加、Chrome 缩放档位/写失败不生效，以及 `.user.js` 短期安装路由不进入会话快照。
- `contextMenu.test.ts`：页面、壳内编辑区/Omnibox 与标签右键模板覆盖及动作白名单。
- `tabSessionLifecycle.test.ts`：窗口关闭前 flush、重复关闭合并、无 persistence 直关，以及同步/异步失败和诊断异常不阻断关闭。

## 3. 运行方式

```powershell
cd algo-electron
npx vitest run tests\browser
npm run test:electron
```

## 4. 新增规则

修改 `electron/browser/ojBridge.ts`、`ojPreload.ts`、导航/权限/会话策略或 `setWindowOpenHandler` 接管流程时，在这里补测试。POST、OAuth 和 opener 等 Electron ABI 行为必须追加真实 startup smoke；会话 fixture 不得包含真实 URL 凭据、表单、密码、Cookie 或脚本源码。
