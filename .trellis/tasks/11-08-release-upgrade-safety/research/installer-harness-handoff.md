# 隔离安装验收脚本交接

2026-11-10。本记录交接静态复核、函数探针与执行准备。harness worker 未运行安装包、应用或 Windows Sandbox；主会话已执行的 Sandbox 失败及后续策略诊断分别记录于后文和 `sandbox-policy-diagnosis.md`。

## 文件与静态修正

- `algo-electron/tests/packaging/sandbox-upgrade-guest.ps1`：guest 身份/固定路径/新目录守卫、NSIS 和应用实际进程等待、注册表/快捷方式/PE/ASAR 检查、26 步生命周期及逐步证据。
- `algo-electron/tests/packaging/sandbox-upgrade-data.mjs`：Node 内置 SQLite 的合成 fixture、文件和数据断言；不导入生产迁移。
- `algo-electron/tests/packaging/README.md`：六文件输入、严格 manifest、运行与证据边界。

复核修正：已发布 2.0.0 的 `main.ts` 有 `app.ready`，没有候选版新增的 `app.launch` 版本字段；两个版本都验证实际安装 PE/registry，仅候选要求 launch 版本日志。补充输入两个脚本哈希和安装 ASAR 与构建 ASAR 一致性；处理退出过程中枚举进程的竞态、helper 超时结束；对归一化配置保存首轮字节基准，后续重启/恢复/卸载重装严格比对；校验来源恢复点 manifest/schemaHash。原合成 PNG 的 IDAT CRC 无效，已换为有效 1×1 RGB PNG。

fixture SQL 已逐字段核对 `tests/db/fixtures/rc1.schema.sql`、029/030 冻结迁移和运行时代码：七种事实/元数据表存在，使用明确 Z 时间避免 timezone 猜测；credential 的 JSON CHECK、script resource BLOB、note/assets 路径与当前契约一致。旧 schema fixture 的来源已在原研究中对齐 v2.0.0；安装验收仍必须观察实际已安装 2.0.0 生成的 schema29，不能拿该源码检查替代运行。

## Sandbox 执行顺序

1. 等最终代码检查完成，固定源码快照；执行 `pnpm test:all` 和 `pnpm build:win`，不与原生/UI/Sandbox 并发。
2. 核对构建前后源码快照相同，记录 package、安装包/blockmap/latest.yml 以及 `win-unpacked/resources/app.asar` 哈希。源码快照算法见下段。
3. 在 `algo-electron/tmp/` 下新建唯一目录，例如 `release-sandbox-acceptance-<UTC timestamp>`，内含 `input/`、空 `output/`、宿主保留的 `source-snapshot.json` 和 `.wsb`。不得复用已有运行目录。
4. `input/` 仅放六个 README 指定文件。已下载基线在 `tmp/release-install-input/AlgoLearningPlatform-Windows-2.0.0-x64-Setup.exe`，大小 121203039，SHA256 `5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc`。候选来自 `release/2.0.1/AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe`。独立 Node 为 `C:\Users\drxuo\AppData\Local\Volta\tools\image\node\22.23.2\node.exe`，不可用 PATH 中的 shim 替代。
5. 填写严格 manifest：`formatVersion=1`、真实 `sourceSha/sourceTreeSha256/sourceDirty`、`candidateSize/candidateSha256/candidateAsarSha256`、`nodeSha256/guestScriptSha256/fixtureHelperSha256`。完整契约见 README。安装包与所有工具按原字节复制后再次计算输入目录哈希。
6. `.wsb` 仅映射 input（只读）和 output（可写）。禁用网络、剪贴板、音视频输入和打印机。LogonCommand 直接运行 guest 脚本，不使用 APPDATA 或 smoke 重定向。宿主 `Start-Process WindowsSandbox.exe` 使用 `-WindowStyle Hidden`。
7. 每隔有限时间读取 `output/report.json`，检查 `updatedAt`/步骤进展；文件替换时偶发读失败只重新读取，不能替换既有失败。以 `finishedAt` 和最终 `status` 判定结束，查看 errors、limitations 和每步结果；WindowsSandbox 进程不是测试结果。脚本不自动关闭 guest，主会话确认并保存证据后可关闭自己启动的 Sandbox。
8. `passed-with-limitations` 要保留缺项；不可填写全部通过的 release acceptance。所有输出只含合成 guest 数据，仍只留本地，不上传发行。

## 源码快照算法

