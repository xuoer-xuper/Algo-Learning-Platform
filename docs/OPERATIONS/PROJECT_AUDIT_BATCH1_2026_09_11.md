# 项目审计第一批：备份、笔记与导入完整性

审计日期：2026-09-11。代码基准：`97fab601d64cdb2022c4df1f6b46fc8ade490635`，应用版本 `2.0.0-rc.1`。范围来自 [项目问题排查清单](PROJECT_AUDIT_CHECKLIST.md)。

本批确认 **8 项问题：2 项 P1、5 项 P2、1 项 P3**。没有确认 P0。另有 2 条安全线索尚未完成动态验证，未计入缺陷数。157 个检查项仍有大量未执行，本文不表示全项目审计完成。

本批只新增审计文档和独立复现脚本，没有修复业务代码，没有提交或推送。全部动态实验使用新建临时 profile、SQLite 数据库和合成内容；没有读取真实用户数据库、密码、Cookie 或向真实 OJ 提交。

## 1. 确认问题总览

| 编号 | 等级 | 问题 | 主要触发条件 | 清单关联 |
|---|---|---|---|---|
| AUD-001 | P1 | “完整备份”无法恢复笔记图片 | 源笔记目录丢失后，仅持有设置页生成的 SQLite 备份 | PROD-02、BAK-01、BAK-11 |
| AUD-002 | P1 | 笔记保存失败仍显示“已保存” | 文件或数据库写入失败，保存接口返回 `false` | NOTE-02、NOTE-10、UI-02、DATA-12 |
| AUD-003 | P2 | 导入的题目 ID 能让新笔记写到用户数据目录外 | 用户导入含路径片段的 ID，随后为该题新建笔记 | BAK-03、NOTE-05 |
| AUD-004 | P2 | 导入的软删除提交与访问仍参与显示和统计 | 导入包含非空 `deleted_at` 的提交/访问 | DATA-04、DATA-05、DATA-10、BAK-07 |
| AUD-005 | P2 | 账号与 rating 差异不进入冲突预览，覆盖入口不可用 | 已存在同业务键、不同值的账号/rating | BAK-06 |
| AUD-006 | P2 | 状态筛选只查最近 200 题，遗漏较早匹配项 | 最近 200 题不匹配，较早记录匹配筛选条件 | UI-01、PROD-05 |
| AUD-007 | P2 | 导入允许负时长，并将其写入每日统计 | JSON 的访问时长字段为负数 | BAK-03、DATA-10 |
| AUD-008 | P3 | 空笔记正文混入旧标题，文件与 DB 表达不一致 | 新建空正文笔记，然后读取或改标题 | NOTE-03 |

这些等级按当前已证明的影响评定。路径问题没有证明任意指定文件覆盖或代码执行；软删除问题不表示正常 UI 删除必然失败；备份问题也不表示 DB 中已有的笔记正文全部丢失。

## 2. 可复现环境与证据

实测环境：Windows `10.0.26200`，AMD Ryzen 9 9955HX，Electron `43.4.0`，Chromium `150.0.7871.224`，Electron 内置 Node `24.18.1`，better-sqlite3 依赖版本 `13.0.3`。这里的 Node 版本是实际执行 SQLite 实验的 Electron 内置版本，与先前清单调查使用的系统 Node 不同。

可保留并重跑的脚本：

- [auditDataIntegrity.repro.ts](../../algo-electron/tests/db/auditDataIntegrity.repro.ts)：调用真实 backup、notes、import 和 repository 实现；8 个异常场景、1 个事务回滚对照场景。
- [runAuditDataIntegrity.mjs](../../algo-electron/tests/db/runAuditDataIntegrity.mjs)：构建独立入口，启动真实 Electron，设置 60 秒超时；不启动主应用。
- [auditNoteSave.repro.tsx](../../algo-electron/tests/components/auditNoteSave.repro.tsx)：保留真实 `NotePanelModal` 和 `NoteEditorPane`，在编辑器和 IPC API 边界使用替身，验证保存失败后的文案和重新打开行为。
- [runAuditNoteSave.mjs](../../algo-electron/tests/components/runAuditNoteSave.mjs)：单独运行上述组件复现，不改变默认测试集合。

在 `algo-electron` 目录运行：

