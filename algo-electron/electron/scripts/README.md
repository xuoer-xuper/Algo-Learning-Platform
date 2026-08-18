# Scripts 模块说明

## 1. 职责

`electron/scripts/` 管理用户脚本 metadata、站点匹配和页面注入。它提供类似 userscript 的本地扩展能力，用于在 OJ 页面注入用户自定义脚本。

本模块不负责内置提交监测 hook。提交监测 hook 属于 `electron/adapters/` 和 `electron/submissions/`。用户脚本管理 IPC 注册在 `electron/ipc/registerScriptsIpc.ts`。

## 2. 当前实现程度

当前包含：

- `UserScriptService.ts`：启用脚本读取、metadata 解析和 URL 匹配。
- `userScriptMetadata.ts`：解析 userscript metadata，并把 `@match` / `@include` 规则转为正则。
- `userScriptImport.ts`：提供身份、版本、文件名、另存副本和原子落盘的纯导入逻辑。
- `userScriptInjector.ts`：把匹配到的脚本注入到 OJ `WebContentsView`，并提供基础 GM_* polyfill。

`UserScriptService.ts`：

- 支持按站点配置或 `@match` / `@include` 匹配当前 URL。
- 匹配成功后按 `file_path` 读取脚本文件，并返回脚本及 `@require`、`@resource` metadata。
- 不注册 IPC，不打开文件对话框，不直接处理导入/删除。

`userScriptMetadata.ts`：

- `parseScriptMetadata(code)` 解析 `// ==UserScript==` 头部。
- 解析 `@namespace`，并与 `@name` 组成大小写敏感、精确匹配的脚本身份。
- `matchRuleToRegExp(rule)` 支持 Tampermonkey `*://*.domain/*` 规则，包含裸域名和子域名。

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
- `matchRuleToRegExp(rule)`：把 `@match`/`@include` 规则转为正则。
- `decideUserScriptImport(input)`：生成可注入 repository 的导入决策。
- `writeUserScriptImport(decision, options)`：落盘后执行注入的持久化回调，并处理失败清理。
- `installUserScriptInjection(options)`：注册页面加载后的脚本注入流程，通过 `getUserScriptService` 延迟读取服务实例。

## 5. 存储规则

- 导入脚本复制到 `app.getPath('userData')/userscripts`。
- DB 保存脚本元信息和 `file_path`。
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
npm exec vitest -- run tests/scripts/userScriptMetadata.test.ts tests/scripts/userScriptImport.test.ts tests/ipc/registerScriptsIpc.test.ts
```

涉及 repository 时追加运行 DB 临时库测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

涉及导入或匹配规则时需要手测脚本导入、启用、禁用和目标站点匹配。
