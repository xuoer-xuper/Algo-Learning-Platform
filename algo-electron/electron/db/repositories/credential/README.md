# Site Credential Repository

## 1. 职责

`electron/db/repositories/credential/` 保存站点登录凭据的主进程数据边界。它只接受已经由后续 `CredentialVault` 生成的版本化 `electron-safe-storage` envelope，不接收密码明文，也不向 renderer 返回 envelope。

## 2. 当前实现程度

- `types.ts`：版本化 envelope、数据库行、主进程领域对象和脱敏列表摘要。
- `serialization.ts`：严格校验/序列化 V1 envelope，拒绝无版本、错误 provider、非法 base64 和额外字段。
- `queries.ts`：按 ID、站点/用户名读取，以及只返回脱敏摘要的列表查询。
- `mutations.ts`：同站点同用户名 upsert、软删除清密文、最近使用时间更新。
- `../credentialRepository.ts`：兼容导出口，供后续 Vault 使用。

关键入口：`upsertCredential`、`getCredentialById`、`getCredentialBySiteAndUsername`、`listCredentials`、`softDeleteCredential`、`markCredentialUsed`。

## 3. 边界规则

- `site_credentials.sync_excluded` 固定为 `1`，不进入同步或普通 JSON 导出。
- 活动行必须有 V1 envelope；软删除行清空 `secret_envelope` 并保留 tombstone。
- `UNIQUE(site_id, username)` 冲突时 revive 原行，保留 `id` 和 `created_at`。
- renderer 只能看到 `credentialId`、站点和用户名摘要；B4.2 才接入受限 autofill 明文通道。
- migration/schema 变化必须同步 `docs/DESIGN/DATABASE_SCHEMA.md` 与导出边界文档。

## 4. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run typecheck
```
