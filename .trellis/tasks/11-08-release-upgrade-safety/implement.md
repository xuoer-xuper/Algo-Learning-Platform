# 发布加固实施计划

## Planning Gate

- [x] 用户同意独立加固方向；创建任务且保持planning。
- [x] 复用发布范围/工具研究，补齐当前dev生命周期源码调查。
- [x] PRD按要求/验收重写；design限定真实写入、故障边界及非目标。
- [x] implement/check JSONL包含实际规范、研究与当前决策，不直接列代码作注入上下文。
- [x] 独立规划复核：补齐验证后keep-current/retry-source解除阻断路径，二次复核无遗留问题；
      JSONL12/9条、文档检查、diff检查通过。只检查规划，未运行产品测试或发布。
- [x] 用户于2026-11-08明确回复“开始做吧”，批准本轮具体方案，进入实施；公开发行仍暂停。

## Current Verification（2026-11-10）

- S2/S3/S4已实现并完成整批独立复核，修复真实2.0.0历史marker目标范围和Windows临时路径问题。
- `pnpm install --frozen-lockfile`、最终 `pnpm test:all`、`pnpm build:win`全部退出0。
  196个Vitest文件/1722用例、真实原生与强制终止矩阵、11项Playwright通过。
- 构建前后源码hash一致，exe/blockmap/latest.yml/ASAR身份与hash验证通过。
- 实际Sandbox第二轮bootstrap通过，但已发布2.0.0安装器被应用控制策略阻止；未禁用策略，
  安装/升级/恢复/卸载重装门仍未通过，七站/同步/核心页面人工门也未完成。
- 完整证据与失败记录见 `research/final-engineering-validation.md`；当前只可提交审查，
  master合并/tag/草稿/公开仍暂停。任务保持in_progress。
- 用户随后要求解决安装环境：已采到真实3077/3089事件、策略GUID及安装器Flat Hash，
  确认Smart App Control的VerifiedAndReputableDesktop阻止基线。新增现有CI的显式安装
  job，在GitHub-hosted临时Windows VM继续同范围验收；不关闭策略、不用宿主profile。
  已实现并独立复核，14项Node/PS子进程守卫和20项PS路径检查通过；实际远程结果待记录，
  不能把环境方案写成通过证据。详见 research/installer-ci-review.md。
- PR9已推送至`54265bc`，必需CI `42788558182`通过。首轮托管安装`42788578461`
  前置检查/候选构建/输入准备通过；第2步官方2.0.0安装180秒未退出，失败保留，
  无害NSIS探针已复现给`/S`加引号会失去静默模式，正修复参数并补回归。
  详见`research/hosted-installer-validation.md`，
  不能把PR CI或构建通过记作安装验收通过。

## S1 源码集成与基线

- [x] 从dev `3702f01`创建 `fix/release-upgrade-safety`，master为`d2d2b0c`；远程核对无v2.0.1 tag/Release。
- [x] 独立工作区`pnpm install --frozen-lockfile`通过：Node22.23.2、pnpm12.8.1、Electron43.4.0、
      better-sqlite3原生依赖安装通过；未复用Drizzle的node_modules，日志在忽略tmp目录。
- [x] 对master→dev同步逐文件解决预检22处冲突；主会话拥有Git，实施agent只拥有分配源码。
      比较稳定版Ctrl点击、首页、焦点、全屏、会话、凭据及标签行为，不能整文件无脑取一侧。
      2026-11-09独立复核无遗留问题，最终index与dev `3702f01`相同；只是补齐master祖先关系。
      基线`pnpm test:all`通过：192个Vitest文件/1563用例、原生套件和11个Playwright用例；
      详细证据见`research/s1-integration-validation.md`，不代表后续加固或发行验收完成。
- [ ] 同步PR保留merge祖先关系；独立复核与完整门通过后合入dev。普通加固提交按功能PR规则。

## S2 数据库恢复点与失败处理

所有者范围：`electron/db/{connection,migrate}.ts`、`electron/backup/sqliteMigrationBackup.ts`；
必要新纯模块在`src/main/db/`和`src/main/services/backup/lib/`，测试在`tests/db/`。

- [x] 先补原错/句柄泄漏、未知/不连续台账、pending=[]恢复失败绕过的复现回归。
- [x] close-on-error包住pragma/台账读取，默认生产校验与合成测试seam分开。
- [x] partial备份→只读校验→正式恢复点，轮换只处理已验证文件并固定活动恢复点。
- [x] typed/Zod升级尝试记录，迁移前写入、成功边界清理；中断/恢复失败不因pending为空解锁。
- [x] 恢复先验证/记录意图再保留main/WAL/SHM集合，不在验证替换成功前丢弃恢复材料。
- [x] 故障与子进程终止矩阵、旧marker、原始/次级错误、idempotent重启、真实SQLite和native测试。
- [x] 限定维护入口的验证后解除：单实例锁、写业务前、仅匹配attemptId、keep-current/retry-source
      的源/目标schema及完整性验证，持久化resolution，拒绝任意路径/未知状态；正常业务不启用。
