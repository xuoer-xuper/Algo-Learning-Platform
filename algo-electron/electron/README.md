# Electron 主进程目录

## 1. 职责

`electron/` 是桌面应用的本地能力边界，负责窗口、浏览器容器、持久 session、IPC、SQLite、站点识别、提交监测、学习追踪、笔记、用户脚本、AI 本地规则和打包后的主进程入口。

Renderer 不能直接访问本目录能力，只能通过 `preload.ts` 暴露的 `window.electronAPI` 白名单调用。

## 2. 根文件

- `main.ts`：应用启动编排。负责设置 Chromium flag、初始化数据库和服务、创建窗口、注册 IPC、创建浏览器标签系统、安装协议和注入器。业务逻辑应继续下沉到子模块。
- `preload.ts`：renderer preload 白名单。只暴露固定 `electronAPI`，不暴露通用 `ipcRenderer`。
- `electron-env.d.ts`：renderer 可见 preload API 类型契约。新增 IPC/Preload API 必须同步这里和 IPC contract 测试。

## 3. 子目录分类

| 目录 | 职责 |
|---|---|
| `app/` | 主进程配置、Chromium flag、服务初始化、最近站点预连接和 smoke test 编排。 |
| `backup/` | 本地 SQLite 备份、学习数据 JSON 导入导出和冲突检测。 |
| `browser/` | `WebContentsView`、多标签、独立窗口、OJ session 和远程页面 preload bridge。 |
| `ipc/` | 按业务域注册主进程 IPC handler，统一由 `registerMainIpc.ts` 组合。 |
| `db/` | SQLite 连接、migration、repository 和数据库写入边界。 |
| `adapters/` | 站点 adapter 注册、题目身份解析、提交解析、实时 hook 和共享 helper。 |
| `sites/` | 内置站点配置、用户站点配置类型和站点 registry。 |
| `parsers/` | URL 识别、标题抓取脚本、标题校验和配置 pattern 兼容层。 |
| `submissions/` | 实时提交 watcher、批量写入、题目关联、手动同步和页面 scraper。 |
| `tracking/` | 题目访问、停留时长、activity events 和 daily stats 触发。 |
| `cookies/` | CookieVault 和持久登录态读取边界。 |
| `notes/` | Markdown 笔记、图片附件、`note-asset://` 协议和 DB 缓存。 |
| `scripts/` | 用户脚本 metadata、匹配、注入和脚本服务。 |
| `ai/` | 本地 AI 上下文、复习建议、薄弱标签和周期总结。 |
| `rating/` | Codeforces rating 抓取和账号 rating 更新。 |
| `shared/` | 主进程共享类型、时间 helper 和跨模块基础工具。 |

每个子目录维护自己的 README，说明更细的实现程度、核心函数和验证入口。

## 4. 关键封装入口

- 启动组合：`main.ts`、`app/mainServices.ts`、`ipc/registerMainIpc.ts`。
- 浏览器能力：`browser/TabManager.ts`、`browser/BrowserHost.ts`、`browser/ojPreload.ts`。
- IPC 契约：`preload.ts`、`electron-env.d.ts`、`ipc/register*.ts`。
- 数据写入：`db/repositories/*`、`submissions/SubmissionBatchWriter.ts`、`tracking/TrackingService.ts`。
- 备份导入：`backup/backupService.ts`、`backup/learningDataExport.ts`。
- 站点能力：`adapters/sites/{site}/`、`sites/builtins/`、`parsers/sites/`。
- 提交监测：`submissions/SubmissionWatcherCore.ts`、`adapters/shared/frontendVerdictHook.ts`、站点专用 `hook.ts`。
- AI 本地分析：`ai/contextExporter.ts`、`ai/recommendations/`、`ai/summary/`。

## 5. 实现程度

当前已实现：

- WebContentsView 多标签浏览器和独立窗口剥离。
- 持久 OJ session 和 CookieVault 基础能力。
- SQLite migration、repository、统计聚合和本地数据写入。
- 本地 SQLite 备份、非敏感学习数据 JSON 导出/导入和冲突预览。
- 七站题目识别、提交同步和实时提交监测。
- 题目访问追踪、笔记、用户脚本、Codeforces rating 和本地 AI 建议。
- IPC contract、Electron smoke、adapter、submission、DB 和 UI screenshot 自动测试。

仍需人工验收：

- 七站真实登录态和正式提交。
- 站点验证码、比赛权限和风控。
- Windows 安装包安装、升级、卸载和数据保留。

## 6. 修改边界

- 不把业务逻辑堆回 `main.ts`。
- 不在 renderer 暴露通用 IPC、Node、SQLite、Cookie 或文件系统能力。
- 数据库 schema 变化必须新增 migration，并同步 `DATABASE_SCHEMA.md` 和 `docs/database-migration-rollback.md`。
- IPC/Preload API 变化必须同步 `preload.ts`、`electron-env.d.ts`、renderer helper、IPC contract 测试和相关 README。
- Nowcoder、VJudge 不得重新使用通用 DOM verdict observer 作为实时入库来源。
- 不把 Cookie、用户源码、完整请求体、本机数据库或可复用登录态写入日志、文档或测试快照。

## 7. 验证入口

主进程相关改动至少运行：

```powershell
cd algo-electron
npm run typecheck
npm run test:core
```

按影响范围追加：

```powershell
npm run test:adapters
npm run test:submissions
npm run test:db
npm run test:electron
```

发布前运行：

```powershell
npm run test:all
```

真实站点和安装包验收按 `docs/release-process.md` 执行。
