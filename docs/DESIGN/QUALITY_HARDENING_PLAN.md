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

Q1–Q4 是确定工作量的机械活，不含架构决策，应连续执行。Q5 依赖 Q1 完成（preload 覆盖率需要 renderer 侧错误路径可测）。Q6 需要独立设计评审，不与前面混提交。

剩余约 4.5 分：type-aware lint 缺失约占 1.5 分，卡在上游（TS 7.0.2 与 `typescript-eslint` 兼容性），不由本计划解决。

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
> **5. 本块之外的发现：Tailwind 现在零消费者。** `ErrorBoundary.tsx` 是全项目最后一处 Tailwind 工具类（`red-50/600/900`，与设计 token 无关），改成 `.crash-*` + token 后，`@tailwindcss/vite` 与 `src/index.css:1` 的 `@import "tailwindcss"` 已无人使用。删构建依赖超出 Q4 范围，仅记录，留待单独决定。
>
> **另外**：本表没提但一并做了 —— 裸 hex 这条规则在 `index.css:8` 和 `REFACTOR_HANDOFF.md` 里都写着"已有守卫"，实际没有。补成第 12 条架构守卫（按文件豁免三个 token 定义文件，不进棘轮预算：定义 token 不是欠账，新增合法 token 不该让守卫响），当前即为零。`Select` 补了 `size="sm"`（24px，密集面板用），是这次暴露出的真实设计系统缺口。

### Q5 preload 纳入覆盖率

**问题**：`electron/preload.ts`、`electron/browser/ojPreload.ts`、`electron/scripts/userscriptBootstrapPreload.ts` 三个文件在 coverage 排除名单中。B6.7 的缺陷恰好位于 `ojPreload.ts`——排除项正好盖住了出问题的地方。

排除的原论据是"preload 在测试环境无法执行"。该论据已不成立：真实 Electron smoke 现在能驱动打包后的 preload。

**做法**：逐个移出排除名单，按实际可测量结果重设阈值。若某文件确实无法纳入，须在 `vitest.config.ts` 注明具体技术原因，不得只留文件名。

### Q6 `TabManager.ts` 拆分

2275 行，全项目最大。问题是职责堆积而非过度设计。**需独立设计评审**,不与 Q1–Q5 混提交。拆分前须先补足行为测试作为安全网,拆分本身应为纯搬移。

`CoachOrchestrator.ts`(1248 行) 同类问题,优先级次之。

### Q7 IPC 边界 `any` 收敛

45 处 `any` 中,值得收的是 IPC 边界上那些——那里 `any` 会让 `checkIpcPayload` 的校验成果在类型层失效。其余（测试替身、第三方交互）按实际情况保留并注明。

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
| Q4 | [x] | 已完成。守卫增至 12 条（新增裸 hex，按文件豁免三个 token 定义文件而非棘轮预算）。`NOTE_TYPE_COLORS` 及 `+ '20'` 拼 alpha 删除，笔记徽标改 CSS 修饰类，对比度从 1.23~1.94:1 提到浅色 6.11~6.70 / 深色 5.54~7.74（原方案的等值替换会保留这个可达性缺陷，见偏差 1）；4 处裸 hex（计划漏了 `#585b70`）收成 `--color-on-fill` / `--color-sys-close` 两个 token，样式文件裸 hex 归零。`ProblemSidebar` / `NoteEditorPane` / `UserScriptEditor` / `ErrorBoundary` 四个文件的裸控件换成 ui/ 原语，棘轮欠账条目由陈旧分支强制清空，`HomePage` 2 处改判长期例外。顺带：`Select` 补 `size="sm"` 缺口、修掉源码框 `rows` 被 `height:30px` 压死的渲染 bug、补 2 处图标按钮缺失的 `aria-label`、`ErrorBoundary` 移出 Tailwind（Tailwind 由此零消费者，是否删依赖单独定）。新增 `controlGovernance.test.ts` 7 例 + 裸 hex 反向验证 4 例 |
| Q5 | [ ] | 依赖 Q1 完成 |
| Q6 | [ ] | 需独立设计评审 |
| Q7 | [ ] | 待实施 |