```powershell
node tests/db/runAuditDataIntegrity.mjs
node tests/components/runAuditNoteSave.mjs
```

每次 SQLite 实验都新建 `tmp/audit-20260911/data-<UUID>/`，不会复用用户 profile。演练只将本次创建的源笔记目录重命名为离线副本，没有删除它。脚本验证所有演练目标都在本次临时根目录下。

最新原始输出为 `algo-electron/tmp/audit-20260911/data-integrity-results.json` 和 `note-save-ui-results.json`。这些临时文件受 gitignore 排除；本报告保留关键观察值，复现源码保留在 `tests/`。临时 JSON 会在再次运行时更新，每次创建的 profile 保留供核查。

**复现脚本断言的是当前错误行为。脚本通过表示问题被复现，不表示应用行为正确。** 它们使用 `.repro.ts`/`.repro.tsx` 命名，不纳入默认 Vitest 回归集合。修复时应据下述验收标准转换成正确行为的回归测试。

## 3. 逐项发现

### AUD-001 / P1：SQLite“完整备份”遗漏笔记附件

依据：[backupService.ts](../../algo-electron/electron/backup/backupService.ts) 第 24 行只调用 SQLite `backup`；[noteStorage.ts](../../algo-electron/electron/notes/noteStorage.ts) 第 74 行将图片写在外部附件目录；[BackupPanel.tsx](../../algo-electron/src/features/settings/BackupPanel.tsx) 第 103 行提示“完整备份请用数据库备份”。

复现：创建带 PNG 附件的笔记，保存正文，调用真实数据库备份；关闭 DB，将本次源 `notes` 目录重命名为离线副本，模拟源文件丢失；将备份复制到新 profile 并加载笔记。

实际结果：备份返回成功，输出目录只有 1 个 `.sqlite` 文件；恢复 DB 的 `integrity_check = ok`；正文匹配，附件不存在，Markdown 文件不存在；记录中的 `file_path` 仍指向原 profile。正文中的图片链接保留，但无法从备份恢复图片本体。

影响：用户按“完整备份”提示保留该文件，源附件丢失时无法恢复学习笔记中的图片。仅迁移到新路径而保留旧目录时，还可能继续访问旧路径；这不是可独立恢复的附件备份。

限制：正文缓存此次成功恢复。脚本未验证 session、用户脚本资源、LLM 配置的恢复，不能把它们也列成本批已证实的丢失项；不需要源文件丢失的日常保存操作不受此复现场景直接证明。

修复验收：定义并实现可恢复的备份资产集合，包含附件和路径映射；对备份包做完整性校验。在源 profile 不可访问的新目录恢复后，正文与图片均可读取。只修正文案可以消除误导，但不能提供完整恢复能力。

### AUD-002 / P1：保存失败后界面仍承诺已保存

依据：[NoteService.ts](../../algo-electron/electron/notes/NoteService.ts) 第 158 行先写文件再更新 DB，第 165 行失败后返回 `false`；[NotePanelModal.tsx](../../algo-electron/src/features/problems/NotePanelModal.tsx) 第 90 行忽略该布尔结果并清除 dirty；[NoteEditorPane.tsx](../../algo-electron/src/features/problems/NoteEditorPane.tsx) 第 52 行据此显示“已保存”。

复现分两层：

1. 在临时 DB 创建正文 `Old body` 的笔记，用 TEMP trigger 使后续正文 UPDATE 报错，再调用真实 `updateNoteContent` 写入新正文。
2. 在真实笔记面板组件中令保存 API 返回相同的 `false`，输入新正文，等待保存结束，再卸载并重新打开面板。

实际结果：服务返回 `false`，文件包含新正文，DB 和 `getNoteWithContent` 返回旧正文。组件仍显示“已保存”，重新打开显示 `Old body`。没有错误提示或保留未保存状态。

影响：文件或 DB 出错时，用户得到错误的保存承诺，可能关闭页面而失去可见的新编辑。文件先成功、DB 后失败还会形成两份不同版本，正常读取优先返回旧 DB 内容。

限制：SQL 故障由测试 trigger 注入；组件使用 IPC 与编辑器替身，没有做真实磁盘满或全窗口端到端实验。该 SQL 场景的新正文仍可手工从 Markdown 文件恢复，不能称为物理不可恢复的数据损坏。

