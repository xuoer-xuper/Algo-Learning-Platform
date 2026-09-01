# IPC Registration

## 1. 职责

`electron/ipc/` 存放主进程 IPC handler 注册模块。它把 `main.ts` 中按业务域增长的 `ipcMain.handle/on` 分离出来，保持 channel 名称和 preload 契约稳定。

本目录只做 IPC 参数接线和调用已有 service/repository，不创建 BrowserWindow、不管理 Cookie、不直接执行浏览器脚本，也不修改数据库 schema。

## 2. 当前实现程度

- `registerAiIpc.ts`：注册 `ai:*` 上下文导出、规则建议、阶段总结、复习计划和 AI 输出持久化 handler。
- `registerBackupIpc.ts`：注册 `backup:*` 数据库备份、学习数据导出导入和导入确认 handler。
- `registerConfigIpc.ts`：注册 `config:*` 应用轻量配置读取和保存 handler。
- `registerNotesIpc.ts`：注册 `notes:*` 笔记 CRUD、图片保存、批量删除和打开目录 handler。
- `registerProblemIpc.ts`：注册 `problem:*` 最近题目、题目详情和题目删除 handler。
- `registerRatingIpc.ts`：注册 `rating:*` 账号绑定、Codeforces rating 同步、rating 历史和比赛结果查询 handler。
- `registerScriptsIpc.ts`：注册 `scripts:*` 用户脚本摘要列表、本地导入、远程安装预览/确认/取消、手动检查更新、保存、启停、删除、只读源码查看、系统编辑器打开和打开目录 handler；列表和远程预览不返回源码、资源正文或绝对路径，源码只经显式受控只读请求返回。
- `registerSitesIpc.ts`：注册 `sites:*` 站点 CRUD、导入导出、冲突预览确认 handler。
- `registerStatsIpc.ts`：注册 `stats:*` 统计查询和重算 handler。
- `registerSubmissionsIpc.ts`：注册 `submissions:*` 手动同步 handler。
- `registerBrowserShellIpc.ts`：注册 `browser:*`、`tab:*`、`window:*` 与用户脚本 host 授权 handler，包括受校验的内部页/标签/故障恢复/查找/缩放/下载/脚本安装/原生菜单入口，以及 `userscript:getHostPermissionPrompt`、`userscript:respondHostPermission`。
- `registerCoachIpc.ts`：注册 Coach 桌宠、比赛模式、会话、干预和指标相关 handler。
- `registerCookieIpc.ts`：注册 `cookies:*` 安全摘要 handler，不向 renderer 暴露 Cookie value。
- `registerCredentialsIpc.ts`：注册凭据脱敏列表、重命名、删除、按壳窗口路由的多账户自动填充 prompt/respond，以及登录捕获 prompt/respond/result handler；不向 renderer 暴露密码或 envelope。
- `registerMainIpc.ts`：组合注册入口，集中由 `main.ts` 调用各业务域注册函数。
- `trustedSender.ts`：统一完整浏览器壳、Coach 壳与 OJ sender 的 main frame、origin、webContents 能力归属和 payload 边界；完整壳登记时同时绑定 `AppWindow` owner，窗口敏感 handler 使用 `getShellWindowOwner(event)` 定向路由。普通 handler 使用仅完整壳可调用的 guarded `ipcMain` facade，桌宠必需的最小 Coach handler 使用 `coachPetIpcMain`，提交与登录捕获 bridge 使用 `onFromOj()`。
- `ui:command`：主进程向壳 renderer 发送的受限对象指令，目前包含聚焦地址栏、聚焦查找条、导航被安全策略阻止和标签满额提示；查找结果、缩放状态和下载结果使用独立固定事件。
- `userscript:hostPermissionRequested`：只向请求所属完整壳发送 `promptId/scriptName/targetHost/sourceHost`，renderer 通过既有 NoticeBar 回应；handler 从 sender owner 解析 windowId，不接受 renderer 指定窗口。

其他 IPC 仍在 `electron/main.ts`，后续可按风险逐步迁移：

- realtime submission IPC 当前由 `RealtimeSubmissionService.registerIpc()` 自己管理，不应重复注册。

## 3. 核心封装

