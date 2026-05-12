# AI 开发交接（AI HANDOFF）

---

# 当前阶段

Phase 1：桌面端 MVP

---

# 当前目标

开发一个可真正用于刷题的 Electron 桌面应用。

当前 MVP：

1. 内嵌浏览器
2. 自动识别题目
3. 本地题库系统
4. VJudge 支持

---

# 当前已完成

## 工程初始化

- 已创建项目目录
- 已初始化 Git
- 已创建 README.md
- 已创建 ROADMAP.md
- 已初始化 Electron（electron-vite 模板）
- 已初始化 React + TypeScript
- 已初始化 Vite
- 已建立基础目录结构

## Electron 主窗口

- 已创建主窗口（1280x800）
- 支持开发模式启动（npm run dev）
- preload 已初始化
- IPC 基础通信已建立

## 内嵌浏览器（BrowserView）

- 已创建 BrowserView（嵌入主窗口，默认加载 codeforces.com）
- 支持打开网页（URL 栏输入 + 前往按钮）
- 支持页面刷新（刷新按钮）
- 支持 URL 获取（页面导航时自动同步到导航栏）
- 支持后退/前进
- BrowserView 尺寸跟随主窗口变化（resize 自适应）
- Codeforces 已支持

---

# 当前未完成

- TailwindCSS 初始化
- Cookie 持久化 / 登录状态保存
- AcWing / 牛客 / VJudge 支持
- 平台 URL 识别
- 题号解析
- SQLite 初始化
- Problem 表创建
- 题库侧边栏

---

# 当前开发原则

- 小步开发
- 不允许大规模重构
- 优先稳定方案
- 本地优先

---

# 当前技术栈

- Electron（v30）
- React（v18）
- TypeScript
- Vite
- TailwindCSS（待安装）
- SQLite（待引入）

---

# 当前 UI 风格

- 简洁
- 深色主题（Catppuccin Mocha 色系）
- 蓝色主色调（#89b4fa）

---

# 下一步

下一步任务：

1. 安装 TailwindCSS
2. Cookie 持久化 / 登录状态保存
3. 监听 URL 变化，识别题目页面
4. 初始化 SQLite + Problem 表

---

# AI 修改要求

AI 修改项目前必须：

1. 阅读 PROJECT_RULES.md
2. 阅读 ROADMAP.md
3. 阅读 TASKS.md
4. 阅读 AI_HANDOFF.md
5. 分析任务，告知预计用时
6. 等用户确认后再开始编码

---

# AI 修改后必须

1. 更新 TASKS.md
2. 更新 AI_HANDOFF.md
3. 保持目录结构稳定
4. 告诉用户建议的 git commit 名称
