# Credential Autofill

## 1. 职责

`electron/credentials/autofill/` 负责把已保存的站点凭据安全地填入 OJ 登录页。它不保存密码、不提交表单，也不向壳 renderer 暴露明文。

## 2. 数据与事件边界

当前实现程度：B4.4 已完成主进程协调器、站点配置收敛、OJ 隔离 preload 填充、壳 NoticeBar 多账户选择和定向安全测试；登录捕获和真实站点逐站 smoke 仍按计划留给后续任务/环境验收。

- 站点配置唯一来自 SQLite `site_configs`：`domains`、`loginUrlPatterns`、`loginUsernameSelectors` 和 `loginPasswordSelectors`。
- `CredentialAutofillService` 在主进程监听全局 `web-contents-created`，只接收 `persist:oj-main` session，因此拆分窗口、标签过户和后台标签不会遗漏。
- 只有恰好一个已保存凭据时自动填充；多个凭据暂停协调器并请求所属壳 NoticeBar 选择。选择按 windowId 隔离、30 秒超时、导航代际变化和非法 credentialId 均 fail closed。
- 主进程到 OJ 隔离 preload 的唯一内部通道是 `oj-credentials:fill`。壳 preload 没有对应 API。
- `ojPreload` 校验 payload 和当前 `window.location.href`，然后只填用户名和密码，不触发表单提交。
- HTTPS、无 userinfo、合法域名、登录 URL pattern、选择器长度和异步 generation/stale guard 共同构成 fail-closed 边界。

## 3. 文件职责

- `autofillPolicy.ts`：站点 URL、登录 pattern 和选择器净化。
- `formFiller.ts`：DOM 字段查找、短时延迟重试和原生 `input/change` 事件派发。
- `autofillServiceCore.ts`：无 Electron 依赖的协调器，处理凭据数量、异步解密、导航竞态和发送去重。
- `CredentialAutofillService.ts`：绑定 Electron 全局 webContents 生命周期和 OJ session。
- `CredentialAutofillService.ts` 同时维护按壳窗口隔离的 prompt 生命周期；prompt 只含脱敏摘要，renderer dismiss 返回 `null`。
- `credentialAutofillBridge.ts`：内部 channel 和 payload 类型；不得加入普通壳 preload。

## 4. 验证

```powershell
cd algo-electron
npx vitest run tests/security/credentialAutofillPolicy.test.ts tests/security/credentialAutofillCoordinator.test.ts tests/security/credentialAutofillService.test.ts tests/browser/credentialFormFiller.test.ts tests/db/siteLoginAutofillMigration.test.ts
```

当前自动化验证覆盖策略、URL fail closed、单/多凭据、reload/SPA stale guard、表单延迟渲染、migration 028 和 IPC channel 契约。七个真实站点登录页的逐站 smoke 仍需在具备测试账号和网络条件时执行，不能用单元测试替代。
