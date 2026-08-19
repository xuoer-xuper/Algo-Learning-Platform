# Credential Vault

## 1. 职责

`electron/credentials/` 是站点账号密码的主进程安全边界。它把密码交给 Electron `safeStorage` 异步加密后再写入 `site_credentials`，renderer 只可以读取脱敏摘要。

## 2. 当前实现程度

- `credentialVaultCore.ts`：无 Electron 绑定的 Vault 逻辑和依赖注入接口。
- `CredentialVault.ts`：使用系统密钥环 `safeStorage` 的主进程薄壳。
- 支持 `save`、`list`、`delete` 和主进程内部 `getForAutofill`。
- envelope 固定校验 V1/provider；Electron key rotation 会再次解密并用新 key 重加密旧记录。
- `credentials:list`、`credentials:delete` 仅提供脱敏摘要和删除能力；自动填充明文通道留给 B4.3 的 OJ 隔离 preload。

## 3. 安全边界

- `safeStorage.isEncryptionAvailable()` 或异步加密能力不可用时拒绝保存和解密。
- 不使用应用主密码，不回退到明文或同步配置文件。
- renderer 只见 `credentialId`、`siteId`、`username`、固定 masked 摘要和时间字段。
- `getForAutofill` 返回的密码只能由后续受限 OJ 主进程通道消费，禁止接入壳 renderer IPC。
- 错误只携带结构化 `CredentialVaultError.code`，不携带密码、密文、URL、Cookie 或数据库路径。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\vitest\vitest.mjs run tests\security\credentialVault.test.ts tests\ipc\registerCredentialsIpc.test.ts
```

真实 Electron `safeStorage` 和后续登录流程按 B4.3-B4.5 的专项 smoke 验证；Vitest 只覆盖纯逻辑和 IPC 脱敏契约。
