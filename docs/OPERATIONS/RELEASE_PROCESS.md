# 发布流程

## 1. 职责与当前状态

本文定义 Windows 发行的源码、验证、打包、安装升级和公开发布门。**2.0.1 仍是候选，公开发行仍暂停。**
实现工具、通过单测或完成构建都不是恢复发行授权；必须消除验收阻塞，再由维护者明确同意继续。

发行分两阶段：PR 分支准备版本和评审后的 CHANGELOG；已验收的 `dev -> master` 合并提交只打
annotated tag，不修改源码。上传草稿、下载核对、公开发布是第二阶段中独立操作。
`pnpm release` 和默认 `.release-it.json` 拒绝执行并提示流程，不再自动 bump/commit/tag/upload。

打包时不得临时变更 schema、IPC、Cookie 策略或站点 hook；先回对应模块补代码、测试和文档。
禁止将 Cookie、session、csrf、用户源码、请求体、本机数据库、`.env`、密钥或可复用登录态写入发布资产、说明或日志。

## 2. 源码与版本准备

1. 核对实际已发布稳定基线 `v2.0.0` / `d2d2b0c6b758e1936b00aa602ea172dbb848b065`。
2. 通过保留祖先关系的同步 PR 将稳定版修复与 `dev` 集成；这次分支同步不能 squash。
3. 在干净的专用 PR 分支准备候选元数据，不能在 `master` 或 `dev` 自动准备。
4. 审核相对实际稳定版的变化、支持升级来源与导出契约，正常提交、测试、评审并合入 `dev`。
5. `dev -> master` 使用 no-ff PR 合并；记录 merge SHA、第一父提交（旧 master）、第二父提交
   （验收的 dev）及 PR 号。tag 必须落在该 merge，不是后加的 release commit。

在 `algo-electron/` 中，且确认准备操作获准后：

```powershell
pnpm install --frozen-lockfile
pnpm run release:prepare --version 2.0.1
```

`.release-it.prepare.json` 保持 npm 读取 package 版本，允许当前已是 2.0.1，不发布 npm、不提交、
不打 tag、不 push、不创建 Release。CHANGELOG 生成范围显式绑定 `v2.0.0`，不能使用
`git describe` 得到的旧 RC。生成后**人工审阅** `docs/PRODUCT/CHANGELOG.md`，保留已发布历史，
不要把旧“未发布”段里已经发布的修复再次算作新增。生成器不代表语义审查通过。

版本唯一来源是 `algo-electron/package.json`；只维护 `pnpm-lock.yaml`，没有 package-lock.json
顶层版本同步步骤。本轮工具有意锁定 2.0.1 / v2.0.0；GitHub 最新稳定版不再是 v2.0.0 时拒绝。
下一次发行须评审并更新 `scripts/release-guards.mjs` 的 VERSION/BASELINE、准备配置与相应测试，
不能改版本绕过未解决的失败。范围不符合 patch 时报告并重新确认范围/版本，不能擅自升 major。

迁移与导出边界必须可见：学习数据 JSON、AI 上下文 JSON、站点配置均输出各自的 v2 格式，
时间点使用 Unix 毫秒；学习数据和站点配置仍接受 v1/v2 导入。2.0.0 与仅支持 v1 的外部
解析器不能直接消费新 v2 文件。成功使用后优先向前修复。无法任意无损降级不自动要求
major，版本标签也不能代替数据保护验收。

## 3. 最终源码与构建证据

发行工作区必须是真正的 `master`，跟踪正确仓库的 `origin/master`。worktree 无法检出被占用的
master 时，维护者使用独立干净 clone；不要重置或删除其他 worktree。
守卫执行包含 untracked 的 `git status --porcelain=v1 --untracked-files=all`，刷新 origin/master，
再次远程核对及检查两个父提交。release-it 内置 clean 检查忽略 untracked，不能单独代替这个门。

