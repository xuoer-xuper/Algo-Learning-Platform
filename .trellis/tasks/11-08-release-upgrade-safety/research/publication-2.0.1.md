# v2.0.1 正式发行记录

日期：2026-11-17（Asia/Shanghai）。发布于11:43:55，公开后下载验证已完成。

- Release：[v2.0.1](https://github.com/xuoer-xuper/Algo-Learning-Platform/releases/tag/v2.0.1)，ID448033028。
- draft=false、prerelease=false，GitHub latest稳定版为v2.0.1。
- annotated tag对象：`6125f0ebfb7902ab76fd0575597447a0b485456c`。
- tag目标/master：`de89ce4b58f240236a7aa249f0a08627df0a996e`。
- 最终发行[PR #13](https://github.com/xuoer-xuper/Algo-Learning-Platform/pull/13)使用merge commit，
  第一父`c520544189aab5eb9619d36086ef428b040745d2`，第二父/验收dev`a172a92696caca104ce25eba9f1d7fe234394eb6`。
- CHANGELOG SHA256：`51424a0c35f340643834099d49bcef7146f4ae7662d7a057b11b3c0f92d742e1`；没有在master新增发行提交或再改版本。

## 验证

最终master的`release:build`串行执行test:all与build:win，均退出0；197个Vitest文件/1766用例、
11项Playwright、真实SQLite及四个强制终止阶段、打包主程序/native/fuses/单实例均通过。
覆盖率75.17/69.09/72.23/78.38%，重复率1.63%，未降低门限。

- accepted dev push CI：44003620158，发行PR CI：44003640640。
- master push CI：44004278374；最终[托管安装CI44004833568](https://github.com/xuoer-xuper/Algo-Learning-Platform/actions/runs/44004833568)。
- 恢复远程dev后的CI44005424145通过；最终API读取accepted dev四项、master六项同名检查全部成功。
- 官方2.0.0安装→2.0.1升级→新数据→阻断/keep-current→卸载留数据→重装，共26步passed，
  errors/limitations为空，没有强制结束恢复对话框。
- 本地final ASAR与维护者已测d8b5620的SHA256完全相同：`d8f6862c9ede8c768aae69c0bb5150a6edc7496c00ecc0fb163e161c47591a1f`；
  13557个包内文件（含76个unpacked项）逐项哈希相同。
- 人工门依据维护者整体反馈接受，没有逐站登录/提交/所有页面实测明细；不编造这些证据。
- hosted使用同一最终源码独立构建的安装器，CI ASAR为b90d796d803b5a7316a44890e350694fb5e3bb0a0ed5aca705ccd6d16c59c127，
  不与本地发行文件混称字节相同。真实强杀由本地原生套件覆盖；安装恢复是completed→prepared模拟。

正常执行release:check、release:draft、release:verify、release:publish全部退出0。tag推送经过正常
pre-push；只上传exe、blockmap、latest.yml，未上传profile、数据库、日志或验收材料。
公开后再次下载核对三件资产与annotated tag，结果为`verified-public`。

| 资产 | 字节 | SHA256 |
| --- | ---: | --- |
| `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe` | 122235543 | `b0220023f58d5d141f805cdb98e0505a1926bdb38a69579ac4dae6c1d07db081` |
| `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe.blockmap` | 128177 | `220a7c7301078d31d2885ee739f8d9c3c3e25c94db6aec7ef6efa49b1656b87c` |
| `latest.yml` | 393 | `c0da90b370c610c4433c90b1f6cfda18af6762af6d452876779b7b5a60ca2312` |

## 保留证据

本地忽略目录`algo-electron/tmp/release-acceptance/`保留identity、build、acceptance、原始日志、
三份独立报告、maintainer映射、三份hosted摘要及每次草稿/公开下载验证。

- build.json SHA256：`929997cfec560ff7b7713f5ecfad9594106ee1a95cbc049a15b91a6f2884d980`。
- acceptance.json SHA256：`02c8106d6b22fe730b8effa0ff7b8cf628128d7690a5c9857a7ab1204434bf73`。
- 最终公开verification.json SHA256：`1d96ff8c5f998998d53b4599bfd147e47d77f292bd7a73f9b10418d952e46466`。
- hosted report.json SHA256：`76fe4415bf7eb84417252273f3b15adfb12d24d25dd799cb789bd31f7220fcfc`。

## 发行中修复及后续

真实push/PR重复CI套件误拒绝与pnpm12原生入口问题均有红绿回归、独立复核和正常PR，分别见
release-ci-check-review.md、release-pnpm-runtime-review.md。c520544的构建前失败证据保留，
未被改写成通过；当时的安装成功是中间证据，不代替最终master。

仓库自动删除合并源分支也删除了dev；已通过正常hook推送从finalmaster恢复dev，未改仓库设置。
master及v2.0.1保持发行提交；本记录只走后续dev文档PR。
本次不纳入PR #8/Drizzle；其安全迁移接管同步仍为后续工作，因此release-upgrade-safety暂不归档，
阶段3及整个对齐计划也未完成或预设3.0.0。下个版本必须重新评审VERSION/BASELINE及完整发行证据。
