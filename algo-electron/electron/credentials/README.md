# Credential Vault

## 1. 职责

`electron/credentials/` 是站点账号密码的主进程安全边界。它把密码交给 Electron `safeStorage` 异步加密后再写入 `site_credentials`，renderer 只可以读取脱敏摘要。

## 2. 当前实现程度

- `credentialVaultCore.ts`：无 Electron 绑定的 Vault 逻辑和依赖注入接口。
- `CredentialVault.ts`：使用系统密钥环 `safeStorage` 的主进程薄壳。
- 支持 `save`、`list`、`rename`、`delete` 和主进程内部 `getForAutofill`。
- envelope 固定校验 V1/provider；Electron key rotation 会再次解密并用新 key 重加密旧记录。
- `credentials:list`、`credentials:rename`、`credentials:delete` 仅提供脱敏摘要管理；账户中心可按站点查看登录态摘要、重命名/删除保存凭据，并在新 OJ 标签打开登录页更新密码。B4.4 不提供密码输入或查看框。
- 多账户自动填充通过完整壳顶部 NoticeBar 显示 `credentialId`、用户名、显示名和 masked 摘要，壳只回传所选 ID；密码仍只经过 OJ 隔离 preload。
- B4.5 登录捕获由 `ojPreload` 在隔离世界监听表单 `submit`，只把用户名和密码送入主进程短时 pending map；壳 renderer 只收到一次性 `captureId`、站点/用户名和 masked 等脱敏摘要，通过 NoticeBar 确认后才写入 Vault。
- 同站点同用户名且密码未变化时静默丢弃；密码变化时提示“更新密码”。取消、30 秒超时、页面导航（含 SPA 原位导航）、WebContents 销毁和服务 `dispose` 都会清理 pending capture；同一窗口的新捕获替换旧捕获。

### 自动填充

- `credentials/autofill/` 只消费 SQLite `site_configs` 中的登录 URL pattern 与表单选择器，不再维护第二份运行时站点配置。
- `CredentialAutofillService` 监听全局 `web-contents-created`，仅接受 `persist:oj-main` session，因此拆分窗口和迁移后的标签仍覆盖在同一安全边界内。
- URL 必须是 HTTPS、无 userinfo、命中站点域名和登录 pattern；多个凭据时 fail closed，等待 B4.4 的显式账户选择。
- 主进程只发送一次性 `oj-credentials:fill` payload 到 `ojPreload`；preload 再校验当前 URL 后填入用户名和密码，绝不自动提交表单。
- 页面导航、SPA 原位导航、reload、销毁和异步解密均有 generation/stale guard，旧页面结果不会写入新页面。

## 3. 安全边界

- `safeStorage.isEncryptionAvailable()` 或异步加密能力不可用时拒绝保存和解密。
- 不使用应用主密码，不回退到明文或同步配置文件。
- renderer 只见 `credentialId`、`siteId`、`username`、可选 `displayName`、固定 masked 摘要和时间字段。
- `getForAutofill` 返回的密码只能由 `oj-credentials:fill` 受限 OJ preload 通道消费，禁止接入壳 renderer IPC。
- 错误只携带结构化 `CredentialVaultError.code`，不携带密码、密文、URL、Cookie 或数据库路径。
- 登录捕获使用 OJ 专用 `oj-credentials:capture` channel 和 `onFromOj()` sender 校验，不能由壳 renderer 直接调用；`credentials:capturePrompt`/`credentials:captureResult` 只携带脱敏摘要和非敏感成功/失败结果。
- 捕获监听不阻止或代替站点原生提交，也不自动提交；自动填充与捕获都必须经过 HTTPS、站点域名和登录 URL pattern 校验。密码明文仅存在于 OJ 页面输入、OJ 隔离 preload 到主进程的专用 IPC、主进程瞬时内存以及 Vault 写入过程，不进入日志、导出、NoticeBar 或 renderer DOM。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\vitest\vitest.mjs run tests\security\credentialVault.test.ts tests\ipc\registerCredentialsIpc.test.ts
```

B4.5 登录捕获已完成，Vitest 覆盖表单提取、主进程 pending 生命周期、owner/captureId/action 校验、同密码静默、密码变化更新、IPC 合约和 renderer 脱敏展示。真实七站登录页逐站捕获/自动填充 smoke 仍留到具备测试账号和网络条件的 B4 统一验收，不由单元测试替代。
