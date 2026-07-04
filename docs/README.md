# 文档索引

本文是 Algo Learning Platform v1.0 的成品文档入口。文档只保留项目说明、技术栈、版本、支持功能、接口边界、数据结构、发布和运维资料；协作期任务清单、交接记录、提示词草稿和结构巩固审计已从当前文档集中移除，历史可通过 Git 追溯。

## 1. 项目与版本

| 文档 | 内容 |
|---|---|
| [README.md](../README.md) | 项目总览、v1.0 状态、支持平台、功能、技术栈和运行命令。 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录。 |
| [ROADMAP.md](ROADMAP.md) | v1.0 完成范围和后续方向。 |
| [PROJECT_RULES.md](PROJECT_RULES.md) | v1.0 稳定技术边界。 |
| [SECURITY.md](SECURITY.md) | 安全与隐私边界。 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 通用贡献流程和验证入口。 |
| [COMMIT_RULES.md](COMMIT_RULES.md) | 提交信息约定。 |
| [LICENSE](../LICENSE) | MIT License。 |

## 2. 核心架构与接口

| 文档 | 内容 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Main、Preload、Renderer、IPC、浏览器容器、提交监测、AI 边界和数据流。 |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | SQLite schema、migration、repository、索引和写入约束。 |
| [SITE_ADAPTER_GUIDE.md](SITE_ADAPTER_GUIDE.md) | 站点适配、提交抓取、parser、实时 hook 和自定义站点规范。 |
| [submission-monitoring-design.md](submission-monitoring-design.md) | 七站提交监测数据流、submit intent、站点差异和实时 hook 安全边界。 |
| [sync-compatibility.md](sync-compatibility.md) | 同步队列、JSON 导入导出、冲突策略和 Cookie 不同步边界。 |
| [android-readonly-data-interface.md](android-readonly-data-interface.md) | 未来安卓端只读数据格式、只读边界和兼容策略。 |

## 3. 发布与运维

| 文档 | 内容 |
|---|---|
| [release-process.md](release-process.md) | Windows 发布前版本、changelog、自动验证、打包、产物检查和安装升级卸载流程。 |
| [troubleshooting.md](troubleshooting.md) | 登录、页面加载、提交监测、同步、数据库、笔记、用户脚本、统计和打包常见问题。 |
| [database-migration-rollback.md](database-migration-rollback.md) | SQLite migration 失败识别、备份、恢复、回滚策略和验证命令。 |
| [algo-electron/README.md](../algo-electron/README.md) | Electron 子项目目录、开发命令、构建和测试入口。 |
| [.github/README.md](../.github/README.md) | GitHub workflow、PR 模板和 issue 模板说明。 |
| [CI workflows](../.github/workflows/README.md) | CI workflow 覆盖范围和维护要求。 |
| [Issue templates](../.github/ISSUE_TEMPLATE/README.md) | issue 模板字段和敏感信息边界。 |

## 4. ADR

| ADR | 决策 |
|---|---|
| [README.md](adr/README.md) | ADR 目录职责、新增规则和维护要求。 |
| [0001-use-webcontentsview.md](adr/0001-use-webcontentsview.md) | 统一使用 `WebContentsView`。 |
| [0002-cookie-vault.md](adr/0002-cookie-vault.md) | CookieVault 和 Cookie 安全边界。 |
| [0003-event-log-and-analytics.md](adr/0003-event-log-and-analytics.md) | 学习行为采用“原始事件日志 + 聚合统计表”。 |

## 5. 主进程模块