修复验收：`false` 与 rejection 均显示保存失败并保留待保存内容；支持重试。定义文件与 DB 的唯一权威来源或可验证的补偿流程。对文件失败、DB 失败、切页/关闭、重试分别验证，成功提示必须对应持久化成功。

### AUD-003 / P2：导入题目 ID 越出笔记目录边界

依据：[learningDataExport.ts](../../algo-electron/electron/backup/learningDataExport.ts) 第 389 行插入原始 `row.id`；[registerNotesIpc.ts](../../algo-electron/electron/ipc/registerNotesIpc.ts) 第 57 行只要求可空文本；[noteStorage.ts](../../algo-electron/electron/notes/noteStorage.ts) 第 109 行直接将 `problemId` 拼入文件路径。

复现：从真实文件预览与导入函数导入题目 ID `../../audit-note-outside-profile`；从 `getRecentProblems(200)` 取得该记录的 ID，模拟界面为此题新建空笔记。

实际结果：导入成功，题目可列出，新建笔记成功；文件位于 `notes` 根目录的 `../../audit-note-outside-profile/<随机 UUID>.md`，也越出了该 profile 的 `userData`。此次目标仍在本次演练总根目录内。

入口成立的依据：[problemsApi.ts](../../algo-electron/src/features/problems/problemsApi.ts) 第 54 行将所选题目 ID 原样传入 `createNote`；不需要普通远程网页能调用壳 IPC。

影响与前提：提供导入文件的一方可以影响后续新笔记的父目录；需用户导入并为该题创建笔记，目标还受操作系统写权限限制。文件名由程序生成，当前证据不支持任意指定文件覆盖或代码执行。

修复验收：在导入时校验/重映射外部 ID，在文件存储边界再次做最终路径包含性检查；兼容已有合法 UUID 与独立笔记。包含 `..`、Windows 分隔符等异常 ID 不得逃出预期目录。

### AUD-004 / P2：导入软删除事实仍被统计

依据：[firstAc.ts](../../algo-electron/electron/db/repositories/submission/firstAc.ts) 第 44 行的提交聚合、[problem/queries.ts](../../algo-electron/electron/db/repositories/problem/queries.ts) 第 52 行的详情提交列表、[stats/recompute.ts](../../algo-electron/electron/db/repositories/stats/recompute.ts) 第 30 行和第 38 行的统计都未过滤 `deleted_at`。

预期来自 [DATABASE_SCHEMA](../DESIGN/DATABASE_SCHEMA.md) 第 470 行与 [DATA_EXPORT_AND_IMPORT](../DESIGN/DATA_EXPORT_AND_IMPORT.md)：该字段用于导入覆盖/恢复表达软删除状态，并非脚本自行发明删除语义。

复现：经文件预览和确认导入 1 个活动题目、1 个带删除时间的 AC、1 个带删除时间的访问。访问持续 600 秒、活跃 540 秒。

实际结果：独立查询的活动提交数 = 0，活动访问数 = 0；题目却显示 `solved`，详情提交数 = 1，日统计解题数 = 1、AC 数 = 1、活跃秒数 = 540。`foreign_key_check` 为空，说明不是外键破损造成。

限制：正常 UI 的 `deleteProblem` 当前使用硬删除，不能据此声称“在 UI 删除题目后必然残留”。问题触发于包含 tombstone 的导入/恢复数据，样本中的删除标记是人工构造的合法导入字段。

修复验收：明确活动事实口径，统一过滤已删除事实，并修复首次 AC、详情列表、平台分布和日统计。加入“仅有已删除 AC”和“最早 AC 已删除但后续有效 AC 存在”的导入回归。

### AUD-005 / P2：账号和 rating 的冲突确认不完整

依据：[learningDataExport.ts](../../algo-electron/electron/backup/learningDataExport.ts) 第 218 行的 `collectConflicts` 只收集题目、提交、日统计差异，但第 589 行和第 645 行允许覆盖账号/rating；[BackupPanel.tsx](../../algo-electron/src/features/settings/BackupPanel.tsx) 第 93 行在冲突数为 0 时禁用“覆盖冲突”。[导入设计](../DESIGN/DATA_EXPORT_AND_IMPORT.md) 明确列出账号和 rating 冲突键。

