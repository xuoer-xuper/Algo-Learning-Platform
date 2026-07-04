# 项目技术边界

本文记录 Algo Learning Platform v1.0 的稳定技术边界。它不是任务清单，也不记录协作交接状态。

## 1. 项目定位

Algo Learning Platform 是本地优先的个人算法学习平台。核心数据默认保存在本机，用于长期记录、分析和沉淀用户的算法学习行为。

## 2. 固定技术栈

| 层级 | 技术 |
|---|---|
| 桌面端 | Electron |
| 浏览器承载 | `WebContentsView` |
| 前端 | React + TypeScript |
| 样式 | TailwindCSS |
| 数据库 | SQLite |
| SQLite 驱动 | `better-sqlite3` |
| Renderer 状态 | React state、feature hooks、feature API helper |
| 构建工具 | Vite、electron-builder |

除非同步更新架构、数据库和发布文档，否则不要更换上述技术栈。

## 3. 本地优先

- 核心学习数据以本地 SQLite 为准。
- 数据库、Cookie、学习事件、题目记录、提交记录和 Rating 历史默认保存在本机。
- 同步和导出只能建立在本地数据模型之上。
- Cookie、日志、完整请求体、用户源码和本机绝对路径不得进入普通 JSON 导出、同步队列或发布材料。

## 4. 浏览器容器

- 运行时代码统一使用 `WebContentsView`。
- 不在 `BrowserView` 上新增功能。
- 浏览器视图生命周期由 `BrowserHost` / `TabManager` 等主进程模块管理。
- 远程 OJ 页面不得启用 Node 能力。

## 5. Cookie 与登录态

- Electron 持久 session 负责正常登录态。
- `CookieVault` 负责按站点提取、保存和查询 Cookie 元数据。
- Renderer 只能读取 Cookie 安全摘要，不得读取 Cookie value。
- Cookie value 不写普通日志、不进 `sync_queue`、不进学习数据 JSON、不进安卓只读接口。

## 6. Renderer 本地能力边界

- Renderer 只负责 UI、交互状态和展示。
- Renderer 不直接访问 SQLite、文件系统、Cookie 或 Electron session。
- 本地能力通过 Preload 白名单 API 暴露。
- Preload 不暴露通用 `ipcRenderer`，只暴露固定方法和固定 channel。

## 7. 数据库边界

- 所有 schema 变化必须通过 migration。
- 所有 schema 变化必须同步 `DATABASE_SCHEMA.md`。
- Repository 负责封装 SQLite 读写，业务层不散落 `CREATE TABLE`。
- 已发布 migration 只能追加修复，不回写历史 migration。

## 8. AI 功能边界

v1.0 的 AI 能力是本地辅助学习能力，不是完整 AI Coach。

- AI 上下文导出和建议规则只读取本地学习数据。
- AI 建议不得直接修改 `problems`、`submissions`、`notes`、`problem_visits` 等核心事实表。
- AI 产物写入独立 `ai_outputs` 表，可由用户清除。
- AI 上下文不得包含 Cookie、绝对文件路径、日志内容或用户私有代码正文。
- AI 建议必须可追溯到题目、提交、访问或统计依据。

## 9. 站点适配边界

- 新站点优先使用配置化 URL 规则。
- 复杂站点通过 adapter 扩展。
- 提交监测必须等待最终 verdict，不把 pending、自测、样例运行、公开状态行或非当前用户记录写入核心提交表。
- 站点适配变更需同步 `SITE_ADAPTER_GUIDE.md` 和相关模块 README。

## 10. 验证入口

常用验证命令在 `algo-electron/` 下执行：

```powershell
npm run test:all
npm run build:win
```

发布、打包和数据恢复流程分别见：

- `docs/release-process.md`
- `docs/troubleshooting.md`
- `docs/database-migration-rollback.md`
