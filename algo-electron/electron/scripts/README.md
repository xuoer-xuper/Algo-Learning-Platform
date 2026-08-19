# Scripts 模块说明

## 1. 职责

`electron/scripts/` 管理用户脚本 metadata、站点匹配和页面注入。它提供类似 userscript 的本地扩展能力，用于在 OJ 页面注入用户自定义脚本。

本模块不负责内置提交监测 hook。提交监测 hook 属于 `electron/adapters/` 和 `electron/submissions/`。用户脚本管理 IPC 注册在 `electron/ipc/registerScriptsIpc.ts`。

## 2. 当前实现程度

当前包含：

- `UserScriptService.ts`：启用脚本读取、持久化规则解析、站点绑定和 URL 匹配。
- `userScriptMetadata.ts`：解析 B6.1 userscript metadata，并分别编译严格 `@match` 与 `@include/@exclude`。
- `userScriptImport.ts`：提供身份、版本、文件名、另存副本和原子落盘的纯导入逻辑。
- `userScriptInjector.ts`：把匹配到的脚本注入到 OJ `WebContentsView`，并提供基础 GM_* polyfill。

`UserScriptService.ts`：

- `site_ids_json` 非空时作为正向匹配的权威范围；只有空绑定才走 `@match/@include`，不会在未绑定站点回退执行。
- `@exclude` 与 `@exclude-match` 始终优先于站点绑定和正向 metadata；坏 JSON、未知/禁用站点和非法 URL 均 fail closed。
- 匹配成功后按 `file_path` 读取脚本文件，并返回脚本及 `@require`、`@resource` metadata。
- 不注册 IPC，不打开文件对话框，不直接处理导入/删除。

`userScriptMetadata.ts`：

- `parseScriptMetadata(code)` 解析 `// ==UserScript==` 头部。
- 解析 `@namespace/@grant/@exclude(-match)/@connect/@noframes/@updateURL/@downloadURL/@antifeature/@icon` 等 B6.1 字段。
- `matchRuleToRegExp(rule)` 严格拆分 scheme/host/path 并锚定 host；scheme/host 大小写不敏感、path 大小写敏感，目标 query/hash 不参与匹配，非法规则返回 never-match。
- `includeRuleToRegExp(rule)` 支持 URL glob 和 `/source/flags` 正则，保留显式 regex flags；两类规则不再混存。

`userScriptImport.ts`：

- `decideUserScriptImport(input)` 按精确 `(namespace, identity_name)` 身份返回 create/update 决策，不读取可编辑展示名，也不直接访问 repository。
- `compareUserScriptVersions(incoming, installed)` 返回 `newer` / `same` / `older` / `unknown`，支持数字段与 prerelease。
- 导入文件名采用 `可读-slug--身份哈希--内容哈希.user.js`，slug 避开 Windows 非法字符、保留名和尾随点/空格。
- `mode: 'copy'` 生成 `local:<uuid>` namespace 并改写 metadata 头，确保副本不覆盖来源脚本，同时在决策中返回 `autoUpdateEnabled: false` 供 repository 持久化。
- `writeUserScriptImport(decision, options)` 以临时文件落盘，并通过注入的 `persist` 回调接 IPC/repository；持久化失败会清理本次临时文件和新建目标文件。

`userScriptInjector.ts`：

- 绑定 `TabManager.setPageLoadedCallback()`。
- 页面加载后读取当前 URL 匹配脚本。
- 注入 `GM_addStyle`、`GM_getValue`、`GM_setValue`、`GM_xmlhttpRequest`、`GM_getResourceText` 等基础兼容 API。
- 预取 `@resource`，按顺序加载 `@require`，最后执行用户脚本。
- 只记录脚本名、依赖数量和代码长度，不输出用户脚本源码。

## 3. IPC 能力

`registerScriptsIpc.ts` 注册：

