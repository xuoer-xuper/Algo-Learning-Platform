# NSIS 安装参数修复证据

2026-11-10，release-2-0-1 工作区。此次只修改安装验收启动器及其定向回归，不运行真实产品安装包、应用、Sandbox或完整原生/UI/build套件，不改默认profile、隔离环境、安全策略、180秒超时或失败语义。

## 真实失败与根因

GitHub hosted run `42788578461`、源码 `54265bcc20052bf6bf9319b6267722c44a2cb23e` 的 `report.json` 为failed；bootstrap通过，第二步安装官方2.0.0在09:18:44.561Z开始，09:21:44.712Z以 `NSIS install timed out; no automatic retry` 结束。报告尚无应用启动或实际安装成功证据。原始三份摘要保存在 `algo-electron/tmp/installer-ci-42788578461-328ee970/`。

`Start-GuestProcess` 原先为每个参数添加双引号，把固定开关变成 `"/S" "/currentuser"`。NSIS的内建`/S`解析基于原始Windows命令行；其外层引号会使静默模式失效。下述真实NSIS探针确定了此启动器缺陷，与CI等待交互安装器的180秒超时一致；原CI摘要未收集窗口状态，因此不声称观察到了其具体对话框。修复后的真实产品全链仍须CI再次验证。

## 无安装探针

使用现有缓存 `C:/Users/drxuo/AppData/Local/electron-builder/Cache/nsis/nsis-3.0.4.1/Bin/makensis.exe`，其 `/VERSION` 输出 `v3.04`。探针源码、EXE、PowerShell和JSON全部位于 ignored目录 `algo-electron/tmp/nsis-arguments-probe-1794302929841/`。

`probe.nsi` 仅声明Unicode、名称/输出、`RequestExecutionLevel user`、`SilentInstall normal`、空Section；`.onInit`执行`IfSilent`后设置退出码21（silent）或22（normal）并立刻`Quit`。没有File/WriteReg/快捷方式/产品profile操作。PowerShell5.1.26100.9711通过AST提取实际`Assert-True/Start-GuestProcess/Get-VerifiedExitCode`函数调用它，另用同一EXE进行原始命令行对照。每次都在10秒内结束，探针启动前后目录文件集合相同。

| 案例                  | 原始参数              | IfSilent / 退出码 |
| --------------------- | --------------------- | ----------------- |
| 修复前实际启动器      | `"/S" "/currentuser"` | false / 22        |
| 无引号对照            | `/S /currentuser`     | true / 21         |
| 只给`/S`加引号        | `"/S" /currentuser`   | false / 22        |
| 只给currentuser加引号 | `/S "/currentuser"`   | true / 21         |
| 小写开关对照          | `/s /currentuser`     | false / 22        |
| 修复后实际启动器      | `/S /currentuser`     | true / 21         |

`before.json`与`after.json`保存完整结果；两次使用同一probe EXE，SHA256为 `88d85ce6170794a6fda7e75664a90bc7e2555bf0d2076613c2f95790a54fd77a`。guest脚本修复前本地字节SHA256为 `15c4c6fa391b2d1978e8b6a0b539642b863a03f57a343f7d4d202d2265264b63`，修复后为 `627a09f7fc1404c8b9c267bfc4e0f07991a2e9fc27bb160563443c5a66d46a8c`。工作区换行与CI checkout可产生不同字节hash；每份运行证据仍各自核对实际输入。

补充 `current-user.nsi` 在同样的`.onInit/Quit`边界使用NSIS自带`GetParameters/GetOptions`解析`/currentuser`，不实施安装行为。修复后的实际启动器结果`IfSilent=true`且`currentUser=true`（退出31）；原全引号对照两个开关均未识别（退出34）。结果保存在`current-user-after.json`，EXE SHA256为 `df07c463dc0e3e93accdec2b1c581989875c32ea3224e5d5206c27f684c03b15`。这验证标准GetOptions行为，不宣称覆盖产品multi-user模板的全部逻辑。

## 修复与回归

- `sandbox-upgrade-guest.ps1`：仅空字符串或含空白的参数需要引号，固定NSIS开关和维护UUID参数原样传递；已有双引号/换行/尾反斜杠拒绝、六项认证变量过滤、UseShellExecute=false、默认路径和全部超时保持。
- `installerAcceptanceGuards.test.ts`：真实Windows PowerShell AST启动器回归同时核对原始`ProcessStartInfo.Arguments`及Node实际argv，覆盖`/S /currentuser`、维护参数、含空格的脚本路径、空格/制表符参数和空字符串；同时保留六项认证变量剥离与父环境/默认用户身份不变检查。该回归不依赖NSIS缓存、不运行产品或探针EXE。
- `README.md`：记录原始参数契约与回归/探针的范围。

## 验证与剩余工作

- Node **22.23.2**执行定向Vitest：15项全部通过（含两个实际Windows子进程用例）。
- PowerShell5 AST解析与同一NSIS EXE修复前后对照通过，额外currentuser解析通过。
- Node22.23.2执行 `node_modules/vitest/vitest.mjs run tests/packaging/installerAcceptanceGuards.test.ts`：15项通过。
- Node22.23.2执行 `node_modules/eslint/bin/eslint.js tests/packaging/installerAcceptanceGuards.test.ts --report-unused-disable-directives --max-warnings 0`：通过。
- Node22.23.2执行 `node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit`：通过。
- 定向Prettier格式化与`git diff --check`：通过；除Windows自动换行提示外无错误。

此修复只解决已确定的启动参数缺陷；没有延长超时、自动重试或预填安装通过。后续由独立checker复核，主会话正常提交/推送后在新hosted VM运行真实26步验收。

