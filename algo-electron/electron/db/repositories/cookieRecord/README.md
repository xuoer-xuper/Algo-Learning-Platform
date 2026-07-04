# Cookie Record Repository

## 1. 职责

`electron/db/repositories/cookieRecord/` 保存 CookieVault 读取到的 Cookie 元数据，用于判断站点登录态和审计本地 Cookie 边界。

本目录不读取 Electron session、不保存 Cookie 明文、不参与同步上传，也不向 renderer 返回可复用登录态。

## 2. 当前实现程度

- `types.ts`：Cookie 元数据行、保存输入和安全摘要类型。
- `queries.ts`：按站点或 domain 查询元数据，并生成不含 value 的安全摘要。
- `mutations.ts`：幂等保存、批量保存、按 domain 替换和删除元数据。
- `../cookieRecordRepository.ts`：兼容导出口，外部调用方继续从 repository 根路径 import。

## 3. 封装函数

- 查询：`getCookieRecordsBySite(siteId)`、`getCookieRecordsByDomain(siteId, domain)`。
- 摘要：`getCookieSummaryBySite(siteId)`、`getCookieSummaryByDomain(siteId, domain)`。
- 写入：`upsertCookieMetadata(input)`、`upsertCookieMetadataBatch(inputs)`、`replaceCookieMetadataForDomain(siteId, domain, inputs)`。

## 4. 边界规则

- `value_encrypted` 当前固定为 `NULL`；完整 Cookie 值只在 Electron 持久 session 中按需读取。
- `sync_excluded` 固定为 `1`，Cookie 元数据和 Cookie 明文都不得进入 `sync_queue` 或普通 JSON 导出。
- 返回给 renderer 的摘要只包含 Cookie 名称、数量、过期时间和安全标记统计，不包含 value。
- Schema 变化必须先写 migration，再同步 `DATABASE_SCHEMA.md` 和 CookieVault 文档。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run test:core
```
