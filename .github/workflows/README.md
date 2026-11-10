# CI Workflow 说明

## 1. 职责

本目录存放 GitHub Actions workflow。负责自动验证和显式启动的隔离安装验收，不发布安装包，也不访问真实 OJ 登录态。安装验收只保留三个含合成测试状态、版本、哈希和步骤结果的 JSON 摘要，不上传安装器、数据库、配置、日志或用户目录。

## 2. 当前 workflow

`ci.yml`：

- 触发条件：手动运行、pull request、push 到 `dev` 或 `master`；同一分支的新提交会取消旧运行。默认自动路径并行运行 `fast-guard` 与 `renderer-smoke`，全量、packaged 和安装验收 job 仅手动运行。
- 运行环境：`windows-latest`。
- Node 版本：22.23.2（项目支持范围为 `>=22.18.0 <25`）。
- 工作目录：`algo-electron/`。
- 最小权限：仅 `contents: read`。
- 安全边界：checkout 不保留 Git 凭据；CI 不接收业务 secret。仅安装输入准备步骤接收只读 GitHub token 下载已发布基线，实际应用运行不继承该 token。
- 缓存：`setup-node` 缓存 pnpm 下载，`actions/cache` 缓存公开的 Electron 与 electron-builder 工具下载；不缓存 `node_modules`、构建产物或用户数据。
- `fast-guard`：每次 pull request、`dev`/`master` push 和手动运行都会执行；冻结依赖安装后执行核心、打包及文档检查，覆盖类型、lint、架构/敏感文件、Vitest、组件治理和文档守卫。
- `renderer-smoke`：每次 pull request、`dev`/`master` push 和手动运行都会执行；使用真实 Electron 跑 startup smoke 与 Playwright renderer 交互/截图，覆盖壳协议、preload、内部标签流程、TabStrip pointer 排序和三档原生 viewport。
- `validate`：默认手动运行执行 `pnpm run test:all`，覆盖测试、Electron smoke 和 Playwright。
- `packaged-smoke`：默认手动运行，与 `validate` 在各自的虚拟机并行，生成 Windows `win-unpacked` 并执行隔离 userData 的真实进程 smoke。
- `installer-acceptance`：手动选择 `installer_acceptance=true`，待 fast/renderer 两个检查通过后，在独立全新 GitHub-hosted Windows VM 构建 NSIS，执行已发布 2.0.0 → 当前候选的实际安装、升级、受控恢复、卸载保留数据和重装。此选择跳过同轮额外的 validate/packaged job；不代替完整 test:all。

各 job 在独立临时 VM 执行 `pnpm install --frozen-lockfile`，不通过 artifact 传递 `node_modules`、`dist/`、`release/` 或测试临时目录。默认 push/PR 自动覆盖核心与真实 renderer smoke；手动运行可选择完整自动门或实际安装生命周期验收。

手动集中验证：

```text
gh workflow run ci.yml --ref master
```

对审查中的候选分支执行隔离安装验收：

```text
gh workflow run ci.yml --ref <候选分支> -f installer_acceptance=true
```

使用固定 Node 22.23.2 和当前干净提交，核对发布基线大小/哈希、构建候选三资产及 ASAR 身份。
输入脚本和 helper 仅允许 Sandbox 默认账户或显式的 GitHub-hosted 模式；后者限定本次
RUNNER_TEMP 独占目录及真实默认 profile/current-user 安装位置，不通过修改 APPDATA 隔离。
profile 或安装目录预先存在即失败。每轮 VM 用完销毁；不关闭宿主或 Sandbox 的应用控制策略。
三个 JSON 摘要作为 Actions artifact 保留 14 天，包含来源 SHA 和资产哈希，不构成公开 Release。
出现 passed-with-limitations 仍不能算全部安装门通过；真实账号和七站人工门另行验收。

## 3. 覆盖范围

`pnpm run test:all` 当前覆盖：

- TypeScript 类型检查。
- ESLint。
- IPC contract。
- adapter、submission、parser、browser、integration、AI 和用户脚本测试。
- Vitest V8 覆盖率基线。
- Electron 启动 smoke。
- SQLite repository 测试。
- Markdown 链接和 README 覆盖检查。
- Playwright Electron renderer 交互与 screenshot 验收。

`pnpm run build:check` 额外覆盖生产 renderer/main/preload 构建与 packaged-main 外部依赖检查，不生成安装包。

`packaged-smoke` 使用 `--dir --publish never` 生成 `win-unpacked`；`installer-acceptance` 使用 `build:win` 生成并在同一临时 VM 安装 NSIS；两条路径均禁止上传发行。`pnpm run test:packaged-app` 使用系统临时目录中的隔离 userData、本地 HTTP smoke 页面和 SQLite，结束后清理临时目录。

不覆盖：

- 七站真实提交。
- Cookie 持久登录态。
- 验证码、比赛限制或站点风控。
- 默认 push/PR 不执行 Windows 安装包安装、升级、卸载；这些由显式 installer-acceptance job 覆盖。

## 4. 修改边界

- workflow 里不要打印环境变量、Cookie、请求体或本机路径中的敏感内容。
- 需要新增发布 workflow 前，先补 `docs/OPERATIONS/RELEASE_PROCESS.md` 的自动化边界，并明确是否需要人工安装验收。
- 不要把 `release/`、`tmp/`、数据库、配置、日志或 `.env` 整体上传为 artifact。唯一例外是安装 job 明确列出的 report.json、input-manifest.json、engineering-build.json 三个合成测试摘要；必须审核内容，不使用目录通配上传。
- 不要缓存 `node_modules`、`dist/`、`release/`、`tmp/`、数据库、日志或任何登录态；当前缓存 key 只依赖 lockfile，缓存内容只限公开工具下载。