复现：库中合成账号的 current rating 为 1000，导入相同账号与比赛记录、rating 改为 1500 的数据。先只导入这两表；随后加入一个题目标题差异，再确认覆盖。

实际结果：第一次预览为 0 冲突、2 条重复；默认导入成功但均跳过，rating 仍是 1000，用户无法通过该界面选择覆盖。第二次预览只报告 `problems` 冲突，确认覆盖却同时更新账号/rating，rating 变为 1500。

影响：只更新账号/rating 的导入工作流无法完成，真实差异没有进入冲突清单；一个无关题目冲突会改变这些表能否被覆盖的结果。界面确实显示跳过计数，不能说默认导入毫无反馈或直接破坏现有数据。

限制：访问记录也不参与 `collectConflicts` 是代码事实，本批未单独验证访问差异预览，未把它另算一个缺陷。

修复验收：对所有可覆盖表按映射后的业务键比较允许覆盖的字段，保证预览、确认范围和实际更新一致；仅账号/rating 有差异时也应有可用的明确覆盖入口。

### AUD-006 / P2：题库状态筛选发生在截断之后

依据：[problem/queries.ts](../../algo-electron/electron/db/repositories/problem/queries.ts) 第 25 行先排序并 `LIMIT`，第 30 行才按状态过滤；[ProblemSidebar.tsx](../../algo-electron/src/features/problems/ProblemSidebar.tsx) 第 27 行固定请求 200 条，页面空态称“没有符合筛选条件的题目”。

复现：导入最近访问的 200 道未解决题、1 道更早访问且有有效 AC 的题；请求 `getRecentProblems(200, undefined, 'solved')`。

实际结果：详情确认该旧题已解决，独立事实表有 1 个匹配题目，但筛选返回 0 条。

影响：题库积累超过 200 题后，筛选可漏掉真实匹配记录并产生错误空态。不是第 201 个匹配项被合理分页，而是尚未筛选就丢弃了候选。

修复验收：先在 SQL/查询层按有效状态筛选，再排序和限制结果数量；验证平台、状态同时筛选及 200 条边界。

### AUD-007 / P2：导入接受负时长并污染派生统计

依据：[learningDataExport.ts](../../algo-electron/electron/backup/learningDataExport.ts) 第 124 行的 parser 校验顶层标识/版本和表数组，第 443 行的 INSERT 将访问行直接写入 DB；[stats/recompute.ts](../../algo-electron/electron/db/repositories/stats/recompute.ts) 第 26 行直接求和。

复现：导入 1 个题目和 1 个访问，设置 `duration_seconds = -600`、`active_seconds = -540`，其他字段合法。

实际结果：文件预览 `valid = true`，导入 `success = true`，生成日统计 `duration_seconds = -600`、`active_seconds = -540`。

影响：损坏或手工修改的导入文件可产生不可能的学习时长，并影响后续统计计算。UI 显示层可能对负数做格式化，本批确认的是持久数据与派生聚合错误，不声称所有页面都会直接显示负号。

修复验收：导入预览逐行验证类型、必填字段、非负/有限时长及约定的关联约束，返回表、行和字段信息；不合法文件不得开始写库。本次只验证负时长，其他异常字段和文件资源上限保持待查。

### AUD-008 / P3：空正文被文件标题替代

依据：[noteStorage.ts](../../algo-electron/electron/notes/noteStorage.ts) 第 37 行创建文件时写入 `# title` 和正文，第 42 行后续保存只写正文；[NoteService.ts](../../algo-electron/electron/notes/NoteService.ts) 第 134 行把空 DB 正文视为需要读取整个文件，第 146 行改标题只更新 DB。

复现：新建标题 `Original title`、正文空字符串的笔记，读取；仅改标题为 `New title`，再次读取；再保存正文 `Actual body`。

实际结果：第一次正文变成 `# Original title\n\n`，字数缓存仍为 0；改名后标题是 `New title`，正文仍含旧标题；保存正文后外部文件变成只有 `Actual body`。

影响：新建空笔记时出现额外正文，改名后旧标题仍留在正文；外部 Markdown 的格式取决于是否编辑过正文。没有证明非空正文因此丢失，按轻度内容/体验问题评为 P3。

