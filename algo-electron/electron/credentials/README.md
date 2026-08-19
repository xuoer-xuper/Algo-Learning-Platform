# Credential Vault

## 1. 职责

`electron/credentials/` 是站点账号密码的主进程安全边界。它把密码交给 Electron `safeStorage` 异步加密后再写入 `site_credentials`，renderer 只可以读取脱敏摘要。

## 2. 当前实现程度

- `credentialVaultCore.ts`：无 Electron 绑定的 Vault 逻辑和依赖注入接口。
- `CredentialVault.ts`：使用系统密钥环 `safeStorage` 的主进程薄壳。
- 支持 `save`、`list`、`delete` 和主进程内部 `getForAutofill`。
- envelope 固定校验 V1/provider；Electron key rotation 会再次解密并用新 key 重加密旧记录。
- `credentials:list`、`credentials:delete` 仅提供脱敏摘要和删除能力；B4.3 已接入仅限 OJ 隔离 preload 的自动填充明文通道。

### 自动填充

- `credentials/autofill/` 只消费 SQLite `site_configs` 中的登录 URL pattern 与表单选择器，不再维护第二份运行时站点配置。
- `CredentialAutofillService` 监听全局 `web-contents-created`，仅接受 `persist:oj-main` session，因此拆分窗口和迁移后的标签仍覆盖在同一安全边界内。
- URL 必须是 HTTPS、无 userinfo、命中站点域名和登录 pattern；多个凭据时 fail closed，等待 B4.4 的显式账户选择。
- 主进程只发送一次性 `oj-credentials:fill` payload 到 `ojPreload`；preload 再校验当前 URL 后填入用户名和密码，绝不自动提交表单。
- 页面导航、SPA 原位导航、reload、销毁和异步解密均有 generation/stale guard，旧页面结果不会写入新页面。

## 3. 安全边界

- `safeStorage.isEncryptionAvailable()` 或异步加密能力不可用时拒绝保存和解密。
- 不使用应用主密码，不回退到明文或同步配置文件。
- renderer 只见 `credentialId`、`siteId`、`username`、固定 masked 摘要和时间字段。
- `getForAutofill` 返回的密码只能由 `oj-credentials:fill` 受限 OJ preload 通道消费，禁止接入壳 renderer IPC。
- 错误只携带结构化 `CredentialVaultError.code`，不携带密码、密文、URL、Cookie 或数据库路径。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\vitest\vitest.mjs run tests\security\credentialVault.test.ts tests\ipc\registerCredentialsIpc.test.ts
```

真实七站登录页逐站 smoke、账户选择 UI 和登录捕获仍分别属于后续验收/B4.4-B4.5；Vitest 已覆盖策略、协调器、preload 表单填充、迁移和 IPC 合约。
