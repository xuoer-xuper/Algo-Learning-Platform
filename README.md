# 🚀 Algo Learning Platform

<p align="center">
  <strong>本地优先的个人算法学习环境与追踪平台</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-42.2.0-47848F?style=flat-square&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.2-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License">
</p>

## 🌟 简介

**Algo Learning Platform** 是一款为算法爱好者打造的**本地优先 (Local-First)** 个人学习追踪软件。通过内置独立浏览器让你直接访问各大 Online Judge (OJ) 平台，并在后台无感地记录你的刷题轨迹、提交代码、耗时以及错题分布。平台致力于帮助你建立长期的学习习惯，并提供基于你本地数据的深度图表分析。

目前已原生支持 **Codeforces**、**AcWing**、**牛客网**、**VJudge**、**PTA** 等主流平台，同时提供高可扩展的站点自定义接入能力，可轻松适配各类校园及小众 OJ。

---

## ✨ 核心特性

- 🌐 **内嵌多标签浏览器**：基于底层重构的 Chrome 级多标签页体验，支持将网页双击剥离为原生独立窗口，方便多屏刷题。
- 📊 **无感行为追踪**：智能 URL 识别机制，在你不改变原有刷题习惯的前提下，自动记录题目的浏览耗时、首次访问时间与复习频率。
- 🔄 **提交记录本地同步**：支持通过 API 或无头安全 DOM 抓取，自动拉取你的判题状态（AC、WA 等），沉淀属于你的本地代码数据湖。
- 📈 **个人统计大盘**：内置可视化数据仪表盘（饼图、柱状图、趋势折线图、时间线），直观呈现你的学习连续性、平台分布和弱点项。
- 🏆 **Codeforces Rating 跟踪**：自动获取并绘制你的 Rating 变化、历史峰值和单场竞赛表现（Delta）。
- 🧩 **高扩展的站点系统**：内置站点管理器，支持自定义导入/导出题目 URL 匹配规则，且集成了类 Tampermonkey（油猴）级别的插件脚本注入引擎。
- 🔒 **隐私绝对安全**：一切数据（包含登录状态、Cookie 铭文和行为记录）全部保存在你电脑本地的 SQLite 数据库中，永远掌握在自己手里。

---

## 🛠️ 技术栈与架构

本项目采用了目前现代化的前端与桌面技术栈，并严格贯彻主从进程分离原则：

- **桌面框架**: [Electron](https://www.electronjs.org/) (Chromium + Node.js)
- **前端框架**: [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **开发语言**: [TypeScript](https://www.typescriptlang.org/)
- **样式方案**: [TailwindCSS](https://tailwindcss.com/)
- **状态管理**: [Zustand](https://github.com/pmndrs/zustand)
- **本地数据库**: [SQLite3](https://sqlite.org/index.html) (由 `better-sqlite3` 驱动，启用 WAL 模式实现极致读写性能)
- **数据可视化**: [Recharts](https://recharts.org/)

---

## 📦 安装与运行

### 1. 下载发行版 (推荐)
前往项目的 [Releases](#) 页面，下载对应你操作系统的 `.exe` 安装包，双击即可无痛安装运行。

### 2. 源码构建 (适合开发者)

确保你已经安装了 **Node.js** 和 **Git**。

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/algo-learning-platform.git

# 2. 进入核心目录
cd algo-learning-platform/algo-electron

# 3. 安装依赖
npm install

# 4. 启动开发环境 (热更新)
npm run dev

# 5. 打包为本地可执行文件 (生成至 release/ 目录)
npm run build
```

---

## 📄 开源协议

本项目采用 **MIT License** 开源协议。详情请参阅项目中的 `LICENSE` 文件。

你可以自由地使用、修改和进行商业分发，但请保留原作者声明。欢迎提出 Issue 或 Pull Request！

---

## 🤖 AI Agent 必读架构文档 (开发者指引)

本项目拥有极度严格的开发契约与文档职责分离地图。这使得多阶段、多 AI 协作开发成为可能。**任何接手本项目的开发者或 AI Agent，必须在阅读以下核心文档后方可开工修改代码**：

- `PROJECT_RULES.md`：**项目最高规则**。规定了技术栈禁令、架构边界约束、Cookie 隐匿原则和 AI 开发硬纪律。
- `ROADMAP.md`：**长期路线图**。说明从 Phase 0 到 Phase 8 的远景里程碑规划。
- `TASKS.md`：**主任务清单**。所有开发必须按任务编号单线推进，每次开发完成必须更新其状态。
- `AI_HANDOFF.md`：**代码交接现场**。记录当前现有代码的存量状态、已知高风险区域和下一步推进建议。
- `ARCHITECTURE.md`：**系统架构设计**。涵盖 IPC 通信规范、多标签页(TabManager)、CookieVault、Tracking 系统的核心工作流。
- `DATABASE_SCHEMA.md`：**数据库设计契约**。定义一切 SQLite 表结构、索引与迁移 (Migration) 规则。
- `AI_WORKFLOW.md`：**AI 协作流程**。规范 Agent 任务声明格式与交接要求。
- `COMMIT_RULES.md`：严格的中文 Git 提交规范 (Conventional Commits)。
- `SITE_ADAPTER_GUIDE.md`：**站点适配指南**。说明如何编写和注册新的目标站点适配器（Parser Adapter）。

> **ℹ️ 研发进度同步：**  
> 当前版本开发状态：**Phase 5 (站点扩展系统与多标签架构) 已正式完成 (v0.5.0)**。  
> 下一步即将进入：**Phase 6 (AI 辅助学习系统)**。
