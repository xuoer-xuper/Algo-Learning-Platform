# 项目路线图

## 1. 当前状态

Algo Learning Platform v1.0 已完成。当前版本是一个本地优先的 Windows 桌面算法学习平台，支持多平台刷题、题目识别、提交记录、学习统计、Rating、笔记、站点扩展、备份导入导出和发布打包。

AI Coach 不属于 v1.0 规划。后续如基于本项目继续制作 AI Coach，应作为 v1.0 之后的新阶段或独立产品规划，不回填到本路线图的 v1.0 完成范围。

## 2. v1.0 已完成范围

| 阶段 | 状态 | 交付内容 |
|---|---|---|
| Phase 0 架构基线 | 已完成 | `WebContentsView`、Main/Preload/Renderer/SQLite/IPC 边界、ADR 和核心文档。 |
| Phase 1 桌面 MVP | 已完成 | 内嵌浏览器、持久 session、CookieVault、站点注册、题目访问追踪和基础题库。 |
| Phase 2 题目与提交 | 已完成 | 题目元数据、提交记录、题目详情、首次 AC 和提交状态计算。 |
| Phase 3 学习分析 | 已完成 | 活跃时长、趋势、平台分布、时间线、错题和未复习题统计。 |
| Phase 4 Rating | 已完成 | Codeforces 账号、rating 历史、peak rating 和 contest delta。 |
| Phase 5 站点扩展 | 已完成 | 自定义站点配置、导入导出、用户脚本和七站 adapter。 |
| Phase 6 本地 AI 辅助 | 已完成 | Markdown 笔记、AI 上下文导出、本地复习建议、薄弱标签、阶段总结和复习计划。 |
| Phase 7 同步与备份预留 | 已完成 | `sync_queue`、SQLite 备份、学习数据 JSON 导入导出、冲突检测和安卓只读接口设计。 |
| Phase 8 发布质量 | 已完成 | ESLint/TypeScript、自动测试、CI、Windows NSIS 打包、发布/故障/迁移文档和人工验收。 |

## 3. v1.0 功能边界

已纳入 v1.0：

- Windows 桌面端。
- 本地 SQLite 数据库。
- 七站题目识别和提交监测。
- 自定义站点配置和用户脚本。
- 本地学习统计和 Codeforces Rating。
- Markdown 笔记和图片附件。
- 本地规则型 AI 学习建议和可追溯导出。
- 本地备份、学习数据 JSON 导入导出和冲突预览。
- Windows 安装包构建与发布流程。

未纳入 v1.0：

- 云同步服务。
- 安卓应用实现。
- 多用户账号系统。
- 在线大模型托管式 AI Coach。
- 跨设备实时协作或团队功能。

## 4. 后续可能方向

后续迭代可以独立规划：

- AI Coach：基于 v1.0 本地学习数据生成更完整的学习教练体验。
- 多端读取：基于 `docs/android-readonly-data-interface.md` 实现只读移动端。
- 云同步：基于 `docs/sync-compatibility.md` 实现安全同步服务。
- 更多 OJ：按 `docs/SITE_ADAPTER_GUIDE.md` 增加 adapter。
- 打包发布扩展：补齐 macOS、Linux 或自动更新。