- [x] 001–030和固定fixtures没有变化；不同时接入Drizzle或全profile快照。
- [x] 更新实际恢复契约spec（scope/signatures/contracts/error matrix/cases/tests/wrong-correct），
      不把本设计中的建议字段误记为已实现接口。

## S3 配置保护与恢复说明

所有者范围：`electron/app/config.ts`、必要backup/lib小模块、`tests/app/configCompatibility.test.ts`、
`tests/app/configMigration.test.ts`、backup README、恢复文档和不准确的导出提示及对应测试。

- [x] 自动配置回写前备份原字节并验证，失败不回写；普通保存/规范/坏JSON契约不改变。
- [x] 加密envelope不解密、不记录，旧文件仅留受保护本地备份；不跟随任意外部路径。
- [x] 更正SQLite/JSON不是完整profile备份的提示；明确笔记附件、配置、脚本和session边界。
- [x] 恢复文档可演练，保留当前状态，说明后续新增数据不在旧恢复点，默认优先向前修复。
- [x] 记录原错误已处理后如何显式解除阻断，不能让用户靠删marker或清空数据库才能重新启动。
- [x] 独立check验证R2–R4，不把文档警告替代测试或增加全新恢复产品UI。

## S4 发布工具

所有者范围：`.release-it*.json`、`electron-builder.json5`、必要`scripts/release-*.mjs`、
`package.json`发布脚本、`tests/packaging/`、CHANGELOG及RELEASE_PROCESS。父会话负责规范更新。

- [x] 准备/发布两阶段配置；发布保持npm版本来源但禁npm发布、bump、Git commit和changelog写入。
- [x] builder显式provider，构建明确`--publish never`；不新增自动更新界面。
- [x] 真干净状态、版本、master SHA/merge/tag、远程检查与确切资产/hash守卫。
- [x] 覆盖缺任一资产、错误hash/版本、脏untracked、网络失败、已有tag/Release等拒绝路径。
- [x] 草稿上传/核对/公开分开，失败后先检查外部状态；本任务测试不执行公开发布。
- [x] 更新7节可执行spec与README，不再保留与merge tag冲突的自动提交/绕过钩子发布约定。

## S5 最终发行候选验收

主会话拥有并串行运行原生/UI/build/安装套件，worker不得同时操作桌面焦点或发布外部资产。

- [x] `pnpm install --frozen-lockfile`；首次核对postinstall原生依赖与固定Electron ABI。
- [x] `pnpm test:db`、配置/导出定向Vitest、故障/子进程终止；不得仅用文本假DB证明可恢复。
- [x] `pnpm test:all`、`pnpm build:win`；实际fuses/native/单实例、schema29→30、重复启动。
- [ ] 合成笔记/图片/配置/脚本/凭据样本，声明来源；不打开用户原库或冒称原始release数据。
- [ ] WindowsSandbox/可用VM内执行NSIS安装2.0.0→候选、卸载保留数据/重装、受控恢复。
      只发现WindowsSandbox.exe不能打勾；无隔离环境时保留该验收阻塞，不在宿主profile操作。
      Sandbox已确认策略阻止；2026-11-10按用户要求接入显式GitHub-hosted Windows VM验收。
- [ ] 保留既有发布流程的七站/同步/核心页面人工验收，明确新验证与可复用旧证据；真实登录态
      或正式提交由用户授权并控制，不将本地假站/合成密文测试冒充七站实测。
- [x] 最终集成树独立trellis-check，通过后记录实际命令/结果/来源SHA/资产hash与缺口。
      见 `research/final-code-review.md`、`final-engineering-validation.md`；该工程门不替代安装/人工门。
- [x] 对外兼容/版本审查，2.0.1合适则保留；发现不适合只报告，不擅自升版。

## Commit / Handoff

- [ ] 每次提交前读Git规范、正常钩子；原子中文conventional commit，提交后及时推送。
- [ ] pre-push `pnpm test:ci`通过；CI用`gh run watch --exit-status`跟到结果，不靠重复重跑碰绿。
- [ ] 检查无发布阻塞、征得恢复发行确认后，才进入dev→master PR/tag/Release操作。
- [ ] 将加固修复按祖先/冲突边界同步到原Drizzle分支，避免覆盖其安全迁移接管代码。
- [ ] 完成独立加固任务后记录会话；不归档阶段3或整个对齐计划，不预设3.0.0。

## Stop Conditions

真实数据风险、超出本次写入边界、版本/范围需要用户决定、隔离验收不可用、检查失败或
外部发布状态不确定时停止相应步骤。不得用禁用校验、删failure记录、丢sidecars、改已发布
tag、跳过hook或更换版本名掩盖问题。故障模拟仅在明确验证的临时绝对目录执行。
