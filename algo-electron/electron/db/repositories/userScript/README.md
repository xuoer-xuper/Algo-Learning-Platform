# User Script Repository

## 1. 职责

`electron/db/repositories/userScript/` 是 `userScriptRepository.ts` 的内部实现目录，负责用户脚本元信息、启用状态、匹配规则 JSON、源码兼容字段和本地文件路径的 SQLite 访问。

本目录不打开文件对话框、不复制脚本文件、不解析 userscript metadata、不注入脚本到页面。导入和文件管理在 `electron/ipc/registerScriptsIpc.ts`，匹配与注入在 `electron/scripts/`。

## 2. 当前实现程度

- `types.ts`：用户脚本对外记录、数据库行和写入/更新输入类型。
- `rowMapper.ts`：把 SQLite `enabled` 的 0/1 归一为布尔值。
- `queries.ts`：脚本列表、启用脚本列表和按 ID 查询。
- `mutations.ts`：脚本创建、部分更新、启停和删除。
- `../userScriptRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 查询：`getAllScripts()`、`getEnabledScripts()`、`getScriptById(id)`。
- 写入：`createScript(data)`、`updateScript(id, data)`、`toggleScript(id, enabled)`、`deleteScript(id)`。
- 行映射：`normalizeUserScriptRow(row)`。

## 4. 边界规则

- `code` 字段保留旧版兼容；导入脚本默认使用 `file_path` 指向用户数据目录下的脚本文件。
- Repository 只保存调用方传入的 `match_urls_json` 和 `site_ids_json`，不解析或校验 userscript 规则。
- `enabled` 在数据库中是整数，对外统一返回布尔值。
- 不记录用户脚本源码、Cookie、登录态、完整请求体或可复用登录态信息。
- Schema 变化必须先写 migration，再同步 `DATABASE_SCHEMA.md` 和本目录 SQL。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