在 repository root 通过 `git ls-files -z --cached --others --exclude-standard` 收集文件名，去重并按代码点排序；固定 `formatVersion: 1`，`files` 每项按属性顺序写成 `{ path, size, sha256 }`，缺失 tracked 文件为 `{ path, size: null, sha256: null }`。路径使用 Git 原样的 `/` 相对名。对 `JSON.stringify({formatVersion:1,files}) + '\n'` UTF-8 字节做 SHA256，并保留这些精确字节为宿主 `source-snapshot.json`。拒绝 symlink/非普通文件；忽略的 node_modules/tmp/release 不在 source snapshot 内。记录 `git rev-parse HEAD` 和包含 untracked 的 `git status --porcelain=v1`。

若用于一次 dirty-tree 工程验收，此快照说明实际输入内容，不证明最后 merge SHA 的发行构建。最终 master 发布必须重新按 release 工具所要求的 source identity 跑门。

## 验收内容与限制

26 步包含：默认路径安装2.0.0 → 真应用创建 schema29 → 停机合成数据 → 旧应用重启 → stage legacy config → 候选 NSIS 升级 → 真应用030 → 恢复点/配置/附件/密文/BLOB → 新行重启 → 人为 prepared checkpoint 阻断 → 安装版 keep-current → 当前状态备份/audit → 正常重启 → 实际卸载留 profile → 重装后新行及文件仍在。

输入密文是明确不可解密的合成 envelope；脚本不会调用真实账号，也不声称测过 DPAPI 解密或 session 登录。脚本停用 Coach/LLM 和 userscript 更新。它检查窗口可见句柄、响应、启动日志和关闭，不导航七站或核心页面。

恢复阶段通过 `CloseMainWindow()` 尝试自然结束真实故障/维护对话框，等待并检查预期退出码1/0；如果只能强制终止，会在报告中设 `passed-with-limitations` 且退出2，不能隐去此限制。恢复模拟仅改变 checkpoint 状态，不是真实 SIGKILL；后者由原生中断矩阵单独证明。

## 本次检查

- PowerShell `System.Management.Automation.Language.Parser.ParseFile`：通过，无解析错误；未执行脚本。
- `node --check tests/packaging/sandbox-upgrade-data.mjs`：通过。
- `pnpm exec eslint tests/packaging/sandbox-upgrade-data.mjs`：通过。
- `pnpm exec prettier --write`（helper/README/本记录）：通过，已格式化。
- Python 标准库核对内嵌 PNG 的 chunk CRC：原 IDAT 失败，修正后 IHDR/IDAT/IEND 全部通过。

上述为首次静态交接结果；安装/升级/卸载/恢复全链尚未完成。harness worker 未改运行时代码、未重建原生依赖、未运行完整/UI/build/Sandbox/NSIS，也未修改 Git index 或创建提交。后续主会话 guest 运行结果如下。

### 首次 guest 运行后的退出码修正

主会话首次 Sandbox 运行 `tmp/release-sandbox-acceptance-qcNAYa/output` 在第一步错误停止：bootstrap helper 输出 `status: passed`，但 Windows PowerShell 5 的 `Start-Process -PassThru` 返回对象在 `WaitForExit()` 后没有退出码。该次未进入 NSIS。主会话保留输出并关闭 guest。

宿主 Windows PowerShell **5.1.26100.9711** 用独立 Node 子进程复现：`process.exit(0)` 与 `process.exit(7)` 均为 `waited: true, ExitCode: null`。脚本已统一改用 `ProcessStartInfo` + `Process.Start()` 直接持有启动句柄（仍 Hidden/CreateNoWindow），并通过 `Get-VerifiedExitCode` 拒绝尚未结束或缺失退出码；helper 同时异步读取 stdout/stderr，结束后落盘，超时保持失败。安装器、卸载器和应用启动共用同一启动函数。

修正后的函数由 AST 原样提取后在同一 PowerShell 5 下验证：捕获输出与不捕获输出两种模式，exit0/7 均精确返回0/7；100ms 超时样例被识别，提前读退出码被拒绝，显式结束该 Node 后退出码-1且确认已停止。probe 脚本及结果保存在 `tmp/ps5-exit-probe-94bbddfea03b4042965b9ece4274566b/`。本轮仅运行独立 Node 验证，未运行应用、NSIS 或 Sandbox；重试由主会话使用新目录执行，并更新 guest script hash。

### Sandbox 策略阻止与确定根因

