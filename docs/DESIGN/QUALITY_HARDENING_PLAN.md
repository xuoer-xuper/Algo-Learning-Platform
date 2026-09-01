# 质量收口计划（Q 系列）

> 本文是 B6 浏览器化重构完成后的一轮质量收口计划。范围只含**已存在代码的缺陷修复、一致性收敛与结构拆分**，不含新功能；多设备同步是新功能，单列 §7 只做前置结论，不在本计划执行范围内。
>
> 配套文档：架构契约见 [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md);重构分期见 [BROWSER_SHELL_REFACTOR_PLAN](BROWSER_SHELL_REFACTOR_PLAN.md);导出导入契约见 [DATA_EXPORT_AND_IMPORT](DATA_EXPORT_AND_IMPORT.md)。

## 1. 起点：评分与扣分归属

评分基于 2026-08-27 实测，非估算。总分 **81/100**。

| 维度 | 权重 | 得分 | 主要扣分 |
|---|---|---|---|
| 安全边界 | 20 | 19 | OJ document token 挡不住页内脚本伪造 payload（已如实记录，下游 adapter/verdict 校验兜底） |
| 正确性与健壮性 | 18 | 14 | renderer 无 `unhandledrejection` 兜底；读路径静默失败 |
| 测试与可验证性 | 16 | 14 | 三个 preload 在 coverage 排除名单；`test:all` 曾长期红 |
| 一致性与标准化 | 15 | 10 | coach 绕过 API 层 27 处；30 处裸 SQL 越层；无守卫兜底 |
| 结构与组件化 | 12 | 9 | `TabManager.ts` 2275 行、`CoachOrchestrator.ts` 1248 行 |
| 效率 | 9 | 8 | `reviewPlanner` N+1（层次问题非性能）;无 statement cache |
| 工具链与文档 | 10 | 7 | TS 7.0.2 无 type-aware lint;§11.50 曾先写后验 |

### 1.1 与早期评分的差异说明

首轮给出 87/100,用的是五轴（安全/测试/工程纪律/代码质量/文档）。该轴集**没有"一致性"维度**,把分层与约定执行情况混入"代码质量"一笔带过。补上该轴后重新计算得 81。差值来自两处：新增的一致性轴（10/15,全项最低）与健壮性轴上新发现的读路径静默失败。

分数含义：81 分**已包含本轮已修项**。按本轮开工前状态计约 74 分（三个数据缺陷未修、`test:all` 红、coverage 阈值虚设）。

### 1.2 实测基线数据

| 项 | 值 |
|---|---|
| 生产代码 | 51,304 行（`electron` + `src`） |
| 测试代码 | 29,847 行 |
| 测试规模 | 140 files / 931 tests(`vitest run --coverage` 全绿) |
| 覆盖率 | 58.46 / 55.82 / 54.88 / 61.01(语句/分支/函数/行) |
| 覆盖率阈值 | 55 / 53 / 52 / 58(本轮由 28/34/24/29 提升) |
| 守卫 | 8 条架构守卫 + 文档守卫 + 敏感文件守卫 |
| TODO/FIXME/HACK | 0 |
| `any` | 45 处 |

上表是**建立本计划时**的快照，刻意不随执行滚动更新（否则"基线"二字失去意义）。Q10 收尾时重新实测：

| 项 | 建立时 | Q10 收尾 |
|---|---|---|
| 生产代码 | 51,304 行 | 53,110 行 |
| 测试代码 | 29,847 行 | 32,176 行 |
| 测试规模 | 140 files / 931 tests | 153 files / 1102 tests |
| 覆盖率 | 58.46 / 55.82 / 54.88 / 61.01 | 62.83 / 58.49 / 60.52 / 65.38 |
| 架构守卫 | 8 条 | 17 条 |
| `any` | 45 处 | **0 处**（另有 9 处出现在注释里，都是记录"这里为什么不再需要 any"） |
| renderer 规模 | 7,137 行 TSX,最大组件 437 行 |
| 最大生产文件 | `TabManager.ts` 2275、`CoachOrchestrator.ts` 1248、`electron-env.d.ts` 1087 |

## 2. 已完成项（2026-08-27，commit `9ac5f40`）

以下已落地并全绿，记录在此供追溯，不再重复执行。

| 项 | 内容 |
|---|---|
| 缺陷 1 | 导入预览与实际导入漂移。`new_counts = 总数 − 重复 − 冲突`,而冲突恒为重复子集,两边都减导致重复扣除。改为 `planImport` 单趟逐行分类,与实际导入同一判定 |
| 缺陷 2 | 跨设备 rating history 漏判重复。原用导出文件的 `account_id` 查本地表,而导入按 `(platform, handle)` 重映射;`crypto.randomUUID()` 使两机永不共享 id,跨设备导入必然误报"新增" |
| 缺陷 3 | 每日统计时长静默覆盖。`differs()` 只比较 SELECT 出的列,冲突检测漏了 `active_seconds`/`duration_seconds`,而 overwrite 分支会写它们 |
| 测试基建 | 新增 `tests/electron/ojSubmissionBridgeSmoke.test.ts`,真实 preload + `sandbox: true` 六段握手,含导航后 token 复用（push 方案失效点）;变异验证确认非空跑 |
| 流血修复 | `test:all` coverage 步长期红（`userScriptRuntimeSmoke` 未从 Vitest glob 排除）;补 exclude 并加第 8 条守卫双向兜底 |
| 阈值 | coverage 阈值 28/34/24/29 → 55/53/52/58 |

三个缺陷均先写失败测试再修，测试位于 `tests/db/backupImport.test.ts`。

## 3. 执行顺序与目标分

| 块 | 内容 | 目标增分 | 累计 | 性质 |
|---|---|---|---|---|
| Q1 | renderer 读路径错误处理与全局 rejection 兜底 | +4 | 85 | 缺陷修复 |
| Q2 | coach 收回 API 层 | +2 | 87 | 一致性 |
| Q3 | 分层与设计系统守卫 | +2 | 89 | 防退化 |
| Q4 | 设计系统零散漂移收口 | +1 | 90 | 一致性 |
| Q5 | preload 纳入覆盖率 | +1.5 | 91.5 | 可验证性 |
| Q6 | `TabManager.ts` 拆分 | +3 | 94.5 | 结构 |
| Q7 | IPC 边界 `any` 收敛 | +1 | 95.5 | 类型安全 |
| Q8 | `tests/` 纳入类型检查 | +1.5 | 97 | 可验证性 |
| Q9 | IPC 渠道载荷校验 | +1.5 | 98.5 | 安全边界 |
| Q10 | 源码字符串测试行为化 + 被阈值吸收的缺陷 | +0 | 98.5 | 可验证性（补口径，不加分） |

Q1–Q4 是确定工作量的机械活，不含架构决策，应连续执行。Q5 依赖 Q1 完成（preload 覆盖率需要 renderer 侧错误路径可测）。Q6 需要独立设计评审，不与前面混提交。

Q8 是计划外的：Q7 收尾时想确认"测试替身是否也跟着收窄了"，才发现 `tests/` 从来不在任何 tsconfig 的 `include` 里。它同时补掉了一处**评分口径错误**——此前"1043 个测试全绿"被当作可验证性的证据，而其中至少一条断言恒成立、一条在验不存在的字段、一整类主进程推送在每次测试里都静默失败。

Q9 补掉的正是上一版这里记为"当前最大单项缺口"的那 1.5 分（渠道载荷校验，原见 §4 Q7 末段）。

Q10 **刻意记 +0**。它修掉的是"已有分数的证据不成立"，不是新增能力：三份测试文件用源码字符串断言冒充行为验证，一道 80% 的准确率阈值吸收了 5 个真实解析错误。把这些算成加分等于对同一件事收两次钱——第一次是当初把它们计入"测试与可验证性"的 14 分。真实效果是让那 14 分站得住，而不是变成 15 分。

剩余约 1.5 分：type-aware lint 缺失，卡在上游（TS 7.0.2 与 `typescript-eslint` 兼容性），不由本计划解决。这一项能补上之前，98.5 是本计划范围内的上限——把它记成 100 会是虚报。

## 4. 任务清单

### Q1 renderer 读路径错误处理

**问题**：写路径与读路径的错误处理系统性分裂，不是零散疏漏。feature 层 27 处 `try-catch` **全部**位于 save/action handler,load-on-mount effect 则大面积缺失。

