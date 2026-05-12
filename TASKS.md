
---

# TASKS.md

```md
# 当前任务列表（TASKS）

---

# 当前阶段

Phase 1：桌面端 MVP

---

# 一、项目初始化

## 基础工程

- [x] 初始化 Electron
- [x] 初始化 React
- [x] 初始化 TypeScript
- [ ] 初始化 TailwindCSS
- [x] 初始化 Vite
- [x] 建立基础目录结构

---

## Git

- [x] 初始化 Git
- [x] 创建 README.md
- [x] 创建 ROADMAP.md

---

# 二、Electron 主窗口

## 主窗口

- [x] 创建 Electron 主窗口
- [x] 支持窗口刷新
- [x] 支持开发模式启动

---

## Electron 与 React 通信

- [x] preload 初始化
- [x] IPC 基础通信

---

# 三、内嵌浏览器

## BrowserView

- [x] 创建 BrowserView
- [x] 支持打开网页
- [x] 支持页面刷新
- [x] 支持 URL 获取

---

## 支持的网站

- [x] Codeforces
- [ ] AcWing
- [ ] 牛客
- [ ] VJudge

---

## 登录状态

- [ ] Cookie 持久化
- [ ] 登录状态保存

---

# 四、题目自动识别

## URL 监听

- [x] 监听网页 URL 变化
- [x] 获取当前 URL

---

## 平台识别

- [ ] Codeforces URL 识别
- [ ] AcWing URL 识别
- [ ] 牛客 URL 识别
- [ ] VJudge URL 识别

---

## 题号解析

- [ ] 解析题号
- [ ] 提取平台信息

---

# 五、数据库系统

## SQLite

- [ ] 初始化 SQLite
- [ ] 创建数据库连接
- [ ] 创建 Problem 表

---

## Problem 数据

字段：

- id
- platform
- problemId
- url
- status
- lastVisitedAt

---

## 数据操作

- [ ] 插入题目
- [ ] 更新题目
- [ ] 获取题目列表
- [ ] 获取最近访问

---

# 六、题库侧边栏

## UI

- [ ] 创建侧边栏
- [ ] 显示题目列表
- [ ] 最近访问列表

---

## 功能

- [ ] 点击题目跳转
- [ ] 平台分类

---

# 七、Phase 2 预留

以下功能暂不实现：

- [ ] 自动抓标题
- [ ] 自动抓难度
- [ ] 自动抓标签
- [ ] 自动分类
- [ ] 提交记录分析
- [ ] Markdown 题解
