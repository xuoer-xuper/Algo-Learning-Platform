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
- `registerBrowserShellIpc.ts`：注册 `browser:*`、`tab:*` 和 `window:*` 浏览器壳层 handler。
- `registerCookieIpc.ts`：注册 `cookies:*` 安全摘要 handler，不向 renderer 暴露 Cookie value。
- `registerMainIpc.ts`：组合注册入口，集中由 `main.ts` 调用各业务域注册函数。

其他 IPC 仍在 `electron/main.ts`，后续可按风险逐步迁移：

- realtime submission IPC 当前由 `RealtimeSubmissionService.registerIpc()` 自己管理，不应重复注册。

## 3. 核心封装

- `registerAiIpc()`：注册 AI 相关 channel，包括上下文导出、复习建议、薄弱标签、阶段总结、复习计划、AI 输出保存和输出 CRUD。
- `registerBackupIpc(options)`：注册备份导入导出 channel；通过 `getParentWindow` 注入文件对话框父窗口，并在主进程内暂存待确认导入数据。
- `registerConfigIpc()`：注册应用配置 channel，包括默认首页读取和保存。
- `registerNotesIpc(options)`：注册笔记相关 channel；通过 `notifyProblemsUpdated` 注入题目更新通知，避免模块直接依赖 `BrowserWindow`。
- `registerProblemIpc(options)`：注册题目相关 channel；通过 `notifyProblemsUpdated` 注入删除题目后的刷新通知。
- `registerRatingIpc()`：注册 rating 相关 channel，包括账号绑定、账号查询、Codeforces rating 同步、历史查询和比赛结果查询。
- `registerScriptsIpc()`：注册用户脚本管理 channel，包括脚本列表、保存、导入、打开目录、启停和删除。
- `registerSitesIpc(options)`：注册站点配置相关 channel；通过 `getParentWindow` 注入文件对话框父窗口，通过 `notifyProblemsUpdated` 注入导入后的刷新通知。
- `registerStatsIpc()`：注册统计相关 channel，包括概览、趋势、平台分布、题目访问统计、时间线、复访、连续天数、错题、未复习和日统计重算。
- `registerSubmissionsIpc(options)`：注册手动提交同步 channel；通过 `getSyncService` 延迟读取 `SyncService`，避免模块 import 时绑定尚未初始化的服务实例。
- `registerBrowserShellIpc(options)`：注册浏览器壳层 channel；通过 `getWindow`、`getTabManager`、`getTrackingService` 注入运行期对象，保留 URL 重写前的题目识别通知行为。
- `registerCookieIpc(cookieVault?)`：注册 Cookie 摘要查询 channel；完整 Cookie 仅保留在 main 内部，renderer 只拿名称、数量、过期时间和安全标记统计。
- `registerMainIpc(options)`：主入口调用的组合函数；只负责串联各注册模块，不直接实现具体 handler。

## 4. 边界规则

- 新增 IPC handler 时必须同步 `electron/preload.ts`、`electron/electron-env.d.ts`、相关 renderer helper 和本目录 README。
- 不改变已有 channel 名称，除非同步迁移 preload、renderer 和 IPC 合约测试。
- 注册函数应由 `main.ts` 在应用初始化阶段调用，避免模块 import 时产生隐式副作用。
- 具体 channel 逻辑应留在单域 `register*Ipc.ts`，不要把业务 handler 塞进 `registerMainIpc.ts`。
- handler 内不要记录 Cookie、用户源码、完整请求体或可复用登录态信息。
- `cookies:*` channel 不得返回 Cookie value；需要完整 Cookie 时只能由 main 进程内部 service 调用 `CookieVault`。
- `backup:*` channel 导出的 JSON 不得包含 Cookie、`raw_json`、日志或本机绝对路径；冲突导入必须先预览再确认。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\ipc\ipcContracts.test.ts
```

涉及启动时机或 handler 注册顺序时追加运行：

```powershell
npx --yes tsx tests\electron\startupSmoke.test.ts
```
