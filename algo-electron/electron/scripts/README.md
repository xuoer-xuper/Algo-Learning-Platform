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
- `userScriptRuntimeBridge.ts`：生成按 generation 绑定的预编译 catalog preload，校验 OJ frame sender，管理每次导航的 MessagePort 代际，并从真实 frame load 事件驱动 idle 阶段与 SPA 重匹配。
- `userscriptBootstrapPreload.ts`：固定 session preload；sandbox 中不执行用户源码编译，只通过随机 nonce 的短暂 contextBridge 闭包接入主世界运行器，再向主进程转移私有端口。
- `userScriptMainWorldRuntime.ts`：生成主世界可执行函数；每个脚本独立 IIFE，GM API 仅作为按 grant 裁剪的局部参数，并按 revision 处理 start/end/idle 与 SPA 动态同步。
- `userScriptConnectPolicy.ts`：规范化网络目标并按 DNS label 校验 `@connect`，拒绝 userinfo、非 HTTPS 和欺骗性后缀。
- `UserScriptNetworkProxy.ts`：经 `Session.fetch` 执行受限网络请求，逐跳授权并限制重定向、超时、请求/响应大小和并发。
- `UserScriptHostPermissionBroker.ts`：按窗口串行展示 host 授权，合并同源请求并处理回放、超时、generation/窗口取消。
- `UserScriptMenuRegistry.ts`：按活动端口和 webContents 隔离脚本菜单命令，供页面原生右键菜单读取。
- `UserScriptResourceCache.ts`：安装确认后下载 `@require/@resource`，执行 URL/重定向/大小边界与 sha256/md5 SRI 校验，生成可原子写入的 BLOB 缓存记录。

`UserScriptService.ts`：

- `site_ids_json` 非空时作为正向匹配的权威范围；只有空绑定才走 `@match/@include`，不会在未绑定站点回退执行。
- `@exclude` 与 `@exclude-match` 始终优先于站点绑定和正向 metadata；坏 JSON、未知/禁用站点和非法 URL 均 fail closed。
- 匹配成功后按 `file_path` 读取脚本文件，并返回保留 URL fragment 完整性声明的 `@require`、`@resource` metadata。
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
- `GM_xmlhttpRequest`/`GM.xmlHttpRequest` 只经主进程代理；初始 URL 和每次重定向都同时要求 `@connect` 命中与当前脚本的精确 host 授权。
- 网络代理过滤浏览器所有请求头、不返回 `Set-Cookie`，并对请求体、响应体、超时、重定向和并发设置硬上限；跨 origin 跳转额外移除 Authorization。
- `GM_setClipboard`/`GM.setClipboard` 只提供写入；注册菜单命令进入页面原生右键菜单；SPA 地址变化以受限事件触发 `window.onurlchange`。
- `document-start` 在固定 frame preload 中立即调度并早于页面内联脚本，`document-end` 等待页面世界 `DOMContentLoaded`，`document-idle` 由主进程 `did-finish-load`/`did-frame-finish-load` 回传；Electron 43 中普通 webPreferences preload 仍先于 userscript preload，普通 iframe 不触发 session frame preload，均按 best-effort 记录；后台标签不依赖壳层激活状态。
- `did-navigate-in-page` 会在原 frame 内重算快照；新匹配脚本仅执行一次，失配脚本立即被收回网络、菜单和后续特权消息能力。
- 每个快照包含代码/权限合同 revision，并受 runtime generation 双重约束；刷新、更新、禁用或删除后，旧端口先收到 invalidate，再关闭并取消未完成操作。
- 导入先下载全部外部依赖，仅允许 HTTPS（开发/smoke loopback 例外）、不携带凭据、逐跳校验重定向，并限制声明数、单项和总大小；fragment 中最后一个受支持的 sha256/md5 hash 必须验证通过。
- 脚本记录与 `user_script_resources` 全量替换使用同一 SQLite transaction；运行时复验 kind/key/顺序/声明 URL/integrity/fetched_at，缓存缺失或漂移时整段脚本 fail closed。
- `@require` 按声明顺序在同一 IIFE 源码中先于用户代码执行；`GM_getResourceText`/`GM_getResourceURL` 与 modern alias 只按 grant 暴露，读取本地缓存，不发页面网络请求。

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
- `resolveUserScriptRequestTarget(rawUrl, allowInsecureLocalhost?)`：解析并规范化可代理的安全网络目标。
- `UserScriptNetworkProxy.start(...)`：启动受 `@connect`、host 授权和资源上限约束的请求。
- `UserScriptHostPermissionBroker.request(...)`：把首次 host 请求路由到所属窗口的 NoticeBar 授权队列。
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
- GM values、host 授权与 BLOB 资源缓存已接入私有运行时；更新状态与远程更新调度留给 B6.6。
- B6.2 已删除旧的页面 `window.GM_*`/localStorage/fetch polyfill；值桥、局部 grant API 和隔离通信统一走主进程缓存与专用 preload。
- `code` 字段保存导入内容供主进程运行时回退，`file_path` 指向内容寻址的受管副本；两者均不进入 shell 摘要 DTO。
- 新 canonical 无 `@namespace` 时保存空字符串；`NULL` 只保留给首次重新导入前的 legacy canonical。
- 更新成功后仅清理 `userscripts` 直属目录中已失去引用的受管旧文件；永远不删除用户选择的源文件。

## 6. 边界规则

- 用户脚本是用户扩展能力，不应承载内置站点 adapter 逻辑。
- 不要把用户脚本代码写入普通日志。
- `@require/@resource` 不在页面现场下载；只能消费安装时完成 URL、大小与 SRI 校验后写入主进程数据库的缓存。
- 修改 IPC 名称需要同步 preload、renderer helper、`electron/ipc/README.md` 和 IPC contract 测试。
- `UserScriptService` 不应重新注册 IPC；管理型 IPC 必须放在 `electron/ipc/registerScriptsIpc.ts`。
- 运行器只在 OJ WebContents 内执行脚本，不向 shell renderer 或普通日志传递脚本源码；`scripts:getAll` 仅返回摘要 DTO。
- 不得恢复用 `window.postMessage` 转交 userscript DOM `MessagePort`；站点世界只能使用主世界运行器的短暂闭包通道，不应能捕获、复用或伪造私有端口。
- 修改 Electron 版本、session preload 注册或 frame load 调度时，必须运行 `npm run test:electron`；真实顺序 smoke 失败时只能标记 `document-start` best-effort，不得继续声称精确兼容。
- `@connect` 声明不等于授权；代理必须同时验证声明、精确 host permission、当前 generation、webContents 与窗口 owner，初始 URL 和每一跳重定向都不能复用上一跳结论。
- host 授权提示只能经既有 NoticeBar 暴露安全展示字段；不得把 URL path/query、header、请求体、脚本源码或任意回调透传给 shell renderer。
- 修改资源解析、下载或运行时 API 时，必须保持“下载校验先于持久化、DB 同事务替换、运行时缓存不一致 fail closed”，并运行资源缓存、IPC、runtime 与真实 Electron smoke。

## 7. 测试入口

修改后至少运行：

```powershell
cd algo-electron
npm run typecheck
npm exec vitest -- run tests/scripts tests/browser/ojSession.test.ts tests/browser/contextMenu.test.ts tests/ipc/registerBrowserShellIpc.test.ts
npm run test:electron
```

涉及 repository 时追加运行 DB 临时库测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

涉及导入或匹配规则时需要手测脚本导入、启用、禁用和目标站点匹配。
