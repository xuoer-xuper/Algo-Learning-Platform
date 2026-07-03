# Account Repository

## 1. 职责

`electron/db/repositories/account/` 是 `accountRepository.ts` 的内部实现目录，负责平台账号、当前 rating、peak rating 和 rating history 的 SQLite 访问。

本目录不请求 Codeforces API、不注册 IPC、不写提交或题目事实数据。外部 rating 同步由 `electron/rating/` 获取网络数据，再通过本 repository 持久化。

## 2. 当前实现程度

- `types.ts`：平台账号行、rating history 输入和 rating history 行类型。
- `accounts.ts`：账号 upsert、账号查询、当前 rating 和 peak rating 更新。
- `ratingHistory.ts`：rating history 去重写入、历史查询和 peak rating 计算。
- `../accountRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 账号：`upsertAccount(platform, handle, displayName?)`、`getAccount(...)`、`getAccountById(id)`、`getAccountsByPlatform(platform)`。
- rating：`updateCurrentRating(accountId, rating)`、`updatePeakRating(accountId, peak)`。
- rating history：`upsertRatingHistory(data)`、`getRatingHistory(accountId)`、`computePeakRating(accountId)`。

## 4. 边界规则

- `upsertRatingHistory()` 以 `(platform, account_id, contest_id)` 去重，重复 contest 不覆盖旧记录。
- `updateCurrentRating()` 同步更新 `last_synced_at`，用于表示最近一次成功同步时间。
- `computePeakRating()` 只读取 `rating_history.rating_after`，不自行回写账号表；调用方决定是否更新 peak。
- Schema 变化必须先写 migration，再同步 `DATABASE_SCHEMA.md` 和本目录 SQL。
- 不记录 Cookie、登录态、源码、完整请求体或网络原始日志。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