| 模块 | 文档 | 内容 |
|---|---|---|
| electron 总览 | [electron/README.md](../algo-electron/electron/README.md) | 主进程根文件、子目录职责、封装入口、实现程度和验证入口。 |
| adapters | [electron/adapters/README.md](../algo-electron/electron/adapters/README.md) | 站点 adapter 职责、目录模型、共享 helper 和测试入口。 |
| ai | [electron/ai/README.md](../algo-electron/electron/ai/README.md) | 本地 AI 上下文、复习建议、薄弱标签、阶段总结和规则边界。 |
| app | [electron/app/README.md](../algo-electron/electron/app/README.md) | 主进程轻量配置读写边界。 |
| backup | [electron/backup/README.md](../algo-electron/electron/backup/README.md) | SQLite 备份、学习数据 JSON 导出导入和冲突检测。 |
| browser | [electron/browser/README.md](../algo-electron/electron/browser/README.md) | BrowserHost、TabManager、WebContentsView 和远程页面 preload。 |
| cookies | [electron/cookies/README.md](../algo-electron/electron/cookies/README.md) | CookieVault、持久 session 和敏感信息边界。 |
| db | [electron/db/README.md](../algo-electron/electron/db/README.md) | SQLite 连接、migration、repository 和写入规则。 |
| ipc | [electron/ipc/README.md](../algo-electron/electron/ipc/README.md) | 主进程 IPC 注册拆分、channel 稳定性和验证入口。 |
| notes | [electron/notes/README.md](../algo-electron/electron/notes/README.md) | Markdown 笔记、图片附件、DB 缓存和路径安全。 |
| parsers | [electron/parsers/README.md](../algo-electron/electron/parsers/README.md) | 题目 URL 识别、标题清洗、自定义 pattern 和兼容层。 |
| rating | [electron/rating/README.md](../algo-electron/electron/rating/README.md) | Codeforces rating 抓取和格式化边界。 |
| scripts | [electron/scripts/README.md](../algo-electron/electron/scripts/README.md) | 用户脚本导入、匹配、注入、IPC 和文件存储。 |
| shared | [electron/shared/README.md](../algo-electron/electron/shared/README.md) | 主进程跨模块基础类型和时间工具。 |
| sites | [electron/sites/README.md](../algo-electron/electron/sites/README.md) | SiteConfig、内置站点清单和 SiteRegistry。 |
| submissions | [electron/submissions/README.md](../algo-electron/electron/submissions/README.md) | 提交采集写入链路、实时监听、手动同步和 scraper。 |
| tracking | [electron/tracking/README.md](../algo-electron/electron/tracking/README.md) | 题目访问追踪、停留时长、activity events 和 daily stats。 |

关键子目录：

| 子目录 | 文档 |
|---|---|
| adapter 共享 helper | [electron/adapters/shared/README.md](../algo-electron/electron/adapters/shared/README.md) |
| 内置 adapter 列表 | [electron/adapters/sites/README.md](../algo-electron/electron/adapters/sites/README.md) |
| Codeforces adapter | [electron/adapters/sites/codeforces/README.md](../algo-electron/electron/adapters/sites/codeforces/README.md) |
| AcWing adapter | [electron/adapters/sites/acwing/README.md](../algo-electron/electron/adapters/sites/acwing/README.md) |
| Nowcoder adapter | [electron/adapters/sites/nowcoder/README.md](../algo-electron/electron/adapters/sites/nowcoder/README.md) |
| VJudge adapter | [electron/adapters/sites/vjudge/README.md](../algo-electron/electron/adapters/sites/vjudge/README.md) |
| PTA adapter | [electron/adapters/sites/pta/README.md](../algo-electron/electron/adapters/sites/pta/README.md) |
| Luogu adapter | [electron/adapters/sites/luogu/README.md](../algo-electron/electron/adapters/sites/luogu/README.md) |
| LeetCode adapter | [electron/adapters/sites/leetcode/README.md](../algo-electron/electron/adapters/sites/leetcode/README.md) |
| AI recommendations | [electron/ai/recommendations/README.md](../algo-electron/electron/ai/recommendations/README.md) |
| AI summary | [electron/ai/summary/README.md](../algo-electron/electron/ai/summary/README.md) |
| DB migrations | [electron/db/migrations/README.md](../algo-electron/electron/db/migrations/README.md) |
| DB repositories | [electron/db/repositories/README.md](../algo-electron/electron/db/repositories/README.md) |
| DB AI context snapshots | [electron/db/repositories/aiContextSnapshot/README.md](../algo-electron/electron/db/repositories/aiContextSnapshot/README.md) |
| DB AI output repository | [electron/db/repositories/aiOutput/README.md](../algo-electron/electron/db/repositories/aiOutput/README.md) |
| DB account repository | [electron/db/repositories/account/README.md](../algo-electron/electron/db/repositories/account/README.md) |
| DB cookie record repository | [electron/db/repositories/cookieRecord/README.md](../algo-electron/electron/db/repositories/cookieRecord/README.md) |
| DB problem repository | [electron/db/repositories/problem/README.md](../algo-electron/electron/db/repositories/problem/README.md) |
| DB submission repository | [electron/db/repositories/submission/README.md](../algo-electron/electron/db/repositories/submission/README.md) |
| DB site repository | [electron/db/repositories/site/README.md](../algo-electron/electron/db/repositories/site/README.md) |
| DB stats repository | [electron/db/repositories/stats/README.md](../algo-electron/electron/db/repositories/stats/README.md) |
| DB user script repository | [electron/db/repositories/userScript/README.md](../algo-electron/electron/db/repositories/userScript/README.md) |
| parser site extensions | [electron/parsers/sites/README.md](../algo-electron/electron/parsers/sites/README.md) |
| builtin site configs | [electron/sites/builtins/README.md](../algo-electron/electron/sites/builtins/README.md) |
| submission scrapers | [electron/submissions/scrapers/README.md](../algo-electron/electron/submissions/scrapers/README.md) |
| submission syncers | [electron/submissions/syncers/README.md](../algo-electron/electron/submissions/syncers/README.md) |

