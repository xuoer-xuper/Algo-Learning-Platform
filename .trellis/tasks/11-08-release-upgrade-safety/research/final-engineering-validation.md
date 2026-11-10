# 候选工程验证记录

日期：2026-11-10（Asia/Shanghai）。范围是 release worktree 的未提交候选树，
不是已接受的 master merge，也不是公开发行验收完成证明。未操作真实用户 profile。

## 源码与自动门

- 构建时 HEAD `3702f01ab2d83e73e70c98515cebea829eea19f9`；当时 master 祖先同步尚未提交。
- 构建前后源码快照相同：SHA256
  `16b5f4a55706911c8839517c398e26e7ba93272d2a857ba3c8af20ccba65cddb`，
  1271 个 tracked/未忽略 untracked 文件，包含未提交改动。
- Node22.23.2、pnpm12.8.1；进程 PATH 显式指向实际 Node22，避免 pnpm 子进程
  解析到机器其他 Node26。`pnpm install --frozen-lockfile` 退出0，锁文件无漂移。
- `pnpm test:all` 退出0：196个 Vitest文件 / 1722用例；覆盖率 statements75.17、
  branches69.09、functions72.23、lines78.38；jscpd重复行1.63%（门限3%）。
- 同一全门包含类型检查两次、lint、架构21项、安全、文档、打包、性能、真实SQLite
  导入/迁移/仓储/统计、真实强制结束四阶段和新增数据保留、Electron冒烟、11项Playwright。
- 最终全门日志：`algo-electron/tmp/release-safety-all-final-node22-r2.log`。
- `pnpm build:win` 退出0：Electron43.4.0、builder26.15.3，实际fuses、native SQLite、
  主程序external和单实例冒烟通过；构建明确 `--publish never`。
- 构建日志：`algo-electron/tmp/release-safety-build-final.log`。
- 001–030及历史fixtures无变更；没有引入Drizzle。

早先失败未隐藏：第一次全门发现theme旧写入断言与coach懒加载等待；Node22复跑发现
note编辑器第二层懒加载等待。修复、独立复核与定向验证见 `final-code-review.md`。
未通过重试、加长超时、降低最终覆盖率门或禁用断言处理。原ViewTransition警告仍有记录。

## 候选资产

真实 `validateAssets` 检查了精确资产集合、YAML双SHA512/size、安装器与主EXE版本资源、
ASAR package identity。未执行远程草稿、tag、上传或公开。

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe | 122235543 | e8d2ec618e4c93e81fe8c40847d8e5e6528d6d8de29a4b4a4fd6d5b39e5a295d |
| AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe.blockmap | 128177 | c3af94629d58de2f5c52ea63e387160f3f7d435ffab2dd038c71d7acc9630dac |
| latest.yml | 393 | 9fcd9d5506b09230834530f6d50a7e06167a726b42869cc7603b0766f82c829a |

`win-unpacked/resources/app.asar`：
`d8f6862c9ede8c768aae69c0bb5150a6edc7496c00ecc0fb163e161c47591a1f`。
资产位于本地忽略的 `algo-electron/release/2.0.1/`，未发布。

## 实际 Sandbox 尝试与阻塞

两次均全新guest和映射目录；网络/剪贴板/音视频/打印机关闭，仅六个专用输入只读及
空证据输出可写，不共享源码或宿主profile。两次结束后仅停止已验证属于本任务的Sandbox。

1. `tmp/release-sandbox-acceptance-qcNAYa/`：bootstrap helper返回passed，但PS5
   Start-Process的Process.ExitCode为null，脚本严格判失败；没有运行安装器。
   随后宿主独立Node探针稳定复现exit0/7均得到null；改为Process.Start持有句柄，
   捕获/不捕获两模式下exit0/7和超时验证通过。见installer-harness-handoff。
2. `tmp/release-sandbox-acceptance-5OdseC/`：bootstrap通过；第二步执行已发布2.0.0
   安装器被guest拒绝：`An Application Control policy has blocked this file`。
   原文件SHA256 `5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc`，
   121203039字节，与GitHub发布资产一致；宿主签名读取为NotSigned。
   不能据此断言确切策略名称或根因：追加事件读取未取得日志，未禁用策略或绕过阻止。
   本次report SHA256 `f9b8e11dc381489f604e3338946c5c05d07e0f94a6cc7dffc0372bea97477025`。

第二次仅修改了验收PS脚本及交接文档，产品/资产未变；构建源码快照与后续harness快照
`fbef709344687e1417084ad590fc447a7b3682a8b45a86aea38a606007de2fd3`的差异逐项核对。
manifest仍指向实际构建源码，同时记录独立脚本hash和harness-revision.json，不混淆来源。

**安装/升级/恢复/卸载/重装均未通过验收。** 当前候选不能据此公开；需要能正常执行
已发布安装器的合规隔离Windows环境，或维护者完成同范围验收。无需/不得关闭应用控制
策略来凑通过。真实七站登录/提交/同步、最终核心页面人工验收也仍未完成，历史图标
验收不能替代，见 `final-compatibility-review.md`。

## 后续

2026-11-10追加诊断：用户要求继续解决环境。专用全新guest取得同一基线文件的真实
3077拦截和3089零签名事件，PolicyName为VerifiedAndReputableDesktop、GUID为
{0283ac0f-fff1-49ae-ada1-8a933130cad6}，Flat Hash与2.0.0安装器一致，SAC状态为1。
原始environment/attempt JSON的SHA256分别为
4ec347c074b2448e8b9fabefbc632c8f7ec0cb2997d587d8ebdd2fc777e7a9ab、
29ec1ef08a45deafb504eccc2f791f5a710be4564c0e982eb7a8e6b3f36c03be。
诊断guest已关闭；没有改动策略。现新增显式GitHub-hosted Windows临时VM安装验收，
沿用同26步、默认用户profile及严格失败语义。首次运行`42788578461`的前置CI、
候选构建、输入准备通过，但第2步2.0.0安装180秒未退出；安装验收仍失败，
正在定位修复。三份摘要身份核验和失败证据见`hosted-installer-validation.md`。

实现及文档已分组正常提交/推送至58f1e5c；祖先同步为c340c16（parents 3702f01、d2d2b0c），
代码组为f23c6aa、efdf573、982cf7d、8e9dbe2，验收组e952f01。每次推送的test:ci均退出0。
后续CI适配提交5e98409的首次pre-push在197文件/1736用例通过后，被真实userscript Electron
冒烟拦住：重载数组暂缺v2-idle。源码确认did-finish-load只发送MessagePort idle消息，
测试没有等待renderer处理。独立checker在隔离tmp bundle延迟该消息，确定性复现同一失败；
修复只等待真实idle sentinel后保留精确顺序断言，没有改生产调度、增加超时或重试。
修复后的定向验证通过；随后`9b30e9b`和`54265bc`的正常pre-push均通过，
197文件/1736用例、Electron冒烟和11项Playwright通过。PR9已创建到dev，
CI `42788558182`两项必需检查通过，watch退出0。首次失败仍保留。
构建快照与提交后逐文件哈希对比，仅任务文档及PS验收脚本改变，产品代码/构建配置/依赖
字节保持一致。这仍是工程候选证据；后续CI包须记录其自身提交和实际哈希。

可提交推送当前已验证工程改动并通过PR审查/CI；这些不等于恢复发行。保留候选2.0.1，
学习/AI上下文/站点配置三种v2导出边界必须披露。master合并、tag、草稿上传及公开均
继续暂停，待所有验收阻塞解除并得到重新确认。任务保持in_progress，不归档阶段3。