使用固定 Node/pnpm 与 `pnpm install --frozen-lockfile`。postinstall 下载 Electron 并重建
better-sqlite3；不能跳过、借用另一分支 node_modules 或并行运行 native/UI/build 任务。
正常 Husky hooks 必须启用；禁止 `HUSKY=0`、`--no-verify` 或禁用 core.hooksPath。

将以下 JSON 放到忽略目录 `algo-electron/tmp/release-acceptance/identity.json`。SHA 均为完整
小写 40 位，CHANGELOG 为评审后**完整文件原字节**的 SHA256；占位文字不是有效输入：

```json
{
  "version": "2.0.1",
  "masterSha": "<accepted merge SHA>",
  "sourceSha": "<second parent, accepted dev SHA>",
  "targetSha": "<first parent, previous master SHA>",
  "changelogSha256": "<64 lowercase hex digits>"
}
```

```powershell
Get-FileHash ../docs/PRODUCT/CHANGELOG.md -Algorithm SHA256
pnpm run release:build --identity tmp/release-acceptance/identity.json
```

`release:build` 检查源码和远程无目标 tag/Release，串行执行 `pnpm test:all`、`pnpm build:win`，
通过后复核源码，再生成 `tmp/release-acceptance/build.json`。记录源码身份、命令、两个自动门日志
大小/SHA256、三件资产大小/SHA256、app.asar SHA256。失败不产生 passed build.json，保留失败
日志和产物，先诊断再决定后续；已有输出目录或旧证据会阻止重建，建议使用新 clone。

普通 `pnpm build` / `pnpm build:win` 也明确传 `electron-builder --publish never`，即使 token/CI
存在也不上传。GitHub provider 固定为 `xuoer-xuper/Algo-Learning-Platform`，使 builder 生成
`latest.yml`。**元数据生成不是自动更新功能，项目未集成 electron-updater。**

`test:all` 不能证明真实七站登录/正式提交或 NSIS 安装升级卸载，以下人工门仍必须完成。

## 4. 产物与隔离安装验收

只接受 `release/2.0.1/` 中这三个确切的非空文件，不使用通配符上传，不复用其他分支的 installer：

- `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe`
- `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe.blockmap`
- `latest.yml`

守卫用 YAML 解析器拒绝重复键，核对 version、唯一 files 条目、path/url、size、SHA512（两个位置）；
核对 installer 与 win-unpacked executable 的 Windows 版本资源、app.asar/package.json 的
name/version/main，资产与 asar 必须匹配 build.json 哈希。其他 exe/blockmap/YAML 资产拒绝
（builder-debug.yml、builder-effective-config.yaml 是非上传诊断例外）。

真实打包程序检查和安装验收分开记录：

- appId `com.algo.learning`、产品 `AlgoLearningPlatform`、NSIS x64、生产 userData 身份不变。
- 白名单仅 renderer/main 构建、package.json、生产依赖，排除 tests/tmp/release、数据库、日志和 `.env`。
- better-sqlite3 native 可加载。真实 executable 的 fuses 由 `test:packaged-app` 验证：runAsNode、
  NodeOptions、CLI inspect、file 特权关闭，Cookie 加密、ASAR integrity、onlyLoadAppFromAsar 开启。
- win-unpacked 用隔离临时 userData 验证真实启动、迁移及双实例；失败实例不写共享日志。
- **NSIS 必须在可用 Windows VM/Sandbox 或专用隔离账户验收**：全新安装、从 2.0.0 升级、
  启动与数据保留、失败/中断恢复、卸载保留数据、重装。仅发现 WindowsSandbox.exe 不算完成。

NSIS `/D=<temp>` 或改变 APPDATA 不是隔离，仍会写真实产品注册表与快捷方式；不得在维护者
真实 profile 偷跑安装器。隔离环境不可用时保持阻塞，不能用 win-unpacked 冒烟代替。

