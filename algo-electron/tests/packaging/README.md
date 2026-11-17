# Packaging Tests 说明

## 1. 职责

`tests/packaging/` 存放打包配置、主进程产物检查和隔离 Windows 安装验收脚本。它不生成安装包；普通检查验证 `electron-builder.json5`、`package.json` 和已构建的 `dist-electron/main.js`，隔离验收则使用已经生成且核对过身份的两个 NSIS 安装包。

## 2. 当前检查

`check-packaging.mjs` 当前覆盖：

- `asar` 开启。
- 打包入口只包含 `dist/`、`dist-electron/` 和 `package.json`。
- 排除日志、本地数据库、`.env`、`tmp/`、`tests/` 和 `release/`。
- `better-sqlite3` 的 `prebuilds/`、`build/Release/` 和 `bin/` 原生 `.node` 文件通过 `asarUnpack` 解包。
- `electronFuses` 固定生产安全基线：禁用 `runAsNode`、`NODE_OPTIONS` 和 Node inspect 参数，启用 Cookie 加密、ASAR 完整性校验与 `onlyLoadAppFromAsar`，并关闭 `grantFileProtocolExtraPrivileges`。
- Windows 目标为 NSIS x64，并使用 `build/icon.ico`。
- NSIS 卸载不删除用户数据。
- provider 固定仓库，所有 build 显式 `--publish never`；准备/发行配置分离，发行不 bump/commit/改 CHANGELOG/绕过 hook。
- `releaseTooling.test.ts` 注入假的 Git/GitHub/构建 runner 和合成 ASAR/资产，验证缺资产、版本/hash/merge 不符、脏 untracked、远程失败及部分上传均停止，草稿验证后仍需单独公开授权。测试不调用真实发布命令。
- `postinstall` 先装 Electron 二进制再重建 native 依赖，`build` / `build:win` 保持标准命令且在 `electron-builder` 之前先跑 `test:packaged-main`（只断言顺序，不钉死包管理器写法）。
- `pnpm-workspace.yaml` 保持 `nodeLinker: hoisted`、`shamefullyHoist: true` 和 `allowBuilds` 白名单：pnpm 12 只从这里读项目设置，缺条目会以 `ERR_PNPM_IGNORED_BUILDS` 直接安装失败而不是警告。
- Vite 8 主进程产物保持 `better-sqlite3` 为运行时 external，不内联依赖 `__dirname` 的 native loader。
- Windows `win-unpacked` 使用隔离的临时 `userData` 启动，确认主窗口、preload、SQLite 和迁移可以工作。
- 同一隔离 `userData` 下真实启动第二个 `win-unpacked` 进程，确认失败实例快速退出、主实例保持运行并恢复聚焦，且失败实例不写共享日志。
- `checkPackagedApp.mjs` 使用 `@electron/fuses` 读取真实 executable，而不是只信任 JSON5 配置；这一步用于发现打包工具或缓存导致的 fuse 漂移。

## 3. 验证入口

```powershell
cd algo-electron
pnpm run test:packaging
pnpm run test:release
pnpm run test:packaged-main
pnpm run test:packaged-app
```

`test:packaged-app` 需要先生成 `release/${version}/win-unpacked`。网络不可用时，可使用仓库中版本匹配的 `node_modules/electron/dist` 作为 `--config.electronDist` 做离线构建，但仍必须读取真实 executable 并完成双实例 smoke。

发布前使用：

```powershell
pnpm run test:all
pnpm run build:win
```

## 4. 维护边界

- 新增打包资源、原生依赖或输出目录时，同步 `electron-builder.json5`、`docs/OPERATIONS/RELEASE_PROCESS.md` 和本检查。
- 不把 Cookie、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态纳入打包输入。
- `test:packaged-main` 必须在 `vite build` 后运行；静态检查不能替代真实安装、升级、卸载和产物解包验收。
- 发行守卫单测不算 NSIS 隔离验收，也不等于生产上传已验证。操作顺序及证据契约见 `docs/OPERATIONS/RELEASE_PROCESS.md`；发行保持暂停。
- `test:packaged-app` 的双实例检查必须共用临时 `userData`，并在任一断言失败时释放 HTTP gate、终止残留进程后再删除临时目录。