- `registerAiIpc()`：注册 AI 相关 channel，包括上下文导出、复习建议、薄弱标签、阶段总结、复习计划、AI 输出保存和输出 CRUD。
- `registerBackupIpc(options)`：注册备份导入导出 channel；默认从 sender owner 解析文件对话框父窗口，待确认导入按 `windowId` 隔离并在 shell 销毁时清理。
- `registerConfigIpc()`：只公开净化后的 `config:getHomeShortcuts`；旧默认首页读写 channel 已退役。
- `registerNotesIpc(options)`：注册笔记相关 channel；通过 `notifyProblemsUpdated` 注入题目更新通知，避免模块直接依赖 `BrowserWindow`。
- `registerProblemIpc(options)`：注册题目相关 channel；通过 `notifyProblemsUpdated` 注入删除题目后的刷新通知。
- `registerRatingIpc()`：注册 rating 相关 channel，包括账号绑定、账号查询、Codeforces rating 同步、历史查询和比赛结果查询。
- `registerScriptsIpc(options)`：注册用户脚本管理 channel，包括脚本列表、受控保存、身份更新导入、远程 installId 预览/确认/取消、手动更新检查、打开目录、启停和删除；确认前复验 identity/目标版本并按 installId 互斥，原生文件/确认对话框默认绑定 sender 所属窗口。
- `registerSitesIpc(options)`：注册站点配置相关 channel；文件对话框默认绑定 sender 所属窗口，数据变更后通过应用级 `notifyProblemsUpdated()` 广播全部完整壳。
- `registerStatsIpc()`：注册统计相关 channel，包括概览、趋势、平台分布、题目访问统计、时间线、复访、连续天数、错题、未复习和日统计重算。
- `registerSubmissionsIpc(options)`：注册手动提交同步 channel；通过 `getSyncService` 延迟读取 `SyncService`，避免模块 import 时绑定尚未初始化的服务实例。
- `registerBrowserShellIpc(options)`：注册浏览器壳层 channel；每次调用从 trusted sender owner 取得所属 `AppWindow/TabManager`，不接受全局窗口 getter。URL 输入只负责解析与导航，内部页 payload 先经过严格判别联合校验，标签排序只接受字符串 ID 与整数最终索引，题目追踪统一由 TabManager 导航链处理。
- `registerCookieIpc(cookieVault?)`：注册 Cookie 摘要查询 channel；完整 Cookie 仅保留在 main 内部，renderer 只拿名称、数量、过期时间和安全标记统计。
- `registerCredentialsIpc(credentialVault?, options?)`：注册 `credentials:list`、`credentials:rename`、`credentials:delete`、`credentials:autofillPrompt`、`credentials:autofillRespond`、`credentials:capturePrompt`、`credentials:captureRespond` 和 `credentials:captureResult`；只返回 Vault 脱敏摘要。自动填充明文仅由 `oj-credentials:fill` 主进程到 OJ 隔离 preload 的内部通道承载，登录捕获明文仅由 OJ 隔离 preload 经 `oj-credentials:capture` 进入主进程 pending map，shell prompt/respond/result 只传 captureId、站点/用户名、masked、isUpdate 和非敏感结果。
- `registerMainIpc(options)`：主入口调用的组合函数；只负责串联各注册模块，不直接实现具体 handler。
- `handleFromShell()` / `onFromShell()`：普通壳 IPC 的统一校验入口，拒绝未知 webContents、iframe、伪造 origin 和超限/循环 payload。
- `getShellWindowOwner(event)`：在 sender 校验通过后返回登记的 `AppWindow`；owner 缺失时窗口敏感操作 fail closed，不回退最近活跃窗口。
- `onFromOj()`：只允许已登记的 `persist:oj-main` WebContentsView 主 frame 发送提交或登录捕获 bridge 事件；不同内部 channel 仍各自执行严格 payload 判别。
- `handleFromOj()`：`onFromOj()` 的 invoke 版本，供隔离 OJ preload 在 document start 主动拉取主进程状态。主进程到 OJ 的 push 不可用于这类握手：`did-navigate` 时发出的 push 可能早于新文档 preload 注册监听而永久丢失。
- OJ 提交 bridge token：主进程按 webContents 惰性生成随机 token，`ojPreload` 通过 `oj-submission:getDocumentToken` 拉取；token 在该 webContents 生命周期内稳定，不随导航轮换（轮换会重新引入 preload 持旧 token 的窗口），销毁时清除。它只证明 envelope 来自当前活文档，不构成对页面内伪造 payload 的防护。

## 4. 边界规则

