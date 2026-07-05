# CI Workflow 说明

## 1. 职责

本目录存放 GitHub Actions workflow。当前只维护仓库级自动验证，不负责发布安装包、不上传产物，也不访问真实 OJ 登录态。

## 2. 当前 workflow

`ci.yml`：

- 触发条件：pull request、push 到 `main` 或 `master`。
- 运行环境：`windows-latest`。
- Node 版本：22。
- 工作目录：`algo-electron/`。
- 安装方式：`npm ci`。
- 验证命令：`npm run test:all`。

## 3. 覆盖范围

`npm run test:all` 当前覆盖：

- TypeScript 类型检查。
- ESLint。
- IPC contract。
- adapter、submission、parser、browser、integration、AI 和用户脚本测试。
- Electron 启动 smoke。
- SQLite repository 测试。
- Markdown 链接和 README 覆盖检查。
- Renderer screenshot 验收。

不覆盖：

- 七站真实提交。
- Cookie 持久登录态。
- 验证码、比赛限制或站点风控。
- Windows 安装包安装、升级、卸载。

## 4. 修改边界

- workflow 里不要打印环境变量、Cookie、请求体或本机路径中的敏感内容。
- 需要新增发布 workflow 前，先补 `docs/OPERATIONS/RELEASE_PROCESS.md` 的自动化边界，并明确是否需要人工安装验收。
- 不要把 `release/`、`tmp/`、本地数据库或 `.env` 上传为 artifact。