> 实施期逐文件复核修正：原文"load-on-mount effect **全部**没有"过宽。`SearchEnginePanel`、`SessionTimelineView`、`CoachMetricsView`、`CredentialsPage`、`SettingsPage.loadRealtimeStatus` 以及 `HomePage` 四处调用中的两处已有处理。实际缺口 **12 处,分布在 9 个文件**。

主进程有 `electron/app/mainProcessErrors.ts` 完整处理 `unhandledRejection`,renderer 侧为 **0**。React `ErrorBoundary` 只捕获 render/lifecycle 异常,捕获不到 promise rejection。后果：IPC reject 时面板停在初始 state,显示空值或默认值,不报错不提示,用户无法区分"无数据"与"读取失败"。

已确认样本：

| 文件 | load 路径 | save 路径 |
|---|---|---|
| `LlmConfigPanel.tsx` | `.then()` 无 catch | `try-catch` 有 |
| `CoachPanel.tsx` | `.then()` 无 catch,且绕过 API 层 | — |
| `CodeforcesSyncPanel.tsx` | 无 `void`,浮空 promise | `try-catch` 有 |

**根因**：`no-floating-promises` 需要 type-aware lint。项目 TS 7.0.2,`typescript-eslint` 未安装,该类规则整体不可用（`eslint.config.js` 已注明原因）。这解释了漂移为何未被自动拦住,也意味着必须用运行时兜底替代。

**子任务**：

- Q1a 全局 `unhandledrejection` 处理器挂在 renderer 入口，reject 原因走既有 `Toast`/`NoticeBar` 通道，同时 `console.error` 保留可诊断性。不得吞掉原始 error 对象。
- Q1b 上表三个面板补 catch 与错误态，错误态复用 `NoticeBar`,不新增视觉元素。
- Q1c 逐文件确认其余 feature 的 load effect,一次收干净。**不得**依赖粗粒度脚本扫描结果,须逐个打开确认。

**验证**：`test:unit` 新增用例,模拟 IPC reject,断言面板呈现错误态而非停在空态;`test:core`、`typecheck`、`lint` 全绿。

**边界**：只改 renderer;不动主进程;不改色板、字体、布局基调、按钮形态、动画。

> 实施期偏离说明：**"不动主进程"未能守住**。`TabManager.updateBounds()` 按已知通知条数量累加 `topInset`,主进程不知情的 NoticeBar 会被 `WebContentsView` 直接盖住;`.ui-toast-viewport` 是 `fixed; right/bottom: 16px`,同样落在 web view 矩形内,所以 Toast 也不是免主进程改动的出路。为保证 web 标签活动时错误可见，新增 `browser:setErrorNoticeVisible` 通道,涉及 `TabManager.ts`、`registerBrowserShellIpc.ts`、`preload.ts`、`electron-env.d.ts`、`main.ts` 五处。视觉基线未变。

### Q2 coach 收回 API 层

**问题**：renderer 共 151 处 `window.electronAPI` 调用,123 处位于 `*Api.ts`（正确）,28 处直接写在 `.tsx` 里,其中 **27 处属 coach**。`coachDataApi.ts` 注释写着"与 problemsApi / analyticsApi 一致",实际未被遵守。

| 文件 | 直连处数 |
|---|---|
| `CoachPet.tsx` | 13 |
| `CoachBubble.tsx` | 7 |
| `CoachPanel.tsx` | 4 |
| `CoachChatPanel.tsx` | 3 |
| `CredentialsPage.tsx` | 1 |

> **实施期修正（本块统计有误）**：实测总数是 **164 处**,不是 151;`.tsx` 中是 **38 处**,不是 28。上表漏了 `App.tsx` 的 **9 处**（7 处凭据提示 + 2 处 coach）和 `main.tsx` 的 1 处。coach 小计 27 是对的。
>
> `App.tsx` 的 9 处按归属分流：2 处 coach 进 `coachDataApi.ts`,7 处凭据提示进 `hooks/browserShellApi.ts`（与 userscript host 授权同形状,属壳层而非 feature）。`main.tsx` 的 1 处是同步读取 preload 注入的布局常量,不是 IPC 调用,作为入口文件保留并在 Q3b 守卫中显式豁免。

**做法**：全部搬入 `coachDataApi.ts`,签名与命名沿用既有约定（`load*`/`subscribe*`/`save*`）。纯机械搬移。

**验证**：`test:core` 应零改动通过。若有测试失败即说明搬移出错，这正是该块的验证价值。

> **实施期修正（验收口径需放宽）**："零改动"这条对 coach + settings 部分成立,对 `App.tsx` 不成立,已知会改 3 个测试文件的替身,这是搬移的必然结果而非搬移出错：
>
> - `appContestNotice.test.tsx`、`appErrorNotice.test.tsx` 原先整体赋值 `window.electronAPI` 来喂 App 的 coach/凭据调用。调用搬走后模块边界移动,替身边界必须跟着移动 —— 改为 `vi.mock` 两个 API 模块。这同时是收口的收益之一：替身从"整个 preload 表面"缩小到"两个具名模块"。
> - `credentialsPage.test.tsx` 已 `vi.mock` 整个 `settingsApi`,新增的 `loadCookieSummaryForSite` 不在替身里会返回 undefined,需补一条 mock。
>
> 断言与用例数量均未改动（12 个用例全部保留、逐条通过）,改的只是替身接线。判据因此细化为：**允许改替身接线,不允许改断言或删用例**。

### Q3 分层与设计系统守卫

**问题**：现有 8 条守卫全部针对安全边界，没有一条约束分层或设计系统。文档立的规矩只能靠人记，Q1/Q2/Q4 的成果可再次漂移。这条是乘数项。

**新增守卫**：

- Q3a 裸 SQL 只允许出现在 `electron/db/` 下。当前越层 30 处：`NoteService.ts` 12、`tracking/trackingRepository.ts` 4、`weaknessAnalyzer.ts` 4、`contextTagStats.ts` 3、`reviewRecommender.ts` 2、其余各 1。**先加白名单并注明待清理**,避免本块膨胀为大重构;白名单只减不增。

> **实施期修正（本块统计同样有误）**：实测 **61 处 / 13 个文件**,不是 30 处。上表漏了最大的一个：`backup/learningDataExport.ts` **34 处**（泛表导出导入,按表展开的 SELECT/INSERT）。另外上表的 `weaknessAnalyzer.ts` 4、`contextTagStats.ts` 3、`reviewRecommender.ts` 2 实测都是 1,差值来自按 SQL 关键字计数会把同一条语句里的子查询和注释重复计入。
>
> 判定口径因此定为"对 `db` / `database` / `getDb()` 调 `prepare` / `exec`",不按关键字：关键字会命中注释和文档字符串,也漏掉动态拼表名的写法;而只限定方法名会把 `regex.exec()`、`installer.prepare()` 算成违规（实测 3 处误报源）。
- Q3b feature 层不得直连 `window.electronAPI`。依赖 Q2 完成后方可启用。
- Q3c 设计系统：`ui/` 之外不得新增裸 `<button>`/表单控件。需先确认合法例外（见 §5）,以白名单形式固化。

**验证**：每条守卫须双向验证——删除对应修复后守卫必须失败。这是第 8 条守卫已建立的做法。

**附带**：`tracking/trackingRepository.ts` 命名为 repository 但不在 `db/repositories/` 下,应一并归位或改名。

