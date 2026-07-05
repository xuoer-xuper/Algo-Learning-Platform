# GitHub 协作配置

## 1. 职责

`.github/` 存放仓库级协作入口，包括 CI workflow、PR 模板和 issue 模板。这里的文件只约束协作和自动验证，不承载业务逻辑、站点适配规则或发布状态。

## 2. 当前内容

- `workflows/ci.yml`：在 pull request 和 `main`/`master` push 上运行 Windows CI。
- `pull_request_template.md`：PR 变更范围、边界确认、验证、手测和文档同步清单。
- `ISSUE_TEMPLATE/bug_report.yml`：普通应用缺陷模板。
- `ISSUE_TEMPLATE/submission_monitoring.yml`：提交监测专项问题模板。
- `ISSUE_TEMPLATE/config.yml`：关闭空白 issue。

## 3. 实现程度

当前 CI 使用 Windows runner、Node.js 22、`npm ci` 和 `npm run test:all`。它能覆盖 TypeScript、lint、IPC contract、adapter、submission、DB repository、Electron smoke 和 renderer screenshot 验证。

CI 不访问真实 OJ 登录态，不提交代码，不读取 Cookie，也不替代七站实时提交手测、站点风控验证或安装包安装/卸载验收。

## 4. 修改边界

- 新增 workflow 时优先复用 `algo-electron/package.json` 中的 `npm run test:*` 入口。
- 不在 workflow、issue 或 PR 模板中要求上传 Cookie、session、csrf token、用户源码、完整请求体、本机数据库内容或可复用登录态。
- 提交监测模板只能要求安全诊断文本、公开页面 URL 和最终表现。
- 发布相关自动化必须继续遵守 `docs/OPERATIONS/RELEASE_PROCESS.md`，不能绕过安装、升级、卸载和敏感文件检查。

## 5. 验证入口

本地等价验证：

```powershell
cd algo-electron
npm ci
npm run test:all
```

文档和模板改动后还应检查 Markdown 链接和 `git diff --check`。
