# Windows Sandbox 安装策略诊断

2026-11-10。本记录汇总只读宿主/任务输入调查、官方资料及主会话采集的独立 guest 诊断。研究 worker 未运行安装器、应用、Sandbox 或 VM；未改策略、注册表、文件名、ADS 或二进制，未访问真实用户数据。主会话拥有诊断 guest、日志采集与 Git。

## 当前结论

第二轮安装验收在 **创建基线安装进程时** 被 Application Control 拒绝，尚未运行 NSIS。12:49 的错误消息只说明有策略阻止；14:24 的独立 guest 诊断已通过 **CodeIntegrity 3077 强制拦截事件、关联 3089 签名事件、SAC 状态和文件 Flat Hash** 确认为 Smart App Control 的 `VerifiedAndReputableDesktop` 策略阻止已发布的未签名2.0.0。安装包字节与基线一致，未发现损坏或下载标记；不能把此失败写成产品迁移失败，也不能当作已通过安装验收。

后续选择仓库已有的 **GitHub 托管临时 Windows runner** 作为独立安装环境，并为 harness 增加显式且受限的 `GitHubActions` 模式；宿主及 Sandbox 的安全策略不变。其实际安装结果仍须等待完整运行。宿主具备 Hyper-V 组件、服务、内存和磁盘条件，但当前账户无管理权限；VM 清单不可读，不能报告“没有 VM”。

## 直接证据

`algo-electron/tmp/release-sandbox-acceptance-5OdseC/output/report.json`：

- guest：`WDAGUtilityAccount`，Windows `10.0.26100.0`。
- 第1步 bootstrap 通过，Node `v22.23.2` 创建合成 config；前一轮 PowerShell 退出码观察问题已修正。
- 第2步 `Install published 2.0.0 using default current-user location` 失败于 `Start-GuestProcess → Process.Start()`，错误为 `An Application Control policy has blocked this file`。
- 发生时间 `2026-11-10T04:49:35.8315251Z` 至 `04:49:39.0621684Z`（北京时间12:49）；报告没有安装后版本、registry 或 schema 29 证据。
- `.wsb` 的 input 只读、output 可写；network/audio/video/printer/clipboard 均 disabled；未配置 `ProtectedClient`。

只读核对任务原输入及第二轮映射 input：

| 文件                                               | 大小 / SHA256                                                                 | PE / 签名 / ADS                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `AlgoLearningPlatform-Windows-2.0.0-x64-Setup.exe` | 121203039；`5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc` | Product/FileVersion 2.0.0；Authenticode `NotSigned`；证书表 offset/size 0/0；仅 `:$DATA` |
| `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe` | 122235543；`e8d2ec618e4c93e81fe8c40847d8e5e6528d6d8de29a4b4a4fd6d5b39e5a295d` | ProductVersion 2.0.1；Authenticode `NotSigned`；证书表 offset/size 0/0；仅 `:$DATA`      |

两文件均为合法 MZ/PE header，machine `0x14c`、PE32 optional header `0x10b`、5 sections。这是 NSIS 安装 stub 的结构，不能据此推断包内 Electron 不是 x64。无 `Zone.Identifier`，所以 `Unblock-File` 缺乏对应证据且不会解决已确定的应用控制拒绝。`NotSigned` 只是签名状态，不等于恶意或损坏。

## 独立 guest 的确定性诊断

主会话保存 `algo-electron/tmp/release-policy-diagnosis-RCMjfk/output/environment.json`（06:22Z）和 `attempt.json`（06:24Z），guest 为 Windows 11 Enterprise `10.0.26100`。受控启动同一2.0.0文件返回 `started=false`、Win32 错误4551，没有安装进程成功启动。