> **实施期补充**：
>
> **Q3c 实测 45 处 / 18 个文件。** 按性质分三类,白名单条目里注明属于哪一类：
>
> - **长期例外 · 浏览器原生 chrome**（15 处）：`BrowserToolbar` 6、`WindowControls` 3、`TabStrip` 3、`Omnibox` 2、`FindInPageBar` 1。几何按像素对齐系统窗口装饰,`ui/Button` 的内边距与圆角体系不适用。
> - **长期例外 · Coach 独立视觉域**（10 处）：`CoachActions` 4、`CoachBubble` 3、`CoachChatPanel` 3。§5 已定 Coach 的 token 分叉不动。
> - **待清理欠账**（11 处,Q4 目标）：`ProblemSidebar` 5、`HomePage` 2、`NoteEditorPane` 2、`UserScriptEditor` 1、`ErrorBoundary` 1。
>   **Q4 结果**：清掉 9 处（四个文件归零，白名单条目由棘轮的陈旧条目分支强制删除），剩 `HomePage` 2 处改判长期例外，理由见 Q4 实施偏差第 3 条。待清理欠账归零。
>
> 另有 **6 处 `checkbox` / `range` 按类型豁免**：`ui/fields.tsx` 只有 `Input` / `Select` / `Textarea`,没有 Checkbox/Radio/Range 组件,现在挡住等于逼人手写更差的东西。豁免写在守卫里并注明"补齐组件后删掉,届时有 6 处要改"。
>
> **守卫的反向验证做成了常驻测试。** 计划只说"删除对应修复后守卫必须失败",实施时先用临时脚本改真实文件跑了 9 项端到端反向验证（全部按预期失败）,但这种脚本不能入库。因此把判定逻辑拆到 `tests/architecture/guards.mjs`,由 `tests/architecture/guards.test.ts` 用合成输入覆盖失败侧,12 个用例随 `test:unit` 常驻。又用变异检查确认这 12 个用例不是空转：故意弄坏 5 处判定逻辑,测试全部抓到。
>
> **棘轮机制多了一条"陈旧条目必须报"。** 只查"超预算"不够：白名单会一直挂着已经还完的欠账,下次有人往那个文件加违规时守卫不会响。归位 `trackingRepository.ts` 后正是这条把陈旧条目报了出来,白名单随之从 13 个文件 61 处降到 12 个文件 57 处 —— 棘轮在真实清理中验证了一次。
>
> **附带项按"归位"处理**：`electron/tracking/trackingRepository.ts` → `electron/db/repositories/problemVisitRepository.ts`,同时改名（`tracking` 是业务侧的名字,不该用来指代数据访问;文件写的是 `problem_visits` 与配套 activity event）。测试内 `describe` 名同步改。

### Q4 设计系统零散漂移

| 项 | 位置 | 处理 |
|---|---|---|
| 硬编码配色 | `notesTypes.ts` 的 `NOTE_TYPE_COLORS` 三个 Catppuccin 深色系 hex(`#a6e3a1`/`#f9e2af`/`#89b4fa`),用在浅色界面,且用 `+ '20'` 拼 alpha | 改为设计 token,alpha 用 `color-mix` 或预定义 soft 变量 |
| 裸 hex | `ui.css` 两处 `#fff`、`app-shell.css` 一处 `#fff` | 改为 token |
| 系统色 | `app-shell.css` 的 `#e81123`(Windows 关闭键红) | 保留取值（对齐系统规范）,但需给出 token 名并注明来源 |
| 普通内部页裸 button | `HomePage.tsx` 的 `.home-site-btn`、`ProblemSidebar.tsx` 的 `.sidebar-item-notes`/`.sidebar-item-detail`/`.sidebar-collapse-btn` | 收进 `ui/` 组件 |

**边界**：视觉输出必须与改前一致。token 化是等值替换,不是重新配色。

> **实施偏差（2026-08-30）**：以下五点与上表不同，逐条记录理由。
>
> **1. "等值替换"这条边界在笔记徽标上不成立，实测推翻。** 先量了现状：文字色是原 hex，底色是同一 hex 叠 12.5% alpha 压在白卡上 —— solution **1.41:1**、review **1.23:1**、summary **1.94:1**。这是可达性缺陷，不是配色偏好，等值替换会把 bug 一起保留下来。而本表暗示的修法（状态色文字 + soft 底）也仍然不过 AA：4.20 / 4.48 / 4.68。最后用的是代码库里已经验证过的配方 —— `.ui-notice-bar-*` 的 soft 底 + `--text-secondary` 文字，两个主题都量过：浅色 6.11~6.70:1、深色 5.54~7.74:1，10px/600 也满足 4.5:1。类型色也因此不再单独承义（徽标里始终有 `NOTE_TYPE_LABELS` 文字），与 `display.ts` 的既有规则对齐。实现上没走 `color-mix`：改成 `.note-item-type--{type}` 修饰类，未知 `note_type` 只留基类走 `--bg-surface` 兜底 —— 那个值来自数据库，不能直接拼进类名。
>
> **2. 本表漏了第四处裸 hex。** `NOTE_TYPE_COLORS` 的 `fallback: '#585b70'` 也是硬编码（这处对比度 5.56:1，本身不违规，但同样是漂移）。删掉整个映射后一并消失。
>
> **3. `HomePage.tsx` 的卡片磁贴不收进 `ui/`，改判长期例外。** `.ui-btn` 是单行内联标签的底座（`justify-content: center` + `white-space: nowrap` + 固定高度），而 `.home-site-btn` 是多行卡片（列向 flex + 省略号 URL）。套上去要再写四条声明去撤销基类，可读性反而更差，全项目只此一处也不值得为它加 Button 变体。只补了 `type="button"` —— 那是走 Button 唯一能拿到的实质收益。其余四个文件（`ProblemSidebar` / `NoteEditorPane` / `UserScriptEditor` / `ErrorBoundary`）已清零，由 Q3 棘轮的陈旧条目分支强制删除白名单条目，Q3 §附注里"11 处待清理欠账"的口径随之收成 2 处长期例外。
>
> **4. 顺手修掉一个没人报过的渲染 bug。** `UserScriptEditor.tsx` 的只读源码框写的是 `<textarea className="ui-input mono" rows={12}>`，而 `.ui-input` 设了 `height: 30px` —— `rows` 被压死，源码框一直只有 30px 高（已确认 `scripts.css` 里没有覆盖）。换成 `Textarea` 后恢复。这条说明"搬进 `ui/`"的收益不止统一外观。
>
> **5. 本块之外的发现：Tailwind 的工具类零消费者，但依赖不能删（结论已纠正）。** `ErrorBoundary.tsx` 是全项目最后一处 Tailwind 工具类（`red-50/600/900`，与设计 token 无关），改成 `.crash-*` + token 后确实再没有人写工具类了。
>
> 但由此推出"`@tailwindcss/vite` 已无人使用、可以删"是错的。`src/index.css:11` 的 `@theme { … }` 是 Tailwind v4 的指令，44 个设计 token 全写在里面，靠插件编译成 `:root` 上的自定义属性；全项目有 111 个 `var(--…)` 消费它们。实测（临时注掉 `@import "tailwindcss"` 后重新构建）：`index-*.css` 从 12841 字节掉到 3686，`--color-app` 的定义出现 0 次 —— 也就是说删掉插件，整套配色会全部失效退回浏览器默认值，这正是「视觉基线冻结」要防的事。产物里另有 preflight（`box-sizing`、`margin:0`、`::placeholder`、`tab-size` 等重置）同样承重。
>
> 顺带澄清产物里那 28 个类选择器：`.mono` / `.num` / `.tab-0..3` 是 `index.css` 里手写的，其余 22 个（`.flex` / `.absolute` / `.filter` / `.table` / `.ring` …）是 v4 扫描源码时把 `Array.prototype.filter`、行文里的「table」、`during` 里的 `ring` 之类误判成类名生成的空转产物，无人引用。这层噪音无害，但也说明"产物里有 flex 类"不能当成"有人在用工具类"的证据。
>
> **结论：Tailwind 留下，作为 token 编译器与 CSS 重置来源，不作为工具类框架使用。** 与「固定技术栈：样式 TailwindCSS」一致。
>
> **另外**：本表没提但一并做了 —— 裸 hex 这条规则在 `index.css:8` 和 `REFACTOR_HANDOFF.md` 里都写着"已有守卫"，实际没有。补成第 12 条架构守卫（按文件豁免三个 token 定义文件，不进棘轮预算：定义 token 不是欠账，新增合法 token 不该让守卫响），当前即为零。`Select` 补了 `size="sm"`（24px，密集面板用），是这次暴露出的真实设计系统缺口。

### Q5 preload 纳入覆盖率

**问题**：`electron/preload.ts`、`electron/browser/ojPreload.ts`、`electron/scripts/userscriptBootstrapPreload.ts` 三个文件在 coverage 排除名单中。B6.7 的缺陷恰好位于 `ojPreload.ts`——排除项正好盖住了出问题的地方。

排除的原论据是"preload 在测试环境无法执行"。该论据已不成立：真实 Electron smoke 现在能驱动打包后的 preload。

**做法**：逐个移出排除名单，按实际可测量结果重设阈值。若某文件确实无法纳入，须在 `vitest.config.ts` 注明具体技术原因，不得只留文件名。

