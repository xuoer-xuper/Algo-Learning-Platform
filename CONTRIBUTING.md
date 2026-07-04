# 贡献指南

## 1. 开始前

先从 [docs/README.md](docs/README.md) 进入文档体系，再按任务类型阅读对应文档。最低必读：

- [PROJECT_RULES.md](PROJECT_RULES.md)：最高开发规则、技术栈和隐私边界。
- [TASKS.md](TASKS.md)：唯一任务状态源。
- [AI_HANDOFF.md](AI_HANDOFF.md)：当前交接现场、风险和验证记录。
- [ARCHITECTURE.md](ARCHITECTURE.md)：进程、模块、IPC、浏览器和数据流边界。
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)：SQLite schema、migration 和数据约束。
- [COMMIT_RULES.md](COMMIT_RULES.md)：中文提交规范。
- [SECURITY.md](SECURITY.md)：安全与隐私报告边界。

涉及站点、提交监测或实时 hook 时，还必须阅读 [SITE_ADAPTER_GUIDE.md](SITE_ADAPTER_GUIDE.md) 和 [submission-monitoring-design.md](docs/submission-monitoring-design.md)。

## 2. 本地开发

```powershell
cd algo-electron
npm install
npm run dev
```

常用验证：

```powershell
npm run typecheck
npm run test:core
npm run test:architecture
npm run test:security
npm run test:docs
npm run test:packaging
```

提交前或发布前验证：

```powershell
npm run test:all
```

`test:all` 不覆盖真实 OJ 登录态、七站正式提交、验证码、站点风控或安装包安装/卸载流程；这些必须按 [final-acceptance-checklist.md](docs/final-acceptance-checklist.md) 手测。发布安装包前还必须按 [release-process.md](docs/release-process.md) 执行版本、changelog、打包、产物检查和交接流程。

## 3. 修改边界

- 不要把业务逻辑堆回 `electron/main.ts`、renderer 大组件或通用 DOM 抓取脚本。
- Renderer 只通过 `window.electronAPI` 访问本地能力，不直接访问 SQLite、Cookie、文件系统或 Electron session。
- 数据库 schema 变化必须新增 migration，并同步 [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) 和 [database-migration-rollback.md](docs/database-migration-rollback.md)。
- IPC/Preload API 变化必须同步 `electron/preload.ts`、`electron/electron-env.d.ts`、renderer helper、IPC contract 测试和相关 README。
- Nowcoder、VJudge 等高风险站点不能重新使用通用 DOM verdict observer 作为实时入库来源。
- 不要为了行数继续机械拆分已手测稳定的提交监测 hook、站点 scraper 或契约型类型文件。

## 4. 隐私与安全

禁止在代码、日志、文档、测试快照或 issue/PR 描述中记录：

- Cookie、session、csrf token 或可复用登录态。
- 用户源码、完整请求体或本机数据库文件内容。
- 绝对隐私路径、账号敏感信息或站点风控绕过细节。

导出站点配置、测试数据和截图时也必须遵守该边界。

如果问题可能导致本地数据、Cookie、可复用登录态、任意文件读写或远程页面越权访问本地能力泄漏，按 [SECURITY.md](SECURITY.md) 处理，不要公开粘贴敏感材料。

## 5. 格式约束

仓库使用 `.editorconfig` 和 `.gitattributes` 固定基础格式：

- 默认 UTF-8、2 空格缩进、LF、末尾换行。
- Windows 脚本（`.bat`、`.cmd`、`.ps1`）使用 CRLF。
- 图片、图标、PDF、压缩包和 SQLite 数据文件按 binary 处理。
- Markdown 不强制裁剪行尾空格，避免破坏显式换行。

不要在一个 PR 中只因为换行或格式工具重写大量无关文件。

## 6. PR 检查清单

仓库提供 `.github/pull_request_template.md`。提交 PR 时按模板填写变更范围、边界确认、验证、手测和文档同步。
维护 CI、PR 模板或 issue 模板前，先阅读 [.github/README.md](.github/README.md)。

- 变更范围和任务编号清楚。
- 已运行与变更相关的 `npm run test:*`。
- 涉及提交监测时已追加 adapter/submissions 测试，并说明需要用户手测的站点。
- 涉及 UI 时已运行 `npm run test:ui` 或说明无法运行的原因。
- 涉及数据库、IPC、Cookie、站点 adapter、AI 输出或打包配置时，相关文档已同步。
- `TASKS.md` 和 `AI_HANDOFF.md` 已记录完成内容、验证结果、风险和下一步。
- 提交信息符合中文 Conventional Commits 风格。

## 7. Issue 模板

仓库提供两类 issue 模板：

- 普通缺陷：`.github/ISSUE_TEMPLATE/bug_report.yml`。
- 提交监测问题：`.github/ISSUE_TEMPLATE/submission_monitoring.yml`。

提交站点监测问题时，优先填写站点、页面 URL、动作类型、预期结果、实际结果和安全诊断文本。不要上传 Cookie、用户源码、完整请求体或可复用登录态。
