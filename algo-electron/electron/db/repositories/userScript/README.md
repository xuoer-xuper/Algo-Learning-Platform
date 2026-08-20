# User Script Repository

## 1. 职责

`electron/db/repositories/userScript/` 是 `userScriptRepository.ts` 的内部实现目录，负责用户脚本完整 metadata、启用状态、匹配规则 JSON、源码兼容字段和本地文件路径的 SQLite 访问。GM values、资源、host 授权和更新状态由同级 `userScriptRuntimeRepository.ts` 管理。

本目录不打开文件对话框、不复制脚本文件、不解析 userscript metadata、不注入脚本到页面。导入和文件管理在 `electron/ipc/registerScriptsIpc.ts`，匹配与注入在 `electron/scripts/`。

## 2. 当前实现程度

- `types.ts`：用户脚本对外记录、数据库行和写入/更新输入类型。
- `rowMapper.ts`：把 SQLite 的启用状态 0/1 归一为布尔值。
- `queries.ts`：脚本列表、启用脚本列表、按 ID 查询和精确身份查询。
- `mutations.ts`：脚本创建、部分更新、启停、删除、legacy canonical 身份认领和导入链路的事务边界。
- `../userScriptRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 查询：`getAllScripts()`、`getEnabledScripts()`、`getScriptById(id)`、`getScriptByIdentity(namespace, identityName)`、`getLegacyScriptByIdentityName(identityName)`。
- 写入：`createScript(data)`、`updateScript(id, data)`、`toggleScript(id, enabled)`、`deleteScript(id)`、`claimLegacyScriptIdentity(id, namespace)`、`updateScriptWithLegacyClaim(id, namespace, data)`、`runUserScriptTransaction(operation)`。
- 行映射：`normalizeUserScriptRow(row)`。

## 4. 边界规则

- `code` 字段保留旧版兼容；导入脚本默认使用 `file_path` 指向用户数据目录下的脚本文件。
- Repository 保存调用方传入的 match/include/exclude(-match)、grant/connect、run-at、更新地址等 metadata JSON/字段，不解释 URL 规则；JSON 数组基本形状由 migration 027 的 SQLite CHECK 约束。
- namespace 有三种持久化语义：`NULL` 仅表示迁移后尚未认领的 legacy canonical；明确没有 `@namespace` 的新 canonical 使用空字符串；本地副本使用保留前缀 `local:<id>`。
- `identity_name` 是稳定导入身份，显示字段 `name` 可编辑且更新时不联动身份。
- 创建时省略 namespace 会生成本地副本并默认关闭自动更新；新导入 canonical 必须显式传 metadata namespace 或空字符串；`null` 仅供迁移兼容和测试构造 legacy 行。
- `enabled` 和 `auto_update_enabled` 在数据库中是整数，对外统一返回布尔值。
- `noframes` 在数据库中是 0/1，对外统一返回布尔值；创建旧调用方未传 027 字段时使用安全默认值。
- 身份查询和 legacy 认领只处理 `deleted_at IS NULL` 的活动记录；legacy 可原子认领为声明 namespace 或空字符串，但不能认领为 `local:*`，且不会覆盖已存在身份。
- 不记录用户脚本源码、Cookie、登录态、完整请求体或可复用登录态信息。
- Schema 变化必须先写 migration，再同步 `docs/DESIGN/DATABASE_SCHEMA.md` 和本目录 SQL。

`userScriptRuntimeRepository.ts` 提供 JSON 值 set/get/list/delete、BLOB 资源 upsert/list/全量替换、host 授权 revoke/revive/use 和 update-state merge。四类记录都由 `user_scripts` 外键级联删除；资源严格保留 kind 与声明顺序，导入时与脚本 metadata 更新处于同一事务。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
