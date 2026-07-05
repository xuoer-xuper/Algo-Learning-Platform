# Algo Learning Platform

Algo Learning Platform 是一个本地优先的个人算法学习追踪桌面应用，用于在内嵌浏览器中刷题、识别题目、记录提交、沉淀笔记并查看学习统计。

项目当前版本为 `1.0.0`，面向 Windows 桌面端发布。核心学习数据默认保存在本机 SQLite 数据库中，Cookie 和登录态留在 Electron 持久 session 内，不进入普通导出文件。

## 功能特性

- 多标签内嵌浏览器：基于 Electron `WebContentsView`，支持导航、刷新、标签切换、独立窗口和默认首页。
- 题目识别与追踪：自动识别支持站点的题目 URL，记录访问、停留时间、状态和最近学习轨迹。
- 提交记录：支持正式提交结果入库，过滤 pending、judging、自测、样例运行和公开状态页误写。
- 手动同步：支持 Codeforces API 同步和当前页面提交记录同步。
- 学习统计：提供趋势、平台分布、Rating、错题、未复习题、时间线和连续活跃数据。
- Markdown 笔记：支持题目关联笔记、标题保存、正文编辑和图片附件。
- 用户脚本：支持导入、编辑、启用、禁用、删除和按站点匹配脚本。
- 本地学习建议：基于本地统计规则生成复习建议、薄弱标签和阶段总结，不修改核心事实数据。
- 备份与导入导出：支持 SQLite 备份、学习数据 JSON 导出、导入预览和冲突确认。

## 支持平台

- Codeforces
- AcWing
- 牛客
- VJudge
- PTA
- 洛谷
- LeetCode CN

也可以通过自定义站点配置扩展普通 OJ 的题目识别和页面辅助能力。

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面端 | Electron 42 |
| 浏览器容器 | `WebContentsView` |
| Renderer | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Database | SQLite, `better-sqlite3`, WAL |
| Build | electron-builder, NSIS |
| Tests | TypeScript, ESLint, architecture/security/docs guards, DB, IPC, Electron smoke, UI screenshot |

## 项目结构

```text
.
├── algo-electron/      # Electron 应用、renderer、测试和打包配置
├── docs/               # 产品、治理、设计、运维和 ADR 文档
├── .github/            # CI workflow、issue 模板和 PR 模板
├── README.md           # 项目总览
└── LICENSE             # MIT License
```

## 快速开始

环境要求：

- Node.js
- npm
- Windows，用于安装包验证

安装依赖并启动开发环境：

```powershell
cd algo-electron
npm install
npm run dev
```

## 常用命令

以下命令在 `algo-electron/` 下执行。

```powershell
npm run typecheck
npm run lint
npm run test:all
npm run build:win
```

常用专项检查：

```powershell
npm run test:docs
npm run test:security
npm run test:db
npm run test:submissions
```

Windows 安装包输出目录：

```text
algo-electron/release/${version}/
```

## 数据与隐私

- 核心学习数据保存在本地 SQLite。
- Cookie 值留在 Electron 持久 session 中，不暴露给 renderer API。
- 普通 JSON 导出排除 Cookie value、session、CSRF token、完整请求体、本地日志和本机绝对路径。
- 不要提交 `.env`、本地数据库、日志、包含敏感信息的截图、可复用登录态或用户源码。

完整安全边界见 [SECURITY](docs/GOVERNANCE/SECURITY.md)。

## 文档入口

- [文档索引](docs/README.md)
- [系统架构](docs/DESIGN/SYSTEM_ARCHITECTURE.md)
- [数据库设计](docs/DESIGN/DATABASE_SCHEMA.md)
- [站点适配指南](docs/DESIGN/SITE_ADAPTER_GUIDE.md)
- [提交监测设计](docs/DESIGN/SUBMISSION_MONITORING_DESIGN.md)
- [数据导出与导入](docs/DESIGN/DATA_EXPORT_AND_IMPORT.md)
- [发布流程](docs/OPERATIONS/RELEASE_PROCESS.md)
- [故障排查](docs/OPERATIONS/TROUBLESHOOTING.md)
- [更新日志](docs/PRODUCT/CHANGELOG.md)

## 许可证

MIT. See [LICENSE](LICENSE).
