# Scripts 模块说明

## 1. 职责

`electron/scripts/` 管理用户脚本 metadata、站点匹配和页面注入。它提供类似 userscript 的本地扩展能力，用于在 OJ 页面注入用户自定义脚本。

本模块不负责内置提交监测 hook。提交监测 hook 属于 `electron/adapters/` 和 `electron/submissions/`。用户脚本管理 IPC 注册在 `electron/ipc/registerScriptsIpc.ts`。

## 2. 当前实现程度

当前包含：

- `UserScriptService.ts`：启用脚本读取、metadata 解析和 URL 匹配。
- `userScriptMetadata.ts`：解析 userscript metadata，并把 `@match` / `@include` 规则转为正则。
- `userScriptInjector.ts`：把匹配到的脚本注入到 OJ `WebContentsView`，并提供基础 GM_* polyfill。

`UserScriptService.ts`：

- 支持按站点配置或 `@match` / `@include` 匹配当前 URL。
- 匹配成功后按 `file_path` 读取脚本文件，并返回脚本及 `@require`、`@resource` metadata。
- 不注册 IPC，不打开文件对话框，不直接处理导入/删除。

`userScriptMetadata.ts`：

- `parseScriptMetadata(code)` 解析 `// ==UserScript==` 头部。
- `matchRuleToRegExp(rule)` 支持 Tampermonkey `*://*.domain/*` 规则，包含裸域名和子域名。

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

## 4. 核心函数

- `getMatchingScripts(url)`：返回当前 URL 匹配的启用脚本。
- `getMatchingScriptsWithMeta(url)`：返回脚本及其 `@require`、`@resource` 元信息。
- `parseScriptMetadata(code)`：解析 userscript 头部元数据。
- `matchRuleToRegExp(rule)`：把 `@match`/`@include` 规则转为正则。
- `installUserScriptInjection(options)`：注册页面加载后的脚本注入流程，通过 `getUserScriptService` 延迟读取服务实例。

## 5. 存储规则

- 导入脚本复制到 `app.getPath('userData')/userscripts`。
- DB 保存脚本元信息和 `file_path`。
- `code` 字段保留兼容，但导入路径默认不再存完整代码。

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
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\scripts\userScriptMetadata.test.ts
```

涉及 repository 时追加运行 DB 临时库测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

涉及导入或匹配规则时需要手测脚本导入、启用、禁用和目标站点匹配。