> **实施偏差（2026-08-30）**：
>
> 1. **"按实测重设阈值"这条做法本身是错的，没照做。** 实测：三个文件纳入但不补测试时，functions 掉到 **51.21%**，低于当时已有的 52 门槛——"按实测重设"在这里等于**下调**一个 `vitest.config.ts` 明确禁止下调的门槛（"Raise these together with coverage, never lower them"）。所以本块改成"纳入**并**补测试"，最终四项全涨：58.71/56.22/54.73/61.26 → **59.52/56.41/57.67/62.07**（新计入 311 条语句的前提下）。`preload.ts` 与 `ojPreload.ts` 四项 100%，`userscriptBootstrapPreload.ts` 95.55/88.88/100/100。
> 2. **排除的原论据错得比本计划以为的更基本。** 计划说"该论据已不成立：真实 Electron smoke 现在能驱动打包后的 preload"——但这是另一条链路，Vitest 收不到它的覆盖率。真正的事实是：这三个文件**一直**可以在 Vitest 下执行。它们是纯副作用模块，`import` 即执行，没有导出可断言，唯一的观察点是 `contextBridge` 收到了什么。为此给 electron 替身加了 `exposedMainWorld`（既记账又真的挂到 `globalThis`——`userscriptBootstrapPreload` 会用 `globalThis[bridgeKey]` 取回带随机 nonce 的桥，只记账那条路径在替身下永远走不通）。
> 3. **`vi.resetModules()` 会连 electron 别名一起重置。** 测试文件顶层 import 来的句柄属于另一个模块图，新加载的 preload 写进的是另一个 `exposedMainWorld` 实例。后果不是报错而是**两条负向断言凭空通过**——压根没接线，"不该发生"自然不发生。现在所有句柄都从 loader helper 的返回值里取，已写进两个测试文件的头注释，受影响的负向用例注明了它的正向对照。
> 4. 顺带修掉 `tests/README.md` 里陈旧的覆盖率基线（写的是 28/34/24/29）。三项保留排除已逐个注明技术原因，不再只留文件名。

### Q6 `TabManager.ts` 拆分

2284 行，全项目最大。问题是职责堆积而非过度设计。**需独立设计评审**,不与 Q1–Q5 混提交。拆分前须先补足行为测试作为安全网,拆分本身应为纯搬移。

`CoachOrchestrator.ts`(1248 行) 同类问题,优先级次之。

> **偏差：原定"把 `createView` 的 23 个事件回调整体搬到 `tabViewEvents.ts`"方案降级。**
> 实测这些回调触碰 **42 个**不同的 owner 成员（`findTabByView` 14 次、`emitPageEvent` 6 次、`activeTabId` 6 次……）。搬出文件就必须让这 42 个私有成员对外可见——要么造 42 成员的宿主接口，要么一次 `as any` 破掉类型。为一个调用点付这个代价，本身就是过度设计。
>
> 改为优先做零接口代价的去重与死代码清理，均已定量核实：
>
> | 项 | 行数 | 依据 |
> |---|---|---|
> | 6 个 `add*Listener` 同形拷贝收成一个泛型辅助 | ~25 | 各 6 行，只差字段名与回调类型 |
> | 6 个通知条布尔字段收成一个 `Set` | ~23 | 字段 6 + setter 24 + `updateBounds` 6 + `destroy` 6，加一个通知条现在要改四处 |
> | `did-navigate` / `did-navigate-in-page` 去重 | ~16 | 守卫之后 **14 行字节完全相同**，机械 diff 已证 |
> | 删 `getTitleForUrl` | ~19 | 全仓只有定义本身与 `electron/browser/README.md:88` 的文档条目，`getTitleForPage(event)` 已完全取代（3 个生产调用点） |
> | 删 `emitZoomState` 的 `factor === undefined` 分支 | ~8 | `applyZoomToView` 返回 `number`，5 个调用点全部显式传值；分支内的 try/catch 永不触发。参数改必填由类型系统接管 |
>
> 合计约 91 行，公开接口零变动。搬移改走窄缝：find-in-page 簇 74 行、耦合面 7 个成员，比 42 窄一个量级。
>
> 另记两笔待清：`if (tab.id === this.findInPageTabId) this.clearFindInPage()` 有 8 份拷贝散在生命周期各处，这个不变量没有名字；`failTabRecovery` 的第三道守卫 `!this.findTab(tab.id)` 实际不可达——六条标签页移除路径全部先清 `recoveryPendingViews`，第一道守卫已经吞掉了关闭场景。
>
> **执行结果：五项全部完成，`TabManager.ts` 净减 40 行（+78 −118），公开接口一处未动，全套 940 例绿。**
> 通知条 `Set` 化补了两条断言：六种通知各占一格且独立释放（`show.forEach` 逐条开、逐条关），以及重复投递同一状态不再排版——后者需要在 `MockWebContentsView` 上加 `setBoundsCalls` 计数才可观测。两条变异检查确认承重：把 `credentialCapture` 别名成 `credentialAutofill`，`expected 230 to be 268` 红；把 `contest` 别名成 `download`，`expected 154 to be 192` 红。
> 一处修正：`setNoticeVisible` 初版用 `visible ? !has(kind) : delete(kind)` 一行同时求变更位与执行删除，可读性换不到任何收益，改回与原 setter 同形的先判后写。
>
> **另：8 份拷贝的查找栏不变量已命名。** 实际是两个不变量而非一个：`clearFindInPageForTab(tabId)`（这个标签页的文档即将失效——崩溃、关闭、过户、被内部页替换、重新导航、重载，共 8 处）与 `clearFindInPageWhenLeaving(tabId)`（即将切到另一个标签页，共 2 处）。净 +17 行——命名不变量是花行数买可发现性，不是省行数。两条变异检查：前者置死 2 例红（`expected 116 to be 78`），后者置死 1 例红（`expected [] to deeply equal [ObjectContaining{…}]`）。
>
> **窄缝搬移经测量后不做。** 对全部 134 个类成员做了跨簇引用统计：
>
> | 簇 | 行数 | 簇外成员依赖 |
> |---|---|---|
> | `createView` | 274 | 42（经 `owner.`） |
> | 过户（`releaseTab`+`adoptTab`+`restoreReleasedTab`） | 250 | 30 |
> | 会话恢复 | 83 | 11 |
> | find-in-page | 92 | 7（其中 3 个是自有状态，会随簇搬走，真实宿主依赖 4 个 + `updateBounds` 需回读 `findInPageTabId`，双向面 5） |
> | 缩放 | 61 | 6 |
>
> 结论：2262 行里占比最大的两块（`createView` + 过户 = 524 行，23%）耦合面 42 与 30，搬出去的代价就是把私有实现整片公开；最窄的两块（find-in-page 92 行 4%、缩放 61 行 2.7%）要各付一个 4~5 成员宿主端口换 7% 的行数搬移，且 find-in-page 的**纯状态机早已在 `electron/browser/findInPage.ts`**（`reduceFindInPageCommand` / `parseFindInPageCommand` / `applyFindInPageResult`），留在 `TabManager` 的正是必须触碰 Electron 与版面的非纯外壳——搬它等于把 4 个宿主依赖翻译成一个端口接口，读者要多跳一层文件才能看懂同一件事。
>
> 真实结论是：这个文件**宽而不深**——134 个成员、最大方法 274 行、其余全部 ≤113 行。它需要的不是机械切文件，而是把职责整体迁走（例如过户协调、会话恢复各自成为独立协作者），那属于浏览器化壳层重构的范围，不在本轮质量收口内。本轮到此为止，不做为了指标好看的搬移。

### Q7 IPC 边界 `any` 收敛

45 处 `any` 中,值得收的是 IPC 边界上那些——那里 `any` 会让 `checkIpcPayload` 的校验成果在类型层失效。其余（测试替身、第三方交互）按实际情况保留并注明。

**实施结论**：起始计数应为 **51 处**而非 45（原统计漏了 `as any` 形式）。四批提交后 `electron/` 里只剩 **1 处**，且是刻意保留的。

| 批次 | 提交 | 内容 |
|---|---|---|
| 1 | `54bd75d` | 用 `ScrapedSubmission` 承载抓取线索，消掉 12 处 `as any`。原先抓取器把题目线索塞进声明为 `SubmissionData` 的对象，下游只能 `as any` 捞回来 |
| 2 | `51ff33d` | 8 处 `catch (e: any)` 收敛到新增的 `electron/shared/errors.ts`；顺带合并 19 份重复实现（7 份同名本地副本 + 12 处内联展开） |
| 3 | `ddf30a7` | 数据库行、外部响应、注入脚本结果补真实类型：`NoteRow`、`AppliedVersionRow`、`CFUserInfoResponse`，6 处 `Promise<any>` → `Promise<unknown>` |
| 4 | `4f2137d` | 洛谷/PTA 抓取器载荷改用收窄（`LuoguRecord` + `PtaTableRow`），消掉最后 12 处 |