现有 CI 可显式执行 `gh workflow run ci.yml --ref <候选分支> -f installer_acceptance=true`，
在全新的 GitHub-hosted Windows VM 构建并跑实际 NSIS 生命周期。默认 push/PR 不运行安装器。
该 job 核对已发布2.0.0的确切哈希、当前干净 SHA 与候选资产，使用真实默认 profile 和
current-user 安装位置；仅接受 RUNNER_TEMP 内独占输入目录，拒绝复用已有 profile/安装目录。
只读下载 token 不传给实际应用。三个合成验收 JSON 摘要在 Actions 保留14天，安装包、
数据库、配置、日志及 profile 不上传。失败或 passed-with-limitations 保留未完成项，
不改应用控制策略。候选分支的运行不能直接替代接受 master merge SHA 的最终发行证据。

用有来源标记的合成数据验证题目、提交、笔记/图片、配置、脚本、密文保留与读取；固定 schema29
fixture 与已发布2.0.0结构相同不等于真实用户原库。测试不得读取或上传实际登录态。
SQLite 恢复点及学习 JSON 都不是完整 profile 备份。先保留当前状态，旧恢复点不含后续新增数据。
按 [数据库恢复说明](DATABASE_MIGRATION_ROLLBACK.md) 演练，不以删 marker/台账/用户数据判定通过。

## 5. 人工与 CI 门

保留既有人工范围，区分当前发行实测、有理由复用的旧证据与合成场景：

- 首次启动：首页、多标签、题库侧栏、设置、统计页；名称、图标、开始菜单、卸载入口。
- 七站 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode CN：用户控制真实登录与正式提交，最终结果只入库一次。
- Codeforces API 同步、当前页同步无重复；题目详情、笔记弹层、统计、设置、脚本、备份导入导出无阻断。
- 升级保留题目/提交/笔记附件/配置/脚本，故障与中断可识别、可受控恢复，正常使用后的新数据不被旧快照覆盖。
- 卸载默认保留数据（deleteAppDataOnUninstall:false），重装正常。

独立复核及兼容性评审针对最终树。工具读取 release PR 已合并状态、dev SHA、master merge SHA；
要求该 dev SHA 上 GitHub Actions 的两个 required checks 均成功：`Fast core, packaging and docs guard`、
`Electron and renderer smoke`。另要求 merge SHA 上 fast check 成功；当前 master push 也运行
renderer smoke，最终树完整本地门见 build.json。网络、认证、API 或分页失败一律拒绝，不能解释成不存在或通过。

## 6. 接受文件与预检

真实验收完成且维护者明确恢复发行授权后，创建 `tmp/release-acceptance/acceptance.json`。
这是维护者的明确验收声明及证据索引，不会证明人工报告真实，也不代替用户授权。
在 identity.json 五字段基础上增加下列字段；示例省略的 gates **必须全部补齐**：

```json
{
  "formatVersion": 1,
  "releasePr": 123,
  "buildReportSha256": "<SHA256 of build.json>",
  "approvedBy": "<approving maintainer>",
  "publicationAuthorized": true,
  "gates": {
    "independentReview": {
      "status": "passed",
      "sourceSha": "<same accepted master merge SHA>",
      "report": "independent-review.md",
      "sha256": "<SHA256 of report bytes>"
    }
  }
}
```

必需 gate 为 `independentReview`、`compatibilityReview`、`isolatedInstallUpgrade`、`dataPreservation`、
`failureRecovery`、`uninstallReinstall`、`sevenSitesAndSync`、`corePages`，都使用同样四字段结构。
报告须为 `tmp/release-acceptance/` 内非空常规文件，路径不得越界；哈希、sourceSha 必须匹配，
status 只接受 passed，拒绝 dry-run/pending、未知额外字段和空证据。报告可说明旧证据复用理由，
但结论负责覆盖最终源码与资产。本地日志/报告不作为 Release 资产上传。

```powershell
pnpm run release:check --acceptance tmp/release-acceptance/acceptance.json
```

