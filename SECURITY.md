# 安全与隐私政策

## 1. 适用范围

Algo Learning Platform 是本地优先桌面应用。安全与隐私边界重点包括：

- Electron 主进程、Preload、IPC 和远程 OJ 页面隔离。
- SQLite 本地数据库、migration 和 repository 写入路径。
- 持久登录态、CookieVault、站点 session 和浏览器缓存。
- 提交监测 hook、站点 adapter、用户脚本注入和诊断面板。
- AI 上下文导出、AI 输出保存和本地学习数据摘要。
- 打包产物、日志、截图、导入导出文件和测试 fixture。

## 2. 请不要提交的内容

提交 issue、PR、日志、截图或复现材料时，禁止包含：

- Cookie、session、csrf token、Authorization header 或可复用登录态。
- 用户源码、完整请求体、本机数据库文件内容或完整日志。
- 含隐私的绝对路径、账号敏感信息、远程账号密码或验证码。
- 可绕过站点风控、验证码或权限限制的操作细节。

如果需要说明提交监测问题，使用安全摘要：站点、公开题目 URL、最终 verdict、语言、提交 ID、诊断面板中的红acted 文本即可。

## 3. 报告安全问题

如果问题会导致本地数据泄漏、Cookie 泄漏、任意文件读写、远程页面越权访问本地能力、打包产物包含敏感文件，或 AI/导出链路泄漏隐私，请按以下方式报告：

1. 使用私下渠道联系维护者，不要公开粘贴敏感材料。
2. 说明影响范围、复现步骤和受影响版本。
3. 只提供已脱敏的日志、截图或最小复现。
4. 等待确认后再公开细节。

当前仓库未配置公开安全邮箱时，请先通过项目维护者约定的私有渠道发送脱敏摘要。

## 4. 不属于安全报告的场景

以下问题优先按普通 bug 或提交监测 issue 处理：

- 某个 OJ 登录过期、验证码、站点风控或比赛权限导致无法提交。
- 站点改版导致题目识别、verdict、语言、提交 ID 或 sourceUrl 解析错误。
- 本地 UI 错位、统计图缺失、笔记保存失败或用户脚本匹配错误。
- 未包含敏感数据的测试失败、构建失败或打包失败。

提交监测问题使用 `.github/ISSUE_TEMPLATE/submission_monitoring.yml`。

## 5. 开发安全要求

- Renderer 不直接访问 SQLite、Cookie、文件系统或 Electron session。
- Preload 只暴露白名单 API，不暴露通用 `ipcRenderer`。
- 远程 OJ 页面只能通过受控 bridge 上报有限 payload，不允许访问 Node、本地数据库或任意 IPC。
- Nowcoder、VJudge 等高风险站点不能使用通用 DOM verdict observer 作为实时入库来源。
- 数据库 schema 变化必须有 migration，并同步 `DATABASE_SCHEMA.md` 和 `docs/database-migration-rollback.md`。
- Cookie、用户源码、完整请求体和可复用登录态不得进入日志、文档、测试 fixture、截图或 CI artifact。
- 打包产物不得包含 `tests/`、`tmp/`、`release/`、`.env`、本地数据库或 Cookie。

## 6. 验证入口

本地自动验证：

```powershell
cd algo-electron
npm run test:security
npm run test:all
```

`test:security` 检查 tracked 和未忽略的新增文件中是否存在 `.env`、本地数据库、日志文件，以及高置信 Cookie/header/token 明文模式。它不能替代人工安全审查和安装包内容验收。

提交监测、真实 OJ 登录态和安装包流程必须按 `docs/release-process.md` 人工验收。CI 不访问真实站点登录态，也不替代人工安全验收。
