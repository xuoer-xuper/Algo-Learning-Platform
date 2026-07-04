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

目前已原生支持 **Codeforces**、**AcWing**、**牛客网**、**VJudge**、**PTA**、**洛谷**、**LeetCode** 等主流平台，同时提供高可扩展的站点自定义接入能力，可轻松适配各类校园及小众 OJ。

---

## ✨ 核心特性

- 🌐 **内嵌多标签浏览器**：基于底层重构的 Chrome 级多标签页体验，支持将网页双击剥离为原生独立窗口，方便多屏刷题。
- 📊 **无感行为追踪**：智能 URL 识别机制，在你不改变原有刷题习惯的前提下，自动记录题目的浏览耗时、首次访问时间与复习频率。
- 🔄 **提交记录本地同步**：支持通过 API 或无头安全 DOM 抓取，自动拉取你的判题状态（AC、WA 等），沉淀属于你的本地代码数据湖。
- 📈 **个人统计大盘**：内置可视化数据仪表盘（饼图、柱状图、趋势折线图、时间线），直观呈现你的学习连续性、平台分布和弱点项。
- 🏆 **Codeforces Rating 跟踪**：自动获取并绘制你的 Rating 变化、历史峰值和单场竞赛表现（Delta）。
- 🧩 **高扩展的站点系统**：内置站点管理器，支持自定义导入/导出题目 URL 匹配规则，且集成了类 Tampermonkey（油猴）级别的插件脚本注入引擎。
- 🔒 **隐私绝对安全**：学习数据、登录状态摘要和行为记录都保存在本机环境中，永远掌握在自己手里。

---

## 🛠️ 技术栈与架构

本项目采用了目前现代化的前端与桌面技术栈，并严格贯彻主从进程分离原则：

- **桌面框架**: [Electron](https://www.electronjs.org/) (Chromium + Node.js)
- **前端框架**: [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **开发语言**: [TypeScript](https://www.typescriptlang.org/)
- **样式方案**: [TailwindCSS](https://tailwindcss.com/)
- **状态管理**: React 本地状态与按 feature 拆分的 hooks/API helper
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

本项目有严格的开发契约与文档职责分离地图。**任何接手本项目的开发者或 AI Agent，先从 [`docs/README.md`](docs/README.md) 进入文档体系，再按任务类型阅读对应设计、模块 README 和测试说明。**

最小必读入口：

- [`docs/README.md`](docs/README.md)：文档总索引、阅读顺序和维护规则。
- [`PROJECT_RULES.md`](PROJECT_RULES.md)：项目最高规则。
- [`TASKS.md`](TASKS.md)：唯一任务状态源。
- [`AI_HANDOFF.md`](AI_HANDOFF.md)：当前交接现场和风险提示。
- [`CONTRIBUTING.md`](CONTRIBUTING.md)：贡献流程、验证入口、修改边界和 PR 检查清单。
- [`SECURITY.md`](SECURITY.md)：安全与隐私报告边界。

研发进度不要在 README 中维护第二份状态；以 [`TASKS.md`](TASKS.md) 和 [`AI_HANDOFF.md`](AI_HANDOFF.md) 为准。
