# Algo Learning Platform

本地优先的个人算法学习追踪桌面应用。项目当前标记为 **v1.0 完成**，已覆盖桌面刷题、题目识别、提交记录、学习统计、笔记、站点扩展、备份导入导出和 Windows 打包发布基础。

AI Coach 属于 v1.0 之后的独立规划；v1.0 只保留已经落地的本地规则型 AI 学习建议、复习计划、阶段总结和上下文导出能力。

## 版本状态

| 项目 | 状态 |
|---|---|
| 当前版本 | `1.0.0` |
| 桌面端 | Electron Windows 应用 |
| 数据策略 | 本地优先，SQLite 持久化 |
| 发布状态 | v1.0 功能和手动验收已通过，等待用户发布发行版 |
| 许可证 | MIT |

## 支持平台

内置支持以下 OJ 或刷题平台：

- Codeforces
- AcWing
- 牛客
- VJudge
- PTA
- 洛谷
- LeetCode CN

项目还提供自定义站点配置、站点导入导出和用户脚本能力，可扩展普通 OJ 题目识别和页面辅助逻辑。

## 支持功能

- 多标签内嵌浏览器：基于 `WebContentsView`，支持标签切换、导航、独立窗口剥离和默认首页。
- 题目识别与访问追踪：自动识别题目 URL，记录访问、停留时间、题目状态和复习信息。
- 实时提交监测：支持七站最终判题结果入库，避免 pending、自测、样例运行和公开状态误入库。
- 手动同步：支持 Codeforces API 同步和当前页面提交记录同步。
- 题库与题目详情：展示平台、状态、提交历史、首次 AC、笔记入口和跳转入口。
- 学习统计：提供平台分布、趋势、Rating、错题、未复习题和学习时间线。
- Codeforces Rating：支持账号绑定、rating 历史、peak rating 和 contest delta 展示。
- Markdown 笔记：支持题目关联笔记、正文编辑、标题保存和图片附件。
- 用户脚本：支持导入、编辑、启用、禁用、删除、打开目录和目标站点匹配。
- 备份与导入导出：支持 SQLite 本地备份、学习数据 JSON 导出、导入预览和冲突处理。
- 隐私边界：Cookie 值只留在 Electron 持久 session，普通 JSON 导出、同步预留和 renderer API 均不暴露 Cookie value。

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面端 | Electron 42.2.0 |
| 浏览器容器 | `WebContentsView` |
| Renderer | React 18、TypeScript、Vite |
| 样式 | TailwindCSS |
| 图表 | Recharts |
| 数据库 | SQLite、`better-sqlite3`、WAL |
| 构建 | electron-builder、NSIS Windows x64 |
| 测试 | TypeScript、ESLint、架构/安全/文档/打包守卫、IPC contract、DB、Electron smoke、UI screenshot |

## 运行与构建

```powershell
cd algo-electron
npm install
npm run dev
```

常用验证命令：

```powershell
npm run test:all
npm run build:win
```

Windows 安装包输出目录：

```text
algo-electron/release/${version}/
```

## 文档入口

- [文档索引](docs/README.md)
- [系统架构](ARCHITECTURE.md)
- [数据库 schema](DATABASE_SCHEMA.md)
- [站点适配接口](SITE_ADAPTER_GUIDE.md)
- [同步与导入导出兼容性](docs/sync-compatibility.md)
- [安卓只读数据接口预留](docs/android-readonly-data-interface.md)
- [发布流程](docs/release-process.md)
- [故障排查](docs/troubleshooting.md)
- [更新日志](CHANGELOG.md)

## 安全

不要提交或发布 Cookie、session、csrf token、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态。安全和隐私边界见 [SECURITY.md](SECURITY.md)。

## License

MIT License. See [LICENSE](LICENSE).