| 证据                       | 实际结果                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| SAC 注册表                 | `VerifiedAndReputablePolicyState=1`、`SAC_EnforcementReason=1`                                           |
| DeviceGuard                | `UsermodeCodeIntegrityPolicyEnforcementStatus=2`                                                         |
| 3077 强制拦截              | `2026-11-10T06:24:17.4110739Z`；`Status=0xc0e90002`                                                      |
| 策略名称 / GUID            | `VerifiedAndReputableDesktop` / `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`                                 |
| 事件 PolicyID / PolicyHash | `27555.1000.240208` / `2668895A5B233A80432D00D67251D7B7F52686A3FB13780F4B242C5A1F937A01`                 |
| 文件 SHA256 Flat Hash      | `5576CAB81B879F192B01E5867A81C192297353F3767310EFE7F904079D7C6CCC`，与发布包原字节 SHA256 相同           |
| 关联 3089                  | ActivityID `{240cef84-6e5d-0001-500d-0d245d6edd01}`；`TotalSignatureCount=0`，publisher/issuer `Unknown` |
| 策略文件                   | 对应 GUID 的 `.cip` 文件存在，SHA256 与事件 PolicyHash 相同                                              |
| AppLocker effective        | `<AppLockerPolicy Version="1" />`                                                                        |
| CiTool policy list         | `exitCode=-2147009597`，失败；不是成功枚举，也不能当成空策略                                             |

CodeIntegrity 的普通 `SHA256 Hash` 是另一种文件摘要，不能拿它和完整文件 SHA256 直接等同；本次关联使用明确的 `SHA256 Flat Hash`。确定 SAC 来源依靠这组事件和状态，不依赖 CiTool 成功或仅凭离线、未签名推测。此前输出路径转义错误的诊断脚本未形成有效 guest 报告，也不计入结论。

## 官方依据及其适用边界

1. [Understanding App Control event IDs](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/event-id-explanations)：`CodeIntegrity/Operational` 中 **3077** 表示强制策略实际拦截；**3076** 仅表示 audit 下“本会拦截”；**3089** 提供签名信息，可按 System `Correlation ActivityID` 与拦截事件关联，无签名文件 `TotalSignatureCount=0`。3033 可能在没有 App Control 策略时出现，不能单独定性。EXE/DLL 与 MSI/script 应读取相应 CodeIntegrity/AppLocker 日志。
2. [Query App Control events](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/windows-defender-application-control/operations/querying-application-control-events-centrally-using-advanced-hunting)：AppLocker **8004** 是 EXE/DLL 被拦截，**8007** 是脚本/MSI 被拦截；应区别 AppLocker 与 CodeIntegrity 策略。
3. [CiTool commands](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/citool-commands)：`CiTool --list-policies --json` 是清单读取，包含 PolicyID/BasePolicyID/FriendlyName/IsCurrentlyEnforced/IsAuthorized 等。这里只需要 list，不需要 update/remove/refresh。宿主调用返回 `OperationResult:-2147024891`（0x80070005，Access denied），不能当成空策略清单。
4. [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview)：SAC 结合应用情报预测与签名；未知且未签名代码默认阻止。云服务不能做预测时，受 Trusted Root Program CA 签名的应用仍可允许。本次 SAC 来源已由上述 guest 证据确认；文档不证明打开网络即可解决。
5. [Use and configure Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)：`ProtectedClient` 影响 RDP/AppContainer 隔离，默认 Disabled；当前配置未启用它，关闭该项不是有证据的修复。官方支持仅映射专用目录、禁用 network 等隔离配置。
6. [Windows Sandbox architecture](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-architecture)：Sandbox 使用动态基底镜像，复用宿主 Windows 的 OS 文件；不能假定它等于自独立 ISO 安装的虚拟机，也不能据此直接声称某条宿主策略被继承。
7. [App Control rule types](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/select-types-of-rules-to-create)：管理员可以采用文件 hash 或 signer 等明确允许规则。若诊断确认是可管理 WDAC policy，正式补充允许范围须由该策略所有者审核，包含实际子 EXE/DLL/native 模块，而不是只放行安装器再盲测。Microsoft 平台策略和 SAC 不应臆测为可任意增补的企业 policy。
8. [Create a virtual machine in Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/create-a-virtual-machine-in-hyper-v)：要求 Hyper-V 已启用、账户属于 Administrators 或 Hyper-V Administrators、有内存/磁盘；安装操作系统需要可用 ISO/VHD(X)，虚拟网络为可选。
9. [Windows 11 Enterprise evaluation](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise)：提供注册后下载的90天评估 ISO。它不是本机已存在的已授权镜像；若选用需由用户/管理员确认许可、注册/账号及下载来源，不擅自提交个人资料或登录。

