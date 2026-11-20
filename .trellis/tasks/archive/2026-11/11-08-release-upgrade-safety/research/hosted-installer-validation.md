# GitHub 托管 Windows 安装验收

这是独立临时 Windows VM 的工程候选证据，不是最终 master 发行验收或公开授权。
只使用合成 profile；三个 JSON 摘要之外没有上传安装器、数据库、配置或应用日志。

## 首次运行：42788578461

- [运行记录](https://github.com/xuoer-xuper/Algo-Learning-Platform/actions/runs/42788578461)，
  workflow_dispatch，runAttempt 1，源码 `54265bcc20052bf6bf9319b6267722c44a2cb23e`。
- 前置 Fast core / Electron and renderer smoke 均通过；候选 `pnpm build:win` 和输入准备通过。
- 源码干净；准备前后快照 SHA256
  `392603d30594eed64b23e02e244f06c7cabce7ebc0d44654c235c233e48863e7`。
  该快照范围是输入准备，不把它称为构建前后快照。
- 基线是官方 2.0.0，121203039 字节，SHA256
  `5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc`。
- 候选安装器 122235054 字节，SHA256
  `69f83681d637f45bd68ec8d77bb225fbf0e2cb2d49301bdef71fc86e0ee7ddcd`；
  ASAR `b90d796d803b5a7316a44890e350694fb5e3bb0a0ed5aca705ccd6d16c59c127`。
- 第1步创建隔离默认目录配置通过；第2步官方 2.0.0 NSIS 启动后180秒未退出，
  报错 `NSIS install timed out; no automatic retry`。没有执行后续24步，不能记为安装通过。
- 报告状态 failed，installer job / workflow conclusion 均 failure；watch 退出1。

下载目录：`algo-electron/tmp/installer-ci-42788578461-328ee970/`。核对三份摘要的
源码/run 身份、manifest hash、baseline/candidate/ASAR/runtime/script/helper hash 关联全部一致。

| 摘要                      | SHA256                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| output/report.json        | c715e16b06f29e13274399b93181675cdce285c861f07d6ef2c72558fe829661 |
| input/input-manifest.json | d1a7b02ea6ba69e3c941d24f69eacbf0a0c84ffcc8fd5f9fe8e11b45ed137281 |
| engineering-build.json    | fdf525e8a37a36e5ec3833f172b160eefdf6b4ed347a3a033a6e6b0f1db19dd0 |

同一源码的 [PR CI 42788558182](https://github.com/xuoer-xuper/Algo-Learning-Platform/actions/runs/42788558182)
两项必需检查通过，watch 退出0。PR CI 通过不抵消独立安装验收失败。
后续修复必须先定位并复现原因，再正常提交/推送并在全新托管 VM 重新验收；
不增加等待时限、不盲目重跑，不将新运行的资产混同本次资产。

## 根因复现

缓存 MakeNSIS v3.04 编译仅含 `.onInit` / `IfSilent` / `SetErrorLevel` / `Quit`
和空 Section 的探针，不安装文件、不访问产品 profile。使用真实 PowerShell launcher
抽出的函数运行：`"/S" "/currentuser"` 返回22（IfSilent=false），
`/S /currentuser` 返回21（IfSilent=true）；仅给 `/S` 加引号仍返回22，
仅给 `/currentuser` 加引号返回21。确认总是给参数加引号破坏了 NSIS 静默开关识别。
修复限于参数序列化，并由子进程 argv/原始命令行回归及同一 NSIS 探针复验。
详细实现和验证见`installer-nsis-arguments-review.md`。

## 修复后运行：42794016408 — 26步全部通过

- [运行记录](https://github.com/xuoer-xuper/Algo-Learning-Platform/actions/runs/42794016408)，
  workflow_dispatch，runAttempt 1，源码`717eda65e4fface06bac95245c55b0a57aa199ea`。
- 前置两项CI、候选构建、输入准备及实际安装job全部success，watch退出0。
- `report.status=passed`，26步逐项passed，errors和limitations均为空。
  真实生命周期在2026-11-10 09:57–09:58 UTC完成，没有强制结束恢复对话框。
- 默认当前用户目录保持真实runner已知文件夹，基线仍是上述官方2.0.0精确hash/size。
  基线安装23秒退出0；候选升级19秒退出0，没有改变180秒超时。
- 三份摘要的源码、运行身份、manifest、候选/ASAR/Node/脚本/helper hash关联已核对一致。
  准备前后源码快照SHA256为
  `b0065bac4ed211fe63fe16ed5f1bd87af0295b18ae7d39651652c0cf6d48f7a6`，sourceDirty=false。

| 验收范围           | 实际证据                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| 官方2.0.0安装/启动 | NSIS退出0，PE/registry/shortcut/ASAR核对，真实窗口/日志/DB，schema29                  |
| 2.0.1升级          | 真实NSIS退出0，安装ASAR与本次构建一致，schema30、integrity=ok、FK违例0                |
| 配置及关联数据     | 原配置与保护副本SHA256一致；合成笔记/图片/脚本哈希、DB资源及加密envelope保持          |
| 升级后新数据       | 新增记录正常重启后保留，旧schema29恢复点可读且不包含这条新增记录                      |
| 异常阻断           | 完成的真实checkpoint仅改为prepared后拒绝业务启动；DB/record字节不变，退出1            |
| 显式keep-current   | 安装版维护入口验证并保护现态，audit=verified，退出0，新记录和schema30保留             |
| 卸载/重装          | 实际NSIS卸载退出0，exe/registry/shortcut移除，profile保留；重装启动后全部数据再验通过 |

两次恢复对话框均`forcedDialogStop=false`，所有应用进程关闭后才读取SQL。
最后一步再次确认schema30、integrity=ok、FK违例0、新记录存在、配置副本/文件hash不变。

| 本次构建资产                                              |    字节数 | SHA256                                                           |
| --------------------------------------------------------- | --------: | ---------------------------------------------------------------- |
| AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe          | 122234981 | 79f1bd9605b686e59f961e0de6598f7204fc7a63ffb991c822087bbc04757d3c |
| AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe.blockmap |    128192 | 52797bb66674670cb9afa18ef83d26cb447e8176400a70eb57d1f273cdd543e4 |
| latest.yml                                                |       393 | 24215aadb432baf2cdc72985cdf1783f8076a3e8eff1c997aa99f4c2b3d5ff88 |

ASAR SHA256：`b90d796d803b5a7316a44890e350694fb5e3bb0a0ed5aca705ccd6d16c59c127`。
与首轮产品ASAR一致；NSIS安装器重新构建后的字节hash不同，按各自结果记录。
这些资产未上传Release，CI也只上传下面三个摘要。

| 摘要                      | SHA256                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| output/report.json        | e9dde29435225f7e52366c4dd2fbcd7a2b71bad63665b44895342d0aea44307c |
| input/input-manifest.json | cca18fda3c20592d351f00bcccc52a3a0b0b1a3e7aff40bb7b092ed247e3e5f7 |
| engineering-build.json    | 8f47ebd3361724844747640a01d9042ca244d8752effeb159647865238126595 |

下载目录：`algo-electron/tmp/installer-ci-42794016408-5da2d191/`。
三个原始摘要及首次失败摘要保留在本地忽略目录；GitHub artifact保留14天。
本次源码的[PR CI 42793939679](https://github.com/xuoer-xuper/Algo-Learning-Platform/actions/runs/42793939679)
两项必需检查通过，watch退出0。正常pre-push为197文件/1737用例及11项Playwright通过。

## 仍有边界

隔离安装环境阻塞已解决，S5工程候选安装/数据/恢复/卸载重装门通过。
数据为明确合成样本，不证明真实凭据解密或七站登录/正式提交。异常场景只把实际完成
checkpoint改为prepared，不是安装流程中的真实crash；真实强制结束矩阵另有原生测试证据。
真实七站/同步与最终核心页面人工门、dev集成及最终master SHA/资产验收尚未完成。
公开发行、master合并、tag和草稿上传继续暂停；本报告不提供恢复发行授权。