**收窄暴露出的真实缺陷（不只是类型问题）**：

- `syncService` 与 migration 009/011 的 `e.message` 在非 `Error` 抛出时**自己会抛 TypeError**，把真正的失败原因替换成"读不到 undefined 的属性"。
- `domScraper` 的 `data?.tables` 是对跨进程值的无检查属性访问，`Promise<any>` 让不存在的属性也能编译通过。
- PTA `cells[problemIdx].match(...)` 在行单元格数少于表头列数时（合并单元格、加载中占位行）抛异常，**中断整批解析**。已加存在性判断并补测试。
- 洛谷 `runtimeMs: record.time` 把字符串直接赋给声明为 `number` 的字段。已用 `finiteNumber` 统一转换，非数字落为"没这项"而不是 `NaN`。

四条新测试各用一次变异验证过：改回旧写法时恰好一条断言变红。

**刻意保留的 1 处（已由 Q9 消除）**：`electron/ipc/trustedSender.ts` 的 `IpcListener` 当时仍是 `any[]`。收紧成 `unknown[]` 会让 12 个 `register*.ts` 里 **73 个处理器**一起报错——它们都把渲染进程传来的参数当成已校验类型用，而实际没有任何一处校验。这个 `any` 掩盖的是**渠道载荷校验缺失**这个真实缺口，不是类型标注问题；只改类型再补 73 处 `as` 只是把谎言搬个地方。

结论后来被验证：Q9 把 103 处渠道都加上 schema 之后，这一处收紧**零处需要 `as`**，`tsc` 第一次跑就是 0 错。如果当时选了"改类型 + 补 cast"，73 处 `as` 会一直留在那里，而缺口照旧。

### Q8 `tests/` 纳入类型检查

计划外新增。起因是 Q7 收尾时想确认"测试替身是否也跟着收窄了"，结果发现无从确认：`tsconfig.json` 的 `include` 是 `["src", "electron"]`，`tests/` 落在两者之外——**1043 个测试从来没被 tsc 检查过**。

新增 `tsconfig.tests.json` 后一次性报出 **129 个错**，逐个修到 **0**，并挂进 `tests/verify.mjs` 的 `runTypecheck()`（同时加 `npm run typecheck:tests`）。挂门这一步用"故意改坏一处类型"验证过会真的失败——否则新配置会像当年手工维护的 15 个文件名单一样慢慢腐烂。

**暴露出的真实缺陷（不是类型标注问题）**：

| 缺陷 | 后果 |
|---|---|
| `MockWebContents` 缺 `send()` | `AppWindow.send()` 把调用包在 try/catch 里，于是主进程→渲染进程的推送在**每一次测试**里都抛 TypeError 被吞掉、稳定返回 false。1043 个用例没有一个察觉 |
| `credentialRepository.test.ts` 把 `deleted_at` 和它自己比 | 该半条断言恒成立，软删除实际只验了 `secret_envelope` |
| `userscriptBootstrapPreloadModule.test.ts` 的 catalog fixture 写成构建输入形状（`source`/`grants`）而非产物形状（`ScriptDescriptor` 的 `permissions`），被 `as` 盖住 | "code 应来自 catalog" 这条断言在验一个真实 payload 里**不存在的字段**——它一直通过，靠的是 fixture 自己编了个 `source`。已改用生产 builder 造 payload（不再需要任何 cast），并补上"脚本正文不进 payload"的正向断言，变异验证通过 |
| `rendererScreenshotHarness` 声明返回完整 `ElectronAPI`，实际少 37 个成员 | 界面真调到就是 `undefined is not a function` |
| `constraintParser.test.ts` 第 14 道样例写了 `testGroupCount` 但类型里没这个字段 | 该期望一直参与准确率统计却没人核对过 |

**两处生产侧收窄——都是"声明要得比用得多"**：

- `trustedSender` 的注册参数原写 `Partial<Pick<WebContents,'once'>>`，把 Electron 的链式 `this` 返回一起要了过来，于是任何替身都得自证是完整的 94 成员 `WebContents`。一处牵连 5 个测试文件 **25 个错**。改为手写 `once?(event:'destroyed', listener:()=>void): unknown`——真实与替身都能传，返回 `unknown` 顺带禁止本模块链式调用。
- `SyncService` 的 `batchWriter` 原写完整 `SubmissionBatchWriter` 类。该类有两个 private 字段，private 让类型变成 nominal 的，**对象字面量无论写多全都不可能满足**；5 个替身有 4 个靠 `as any` 蒙过去，而 `as any` 盖的是整个 options 对象（连 `notifyProblemsUpdated` 拼错都不报）。改为 `Pick<…,'write'>`（本服务只用 `write`），4 处 `as any` 随之删除。

**方向：删 cast 而不是加 cast**。两处 `as never`（`credentialCaptureForm` 的 window 替身改按 `Pick<Window,…>` 声明）、两处 `as MockSession`、若干 `as Record<string, unknown>` 与 `as Buffer`（改用 better-sqlite3 的 `prepare<Params, Row>`，列名写错从此是编译错误）。给无参 `vi.fn` 补真实签名，使 `mock.calls` 的下标不再指向类型上不存在的位置。

**三类 TypeScript 收窄陷阱，各自伪装成别的错误**：

1. **闭包内赋值对控制流分析不可见**。`let h: Fn | null = null` 在回调里赋值，调用点仍认定是 `null`，`h?.()` 收窄成 `never` 后报"This expression is not callable"——和"可能为 null"完全不像。改用数组收集，顺带把"到底调了几次"也纳入断言。
2. **断言函数的收窄会过期**。`assert(arr.length === 0)` 把 `.length` 永久收窄成字面量 `0`，之后经未被追踪的路径改了数组也不会放宽，于是后面 `=== 1` 被判成"两个类型无重叠"。把断言收进 helper，让收窄落在形参上。
3. **无参 `vi.fn()` 让 `mock.calls` 推成 `[][]`**，读 `calls[0][0]` 报"长度为 0 的元组没有索引 0"——也就是说那几处断言一直在对类型上不存在的位置取值。

**一条走错的路**：曾想在 `tsconfig.tests.json` 里用 `paths` 把 `'electron'` 指向测试替身。类型会被擦除，拿替身检查生产代码只能得到假结论——试过一次，`CoachPetWindow` 那个真实的 `send` 缺失错误当场消失了。正确做法是替身专有的名字（`MockBrowserWindow`、`resetElectronMock`、`exposedMainWorld`）从替身文件的相对路径导入，只有真实 Electron 的名字才走 `'electron'`。

**已知遗留**：补上 `testGroupCount` 声明后暴露 5 条既有解析失败，被 `accuracy >= 0.8` 的阈值吸收（实测 54/59 = 91.5%）：CF 1343C `nUpper` 期望 200000 实得 1000；洛谷 P1001 `valueUpper` 期望 1e9 实得 null；CF 1343B `nUpper` 期望 2000000 实得 10000；洛谷多组数据 `nUpper` 期望 200000 实得 10000；CF 全角符号混合 `nUpper` 期望 100000 实得 null。属解析器准确率问题，不属本块范围，单独记账。

### Q9 IPC 渠道载荷校验

补掉 Q7 末段记为"当前最大单项缺口"的那一项，也就是上面那 1 处刻意保留的 `any[]` 真正掩盖的东西。

**缺口的实际形状**。三条防线原本缺最后一段：`checkShellSender` 管"谁能发"，`checkIpcPayload` 管结构上限与原型污染，但没有一处管"这个 channel 的参数长什么样"。156 处注册中 **103 处接收渲染进程参数**（两种数法交叉核对过：迁移 10 处 + 剩余 93 处），全靠 TypeScript 形参标注自述，运行时无人兑现。

后果是**静默错误而非注入**——这一点值得写清楚，因为它决定了优先级。实测 `stats:getTrends` 传 `'abc'`：`localDateDaysAgo` 算出 `'NaN-NaN-NaN'` 当日期绑进 SQL，查询匹配不到任何行，图表安静地变成空的，既不报错也不记日志。SQL 本身是参数化的，所以不是注入面；但"用户看到空图表却查不出为什么"这类问题会一直堆积。

**做法**。手写组合子（`payloadSchema.ts`，14 个：`text`/`freeText`/`pattern`/`localDate`/`int`/`decimal`/`bool`/`optional`/`nullable`/`oneOf`/`arrayOf`/`object`/`binary`/`raw`），不引入新依赖。四个注册函数各加一组重载支持 `handle(channel, schemas, listener)`，于是迁移可以一个文件一个文件做。失败即拒，不给静默默认值；`describe()` 只打印长度不打印内容（载荷可能含用户数据）。