修复验收：区分“合法空正文”与“旧记录尚未迁移”，统一文件表示和标题职责；新建空笔记、改标题、清空正文、旧笔记迁移的期望一致。

## 4. 对照结果与未验证线索

### 4.1 本批通过的有限检查

| 检查 | 实际结果 | 边界 |
|---|---|---|
| SQLite 备份文件有效性 | 恢复后 `integrity_check = ok`，DB 中正文一致 | 不包含附件恢复，也没有检验同秒备份覆盖 |
| 导入事务回滚 | 第二张表违反 NOT NULL 时，导入返回失败；先插入的题目也回滚，题目/提交均为 0 | 只注入一个 SQL 失败位置，未覆盖磁盘满/掉电 |
| 回滚后库结构 | `integrity_check = ok`，`foreign_key_check = []` | 不等同于所有迁移版本或所有语义正确 |
| 现有备份导入专项 | `backupImport.test.ts` 在真实 Electron Node 下 11/11 通过 | 原有用例覆盖幂等、跨库映射、AC 更正、日期重算和失败回滚，但未覆盖本批反例 |
| 审计代码验证 | `typecheck:tests`、新增脚本定向 ESLint 通过 | 不代表业务缺陷修复 |
| 文档检查 | `test:docs`、`git diff --check` 通过 | 不代表 157 个审计项全部通过 |

壳 IPC 的只读复核发现：`trustedSender` 已检查登记的 WebContents、主 frame、来源，并有独立 OJ 权限路径。没有依据称“普通网页可直接调用所有壳 IPC”。这只是代码复核结论，没有记作整个 SEC-02 已通过。

### 4.2 保留线索，不计确认缺陷

| 编号 | 代码依据 | 还缺什么 |
|---|---|---|
| S-01 | [ojBridge.ts](../../algo-electron/electron/browser/ojBridge.ts) 第 44 行的转发器接受后代 frame 的消息，未单独比较其 origin；[ojPreload.ts](../../algo-electron/electron/browser/ojPreload.ts) 第 33 行开始为转发附加文档 token | 需要结合真实 frame 来源、主进程平台/URL/提交意图校验，确认跨源消息是否实际能污染入库；不能仅凭转发器就认定远程任意写库 |
| S-02 | [credentialVaultCore.ts](../../algo-electron/electron/credentials/credentialVaultCore.ts) 第 171 行的 `getForAutofill` 在 await 前读取记录，后续轮换写入调用 upsert；[credential/mutations.ts](../../algo-electron/electron/db/repositories/credential/mutations.ts) 第 21 行会将同账号记录 `deleted_at` 清空 | 缺少删除与解密/轮换交错的动态证据，以及真实调用方对取消/删除状态的最终校验复核；不声称已发生密码泄漏或删除记录复活 |

安全子任务尝试开展跨源消息动态复现时被工具自动审核拒绝，理由为可能涉及网络安全风险。该实验未执行，相关脚本已撤除；本批仅保留只读依据。这是验证缺口，不是项目本身的安全结论，也不是“安全检查通过”。

本批没有给出性能泄漏、CPU/GPU/RSS 超标、导入导致 OOM 的结论。清单 F-03 的整文件同步读取、F-04 的缓存、依赖公告、LLM Key 出站等仍需独立有界实验或调用链验证。

## 5. 后续顺序与退出标准

1. 优先处理 AUD-001、AUD-002：确保用户的备份和“已保存”承诺可验证；审计本身未实施修复。
2. 集中处理 AUD-003 至 AUD-007 的导入/查询边界。每次修复都使用原复现作为反例，补正确行为断言；不把“SQL 无注入/事务可回滚”误作业务输入合法性。
3. 下一批覆盖导入文件资源上限、预览到确认的多窗口竞态、同秒备份覆盖，以及主进程耗时/进程树资源基线；继续保持主代理加 1 个子代理的并发限制。
4. 浏览器生命周期、7 站真实适配、AI 缓存/费用、Windows 安装升级、多屏/DPI 等尚未完成。涉及真实账号、真实提交或硬件的结果必须注明环境，不能以本批合成样本代替。

关闭任一问题前须满足对应验收条件，记录修复提交/工作区版本和回归结果。本报告的全部 AUD 项当前均为“确认，未修复”。
