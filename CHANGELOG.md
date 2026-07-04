# 更新日志

本文件记录面向用户和维护者的可见变化。格式参考 Keep a Changelog，提交信息仍按 `COMMIT_RULES.md` 使用中文 Conventional Commits。

## 未发布

### 新增

- 增加提交监测设计文档，说明实时 hook、submit intent、站点差异和手测流程。
- 增加 renderer、主进程模块、测试与构建入口文档索引，方便按模块接手维护。
- 增加 lint、URL 解析、repository、IPC 契约、Electron 启动和 renderer 截图验收测试。
- 增加 Windows NSIS x64 打包脚本、应用图标和 electron-builder 白名单配置。
- 增加发布流程文档，明确版本、changelog、自动验证、打包、产物检查、安装升级卸载验收和交接要求。
- 增加 GitHub 协作配置、CI workflow、issue 模板、打包资源和静态资源目录 README。
- 增加 Electron 主进程总览 README，说明根文件、子目录职责、封装入口和验证入口。
- 增加 `npm run test:docs` 文档一致性检查，覆盖 Markdown 链接和 README 覆盖规则。
- 扩展 `npm run test:docs`，要求长期目录 README 说明职责、实现程度、封装入口、边界和验证入口。
- 扩展 `npm run test:docs`，检查长期 Markdown、ADR 和模块 README 是否进入 `docs/README.md` 总索引。
- 扩展 `npm run test:docs`，检查文档中具体 `npm run` 命令是否存在于 `package.json`。
- 增加 `npm run test:architecture` 架构红线检查，覆盖 BrowserView、preload、renderer IPC 和 Nowcoder/VJudge 实时入库边界。
- 增加 `npm run test:packaging` 打包配置检查，覆盖 electron-builder 白名单、敏感排除、NSIS 和原生模块解包边界。
- 增加 `npm run test:security` 敏感文件检查，拦截 `.env`、本地数据库、日志和高置信 Cookie/header 明文模式。
- 增加项目巩固证据矩阵，把结构拆分、模块文档、自动验证和最终手测剩余项对应到可核查证据。
- 增加最终人工验收记录模板，便于记录自动验证、七站提交、核心页面、打包产物和剩余风险。
- 记录结构巩固阶段 `npm run test:all` 全量自动验证通过，作为发布前手测之外的自动基线。
- 增加 Cookie 元数据本地保存和安全摘要查询能力，renderer 只能查看授权状态摘要，不暴露 Cookie 值。
- 增加 `npm run test:ai`，验证 AI 建议、薄弱标签和复习计划可追溯到本地数据，且不泄漏敏感 payload。

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