**过程中发现的真实缺陷**（都不是类型标注问题）：

| 缺陷 | 后果 |
|---|---|
| `coach:saveConfig` 能写 `llm.encrypted_api_key` | 读路径脱敏（`getCoachConfigForRenderer` 摘掉该字段），写路径 `saveCoachConfig` 把 partial 直接深合并进 `config.json`，无任何过滤——壳 renderer 可绕过 safeStorage 加密直接往那一格塞值。`coach:saveLlmConfig` 同型 |
| `confirmImportSites` 不复判内置站点 | 预览会把内置站点路由进 `builtinSkipped`，但提交这步不再判，`updateSite` 也不看 `is_builtin`。一份把内置站点 id 同时写进 `sites` 与 `overwriteIds` 的载荷能覆盖内置站点行。形状校验拦不住，越权在语义层——修在 `site/importExport.ts` |
| `scripts:toggle`、`browser:setSidebarWidth`、`notes:updateType` 三处纯裸奔 | 只有类型标注，值直接进 UPDATE / `WebContentsView` bounds。`notes.note_type` 列是裸 TEXT 无 CHECK（migration 010），`NoteType` 联合此前只是编译期自述，任何字符串都能写进库再 `as` 回来 |
| `notes:saveImage` 渲染进程侧零检查 | `MilkdownEditor` 把整个文件读成 ArrayBuffer 直接发，既不看体积也不看类型；而**读**路径是硬化过的（`toNoteAssetDomUrl` 拒绝绝对路径、scheme、`..`）。读紧写松的不对称 |
| 棘轮机制本身漏一类失败 | 只有"超预算/未登记/已清零"三类，`count < budget` 不报。于是某文件从 23 处清到 5 处、预算仍写 23 时守卫照样 PASS，那 18 处欠账可以悄悄加回来。实测确认过：把一条预算从 2 上调到 3，守卫不响 |
| `payloadSchema.ts` 注释声称守卫在统计 `raw()`，实际没有 | 我自己写下的未兑现声明。`raw()` 是"没声明 schema"那条守卫的逃逸口，不上棘轮的话迁移可以靠刷它完成。已补第 17 条守卫 |

**一个自己造的坑**。`handleFromShell<S extends IpcSchemaTuple>` 推不出**逐位**类型：数组字面量会被推成数组而非元组，于是 `ParsedArgs<S>` 每一位塌成同一个联合。`[siteId(), bool]` 得到两个 `string | boolean` 形参。修法是加 `const` 修饰符。这个 bug 藏得住是因为参考迁移（`registerStatsIpc`）唯一的多参 channel 是 `[daysRange(), rowLimit()]`——**同构**元组塌了也看不出来。两个并行 agent 各自独立撞上并正确诊断出同一个根因。

`schemaEnforcement.test.ts` 里那条"形参分别是 string 与 number | undefined"原先只是注释里的声称，测试体推进 `unknown[]` 再拼模板串，两者都不区分位置，验不到这件事。现改成两个带类型的局部声明——丢了 `const` 当场 tsc 不过。

**收尾**：103/103 全部声明 schema，棘轮白名单清空（空表不等于关掉守卫：白名单外任何命中直接失败）。`IpcListener` 随之从 `any[]` 收紧为 `unknown[]`，**零处需要 `as`**——这正是 Q7 当时判断"补法是加载荷校验而非改类型"的验证。收紧后还多一层作用：新增带参 channel 忘写 schema 时参数是 `unknown`，handler 体内用不了，编译期就会推着人去声明，不必等架构守卫。用探针确认过这条会真的报错。

`raw()` 保留 4 处，全在浏览器壳层且各指向一个真实存在的判别函数（`isInternalPage` / `isZoomCommand` / `isAppMenuAnchor` / `TabManager.findInPage`）。要降下去需要先给本层加"判别联合"组合子，列为独立项。

**改判清单**（形状不对从返回兜底值改为拒绝，逐条确认过渲染进程调用点有 `catch`）：`credentials:rename`/`autofillRespond`/`captureRespond`、`scripts:getRemoteInstallPreview`/`confirmRemoteInstall`/`cancelRemoteInstall`、`tab:moveToNewWindow`/`finishDrag`、`userscript:respondHostPermission`。最后一条最值得记：`'stale'` 是"授权提示已过期，请重申"这个有含义的业务答复，把形状错误也答成它等于告诉渲染进程一件假话。

## 5. 明确不做

以下经核查确认为合理设计或实测无收益，**不列为缺陷，不做改动**：

| 项 | 结论 |
|---|---|
| coach 独立 token scope | `src/features/coach/styles/tokens.css` 已注明：桌宠是深色科技风悬浮窗,主界面浅色,刻意不映射。两套 token scope 是设计决定 |
| coach 平行按钮系统 | `.coach-action-btn` 与 `ui-btn` 职责重叠但服务不同视觉语言,同上 |
| 浏览器 chrome 裸 button | `TabStrip`/`WindowControls`/`Omnibox`/`BrowserToolbar` 有自身形态要求,硬套 `ui-btn` 反而错 |
| `synchronous = NORMAL` | 实测 2000 次 autocommit 插入：默认 44ms/41ms,NORMAL 41ms/42ms。差异在噪声内,不改 |
| 239 处未缓存 `prepare()` | 实测开销 10µs/call(13.2µs vs 3.0µs,4.35x)。单次 UI 查询不可见,只在行循环累积。唯一有影响的一处（导入预览）已修,476ms→199ms |
| statement cache 基建 | 承上,无需引入 |
| `reviewPlanner` N+1 | 上限 30 条 × 13µs ≈ 0.4ms,仅用户点击时触发。值得改的理由是分层（应走 `problemRepository`),已并入 Q3a |
| OJ token 不防页内伪造 | 设计边界而非缺陷,已在重构计划 §11.50 如实记录,下游由 `SubmissionWatcherCore` 的 adapter/URL/verdict 校验与提交去重收敛 |

## 6. 单块执行规程

每块独立完成、独立验证、独立提交，不跨块混提交。

1. 动手前确认该块边界，不扩大范围。
2. 缺陷类任务先写失败测试，确认失败原因符合预期，再修。
3. 收口类任务确认既有测试零改动通过；若需改测试，说明为何原断言不再适用。
4. 守卫类任务双向验证：删除修复后守卫必须失败。
5. 每块跑 `npm run typecheck`、`npm run lint`、`npm run test:core`,涉及数据库跑 `npm run test:db`,涉及真实 Electron 跑 `npm run test:electron`,涉及覆盖率跑 `npm run test:coverage`。

   > 实施期修正：`test:core` 原先跑一份手工维护的 15 项文件名单，实际只覆盖 **103/150** 个 Vitest 文件——`tests/adapters`、`tests/submissions`、`tests/shared`、`tests/diagnostics`、`tests/shortcuts`、`tests/tracking` 与 4 个 `tests/security` 文件一直在名单外。也就是说本计划前几块里凡是改到这些目录的，"跑过 `test:core`"并不等于验过。已改为跑整个套件（墙钟 9.9s → 11.3s），并加守卫禁止名单回归（第 14 条，反向用例 4 个）。Q7 的验证按修正后的口径重跑过。
6. 文档同步：涉及导出导入改 [DATA_EXPORT_AND_IMPORT](DATA_EXPORT_AND_IMPORT.md);涉及 schema 改 [DATABASE_SCHEMA](DATABASE_SCHEMA.md);本计划的完成状态回填 §8。
7. 提交信息用中文 `类型: 中文说明`,格式见 [COMMIT_RULES](../GOVERNANCE/COMMIT_RULES.md)。

**前端视觉冻结在全部块中有效**：不改色板、字体、布局基调、按钮形态、动画。Q4 的 token 化是等值替换。

## 7. 多设备同步前置结论（不在本计划执行范围）

用户目标是把存档数据库上传。以下是前置结论，实施属新功能，需单独规划。

**可上传的是 JSON 学习数据导出，不是 SQLite 备份文件。**

`createDatabaseBackup` 复制整个 SQLite 文件,内含 `site_credentials`,存的是 `safeStorage` 信封。该信封绑定本机 OS keychain,传到其他机器无法解开——上传等于把加密凭据副本放到云上,收益为零、风险不为零。

