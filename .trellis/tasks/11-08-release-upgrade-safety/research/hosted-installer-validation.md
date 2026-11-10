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