## 独立复核结果

2026-11-10，`release_final_check` 对当前限定改动和上述失败/探针证据完成复核；本节区分实现者已运行的 NSIS 探针与复核者直接执行的测试。

- 已核对 `Start-GuestProcess` 的实际三行差异：空字符串和空格/制表符参数加引号，`/S /currentuser` 和维护参数原样保留。`UseShellExecute=false`，不经过 shell；含双引号、CR/LF和尾反斜杠的参数仍在创建进程之前拒绝。无需扩展为通用任意Windows参数转义器，当前调用端仅使用受控开关、路径和UUID。
- 发现并直接补齐一个回归覆盖缺口：原定向用例只验证合法参数，未实际调用拒绝分支。复核将五种非法参数（双引号、CR、LF、普通尾反斜杠、含空格且尾反斜杠）加入同一 AST 提取探针；使用不存在的可执行文件路径并要求准确的守卫错误，证明拒绝发生在进程创建前。没有修改启动器或扩大测试运行范围。
- 直接执行 Node22.23.2 定向 Vitest：15/15通过，两个Windows子进程用例同时验证raw参数、实际argv、五项非法参数拒绝、六项token过滤及父环境/默认用户身份不变。Scoped ESLint、`typecheck:tests`、测试Prettier检查通过。
- 只读核对原hosted `report.json`：源码为`54265bcc20052bf6bf9319b6267722c44a2cb23e`，第1步passed，第2步failed，错误仍为`NSIS install timed out; no automatic retry`。未修改失败记录，也未将本地参数回归记为实际安装通过。
- 已阅读两个无安装探针的完整NSIS源码及before/after/current-user JSON，并重新计算两份探针EXE和当前PS脚本SHA256，均与本报告一致。独立复核没有重复运行这些NSIS探针或任何产品安装器。
- 安装与卸载均保持180秒超时；exit1失败、exit2限制通过、原始证据保留及26步生命周期不变。文档、release-evidence spec和任务元数据明确首轮失败、修复范围及尚待全新hosted VM验收，不存在通过或发布授权的提前声明。

限定范围内没有遗留实现问题。所有局部检查进程已完成，文件冻结，可由主会话继续正常Git钩子和新一轮托管验收。

## 托管成功结果独立复核

2026-11-10，`release_final_check` 独立读取 `algo-electron/tmp/installer-ci-42794016408-5da2d191/` 的三份原始摘要，并用只读断言核对关联及源码。run `42794016408` / attempt1 对应干净候选 `717eda65e4fface06bac95245c55b0a57aa199ea`；report 为 `passed`，连续26步名称与该提交的实际脚本一致，全部passed，errors/limitations均为空。前次失败记录继续保留。

- 下载目录恰好只有三份JSON。重新计算SHA256：report为`e9dde29435225f7e52366c4dd2fbcd7a2b71bad63665b44895342d0aea44307c`，manifest为`cca18fda3c20592d351f00bcccc52a3a0b0b1a3e7aff40bb7b092ed247e3e5f7`，engineering为`8f47ebd3361724844747640a01d9042ca244d8752effeb159647865238126595`。run/source/tree/manifest关联一致；PS的CRLF checkout字节及helper的Git字节分别匹配manifest哈希，阅读的本地源码内容也与该提交一致。engineering仍正确标为prepared，不冒充安装结果。
- 官方2.0.0的确切大小/哈希匹配固定基线，安装退出0，PE/注册表版本为2.0.0；候选升级及重装均退出0，版本2.0.1，安装器哈希`79f1bd9605b686e59f961e0de6598f7204fc7a63ffb991c822087bbc04757d3c`、ASAR哈希`b90d796d803b5a7316a44890e350694fb5e3bb0a0ed5aca705ccd6d16c59c127`与输入一致。用户为runneradmin，profile和安装目录分别为其真实默认Roaming/algo-electron、Local/Programs/AlgoLearningPlatform；HKCU注册、开始菜单目标、启动窗口和自然关闭均有对应断言。
- 基线应用实际创建schema29；合成题目、提交、笔记、脚本、站点配置、密文envelope及BLOB经升级变为schema30，台账前29项一致，TEXT时间转换为正确Unix毫秒且完整性/外键检查通过。笔记、图片、脚本三个文件哈希全程一致；配置原字节与归一化备份哈希一致，归一化配置及合成密文保持；schema29恢复点通过helper重新打开核验。
- 升级后新增记录在重启、阻断、keep-current、卸载及重装后均保留。prepared checkpoint拒绝启动，数据库和checkpoint原字节断言不变，退出1；keep-current在同一默认profile写入verified审计和含新增记录的当前状态备份，退出0，随后正常重启成功。所有关闭记录均`forcedDialogStop=false`且进程树已结束；这些退出由正常窗口关闭请求完成，没有强杀代替通过。
- 卸载退出0，并观察到EXE、卸载注册和快捷方式消失而profile保留；重装后的PE/ASAR、配置、附件、密文、恢复审计及新增记录再次通过。只读核对还验证了26步顺序、时间连续性及最终文件摘要关联。

结论：本候选的实际隔离NSIS安装、2.0.0升级、合成数据保留、受控keep-current、卸载留数据和重装阻塞已解除，无新增发现。证据仍限于合成数据；completed→prepared是状态模拟而非真实崩溃注入，不证明真实账号解密、七站登录/提交/同步或核心页面人工导航，也不是最终master合并提交的发行验收或公开授权。原始数据库和日志未下载，本复核依据匹配源码的执行断言及三份摘要，没有重新运行测试、构建、UI或安装器。
