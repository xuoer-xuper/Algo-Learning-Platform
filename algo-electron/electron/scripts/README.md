# Scripts 模块说明

## 1. 职责

`electron/scripts/` 管理用户脚本 metadata、站点匹配、主进程运行时缓存和 OJ 页面注入。它提供类似 userscript 的本地扩展能力，用于在 OJ 页面注入用户自定义脚本。

本模块不负责内置提交监测 hook。提交监测 hook 属于 `electron/adapters/` 和 `electron/submissions/`。用户脚本管理 IPC 注册在 `electron/ipc/registerScriptsIpc.ts`。

## 2. 当前实现程度

当前包含：

- `UserScriptService.ts`：启用脚本读取、持久化规则解析、站点绑定和 URL 匹配。
- `userScriptMetadata.ts`：解析 B6.1 userscript metadata，并分别编译严格 `@match` 与 `@include/@exclude`。
- `userScriptImport.ts`：提供身份、版本、文件名、另存副本和原子落盘的纯导入逻辑。
- `UserScriptRuntime.ts`：启动时水合启用脚本和值快照，按 frame URL 在主进程内存中匹配并处理值持久化。
- `userScriptRuntimeBridge.ts`：注册专用 frame preload、校验 OJ frame sender，并管理每次导航的 MessagePort 代际。
- `userscriptBootstrapPreload.ts`：固定 session preload；只接收主进程快照，在隔离 preload 与主世界之间完成一次性端口转移。
- `userScriptMainWorldRuntime.ts`：生成主世界可执行函数；每个脚本独立 IIFE，GM API 仅作为按 grant 裁剪的局部参数。

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

`UserScriptRuntime.ts`：

- `UserScriptService.refresh()` 后只在主进程缓存脚本代码、规则、站点快照和 grant；导航热路径不直接查询 SQLite。
- 每次 frame 导航生成 nonce/generation，快照只经 OJ 专用同步 IPC 进入固定 preload，不进入 shell renderer。
- `GM_getValue`/`GM_setValue`/`GM_deleteValue`/`GM_listValues` 与 `GM_info`、`GM_addStyle`、`unsafeWindow` 严格按 `@grant` 作为词法参数提供；未授权名称为 `undefined`，`@grant none` 不获得特权 API。
- values 写入只经私有 MessagePort 返回主进程，并按脚本 ID 隔离；新导航或缓存刷新后旧 generation 的端口 fail closed。

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
- `getMatchingScriptsWithMeta(url)`：返回主进程缓存中的脚本及其 `@require`、`@resource` 元信息。
- `buildUserScriptMainWorldRuntime(input)`：生成隔离的 IIFE 执行函数和按 grant 裁剪的 GM 局部参数。
- `installUserScriptRuntimeBridge(options)`：注册固定 frame preload、同步快照入口和每导航私有 MessagePort。
- `parseScriptMetadata(code)`：解析 userscript 头部元数据。
- `matchRuleToRegExp(rule)`：把严格 `@match` 规则转为 fail-closed 正则。
- `includeRuleToRegExp(rule)`：把 `@include/@exclude` glob 或 regex 转为正则。
- `matchesUserScriptUrl(url, metadata)`：按 exclude 优先级计算 metadata 匹配。
- `decideUserScriptImport(input)`：生成可注入 repository 的导入决策。
- `writeUserScriptImport(decision, options)`：落盘后执行注入的持久化回调，并处理失败清理。

## 5. 存储规则

- 导入脚本复制到 `app.getPath('userData')/userscripts`。
- DB 保存脚本元信息和 `file_path`。
- migration 027 将 match/include/exclude(-match)、grant/connect、noframes、run-at、更新地址、antifeature 和 icon 分列保存；导入 create/update/legacy claim/local copy 共用同一持久化映射。
- GM values、BLOB 资源缓存、host 授权和更新状态已有主进程 repository 地基，但在 B6.2/B6.3/B6.5/B6.6 前不向页面开放。
- B6.2 已删除旧的页面 `window.GM_*`/localStorage/fetch polyfill；值桥、局部 grant API 和隔离通信统一走主进程缓存与专用 preload。
- `code` 字段保存导入内容供主进程运行时回退，`file_path` 指向内容寻址的受管副本；两者均不进入 shell 摘要 DTO。
- 新 canonical 无 `@namespace` 时保存空字符串；`NULL` 只保留给首次重新导入前的 legacy canonical。
- 更新成功后仅清理 `userscripts` 直属目录中已失去引用的受管旧文件；永远不删除用户选择的源文件。

## 6. 边界规则

- 用户脚本是用户扩展能力，不应承载内置站点 adapter 逻辑。
- 不要把用户脚本代码写入普通日志。
- `@require` 和 `@resource` 仅解析元数据，实际加载策略变更需另行设计安全边界。
- 修改 IPC 名称需要同步 preload、renderer helper、`electron/ipc/README.md` 和 IPC contract 测试。
- `UserScriptService` 不应重新注册 IPC；管理型 IPC 必须放在 `electron/ipc/registerScriptsIpc.ts`。
- 运行器只在 OJ WebContents 内执行脚本，不向 shell renderer 或普通日志传递脚本源码；`scripts:getAll` 仅返回摘要 DTO。
- `GM_xmlhttpRequest`、剪贴板、菜单和 URL 变更监听留给 B6.3；`@require/@resource` 留给 B6.5 的缓存/SRI 链路。

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