## 6. Renderer、测试与资源

| 区域 | 文档 | 内容 |
|---|---|---|
| renderer 总览 | [src/README.md](../algo-electron/src/README.md) | React renderer 职责、App 数据流、IPC 边界和验证入口。 |
| 共享组件 | [src/components/README.md](../algo-electron/src/components/README.md) | TabBar、WindowControls、ModalLayer、ErrorBoundary 等共享 UI。 |
| 业务功能 | [src/features/README.md](../algo-electron/src/features/README.md) | home、analytics、problems、scripts、settings 的职责和 API 调用边界。 |
| 应用 hooks | [src/hooks/README.md](../algo-electron/src/hooks/README.md) | 应用壳和跨 feature 的轻量 React hook。 |
| renderer shared | [src/shared/README.md](../algo-electron/src/shared/README.md) | 跨 feature 展示常量和轻量 helper。 |
| 打包资源 | [build/README.md](../algo-electron/build/README.md) | electron-builder 图标资源、敏感文件边界和打包验证入口。 |
| 静态资源 | [public/README.md](../algo-electron/public/README.md) | Vite public 静态文件、默认首页资源和 renderer 权限边界。 |
| 测试总览 | [tests/README.md](../algo-electron/tests/README.md) | 自动测试覆盖范围和运行方式。 |

Renderer feature：

| Feature | 文档 |
|---|---|
| analytics | [src/features/analytics/README.md](../algo-electron/src/features/analytics/README.md) |
| home | [src/features/home/README.md](../algo-electron/src/features/home/README.md) |
| problems | [src/features/problems/README.md](../algo-electron/src/features/problems/README.md) |
| scripts | [src/features/scripts/README.md](../algo-electron/src/features/scripts/README.md) |
| settings | [src/features/settings/README.md](../algo-electron/src/features/settings/README.md) |

测试子目录：

| 测试域 | 文档 |
|---|---|
| adapters | [tests/adapters/README.md](../algo-electron/tests/adapters/README.md) |
| architecture | [tests/architecture/README.md](../algo-electron/tests/architecture/README.md) |
| ai | [tests/ai/README.md](../algo-electron/tests/ai/README.md) |
| browser | [tests/browser/README.md](../algo-electron/tests/browser/README.md) |
| db | [tests/db/README.md](../algo-electron/tests/db/README.md) |
| docs | [tests/docs/README.md](../algo-electron/tests/docs/README.md) |
| electron | [tests/electron/README.md](../algo-electron/tests/electron/README.md) |
| integration | [tests/integration/README.md](../algo-electron/tests/integration/README.md) |
| ipc | [tests/ipc/README.md](../algo-electron/tests/ipc/README.md) |
| parsers | [tests/parsers/README.md](../algo-electron/tests/parsers/README.md) |
| packaging | [tests/packaging/README.md](../algo-electron/tests/packaging/README.md) |
| scripts | [tests/scripts/README.md](../algo-electron/tests/scripts/README.md) |
| security | [tests/security/README.md](../algo-electron/tests/security/README.md) |
| submissions | [tests/submissions/README.md](../algo-electron/tests/submissions/README.md) |
| ui | [tests/ui/README.md](../algo-electron/tests/ui/README.md) |

## 7. 文档维护

- 长期 Markdown、ADR 和模块 README 应进入本索引。
- 新增长期目录 README 时，至少说明职责、当前实现程度、关键封装入口或函数、边界规则和验证入口。
- 文档中引用具体 `npm run <script>` 时，该脚本必须存在于 `algo-electron/package.json`。
- 数据库 schema 变化必须同步 [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)。
- IPC/Preload API 变化必须同步 `electron/preload.ts`、`electron/electron-env.d.ts` 和相关模块 README。
- 提交监测、站点 adapter、实时 hook 变化必须同步 [submission-monitoring-design.md](submission-monitoring-design.md) 和 [SITE_ADAPTER_GUIDE.md](SITE_ADAPTER_GUIDE.md)。
- 文档和示例不得记录 Cookie、用户源码、完整请求体、本机数据库内容或可复用登录态。
