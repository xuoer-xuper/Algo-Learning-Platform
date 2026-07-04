# 项目巩固完成证据矩阵

## 1. 使用边界

本文用于把“项目全量巩固、分离、分类、标准化、每块有文档、最后统一测试”拆成可核查证据。它不是任务状态源；任务状态仍以 `TASKS.md` 为准。它也不是发布通过证明；真实站点、安装包和最终总验收仍以 `docs/final-acceptance-checklist.md` 与 `docs/release-process.md` 为准。

当前判定：

- 结构巩固、文档覆盖、自动验证入口和协作规范已经具备可验收形态。
- `P8-007` changelog 和 `P8-008` electron-builder 配置仍是后续新增产物的持续标准。
- `P8-009` Windows 安装包发布和 `P8-012` v1.0 总验收不能因为本文存在而标记完成。

## 2. 目标拆解

| 用户目标 | 当前证据 | 判定 |
|---|---|---|
| 该分离的分离 | 主进程 `main.ts` 已收口；IPC、browser、tracking、scripts、notes、AI、repository、adapter、renderer feature 均有独立目录和兼容导出口；详见 `docs/project-hardening-audit.md`。 | 已具备验收形态 |
| 该分类的分类 | `docs/README.md` 按契约、任务、交接、设计、模块 README、调研、ADR、辅助材料分类；源码目录按 `electron/`、`src/features/`、`tests/` 分类。 | 已具备验收形态 |
| 走向标准化大项目 | 已补 CI、贡献指南、PR/Issue 模板、格式规则、许可证、安全政策、发布流程和统一测试 runner。 | 已具备验收形态 |
| 每块有项目文档 | `src`、`electron`、`tests` 根目录及子目录 README 由 `npm run test:docs` 检查；`.github`、workflow、issue template、`build`、`public`、`docs/adr` 也纳入检查。 | 已自动守卫 |
| 文档讲清楚怎么实现 | 关键模块 README 包含职责、当前实现程度、关键函数或 API 封装、边界规则和验证入口；总览由 `docs/README.md` 索引。 | 已覆盖，后续新增目录需继续遵守 |
| 文档讲清楚实现程度 | `docs/project-hardening-audit.md` 记录已完成结构收口和剩余大文件处置；各模块 README 说明当前实现程度。 | 已覆盖 |
| 文档讲清楚封装函数 | adapter、repository、renderer feature、AI、notes、submissions 等核心目录 README 均列出关键函数/API helper/稳定入口。 | 已覆盖主要维护面 |
| 自动测试清单 | `algo-electron/tests/run-tests.mjs` 和 `package.json` `test:*` scripts 提供统一入口；`docs/final-acceptance-checklist.md` 第 3 节列出自动验证基线。 | 已具备 |
| 最后统一手测清单 | `docs/final-acceptance-checklist.md` 覆盖七站提交监测、手动同步、核心页面、设置、用户脚本和打包产物；`docs/manual-acceptance-report-template.md` 提供可填写记录模板。 | 已具备 |

## 3. 自动证据

当前自动验证入口集中在 `algo-electron/`：

```powershell
npm run typecheck
npm run test:core
npm run test:architecture
npm run test:security
npm run test:docs
npm run test:packaging
npm run test:adapters
npm run test:submissions
npm run test:db
npm run test:electron
npm run test:ui
npm run test:all
```

各验证入口证明范围：