`exportLearningData` 是干净的：6 张表（`problems`/`problem_visits`/`submissions`/`user_daily_stats`/`platform_accounts`/`rating_history`）,剥离 `raw_json`、本地绝对路径与日志;`tests/db/credentialExport.test.ts` 断言导出中既无用户名也无密钥哨兵。

**尚缺三项**（前两项为设计缺口，非缺陷）：

| 缺口 | 现状 |
|---|---|
| 增量水位 | `sync_queue`(migration 020) 目前只有 schema,生产代码无生产者也无消费者。表结构够用（`entity_type`/`entity_id`/`operation`/`status`/`payload_hash`）,但无 watermark,无法回答"已上传到哪",只能每次全量导出 |
| 设备身份 | migration 021 已为核心表补 `updated_at`/`deleted_at`,LWW 地基具备,但**无 `device_id`**,冲突时无法判定来源机器 |
| 冲突粒度 | `importLearningData(data, overwrite)` 一个布尔管所有表。预览逐行列出冲突,但用户只能整体接受或整体拒绝,无法"这天用本机的、那题用远端的" |

第三项相关的一个具体隐患已在本轮修复（§2 缺陷 3）——否则合并档案时用时数据会静默丢失。

## 8. 完成状态

| 块 | 状态 | 说明 |
|---|---|---|
| Q1 | [x] | 已完成。12 处读路径补齐;新增 `src/rendererErrors.ts` + `src/shared/errors.ts`;错误通知栏接入主进程 topInset（见上方偏离说明）;顺带修掉 `Dashboard` 重算按钮永久禁用与 `CoachPanel` 乐观更新不回滚两个既存缺陷。新增 21 个用例 |
| Q2 | [x] | 已完成。`.tsx` 中 38 处直连全部收口,现为 0 处（`main.tsx` 读布局常量除外,非 IPC）。`coachDataApi.ts` 由 2 个函数扩到 24 个,分六组;`browserShellApi.ts` 新增 7 个凭据提示函数;`settingsApi.ts` 新增 `loadCookieSummaryForSite`。顺带修掉 `CoachPet` 点击处理里 `coachPetClick()` 无 catch 的悬空 promise（Q1 只扫挂载读路径,未覆盖事件处理器）。测试替身改 3 个文件,断言零改动 |
| Q3 | [x] | 已完成。守卫从 8 条增至 11 条。Q3a 裸 SQL 出 `db/` 层（白名单 12 文件 57 处欠账,建立时 13/61,归位 `trackingRepository.ts` 后即降）;Q3b renderer 只经 `*Api.ts` 触主进程（无白名单,仅 `main.tsx` 豁免）;Q3c 交互控件出 `ui/`（白名单 14 文件,标注长期例外与待清理）。棘轮含"陈旧条目必须报"分支。守卫判定拆到 `guards.mjs`,新增 12 个反向用例常驻 `test:unit`,并经变异检查确认非空转 |
| Q4 | [x] | 已完成。守卫增至 12 条（新增裸 hex，按文件豁免三个 token 定义文件而非棘轮预算）。`NOTE_TYPE_COLORS` 及 `+ '20'` 拼 alpha 删除，笔记徽标改 CSS 修饰类，对比度从 1.23~1.94:1 提到浅色 6.11~6.70 / 深色 5.54~7.74（原方案的等值替换会保留这个可达性缺陷，见偏差 1）；4 处裸 hex（计划漏了 `#585b70`）收成 `--color-on-fill` / `--color-sys-close` 两个 token，样式文件裸 hex 归零。`ProblemSidebar` / `NoteEditorPane` / `UserScriptEditor` / `ErrorBoundary` 四个文件的裸控件换成 ui/ 原语，棘轮欠账条目由陈旧分支强制清空，`HomePage` 2 处改判长期例外。顺带：`Select` 补 `size="sm"` 缺口、修掉源码框 `rows` 被 `height:30px` 压死的渲染 bug、补 2 处图标按钮缺失的 `aria-label`、`ErrorBoundary` 移出 Tailwind（工具类由此零消费者；**但依赖必须留** —— `@theme` 是 v4 指令，44 个 token 靠它编译，实测删掉后配色全失效，见偏差 5 的纠正）。新增 `controlGovernance.test.ts` 7 例 + 裸 hex 反向验证 4 例 |
| Q5 | [x] | 三个 preload 全部纳入覆盖率并补测试（`preloadSurface` 逐个调用 ~200 个暴露方法验转发、`ojPreloadModule` 11 例、`userscriptBootstrapPreloadModule` 12 例）；四项覆盖率反而全涨到 59.52/56.41/57.67/62.07，门槛上调至 56/53/54/59。原"无法执行"论据不成立，纠正见 §4 Q5 偏差 3 —— `vi.resetModules()` 导致两条负向断言曾凭空通过 |
| Q6 | [x] | 已完成（搬移经测量后判定不做，理由见 §4 Q6 偏差末段）。安全网：新增 `tabManagerNavigationGuard.test.ts`（14 例）与 4 个文件的补充用例，共 5 条变异检查逐条确认承重；顺带修掉两个既存缺陷：`userscriptBootstrapPreloadModule.test.ts` 里固定等一轮 `setTimeout(0)` 造成的间歇性失败（修前约 1/4 概率红，修后连续 4 轮全绿），以及 `tabManagerFindZoom.test.ts` 缺失的 `FindInPageViewState` import。清理：删 `getTitleForUrl`、`emitZoomState` 的 `factor` 改必填并删不可达分支、两个导航孪生体合成一个 `handleDocumentNavigation`、六个通知条布尔收成 `visibleNotices: Set`、六个 `add*Listener` 收成一个 `subscribe` 泛型辅助——净减 40 行，公开接口零变动。**侦察结论改变了拆分方案，见 §4 Q6 偏差** |
| Q8 | [x] | 计划外新增，commit `4b56b1c`。`tests/` 一直在 `tsconfig.json` 的 `include` 之外——1043 个测试从未被 tsc 检查。新增 `tsconfig.tests.json` 报出 129 个错，修到 0 并挂进 `runTypecheck()`（挂门用故意改坏类型验证过会真失败）。暴露 5 个真实缺陷，其中 `MockWebContents` 缺 `send()` 让主进程→渲染进程推送在**每次测试里**都静默失败、`credentialRepository` 有一条恒成立的自比断言、`userscriptBootstrap` 的 fixture 用错形状使一条断言在验不存在的字段。两处生产侧"声明要得比用得多"收窄：`trustedSender` 一处牵连 25 个错、`SyncService` 的 nominal 类型迫使 4 个替身用 `as any`。方向是删 cast（两处 `as never`、两处 `as MockSession`、若干 `as Buffer`）而非加 cast。遗留：`constraintParser` 5 条既有解析失败被 80% 阈值吸收，单独记账 |
| Q9 | [x] | 计划外新增，commit `ec9b851` + `f449b11`。补掉 Q7 末段记为"最大单项缺口"的渠道载荷校验：103 处收渲染进程参数的 handler 全部声明 schema，棘轮白名单清空，`IpcListener` 随之从 `any[]` 收紧为 `unknown[]` 且零处需要 `as`。暴露 6 个真实缺陷，其中 `coach:saveConfig` 能绕过 safeStorage 往 `llm.encrypted_api_key` 写（读路径是脱敏的）、`confirmImportSites` 能覆盖内置站点行（预览拦得住、提交这步不复判）、三处通道纯裸奔。顺带发现棘轮机制自己漏一类失败（预算高于实际不报，部分清理不可见）和一条我自己写下的未兑现声明（注释称守卫在统计 `raw()`，实际没有）。自造一坑：泛型参数缺 `const` 使异构 schema 元组塌成联合，两个并行 agent 各自撞上并正确诊断。新增 30 个用例，各经变异验证 |
| Q7 | [x] | 已完成。起始计数纠正为 51 处（原 45 漏了 `as any`），四批提交后 `electron/` 剩 1 处且为刻意保留（`IpcListener`）——**该项已由 Q9 消除**，收紧过程零 `as`，验证了当时"补法是加载荷校验而非改类型"的判断。收窄不是纯类型活：暴露并修掉 4 个真实缺陷——`syncService` 与 migration 009/011 的 `e.message` 在非 `Error` 抛出时自己抛 TypeError 覆盖真实失败原因、`domScraper` 对跨进程值的无检查属性访问、PTA 缺列行让 `.match()` 抛异常中断整批解析、洛谷把字符串赋给声明为 `number` 的字段。顺带把 19 份重复的 `errorMessage`/`errorName` 合并到 `electron/shared/errors.ts`。新增 7 个用例，各经变异验证 |
| Q10 | [x] | 计划外新增，commit `2f7f438`→`ed17df6`。主题是"证据不成立"，故记 +0（理由见 §3 末）。三份源码字符串测试改成行为测试：`coachPageOwnershipWiring`（`CoachOrchestrator` 首次有行为覆盖，此前该 1248 行文件被当作不可测）、`problemTitleExtractionWiring`、`mainResilience`（54 条断言降到 25，并发现 `main.ts` 能在替身下 import——`whenReady` 挂住不 resolve 时闸门内的同步装配全部可观察，新增 `mainStartupContract.test.ts`；把闸门条件改成恒真，新用例红而剩下 25 条源码断言全绿，正是源码断言的问题所在）。`constraintParser` 那道 80% 阈值实测 91.5%、吸收了 5 个真实错误：多测题面把数据组数 `t` 当主变量使 `nUpper` 差两个数量级，而 `buildHint` 只在 `nUpper >= 1e5` 时才建议收紧复杂度——多测题的提示因此**反向**；另两处是全角括号收不住区间右端、裸 `a, b` 落不进值域。修完 59/59，门改成"零失败"。顺带删掉一个零调用点却权限最大的渠道 `sites:update`（能改内置站点的 `domains`/`loginUrlPatterns`，而那两个字段决定自动填充往哪一页填密码）、给 `arrayOf` 加下限（`","` 输入产生的空 `domains` 会造出永不匹配的"已启用"站点）、`normalizePlanDays` 改判整数、删一处 tsc 探针证明不需要的双重 `as`。测试替身补 `dialog.showErrorBox`——缺它使"致命错误弹窗"在此前每次测试里都抛 TypeError 被吞（与 Q8 的 `send()` 同类）。自造一坑并记账：首版忘了注册 `setEnabledSitesFetcher`，`parseUrl` 恒返回 null，四条用例里三条**空转照绿**——只有正向那条会红。教训写进文件头：只有一条正向用例的套件里，那条正向用例同时是其余反向用例的脚手架检查 |