- `scripts:getAll`
- `scripts:save`
- `scripts:importFile`
- `scripts:openFolder`
- `scripts:toggle`
- `scripts:delete`

这些 IPC 依赖 `userScriptRepository` 和 Electron `dialog/shell`。
用户脚本 repository 的内部说明见 `electron/db/repositories/userScript/README.md`。

导入确认使用原生父窗口对话框，不新增 renderer 浮层：升级/同版本默认覆盖，降级/未知版本默认取消，所有分支都可另存为关闭自动更新的本地副本。`scripts:save` 只允许修改显示名和站点绑定，不能从 renderer 改写身份、版本、文件路径或源码。

## 4. 核心函数

- `getMatchingScripts(url)`：返回当前 URL 匹配的启用脚本。
- `getMatchingScriptsWithMeta(url)`：返回脚本及其 `@require`、`@resource` 元信息。
- `parseScriptMetadata(code)`：解析 userscript 头部元数据。
- `matchRuleToRegExp(rule)`：把严格 `@match` 规则转为 fail-closed 正则。
- `includeRuleToRegExp(rule)`：把 `@include/@exclude` glob 或 regex 转为正则。
- `matchesUserScriptUrl(url, metadata)`：按 exclude 优先级计算 metadata 匹配。
- `decideUserScriptImport(input)`：生成可注入 repository 的导入决策。
- `writeUserScriptImport(decision, options)`：落盘后执行注入的持久化回调，并处理失败清理。
- `installUserScriptInjection(options)`：注册页面加载后的脚本注入流程，通过 `getUserScriptService` 延迟读取服务实例。

## 5. 存储规则

- 导入脚本复制到 `app.getPath('userData')/userscripts`。
- DB 保存脚本元信息和 `file_path`。
- migration 027 将 match/include/exclude(-match)、grant/connect、noframes、run-at、更新地址、antifeature 和 icon 分列保存；导入 create/update/legacy claim/local copy 共用同一持久化映射。
- GM values、BLOB 资源缓存、host 授权和更新状态已有主进程 repository 地基，但在 B6.2/B6.3/B6.5/B6.6 前不向页面开放。
- B6.1 不改现有注入器的 legacy GM polyfill；值桥、局部 grant API 和隔离通信从 B6.2 开始切换，不能把本次 schema 完成误记为运行时安全收口。
- `code` 字段继续保存导入内容供旧路径兼容，`file_path` 指向内容寻址的受管副本。
- 新 canonical 无 `@namespace` 时保存空字符串；`NULL` 只保留给首次重新导入前的 legacy canonical。
- 更新成功后仅清理 `userscripts` 直属目录中已失去引用的受管旧文件；永远不删除用户选择的源文件。

## 6. 边界规则

- 用户脚本是用户扩展能力，不应承载内置站点 adapter 逻辑。
- 不要把用户脚本代码写入普通日志。
- `@require` 和 `@resource` 仅解析元数据，实际加载策略变更需另行设计安全边界。
- 修改 IPC 名称需要同步 preload、renderer helper、`electron/ipc/README.md` 和 IPC contract 测试。
- `UserScriptService` 不应重新注册 IPC；管理型 IPC 必须放在 `electron/ipc/registerScriptsIpc.ts`。
- 注入器只在 OJ WebContents 内执行脚本，不向 renderer、日志或数据库传递脚本源码。
- `GM_xmlhttpRequest` 仍走页面 fetch 能力；跨域能力由 OJ session 的受控 CORS 处理决定。

## 7. 测试入口

修改后至少运行：

```powershell
cd algo-electron
npm run typecheck
npm exec vitest -- run tests/scripts/userScriptMetadata.test.ts tests/scripts/userScriptService.test.ts tests/scripts/userScriptImport.test.ts tests/ipc/registerScriptsIpc.test.ts
```

涉及 repository 时追加运行 DB 临时库测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

涉及导入或匹配规则时需要手测脚本导入、启用、禁用和目标站点匹配。
