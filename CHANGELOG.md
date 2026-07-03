# 更新日志

本文件记录面向用户和维护者的可见变化。格式参考 Keep a Changelog，提交信息仍按 `COMMIT_RULES.md` 使用中文 Conventional Commits。

## 未发布

### 新增

- 增加提交监测设计文档，说明实时 hook、submit intent、站点差异和手测流程。
- 增加 renderer、主进程模块、测试与构建入口文档索引，方便按模块接手维护。
- 增加 lint、URL 解析、repository、IPC 契约、Electron 启动和 renderer 截图验收测试。
- 增加 Windows NSIS x64 打包脚本、应用图标和 electron-builder 白名单配置。

### 变更

- 提交监测 adapter 按站点目录整理，registry 只负责注册和查找。
- Renderer 业务组件逐步拆分为 feature 内部组件、hook 和 API helper，减少顶层文件职责。
- renderer 截图验收改为真实组件和 CSS bundle，并检查关键容器越界、敏感文本和统计图表绘制。
- Windows 打包产物现在解包 `better-sqlite3` 原生模块，避免安装包运行时加载 SQLite 驱动失败。

### 修复

- 修复 Codeforces、Nowcoder、VJudge 等站点提交监测提前入库、误抓自测、公开状态行误判和信息缺失问题。
- 修复截图验收中主内容区、统计页 modal 和平台分布图表的布局/绘制问题。

## 0.6.0 - 2026-07-03

### 新增

- 新增本地 Markdown 笔记系统，支持题目关联笔记、所见即所得编辑和图片附件保存。
- 新增 AI 上下文导出、复习建议、薄弱标签分析、阶段总结、复习计划和 AI 输出本地保存能力。
- 新增 Codeforces Rating 同步与统计大盘中的学习建议展示。

### 变更

- 明确 AI 模块只能读取核心学习数据并写入独立产物区，不能修改题目、提交、访问和统计核心数据。
- 代码片段管理方案已撤销，AI 上下文导出直接读取原始提交记录。

## 0.5.0 - 2026-07-03

### 新增

- 新增 Chrome 级多标签页系统，支持标签页切换和独立窗口剥离。
- 新增自定义站点配置导入/导出和用户脚本引擎。
- 新增 PTA、洛谷等站点适配能力。

### 变更

- Electron 升级到 42.2.0，底层浏览器容器迁移到 `WebContentsView`。

### 修复

- 修复 Codeforces 教练题等重定向场景污染本地 `canonical_url` 的问题。
