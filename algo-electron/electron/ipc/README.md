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
- `registerScriptsIpc.ts`：注册 `scripts:*` 用户脚本列表、导入、保存、启停、删除和打开目录 handler。
- `registerSitesIpc.ts`：注册 `sites:*` 站点 CRUD、导入导出、冲突预览确认 handler。
- `registerStatsIpc.ts`：注册 `stats:*` 统计查询和重算 handler。
- `registerSubmissionsIpc.ts`：注册 `submissions:*` 手动同步 handler。
- `registerBrowserShellIpc.ts`：注册 `browser:*`、`tab:*` 和 `window:*` 浏览器壳层 handler，包括受校验的 `tab:openInternal`、`tab:reorder`、`tab:reopenClosed`、按 tabId 的 `tab:reload` 与 `tab:dismissUnresponsive` 故障恢复入口，`browser:findInPage`、`browser:setZoom`、受控下载通知可见性、短时脚本安装请求读/取消，以及原生页面/标签/壳内右键菜单入口。
- `registerCoachIpc.ts`：注册 Coach 桌宠、比赛模式、会话、干预和指标相关 handler。
- `registerCookieIpc.ts`：注册 `cookies:*` 安全摘要 handler，不向 renderer 暴露 Cookie value。
- `registerMainIpc.ts`：组合注册入口，集中由 `main.ts` 调用各业务域注册函数。
- `trustedSender.ts`：统一完整浏览器壳、Coach 壳与 OJ sender 的 main frame、origin、webContents 能力归属和 payload 边界；完整壳登记时同时绑定 `AppWindow` owner，窗口敏感 handler 使用 `getShellWindowOwner(event)` 定向路由。普通 handler 使用仅完整壳可调用的 guarded `ipcMain` facade，桌宠必需的最小 Coach handler 使用 `coachPetIpcMain`，提交 bridge 使用 `onFromOj()`。
- `ui:command`：主进程向壳 renderer 发送的受限对象指令，目前包含聚焦地址栏、聚焦查找条、导航被安全策略阻止和标签满额提示；查找结果、缩放状态和下载结果使用独立固定事件。

其他 IPC 仍在 `electron/main.ts`，后续可按风险逐步迁移：

- realtime submission IPC 当前由 `RealtimeSubmissionService.registerIpc()` 自己管理，不应重复注册。

## 3. 核心封装

- `registerAiIpc()`：注册 AI 相关 channel，包括上下文导出、复习建议、薄弱标签、阶段总结、复习计划、AI 输出保存和输出 CRUD。
- `registerBackupIpc(options)`：注册备份导入导出 channel；默认从 sender owner 解析文件对话框父窗口，待确认导入按 `windowId` 隔离并在 shell 销毁时清理。
- `registerConfigIpc()`：只公开净化后的 `config:getHomeShortcuts`；旧默认首页读写 channel 已退役。
- `registerNotesIpc(options)`：注册笔记相关 channel；通过 `notifyProblemsUpdated` 注入题目更新通知，避免模块直接依赖 `BrowserWindow`。
- `registerProblemIpc(options)`：注册题目相关 channel；通过 `notifyProblemsUpdated` 注入删除题目后的刷新通知。
- `registerRatingIpc()`：注册 rating 相关 channel，包括账号绑定、账号查询、Codeforces rating 同步、历史查询和比赛结果查询。
- `registerScriptsIpc(options)`：注册用户脚本管理 channel，包括脚本列表、受控保存、身份更新导入、打开目录、启停和删除；原生文件/确认对话框默认绑定 sender 所属窗口。
- `registerSitesIpc(options)`：注册站点配置相关 channel；文件对话框默认绑定 sender 所属窗口，数据变更后通过应用级 `notifyProblemsUpdated()` 广播全部完整壳。
- `registerStatsIpc()`：注册统计相关 channel，包括概览、趋势、平台分布、题目访问统计、时间线、复访、连续天数、错题、未复习和日统计重算。
- `registerSubmissionsIpc(options)`：注册手动提交同步 channel；通过 `getSyncService` 延迟读取 `SyncService`，避免模块 import 时绑定尚未初始化的服务实例。
- `registerBrowserShellIpc(options)`：注册浏览器壳层 channel；每次调用从 trusted sender owner 取得所属 `AppWindow/TabManager`，不接受全局窗口 getter。URL 输入只负责解析与导航，内部页 payload 先经过严格判别联合校验，标签排序只接受字符串 ID 与整数最终索引，题目追踪统一由 TabManager 导航链处理。
- `registerCookieIpc(cookieVault?)`：注册 Cookie 摘要查询 channel；完整 Cookie 仅保留在 main 内部，renderer 只拿名称、数量、过期时间和安全标记统计。
- `registerMainIpc(options)`：主入口调用的组合函数；只负责串联各注册模块，不直接实现具体 handler。
- `handleFromShell()` / `onFromShell()`：普通壳 IPC 的统一校验入口，拒绝未知 webContents、iframe、伪造 origin 和超限/循环 payload。
- `getShellWindowOwner(event)`：在 sender 校验通过后返回登记的 `AppWindow`；owner 缺失时窗口敏感操作 fail closed，不回退最近活跃窗口。
- `onFromOj()`：只允许已登记的 `persist:oj-main` WebContentsView 主 frame 发送提交 bridge 事件。

## 4. 边界规则

- 新增 IPC handler 时必须同步 `electron/preload.ts`、`electron/electron-env.d.ts`、相关 renderer helper 和本目录 README。
- 不改变已有 channel 名称，除非同步迁移 preload、renderer 和 IPC 合约测试。
- 注册函数应由 `main.ts` 在应用初始化阶段调用，避免模块 import 时产生隐式副作用。
- 具体 channel 逻辑应留在单域 `register*Ipc.ts`，不要把业务 handler 塞进 `registerMainIpc.ts`。
- handler 内不要记录 Cookie、用户源码、完整请求体或可复用登录态信息。
- `cookies:*` channel 不得返回 Cookie value；需要完整 Cookie 时只能由 main 进程内部 service 调用 `CookieVault`。
- `backup:*` channel 导出的 JSON 不得包含 Cookie、`raw_json`、日志或本机绝对路径；冲突导入必须先预览再确认。
- `register*.ts` 不得直接从 `electron` 导入 `ipcMain`；新增普通 channel 必须经过 `trustedSender.ts`，并同步 IPC 合约测试。
- 窗口、标签、菜单和原生对话框操作必须按 sender owner 路由；禁止注入模块级 `getWindow/getTabManager` 单槽。
- `ui:command` 只允许受控的判别联合对象，不得把任意脚本、channel、URL 内容或窗口对象透传给 renderer；导航失败只发送枚举原因。
- OJ、登录捕获和用户脚本 bootstrap 不得复用 shell sender validator；专用 validator 必须按 webContents 归属和主 frame 校验。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npm exec vitest -- run tests/ipc
```

涉及启动时机或 handler 注册顺序时追加运行：

```powershell
npx --yes tsx tests\electron\startupSmoke.test.ts
```

信任边界和畸形 payload：

```powershell
npx vitest run tests\security\trustedSender.test.ts
```