| 命令 | 证明范围 | 不证明 |
|---|---|---|
| `npm run test:core` | 类型检查、lint、架构红线、敏感文件、IPC contract、AI 规则、用户脚本、browser、parser、integration。 | 真实 OJ 登录态和安装包。 |
| `npm run test:docs` | Markdown 相对链接、README 覆盖、长期目录文档入口、`docs/README.md` 总索引覆盖、文档中 `npm run` 脚本引用是否存在，以及 README 是否说明职责、当前实现或覆盖范围、封装入口或关键文件、边界规则和验证入口。 | 每个文档的人工表达是否足够清晰，仍需代码评审判断。 |
| `npm run test:architecture` | 不回退 `BrowserView`、renderer 不直连 `ipcRenderer`、preload 不暴露通用 IPC、Nowcoder/VJudge 不走通用 DOM verdict observer。 | 真实站点接口是否变更。 |
| `npm run test:security` | 未忽略/待提交文件中的 `.env`、数据库、日志和高置信敏感明文模式。 | 已被系统忽略的本机私有文件内容。 |
| `npm run test:packaging` | electron-builder 白名单、敏感排除、NSIS x64、图标、asar、`better-sqlite3` unpack、构建脚本。 | 安装包真实安装、升级和卸载体验。 |
| `npm run test:adapters` | 七站 adapter、提交解析、表格解析、实时 payload 解析。 | 网站线上行为实时变化和登录态。 |
| `npm run test:submissions` | 提交 watcher、批量写入、诊断、同步服务、提交页上下文。 | 真实 OJ 网络风控。 |
| `npm run test:db` | migration、repository、去重写入、统计和临时 SQLite 读写。 | 用户真实数据库升级风险，需要发布前备份验收。 |
| `npm run test:electron` | Electron 主窗口、preload 和基础 IPC smoke。 | 长时间人工使用和多站登录态。 |
| `npm run test:ui` | 题库、统计、设置关键页面截图、布局边界和敏感文本扫描；统计页饼图/柱图绘制断言。 | 全部交互路径和真实数据组合。 |

最近一次全量自动验证：

- 日期：2026-07-04。
- 命令：`npm run test:all`。
- 结果：通过。
- 覆盖：typecheck、lint、architecture guard、security guard、IPC contract、AI 规则、用户脚本 metadata、browser、parser、integration、adapter、submissions、DB repository、docs、packaging、Electron startup smoke 和 renderer screenshot。
- 仍不覆盖：真实 OJ 登录态、七站正式提交、验证码/风控、安装包真实安装升级卸载和用户最终手测。

## 4. 模块文档证据

长期维护目录的文档入口由 `docs/README.md` 第 5、6 节维护。最低阅读规则：

- 主进程模块先读 `algo-electron/electron/README.md`，再进入对应子目录 README。
- Renderer 模块先读 `algo-electron/src/README.md`，再进入 `src/features/*/README.md` 或共享组件/Hook README。
- 测试模块先读 `algo-electron/tests/README.md`，再进入对应测试域 README。
- 站点适配或提交监测必须额外读 `docs/submission-monitoring-design.md` 和 `SITE_ADAPTER_GUIDE.md`。
- 发布、安装包或最终验收必须额外读 `docs/release-process.md` 和 `docs/final-acceptance-checklist.md`。

新增长期目录时必须同时满足：

- 目录内新增 `README.md`。
- README 至少说明职责、当前实现程度、关键封装入口或函数、边界规则和验证入口。
- `docs/README.md` 添加索引；长期 Markdown、ADR 和被覆盖目录 README 漏索引会导致 `npm run test:docs` 失败。
- 文档中新增具体 `npm run <script>` 时，该脚本必须存在于 `algo-electron/package.json`。
- 如果属于 `src`、`electron` 或 `tests` 子目录，或属于已纳入覆盖的协作/资源/ADR 目录，`npm run test:docs` 必须继续通过。

## 5. 剩余缺口

这些缺口不是结构巩固的继续拆分项，而是发布前或手测阶段必须完成的验收项：

- 七站真实提交监测仍需要用户按 `docs/final-acceptance-checklist.md` 复测。
- 复测结果建议填写到 `docs/manual-acceptance-report-template.md`，作为是否允许标记 `P8-009` 和 `P8-012` 的人工证据。
- 统计页、题目页、设置页和用户脚本仍需要人工交互验收，截图测试只覆盖关键静态布局。
- Windows 安装包的安装、升级、卸载和真实产物扫描仍按 `docs/release-process.md` 执行。
- 后续新增产物必须继续维护 `CHANGELOG.md` 和 `electron-builder.json5`，不能把当前配置视为永久完成。

## 6. 完成判定

项目巩固阶段可以交给用户统一验收的条件：

- `npm run test:all` 通过。
- `git diff --check` 无 trailing whitespace 或 conflict marker；仅 LF/CRLF 规范提示时记录为非阻塞。
- `docs/final-acceptance-checklist.md` 已作为唯一人工验收清单。
- `TASKS.md`、`AI_HANDOFF.md`、`docs/README.md`、`docs/project-hardening-audit.md` 和本文对剩余未完成项表述一致。

项目最终完成的条件：

- 上述自动验证通过。
- 用户完成最终手测清单且阻断问题已修复。
- 发布前任务 `P8-009` 和 `P8-012` 按真实产物和总验收结果更新。