## 5. 隔离 Windows 安装验收

`sandbox-upgrade-guest.ps1` 支持默认的 `Sandbox` 和显式的 `GitHubActions` 两种隔离环境，不能在普通宿主或 self-hosted runner 执行。两种模式都使用真实默认 profile/install 路径，要求全新工作目录和空输出目录，核对六文件输入；不会重定向 APPDATA、使用 smoke 参数、下载依赖、更改安全策略或主动启动 Sandbox。`sandbox-upgrade-data.mjs` 使用独立 Node 22.18+ 的 `node:sqlite` 读写关闭后的合成 guest 数据，不导入应用迁移或 bootstrap，也不接受数据库路径参数。

`Sandbox` 模式仅由新建 Windows Sandbox 的 LogonCommand 执行，核对 `WDAGUtilityAccount` 与固定 guest 路径，拒绝任何 `InputRoot/OutputRoot` 参数，包括填写默认值的情况。`GitHubActions` 模式的严格入口见下文；它不解除或绕过 Sandbox 的应用控制策略。

主会话串行执行完整测试与 `build:win` 后，固定源码快照及三个发行资产的哈希，再准备一对全新宿主目录。只将以下六个文件放入只读输入目录，映射到 `C:\ReleaseTestInput`；空的专用输出目录映射到 `C:\ReleaseTestOutput`。仓库、宿主 profile 和登录态均不映射。

