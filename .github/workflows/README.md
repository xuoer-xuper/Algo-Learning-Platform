# CI Workflow 说明

## 1. 职责

本目录存放 GitHub Actions workflow。当前只维护仓库级自动验证，不负责发布安装包、不上传产物，也不访问真实 OJ 登录态。

## 2. 当前 workflow

`ci.yml`：

- 触发条件：手动运行、pull request、push 到 `main` 或 `master`；同一分支的新提交会取消旧运行。默认自动路径并行运行 `fast-guard` 与 `renderer-smoke`，全量和 packaged job 仅手动运行。
- 运行环境：`windows-latest`。
- Node 版本：22.23.2（项目支持范围为 `>=22.18.0 <25`）。
- 工作目录：`algo-electron/`。
- 最小权限：仅 `contents: read`。
- 安全边界：checkout 不保留 Git 凭据；CI 不接收业务 secret，不上传 artifact。
- 缓存：`setup-node` 缓存 npm 下载，`actions/cache` 缓存公开的 Electron 与 electron-builder 工具下载；不缓存 `node_modules`、构建产物或用户数据。
- `fast-guard`：每次 pull request、`main`/`master` push 和手动运行都会执行；`npm ci` + `npm run test:core` + `npm run test:docs`，覆盖类型、lint、架构/敏感文件、核心 Vitest、组件治理和文档守卫。
- `renderer-smoke`：每次 pull request、`main`/`master` push 和手动运行都会执行；使用真实 Electron 跑 startup smoke 与 Playwright renderer 交互/截图，覆盖壳协议、preload、内部标签流程、TabStrip pointer 排序和三档原生 viewport。
- `validate`：仅 `workflow_dispatch` 手动运行；执行 `npm run test:all`，覆盖测试、Electron smoke 和 Playwright。
- `packaged-smoke`：仅 `workflow_dispatch` 手动运行；与 `validate` 并行，运行生产 renderer/main/preload 构建与 packaged-main 外部依赖检查，再生成 Windows `win-unpacked` 目录并执行隔离 userData 的真实进程 smoke。

四个 job 各自执行干净的 `npm ci`，不通过 artifact 传递 `node_modules`、`dist/`、`release/` 或测试临时目录。默认 push/PR 自动覆盖核心与真实 renderer smoke；准备集中验收时在 Actions 页面手动运行 workflow，才额外启动 full validation 与 packaged smoke。

手动集中验证：

```text
gh workflow run ci.yml --ref master
```

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

`packaged-smoke` 在 `build:check` 后使用 electron-builder 的 `--dir` 模式，只生成供 CI 启动验证的 `win-unpacked`，不生成或上传 NSIS 安装包。`npm run test:packaged-app` 使用系统临时目录中的隔离 userData、本地 HTTP smoke 页面和 SQLite，结束后清理临时目录。

不覆盖：

- 七站真实提交。
- Cookie 持久登录态。
- 验证码、比赛限制或站点风控。
- Windows 安装包安装、升级、卸载。

## 4. 修改边界

- workflow 里不要打印环境变量、Cookie、请求体或本机路径中的敏感内容。
- 需要新增发布 workflow 前，先补 `docs/OPERATIONS/RELEASE_PROCESS.md` 的自动化边界，并明确是否需要人工安装验收。
- 不要把 `release/`、`tmp/`、本地数据库或 `.env` 上传为 artifact。
- 不要缓存 `node_modules`、`dist/`、`release/`、`tmp/`、数据库、日志或任何登录态；当前缓存 key 只依赖 lockfile，缓存内容只限公开工具下载。