## 宿主虚拟化条件（只读）

| 项目                      | 结果                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系统                      | Windows 11 Pro，`10.0.26300`，64-bit                                                                                                                                 |
| CPU / RAM                 | AMD Ryzen 9 9955HX；33483382784 bytes，约31.2 GiB                                                                                                                    |
| Hypervisor                | `HypervisorPresent=true`，VirtualizationFirmwareEnabled=true                                                                                                         |
| Windows optional features | Microsoft-Hyper-V-All/Hypervisor/Services/Tools/Management-PowerShell、VirtualMachinePlatform、HypervisorPlatform、Containers-DisposableClientVM 全为 InstallState=1 |
| 服务                      | vmms、vmcompute、hvhost 均运行；vmms Auto                                                                                                                            |
| 工具                      | Hyper-V PowerShell2.0/Get-VM/Get-VMSwitch 和 wsb.exe 可用                                                                                                            |
| 账户权限                  | 当前 token 非 elevated Administrator，也无 Administrators/Hyper-V Administrators SID；Get-VM/Get-VMSwitch 均返回权限不足                                             |
| 空间                      | C: 约334.8 GiB free；D: 约293.7 GiB free（只读取卷容量）                                                                                                             |
| 其他 VMM                  | PATH 未发现 vmrun/VBoxManage，常见 VMware/VirtualBox/QEMU 安装路径未发现；这不是全盘搜索，也不证明绝对不存在                                                         |
| 镜像/已有 VM              | 仅在任务 tmp 顶层及默认公共 Hyper-V 路径检查，未确定可用 ISO/VHD；未搜索用户个人文件。VM清单因权限拒绝未知                                                           |

CIM 的 `SecondLevelAddressTranslationExtensions=false` 与正在运行的 Hypervisor/Sandbox 并列记录；不能在 hypervisor 已启用的宿主上单凭该属性宣称硬件不支持虚拟化。实际 Sandbox 启动已成功，当前失败发生在进程策略检查。

## 后续执行与决策边界

1. 完成受限 GitHubActions harness 与输入准备器的独立复核，由主会话通过正常提交、CI 门执行。仅接受 GitHub 托管 Windows x64、真实默认用户目录、干净当前 run SHA 和 `RUNNER_TEMP/algo-installer-<random>` 的新目录，拒绝 self-hosted、任意 profile/安装路径以及 smoke 覆盖。默认 Sandbox 身份/路径守卫保留。
2. 临时 runner 使用同一原字节2.0.0基线及本 run 构建的候选执行26步生命周期；输入及安装后的 ASAR 都校验哈希。实际结果以报告、退出码和逐项断言为准，不因换环境自动认定通过，不修改 SAC/WDAC/Defender 或宿主安全配置。
3. CI 只保留 `report.json`、`input-manifest.json` 和 `engineering-build.json` 三份摘要；原始合成 profile、数据库、日志、源码快照和安装资产不上传为 CI artifact 或 Release。工程证据不代表最终 master 发行验收，也不恢复公开发行授权。
4. 若托管 runner 仍被策略拒绝，继续保留失败证据并评估专用测试 VM 或正式签名，不更改策略逃过检查。Hyper-V 备用环境需要有权限的管理员和可信镜像，不能把未知的 VM 清单或镜像误写成不存在。
5. 若推进面向用户发行的签名，使用可信证书和正常构建签名链。不能就地给已发布2.0.0加签后仍称同一基线，其 hash 会改变；候选签名也不替代旧基线安装验证。

当前已解决根因不明的问题；实际安装/升级验收仍待新环境运行，公开发行保持暂停。