| 文件                                               | 来源与核对                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AlgoLearningPlatform-Windows-2.0.0-x64-Setup.exe` | 已发布 2.0.0；121203039 bytes；SHA256 `5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc` |
| `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe` | 本次候选构建，大小及 SHA256 写入 manifest                                                                |
| `node.exe`                                         | 独立 Node 22.18+，不能复制 Volta/Corepack shim                                                           |
| `sandbox-upgrade-guest.ps1`                        | 本目录脚本原字节                                                                                         |
| `sandbox-upgrade-data.mjs`                         | 本目录 helper 原字节                                                                                     |
| `input-manifest.json`                              | 下列严格字段，无额外字段                                                                                 |

Manifest 使用 UTF-8 JSON，哈希均为小写 SHA256：

```json
{
  "formatVersion": 1,
  "sourceSha": "<40 位 HEAD SHA>",
  "sourceTreeSha256": "<64 位源码快照 SHA256>",
  "sourceDirty": true,
  "candidateSize": 123456789,
  "candidateSha256": "<安装包 SHA256>",
  "candidateAsarSha256": "<win-unpacked/resources/app.asar SHA256>",
  "nodeSha256": "<独立 node.exe SHA256>",
  "guestScriptSha256": "<sandbox-upgrade-guest.ps1 SHA256>",
  "fixtureHelperSha256": "<sandbox-upgrade-data.mjs SHA256>"
}
```

宿主源码快照须覆盖 Git tracked 以及未忽略的 untracked 文件；记录相对路径、存在文件的大小和 SHA256、已删除文件的 `null`，排序并哈希保存在宿主的 JSON。`sourceDirty` 必须按包含 untracked 的真实状态填写。构建前后重新生成快照并比较；构建时仍有未提交改动的记录只能作为工程验证，不能填成最终 master 发行验收。guest 会核对安装后的 ASAR 与 manifest，但无法独立证明宿主源码到安装包的构建过程。

`.wsb` 禁用 Networking、ClipboardRedirection、AudioInput、VideoInput 和 PrinterRedirection，保持输入 `ReadOnly=true`、输出 `ReadOnly=false`。LogonCommand 为：

```text
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File C:\ReleaseTestInput\sandbox-upgrade-guest.ps1
```

脚本按步骤安装并启动真正的 2.0.0，确认 schema 29 后写入合成题目/提交/笔记/图片/停用脚本/BLOB/不透明密文样本，再通过候选 NSIS 升级、验证 schema 30 和原始配置保护。随后验证新数据重启保留、受控 `keep-current`、实际卸载留数据和重装。恢复情景只把真实完成 checkpoint 的 `completed` 改为 `prepared`，明确不冒称真实进程崩溃；真实强制终止矩阵仍由 `tests/db/migrationInterruption.test.ts` 独立覆盖。

### GitHub 托管 Windows runner

CI 使用全新的 GitHub 托管 Windows x64 runner，完成 clean checkout 和本 run 的候选构建后，在 `algo-electron/` 执行：

```text
node tests/packaging/prepare-installer-acceptance.mjs
```

准备器固定 Node 22.23.2，校验 `GITHUB_ACTIONS=true`、`RUNNER_ENVIRONMENT=github-hosted`、Windows、仓库、run ID/attempt、当前干净 HEAD 与 `GITHUB_SHA`；下载并校验已发布基线，核对当前候选三资产及 ASAR。它创建 `RUNNER_TEMP/algo-installer-<random>/input` 和空 `output`，保留 `work` 尚不存在，再生成同一六文件 manifest。通过 `GITHUB_OUTPUT` 返回 `inputDirectory`、`outputDirectory`、`runDirectory`。源码快照在准备前后保持一致；该检查不冒称记录了构建前快照。`engineering-build.json` 的状态为 `prepared`，仅说明输入准备完成。

workflow 使用返回路径，运行输入目录中的原字节脚本：

```text
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "<inputDirectory>\sandbox-upgrade-guest.ps1" -Environment GitHubActions -InputRoot "<inputDirectory>" -OutputRoot "<outputDirectory>"
```

guest 和 helper 核对真实 Windows 用户主目录、标准 `AppData/Roaming` 与 `AppData/Local`，拒绝环境变量重定向。input/output/work 必须同属 `RUNNER_TEMP` 下直接子目录 `algo-installer-<random>`，路径不可穿越、使用 UNC/device 路径或链接；既存 profile、安装、work、非空 output 均拒绝。owner 记录绑定当前用户、profile/work、随机运行 ID 和 GitHub run/attempt/repository/SHA，helper 每次操作重新核对。NSIS 仍只使用 `/S /currentuser` 和默认安装路径。manifest 要求 `sourceDirty=false`、`sourceSha=GITHUB_SHA`，report 同时记录执行环境和 run 身份。

该模式执行同一26步安装生命周期，不改变 runner 的安全或网络策略。环境身份检查是防误用守卫，不是可信平台远程证明。`installerAcceptanceGuards.test.ts` 覆盖环境/身份/路径重定向/链接及 CLI 提前拒绝；它不能代替真实 NSIS 运行。

进程启动器仅对空值或含空白的参数加引号；NSIS 读取原始命令行，`"/S"` 不会启用静默模式，`/S /currentuser` 必须保留原样。回归使用 AST 提取的真实 PowerShell 启动器和 Node 子进程，核对原始命令行、含空格/制表符/空值参数边界，以及认证变量过滤。一次性无安装 NSIS 探针在 `.onInit` 内读取 `IfSilent`/`GetOptions` 后立即退出，已复现修复前后差异；安装/卸载180秒超时与失败退出语义不变。

每步更新 `report.json`，输出各阶段日志、helper 断言和仅合成的 profile 证据。宿主或 CI 读取最终 `status` 与 `finishedAt`，不能将 WindowsSandbox 进程的存活/退出或准备器的成功直接当成 guest 成功。脚本返回 `0/passed`、`1/failed` 或 `2/passed-with-limitations`；若恢复对话框只能强制结束，缺失自然关闭及退出码验收会明确记录，不能将 `passed-with-limitations` 等同于全部验收通过。失败后保留已允许的证据，用新的 Sandbox 或新的 hosted runner 和目录重跑，不覆盖前次输出。

这些样本证明本次安装生命周期中的数据保留，不证明真实账号的解密/登录、七站提交、同步、核心页面人工导航或完整 profile 回滚。Sandbox 的原始输出只留本地；CI 仅上传 `report.json`、`input-manifest.json`、`engineering-build.json` 三份摘要作为 workflow artifact，不上传原始合成 profile、数据库、日志、源码快照或安装资产。工程验证不等于最终 master 发行验收；任何测试证据均不纳入 Release 资产。
