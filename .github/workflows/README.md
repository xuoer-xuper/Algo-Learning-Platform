# CI Workflow 说明

## 1. 职责

本目录存放 GitHub Actions workflow。当前只维护仓库级自动验证，不负责发布安装包、不上传产物，也不访问真实 OJ 登录态。

## 2. 当前 workflow

`ci.yml`：

- 触发条件：手动运行、pull request、push 到 `main` 或 `master`；同一分支的新提交会取消旧运行。
- 运行环境：`windows-latest`。
- Node 版本：22.23.2（项目支持范围为 `>=22.18.0 <25`）。
- 工作目录：`algo-electron/`。
- 最小权限：仅 `contents: read`。
- `validate`：`npm ci` + `npm run test:all`，覆盖测试、Electron smoke 和 Playwright。
- `packaged-main`：在 `validate` 通过后重新安装依赖，运行 `npm run build:check`，确认生产 renderer/main/preload 构建和 packaged-main 外部依赖契约。

## 3. 覆盖范围

`npm run test:all` 当前覆盖：

- TypeScript 类型检查。
- ESLint。
- IPC contract。
- adapter、submission、parser、browser、integration、AI 和用户脚本测试。
- Vitest V8 覆盖率基线。
- Electron 启动 smoke。
- SQLite repository 测试。
- Markdown 链接和 README 覆盖检查。
- Playwright Electron renderer 交互与 screenshot 验收。

`npm run build:check` 额外覆盖生产 renderer/main/preload 构建与 packaged-main 外部依赖检查，不生成安装包。

不覆盖：

- 七站真实提交。
- Cookie 持久登录态。
- 验证码、比赛限制或站点风控。
- Windows 安装包安装、升级、卸载。

## 4. 修改边界

- workflow 里不要打印环境变量、Cookie、请求体或本机路径中的敏感内容。
- 需要新增发布 workflow 前，先补 `docs/OPERATIONS/RELEASE_PROCESS.md` 的自动化边界，并明确是否需要人工安装验收。
- 不要把 `release/`、`tmp/`、本地数据库或 `.env` 上传为 artifact。