- 新增 IPC handler 时必须同步 `electron/preload.ts`、`electron/electron-env.d.ts`、相关 renderer helper 和本目录 README。
- 不改变已有 channel 名称，除非同步迁移 preload、renderer 和 IPC 合约测试。
- 注册函数应由 `main.ts` 在应用初始化阶段调用，避免模块 import 时产生隐式副作用。
- 具体 channel 逻辑应留在单域 `register*Ipc.ts`，不要把业务 handler 塞进 `registerMainIpc.ts`。
- handler 内不要记录 Cookie、用户源码、完整请求体或可复用登录态信息。
- `cookies:*` channel 不得返回 Cookie value；需要完整 Cookie 时只能由 main 进程内部 service 调用 `CookieVault`。
- `credentials:*` 普通壳 channel 不得返回密码、secret envelope 或 `getForAutofill` 结果；自动填充只允许 `persist:oj-main` 的受限 OJ preload 通道，且不得自动提交表单。
- `scripts:getCode` 只允许显式按脚本 ID 读取主进程数据库回退源码或受管目录内、4 MiB 以内的源码；主进程读取后返回带 `status` 的只读判别联合（`ok`/`not-found`/`unmanaged`/`unreadable`/`too-large`），不记录日志。`scripts:openEditor` 仅能打开同一受管目录内的 `.js` 文件并返回结构化 `status`，不回传 OS 本地化错误串。删除只回收应用生成的受管文件名，且必须确认没有其他脚本行仍引用同一文件（内容寻址文件名允许两行共享一个文件）。
- `credentials:autofillPrompt` 是唯一允许壳 renderer 接收的自动填充通知，payload 只含站点、URL 和脱敏凭据摘要；`credentials:autofillRespond` 必须按 owner/requestId 校验并拒绝不属于 prompt 的 credentialId。
- `credentials:capturePrompt`/`credentials:captureResult` 是允许壳 renderer 接收的登录捕获事件，但 payload 只能含一次性 captureId、站点/用户名、displayName、masked、isUpdate 和非敏感结果；`credentials:captureRespond` 必须按 owner、captureId 和受限 action（`save`/`update`/`cancel`）校验。
- `oj-credentials:capture` 是 OJ 专用内部 channel，只能由 `onFromOj()` 接收 `persist:oj-main` 主 frame 的 `{ username, password }`；不得加入 shell preload API 或普通 renderer channel 列表。主进程应在保存前清理 pending，取消、超时、导航、销毁和 `dispose` 均 fail closed，且任何错误不得回传密码或密文。
- `backup:*` channel 导出的 JSON 不得包含 Cookie、`raw_json`、日志或本机绝对路径；冲突导入必须先预览再确认。
- `register*.ts` 不得直接从 `electron` 导入 `ipcMain`；新增普通 channel 必须经过 `trustedSender.ts`，并同步 IPC 合约测试。
- **所有接收渲染进程参数的 channel 都必须声明 schema 元组**：`ipcMain.handle('a:b', [text(), bool], handler)`，组合子见 `payloadSchema.ts`。当前 13 个 `register*.ts` 共 103 处已全部声明，棘轮白名单为空——新增一个没 schema 的 handler 会直接让守卫失败，不需要先登记。三条防线各管一段，缺一段就有缺口：`checkShellSender` 管"谁能发"，`checkIpcPayload` 管结构上限与原型污染，schema 管"这个 channel 的参数长什么样"。少了第三段的后果不是注入而是静默错误——实测 `stats:getTrends` 传 `'abc'` 时 `localDateDaysAgo` 会算出 `'NaN-NaN-NaN'` 绑进 SQL，图表安静地变成空的，既不报错也不记日志。
  - 只写 TypeScript 形参标注（`(_event, id: string)`）不算校验：那是对渲染进程的假设，运行时没有任何一处兑现它。`tests/architecture/check-architecture.mjs` 的 `UNSCHEMAD_IPC_BUDGET` 棘轮盯着这件事，只减不增。
  - 界要有来处：沿用项目里已有的同类上限（URL 4096、FQDN 253、通用标识符 200），不另立标准，并把来处写在注释里。
  - schema 只管形状。跨字段判断、要 parse 才知道的内容（如 `site_ids_json` 必须是无重复的非空字符串数组）、需要查库的存在性检查，都留在 handler 或 service 里——`raw()` 的语义是"在别处校验了"，没有别处就不要用它。`raw()` 自己也上了棘轮（当前 4 处，全在浏览器壳层的判别联合参数上），因为它同时是前一条守卫的逃逸口。
  - 写路径与读路径要一起看。已发现两处"读脱敏、写不设防"的不对称并已堵上：`coach:saveConfig` 能往 `llm.encrypted_api_key` 里写（读路径 `getCoachConfigForRenderer` 是会摘掉这个字段的），`coach:saveLlmConfig` 同理。做法是让 `object()` 的形状只列渲染进程真会发的字段——多余字段默认拒绝，那条路就没了。
    因此这个形状是**白名单**：`CoachPanel` 新加一项设置就要同步加一项，反之不加就发不出去。当前 6 项（`enabled`/`sound`/`bubbleFrequency`/`scale`/`opacity`/`pinMode`）。`pinMode` 是 B5.5 的桌宠置顶模式，取值收在 `petPinPolicy.ts` 的 `COACH_PIN_MODES`；`position` 刻意不在形状里，它由主进程拖拽结束时自己写。
  - 形状不对一律拒绝，不要返回 `null`/`false` 兜底：那会和"服务说不"（没有待处理请求、owner 已销毁）在调用方眼里变成同一件事。改判前先确认渲染进程调用点有 `catch`。
- 窗口、标签、菜单和原生对话框操作必须按 sender owner 路由；禁止注入模块级 `getWindow/getTabManager` 单槽。
- `ui:command` 只允许受控的判别联合对象，不得把任意脚本、channel、URL 内容或窗口对象透传给 renderer；导航失败只发送枚举原因。
- 用户脚本 host 授权 IPC 不得携带 URL path/query、header、请求体、脚本源码或 webContentsId；回执只接受受限 promptId 和 boolean，并由 broker 再验证 generation 与 owner。
- OJ、登录捕获和用户脚本 bootstrap 不得复用 shell sender validator；专用 validator 必须按 webContents 归属和主 frame 校验。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx vitest run tests/ipc
```

涉及启动时机或 handler 注册顺序时追加运行：

```powershell
npx --yes tsx tests\electron\startupSmoke.test.ts
```

信任边界和畸形 payload：

```powershell
npx vitest run tests/security/trustedSender.test.ts
```