## 9. 已测量但未处置：暴露而无消费者的 preload 方法（31 个）

Q10 删掉 `sites:update` 之后顺手把同一类问题量了一遍，结论记在这里等决策，**没有动手删**。

测量方法（可重复）：取 `electron/preload.ts` 里 `electronAPI` 的属性键，在 `src/` 下找
`electronAPI.<方法名>` 的调用点。173 个暴露方法中 **31 个在 `src/` 下没有任何调用点**。

先说不是什么。这**不等于** `sites:update` 那种情况：那个渠道有已完成的站点管理 UI 却没人调
update，而且它能改内置站点的 `domains` / `loginUrlPatterns`——那两个字段决定凭据自动填充
往哪一页填密码，所以删掉是明确的。这 31 个绝大多数是**UI 还没做**（AI Coach 仍在规划中），
删掉等于删正在进行的工作。

按性质分三组：

| 组 | 方法 | 判断 |
|---|---|---|
| Coach（11） | `coachSetPetState`、`coachShowBubble`、`coachDismissBubble`、`coachRequestHint`、`coachGetWorkArea`、`coachGetSession`、`coachGetSessionHistory`、`coachGetMetrics`、`coachListEvents`、`coachListInterventions`、`coachExportAuditLog` | 宠物窗口有自己的 preload，壳侧这份是给还没做的 Coach 面板留的。等 UI |
| AI / 统计（17） | `exportAIContext(+Markdown)`、`getPeriodSummary(+Markdown)`、`getReviewPlan(+Markdown)`、`saveAIOutput`、`getAIOutput`、`listAIOutputs`、`deleteAIOutput`、`updateAIOutput`、`getDailyActiveStats`、`getSubmissionTrend`、`getPlatformDistribution`、`getLastActiveTime`、`recomputeDailyStats`、`getContestResults` | 等 UI。注意 `recomputeDailyStats(date?)` 与在用的 `recomputeAllDailyStats()` **不是**重复：一个重算单日、一个重算全部 |
| 其他（3） | `getBrowserDiagnostics`、`syncVjudge`、`getCookieSummaryForDomain` | `getCookieSummaryForDomain` 是 `loadCookieSummaryForSite`（在用）的按域名版本。查过它不违反 Cookie 规则：`toCookieMetadataInput` 只存 name / 过期 / httpOnly / secure / sameSite / purpose，**不存值**，摘要读的也是这张元数据表 |

风险量级与 `sites:update` 不同档：31 个里没有一个能改变凭据自动填充的落点，写路径
（`saveAIOutput` 等）在 Q9 之后全部有 schema 校验。所以这是**表面积欠账**，不是待修缺陷。

要处置的话有两条路，选哪条取决于 AI Coach 的排期：
1. 等 UI 落地后复测，届时仍无消费者的才删；
2. 现在就把它们从 `preload.ts` 挪进一个显式的"预留"清单，做 UI 时再逐个放出来。

不建议做的：为这件事加架构守卫。当前违规数是 31 而不是 0，守卫会立刻变成一份 31 条的
棘轮白名单；而且判定得靠字符串匹配方法名，`ojPreload.ts` 用常量引用 channel 的写法已经
让第一版脚本误报过一次（`oj-credentials:capture` 被判成无消费者，实际是 `import` 进去的）。
等违规数降到个位数再自动化更划算。

## 10. 两处口径修正（Q10 之后实测）

### 10.1 覆盖率数字是下界，不是真值

`vitest run --coverage` 报出的数字**不含 9 个真实 Electron 套件**——它们在
`vitest.config.ts` 的 `exclude` 里，由 `tests/verify.mjs` 用真实 Electron 单独跑
（`test:db` / `test:ai` / `test:coach` / `test:electron`）。

于是几个"看起来 0 覆盖"的文件其实是被测的，只是测它的那条链路不在 Vitest 里：

| 文件 | Vitest 报的 | 真正测它的 |
|---|---|---|
| `backup/learningDataExport.ts`（668 行） | 4.26% | `tests/db/backupImport.test.ts`（`test:db`，10/10 通过） |
| `ai/recommendations/*`、`ai/contextExporter.ts` 等 | 0% | `tests/ai/traceability.test.ts`（`test:ai`，2/2 通过） |
| `coach/llm/llmConfigStore.ts` | 24% | `tests/coach/llmConfigStore.test.ts`（`test:coach`，safeStorage 需要真实 Electron） |

结论不是"去把这些数字刷上来"——在 Vitest 里 import 它们要么需要真库、要么需要
真 safeStorage，硬凑只会把替身的行为算成生产的信心。结论是**读这个数字时记住它是下界**，
以及别拿"某文件 0%"直接当待办。判断某文件是否真没测，得先查它有没有在那 9 个套件里。

### 10.2 type-aware lint：卡点比原先记的更硬，且有一条代价明确的绕法

原文只写"卡在上游（TS 7.0.2 与 `typescript-eslint` 兼容性）"。查过之后可以给准数：

- 最新 `typescript-eslint@8.69.0` 的 peer 声明是 `typescript: '>=4.8.4 <6.1.0'`，
  本项目是 **7.0.2**，差两个大版本，`npm ci` 会直接 `ERESOLVE` 失败——不是装上之后
  规则不好用，是装不上。
- 根因不是版本范围忘了抬：TS 7.0 把编译器核心换成了 Go 实现（`tsgo`），而
  `typescript-eslint` 依赖的是 JS 侧的编译器 API，那套 API 在 7.0 里没有稳定版本。
  上游把 TS 7 支持的请求按 "not planned" 关掉了，替代 API 预计随 7.1 给出。
  同一个坑里还有 ts-jest、ts-morph，以及 Vue / Svelte / Astro 的模板类型检查。

**唯一可行的绕法及其代价**：把 TypeScript 6.x 作为第二份 devDependency 只给 linter 用，
构建与 `tsc --noEmit` 继续用 7.0.2。这能解锁 `no-floating-promises` 整套——正是 §4 Q1
记为漂移根因的那条规则。代价有三：装两份编译器；lint 依据的类型语义与构建的不是同一份
（对 lint 规则影响小，但确实是两套真值）；以及它动的是"固定技术栈"这条约束。

**这一条不自行决定**，因为它改依赖图、可能影响构建，属于需要拍板的范围，不是常规判断。
在拍板之前，98.5 仍是本计划范围内的上限；把它记成 100 会是虚报。