主会话第二轮 `tmp/release-sandbox-acceptance-5OdseC/output/report.json` 中 bootstrap 通过，但2.0.0安装器在 `Process.Start()` 被应用控制拒绝，尚未执行 NSIS。独立诊断 `tmp/release-policy-diagnosis-RCMjfk/output/{environment,attempt}.json` 已用3077/3089、SAC状态和文件 Flat Hash 确认 `VerifiedAndReputableDesktop` 策略阻止同一未签名基线，Policy GUID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`。CiTool 列表失败不能算空策略；完整来源及官方依据见 `sandbox-policy-diagnosis.md`。

主会话选择仓库的 GitHub 托管临时 Windows runner 继续验收，保留宿主及 Sandbox 安全设置。没有改名、移动、解除下载标记、修改安装包、添加允许规则或停用 SAC/WDAC 来越过此拒绝。

## GitHub 托管 runner 交接

`sandbox-upgrade-guest.ps1` 仅在显式 `-Environment GitHubActions -InputRoot <input> -OutputRoot <output>` 时接受 CI。默认 Sandbox 仍限制 `WDAGUtilityAccount` 和固定路径，并拒绝任何路径参数。新增守卫验证 Windows x64、GitHub hosted/Windows/run ID/attempt/repository/SHA、OS实际用户主目录和标准 AppData；`RUNNER_TEMP` 下直接新子目录 `algo-installer-<random>` 只使用 `input/output/work` 三个兄弟目录。work/profile/install 不得存在，output 必须为空，脚本须位于 input，路径和输入文件拒绝 reparse point。`Assert-NoLinks` 现在检查边界本身，且正确处理盘符根目录末尾分隔符。

主会话 workflow 与输入准备器的协议：

1. 干净 checkout 本 run 的 SHA，按正常门构建候选。package cwd 运行 `node tests/packaging/prepare-installer-acceptance.mjs`；准备器要求 Node22.23.2，下载并哈希核对2.0.0，校验本 run 候选三资产及 ASAR，创建六文件 input 与空 output。
2. 准备器在前后分别获取相同的干净源码快照，记录 `engineering-build.json` 的 `status=prepared`；它不冒称记录了构建前状态或安装通过。`GITHUB_OUTPUT` 返回 `inputDirectory/outputDirectory/runDirectory`，work 由 guest 创建。
3. workflow 在真实 runner 调用 input 内脚本并传上述参数。guest 要求 manifest `sourceDirty=false` 且 `sourceSha=GITHUB_SHA`，继续固定 `/S /currentuser` 默认 NSIS路径，没有 `/D`、APPDATA或smoke重定向。
4. owner 保留 `kind=algo-nsis-synthetic-guest-v1` 和随机 `runId`，新增 `environment/username/profile/workRoot/github`；github为当前 runId/runAttempt/repository/sha，Sandbox为null。helper action 后附 `--environment=GitHubActions`，每次校验 owner、路径及环境。
5. 同一26步与严格退出码规则保持；CI只接受无limitations的最终 `passed`。汇总记录包含环境、run、源码和输入/ASAR哈希；环境变量是防误用守卫，不等于远程平台证明。
6. CI只上传 `report.json`、`input-manifest.json`、`engineering-build.json` 三份摘要。原始合成profile、数据库、日志、源码快照及安装资产不上传。公开发行仍暂停，工程run不替代最终master发行身份或其余人工验收。

Node helper/准备器及其专用13项守卫测试由 installer CI worker 维护；该 worker 报告 `node --check`、scoped eslint/prettier、13项守卫测试与 `typecheck:tests` 已通过。harness worker 本次额外完成：

- Windows PowerShell **5.1.26100.9711** AST 解析通过。
- 从实际脚本 AST 提取路径与早期身份守卫，20项检查全部通过：合法/缺失子路径、盘符根边界、等值/大小写、相对/drive-relative/UNC/device/root/空路径、同前缀兄弟和穿越、边界自身及祖先junction拒绝、Sandbox显式路径拒绝、真实宿主不能冒作Sandbox/GitHubActions。
- 探针仅创建 ignored `tmp` 内合成目录/junction；没有伪造GitHub环境、执行全harness、访问产品profile或运行安装器/应用。结果与脚本在 `tmp/ps5-installer-guards-1794295407947/`，当次 guest script SHA256为 `45e324e4da314968907c7f8b6ab582570a982e81db0a080e77dedf2f4fa409dd`。

实际 GitHub 安装/升级/恢复/卸载重装仍由主会话在最终代码复核和正常提交/CI之后串行执行；本记录不预填成功。