check 不创建 tag/Release、不上传；会读取 Git/GitHub、刷新 remote-tracking master、检查文件。
目标本地/远程 tag 或 GitHub Release（包括 draft）存在均拒绝；要求有 draft 可见性的维护者权限。
release-it 的 `--dry-run` 不算构建、上传、安装或验收证据。本 CLI 不支持 dry-run。

## 7. 草稿、核对与公开

以下是**解除暂停后**的操作，`$sha` 必须为 acceptance 中完整 master merge SHA；示例不是授权：

```powershell
$sha = '<accepted full master merge SHA>'
pnpm run release:draft --acceptance tmp/release-acceptance/acceptance.json --confirm "draft-v2.0.1@$sha"
pnpm run release:verify --acceptance tmp/release-acceptance/acceptance.json
# 再次确认公开授权，而不是只允许上传草稿：
pnpm run release:publish --acceptance tmp/release-acceptance/acceptance.json --confirm "publish-v2.0.1@$sha"
```

draft 在副作用前通过全部门，并独占创建 draft-attempt.json。独立 `.release-it.publish.json` 仅
用 npm 读 package 版本并创建 annotated tag：increment:false、npm.publish:false（**不是 npm:false**）、
git.commit:false、git.changelog:false、requireBranch:master，无 conventional-changelog/继承配置/
提交/bypass。配置不是独立发行入口；hooks 要求 wrapper 传入验收文件，并在打 tag 前复核。
禁止手动添加 release-it 参数绕开门。

wrapper 通过正常 Git hooks 只推送确切 tag ref，避免 release-it 失败 push 后自动删除远程 tag；
复核 hooks 未改变源码/资产后，用 `gh release create --draft --verify-tag` 上传确切三件。
核对远程 annotated tag object/commit、release source/notes、资产名字/数量/大小，实际下载每件
计算 SHA256，保存新 `verify-*/verification.json`，状态 verified-draft，**不自动公开**。

publish 要单独确认字符串，重跑全部本地/远程/hash门，独占创建 publish-attempt.json，再 PATCH
已核对 draft；之后重新核对公开状态、远程 tag 及下载资产 SHA256。只有后验通过才 verified-public，
CLI 成功或 upload 成功本身不算。工具不打印 token 或原始认证响应。

## 8. 失败与部分外部状态

任何失败先停止，检查本地 tag、远程 refs、GitHub draft/public Release、已上传资产与 attempt 记录。
**不得盲目重跑 draft/publish、覆盖 tag、自动删除远程 tag/Release 或清 marker 假装重试。**
记录故障点和哈希，补全核对；外部状态不确定时由维护者决定受控后续处理。verify 可以重新只读
核对草稿；公开 PATCH 结果未知时先用 GitHub 只读查询确认，不得创建第二份发行。
工具有意没有自动续传/撤销功能，需要恢复时先评审外部状态再安排明确操作。

发行记录包含版本、基线、merge/parent SHA、PR/CI、build.json SHA256、三件资产 SHA256、
隔离安装/升级/恢复/卸载和七站报告、批准人、剩余限制、发布后核对结论。保存本地安全证据，
不得上传敏感日志。工具单测使用假的 runner/ref/API 和合成文件，没有实际 tag/push/上传/公开操作，
不能冒称生产链路已做真实上传验收。

## 9. 回归入口与恢复原则

```powershell
pnpm run test:release
pnpm run test:packaging
pnpm run test:docs
git diff --check
```

负例覆盖缺/空/错资产、错版本/大小/hash、包内版本、脏 untracked、错 merge、旧 tag/Release、
网络失败、缺验收、部分上传、下载 hash 错及无源码修改。完整门仍是 test:all、build:win、required
CI 加人工验收，静态配置/单测不能证明可发行。

已成功使用后的普通 UI/站点/数据问题优先向前修复。打包错误修正输入后重建并重新验收，迁移问题
遵守数据库恢复说明，隐私问题遵守 [安全策略](../GOVERNANCE/SECURITY.md)。旧恢复点不含后续新数据，
不得通过修改用户库、删除数据或绕过站点风控掩盖发布失败。
