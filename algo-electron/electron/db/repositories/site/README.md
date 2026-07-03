# Site Repository

## 1. 职责

`electron/db/repositories/site/` 是 `siteRepository.ts` 的内部实现目录，负责 SQLite 中 `site_configs` 的 CRUD、内置站点 seed、配置导入导出和导入预览。

本目录不解析题目 URL、不实现提交监测、不注册 IPC、不读取 Cookie。运行时站点识别和提交逻辑仍属于 `electron/sites/`、`electron/parsers/` 和 `electron/adapters/`。

## 2. 当前实现程度

- `types.ts`：`SiteConfigData`、导入导出类型、SQLite row 映射和导入 payload 清理。
- `crud.ts`：站点列表、启用站点、按 id 查询、创建、更新、启停、删除非内置站点。
- `builtins.ts`：应用启动时写入默认内置站点，使用 `INSERT OR IGNORE` 保留用户已有配置。
- `importExport.ts`：站点配置导出、导入预览、确认导入和冲突覆盖。
- `../siteRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- CRUD：`getAllSites`、`getEnabledSites`、`getSiteById`、`createSite`、`updateSite`、`toggleSite`、`deleteSite`。
- Seed：`seedBuiltinSites`。
- Import/export：`exportSitesConfig`、`previewImportSites`、`confirmImportSites`。
- Helper：`rowToSite`、`parseImportedSite`。

## 4. 边界规则

- 内置站点 seed 只插入不存在的记录，不能覆盖用户启停状态。
- 删除只允许非内置站点。
- 导入预览必须跳过内置站点覆盖，并把自定义站点冲突交给用户确认。
- `siteRepository.ts` 是 DB 边界；新增平台时仍需同步 `electron/sites/builtins/`、adapter、parser、renderer 展示映射和测试。
- 不在导入导出数据中写 Cookie、源码、请求体或可复用登录态。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
