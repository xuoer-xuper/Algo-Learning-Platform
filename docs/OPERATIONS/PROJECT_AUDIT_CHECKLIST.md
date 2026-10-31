# 项目问题排查清单

编制日期：2026-09-08。初查与命令验证日期：2026-09-05，部分代码复核延续至编制日。

审查对象：Algo Learning Platform `2.0.0-rc.1`，代码基准 `97fab601d64cdb2022c4df1f6b46fc8ade490635`。开始调查时工作区存在 RC 修复，写入本清单前已确认工作区干净且该提交包含相关修复；本次没有提交、推送或修改业务代码。

## 1. 目标与结论边界

目标是找出会影响用户、数据、性能、安全或交付的真实问题，并提供能复现、能解释、能修复、能回归验证的证据。本文是第一阶段的排查范围和执行清单，不是已经完成的全项目漏洞报告。

本项目是 Electron 桌面应用，不是常规多租户网站。重点检查远程网页到本地能力的边界、长期学习数据的正确性、浏览器与多窗口生命周期、笔记和备份、用户脚本、AI 教练，以及 Windows 实机表现。未实现的云服务、移动端或多租户权限不凭空列为当前缺陷；只有当前产品承诺涉及的能力才验收。

判定原则：

- 只有明确的输入、执行路径、错误结果与影响，才能写成缺陷。代码中的 `any`、大文件、同步函数、空 `catch` 是线索，不自动等于 bug。
- 性能结论必须有数据规模、硬件、构建模式、测量方法和对照值。不能因为用了 Electron 或任务管理器显示数百 MB 就判定泄漏。
- 安全结论必须说明攻击者控制什么、跨越哪条信任边界、需要什么前提。已安装并获授权的脚本、本机同用户进程、普通远程页面的权限不同。
- 功能承诺、业务语义和设计取舍要分清。明确说明的限制可以记录为产品限制；与 UI 或文档承诺冲突时才记为“货不对板”。
- 已修复的历史问题转为回归检查，不重复充当新发现。同一根因在多个页面出现，只报一个主问题并列影响面。
- 单元测试全绿、覆盖率高、依赖审计为零，均不能推出整个产品没有问题。也不承诺有限审计能穷尽所有问题。

## 2. 优先级与证据

### 2.1 执行优先级

清单中的优先级表示先查什么，不代表已经确认的缺陷严重性。

| 标记 | 执行顺序 | 原因 |
|---|---|---|
| A | 第一批 | 数据丢失或污染、密码/密钥、远程页面越权、无法恢复、核心流程错误。 |
| B | 第二批 | 常用流程、资源增长、主进程阻塞、异步竞态、稳定性、发布链路。 |
| C | 第三批 | 长尾兼容、可访问性、维护成本、文档细节；出现实际重大影响时上调。 |

### 2.2 缺陷严重程度

| 等级 | 判定依据 |
|---|---|
| P0 | 大范围、可直接触发的不可恢复数据损坏，或无需高权限前提的严重本地能力失守等，需立即停止受影响操作/发布。 |
| P1 | 核心流程无法完成、重要数据丢失/错误归属、凭据泄漏等严重后果，有可复现路径和明确前提。 |
| P2 | 局部功能错误、显著性能退化、可恢复的不一致、影响有限或前提较强的安全问题。 |
| P3 | 轻度体验、文档、维护问题，能解释具体成本或误导，不能只表达审美偏好。 |

### 2.3 状态与关闭规则

- `待查`：尚未执行完整检查。第 6 节的条目初始均为此状态。
- `线索`：代码或测试暴露了可疑机制，尚未建立完整影响证据。
- `确认`：最小复现或清晰的确定性代码路径证明问题存在，记录证据与影响范围。
- `通过`：在写明的场景、规模和版本下符合判据，不代表所有输入都安全。
- `不适用`：写清与当前产品范围无关的原因。
- `受阻`：写清缺少的账号、硬件或环境，保留未验证状态。
- `修复并复验`：原始复现失败、修复后成功，相关回归通过，才能关闭。

## 3. 本轮已掌握的事实

### 3.1 项目范围

已阅读项目入口、功能说明、治理/安全文档、构建与测试配置，并抽查主进程、浏览器、IPC、备份、笔记、凭据、用户脚本、提交与 AI 实现。

主要技术为 Electron 43、React 19、TypeScript、Vite、SQLite/better-sqlite3、Milkdown、Recharts。运行边界包含主进程、壳 renderer、OJ WebContentsView、桌宠窗口、三个 preload 入口、本地文件、持久 session、公开 OJ API 与可选 LLM 服务。

当前声明支持 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode CN。站点支持要拆成识题、登录、实时提交、手动同步等能力分别验收。

### 3.2 已执行基线

以下是本轮实际执行结果，不能替代后续检查项。测试时本机 Node 为 `v24.13.0`；CI 固定使用 Node 22，环境差异需要记录。

| 检查 | 结果 | 能证明什么 / 限制 |
|---|---|---|
| `npm run typecheck` | 通过 | 生产 TypeScript 检查通过；本轮未单独运行测试 TypeScript 检查。 |
| `npm run lint` | 通过 | 当前 ESLint 规则通过，不证明业务逻辑正确。 |
| `npm run test:architecture` | 17/17 通过 | 已定义架构红线未触发，不是完整调用路径审计。 |
| `npm run test:security` | 通过 | 敏感文件/高置信模式扫描通过，不是完整安全测试。 |
| `npm run test:unit` | 169 个文件、1362 个测试通过 | 覆盖当前 Vitest 用例；部分测试输出 React `flushSync` 生命周期警告。 |
| `npm run test:db` | 通过 | 含备份导入、迁移安全、repository 与日统计基准。日统计基准一次报告 1.76 ms，仅适用于该样本。 |
| `npm run test:electron` | 通过 | 启动、userscript runtime、OJ bridge smoke 通过；使用受控页面和临时数据。 |
| `npm run test:packaging` | 7/7 通过 | 检查打包配置，不等于安装包实际安装/升级/卸载通过。 |
| `npm run test:docs` | 通过 | 检查链接、索引、约定等，不核实文档承诺的业务真实性。 |
| `npm run test:performance` | 通过 | 此次 renderer 入口 193,733 bytes，并检查指定 lazy chunks；没有测整体 RSS、CPU、GPU、启动时间或安装体积。 |
| 生产依赖 `npm audit --omit=dev`，官方 registry | 0 项 | 仅说明该次公告查询未报告生产依赖问题，不含所有 Chromium/Electron 安全风险。 |
| 完整依赖 `npm audit`，官方 registry | 2 个受影响包 | `fast-uri@3.1.5` 高危公告、`@xmldom/xmldom@0.8.13` 中危公告，均为构建工具的间接开发依赖；实际可利用性待分析。 |

默认 `registry.npmmirror.com` 审计接口返回 404/未实现，随后显式指定官方 registry 才完成查询；没有更改用户 npm 配置。不要把镜像审计失败当成“零漏洞”。

本轮未重新执行 `test:all`、覆盖率、独立 AI/safeStorage 专项、Playwright UI、完整生产打包和安装流程。交接文档中的历史通过记录只作背景。本轮也未使用真实 OJ 登录态、真实 LLM Key 或真实用户数据库做破坏性实验。

### 3.3 优先线索及依据

这些条目是排查起点。表中的“已确认”针对明确的代码事实或检查结果，影响尚未验证的部分不会被写成严重漏洞。

| 编号 | 已有依据 | 当前结论 | 下一步 |
|---|---|---|---|
| F-01 | [backupService.ts](../../algo-electron/electron/backup/backupService.ts) 的 `createDatabaseBackup` 仅调用 SQLite backup；[BackupPanel.tsx](../../algo-electron/src/features/settings/BackupPanel.tsx) 提示“完整备份请用数据库备份”；[noteStorage.ts](../../algo-electron/electron/notes/noteStorage.ts) 将图片保存在库外。 | 已确认备份范围与“完整备份”表述不一致。单个 SQLite 文件不包含笔记图片和其他库外配置/文件；实际恢复损失范围待演练。 | 在隔离用户目录创建带图笔记和配置，仅恢复该备份并核对；关联 BAK-01。 |
| F-02 | [NoteService.ts](../../algo-electron/electron/notes/NoteService.ts) 创建/保存笔记时先写文件再写 DB；标题更新只改 DB。文件创建写标题加正文，后续正文保存只写正文；空 DB 正文会回读文件。 | 已确认文件/DB 双写和内容格式不统一。失败时的不一致、空正文/外部编辑行为需用故障注入和交互复现确定。 | 验证磁盘错误、SQL 错误、空内容、标题变化、外部文件变化和重新打开；关联 NOTE-02 至 NOTE-05。 |
| F-03 | [backupService.ts](../../algo-electron/electron/backup/backupService.ts) 同步读取整个 JSON 并 `JSON.parse`；[learningDataExport.ts](../../algo-electron/electron/backup/learningDataExport.ts) 顶层解析检查标识/版本/表数组，未逐行完成字段语义校验。 | 已确认入口没有文件大小/总行数的读取前限制，顶层校验不足以保证行数据有效。主进程卡顿、内存峰值或数据污染须实测；不等同于 SQL 注入。 | 用有界合成文件验证资源占用、异常字段与整次回滚；关联 BAK-03/04、PERF-04。 |
| F-04 | [LlmHintService.ts](../../algo-electron/electron/coach/llm/LlmHintService.ts) 缓存以题目和等级为键，TTL 只在取值时判断；过期条目不删除，仅从启用切到禁用时清空。 | 已确认条目数量没有容量限制，模型/上下文变化没有完整进入缓存键或失效策略。长期内存影响和错误复用要测，不能仅凭 Map 判定严重泄漏。 | 假时钟和假响应验证过期清理、换模型、题目状态变化；关联 AI-07、PERF-06。 |
| F-05 | [CoachFeedbackStore.ts](../../algo-electron/electron/coach/CoachFeedbackStore.ts) 的每日升级计数在进程内；[AI_HANDOFF.md](../../AI_HANDOFF.md) 已记录重启清零。 | 已确认属于已知限制。是否为功能 bug 取决于“每日额度”是否要求跨重启持续；不能当成本轮新发现。 | 对照 UI 和成本控制用途，复验重启/跨日；关联 AI-08。 |
| F-06 | [vite.config.ts](../../algo-electron/vite.config.ts) 将 `ARK_DEMO_KEY` 构建时替换为字符串；[LlmConfigStore.ts](../../algo-electron/electron/coach/llm/LlmConfigStore.ts) 可降级使用它。 | 已确认有把环境变量编进产物的路径。未检查到或输出任何真实密钥，未证明实际发行包含有效 Key。 | 只用假标记值构建并检查产物，再核对发行策略；关联 SEC-10。 |
| F-07 | [registerCoachIpc.ts](../../algo-electron/electron/ipc/registerCoachIpc.ts) 对 `base_url` 做长度/类型校验；连接测试允许空 Key 时读取已保存 Key；[ArkClient.ts](../../algo-electron/electron/coach/llm/ArkClient.ts) 将其交给 SDK。 | 已确认配置来源与密钥出站目标需一起审查。自定义 LLM 地址是合法功能，不能单凭可改地址判定远程攻击成功。 | 用假 Key 和本地受控服务验证 HTTP、重定向、换 host 与授权提示；关联 SEC-09。 |
| F-08 | 官方 npm audit 与 `npm explain`（审计当时用 npm 锁文件；阶段 0.2 起锁文件为 pnpm）；[pnpm-lock.yaml](../../algo-electron/pnpm-lock.yaml) 锁定两个受影响版本。 | 已确认构建依赖含公告影响版本。`fast-uri` 经 electron-builder/app-builder-lib/ajv 引入；xmldom 经 plist 和 macOS 打包相关依赖引入。公告评级不直接等于桌面应用风险评级。 | 分析输入可控性、打包平台和发行包可达性，评估升级验证；关联 REL-03。 |
| F-09 | [checkRendererBundle.mjs](../../algo-electron/tests/performance/checkRendererBundle.mjs) 检查入口及 lazy chunk 名称；入口门槛为旧 2,221,300 bytes 基线的 65%，约 1.44 MB。 | 已确认“性能测试”覆盖范围窄，门槛显著高于本次约 194 KB 入口，不能有效约束所有实际性能退化。 | 测传递依赖加载、总 JS/CSS 和运行时资源；关联 PERF-01/02、QA-06。 |
| F-10 | [ci.yml](../../.github/workflows/ci.yml) 普通 PR 运行 core、配置/docs 和 renderer smoke；完整验证与 packaged smoke 是手动任务；[verify.mjs](../../algo-electron/tests/verify.mjs) 的真实 DB/AI/safeStorage 专项未全部纳入普通 PR。 | 已确认 CI 覆盖边界。部分 README 仍将 CI 概括为运行 `test:all`，需要核对和校正；不能说项目没有相关测试。 | 建立 PR 与发布检查映射；关联 QA-01/02、PROD-07。 |
| F-11 | 全量 Vitest 通过时，路由过渡和笔记隔离测试输出 `flushSync was called from inside a lifecycle method`；[ShellRouter.tsx](../../algo-electron/src/components/ShellRouter.tsx) 有 effect 内同步刷新分支。 | 已确认警告可见；尚未证明生产页面卡死或丢失输入。 | 在真实 Electron 快速切页、懒加载和降级路径记录命中与控制台；关联 UI-04、QA-04。 |

依赖公告链接：[xmldom](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6)、[fast-uri 主机混淆](https://github.com/advisories/GHSA-5jgf-p345-68v8)、[fast-uri IPv6](https://github.com/advisories/GHSA-f65p-4m7j-42xc)、[fast-uri 重复解码](https://github.com/advisories/GHSA-fph4-wmhf-6fwf)、[fast-uri scheme](https://github.com/advisories/GHSA-jqff-g426-hqxp)。公告结果有时效，正式处理时重查。

### 3.4 执行台账（2026-09-11）

用户要求“开始”后，已完成第一批有限场景的动态复现和独立复核，详见 [第一批审计报告](PROJECT_AUDIT_BATCH1_2026_09_11.md)。确认 8 项问题：2 项 P1、5 项 P2、1 项 P3；全部未修复。本节状态针对已验证场景，不表示对应检查项的所有组合均已覆盖。

| 范围 | 对应检查项 | 状态与证据 | 剩余边界 |
|---|---|---|---|
| 备份附件 | PROD-02、BAK-01、BAK-11 | 确认 AUD-001：源 notes 丢失后，SQLite 恢复正文成功但图片不存在 | session、脚本资源、配置及完整恢复说明尚未逐项演练 |
| 保存失败 | NOTE-02、NOTE-10、UI-02、DATA-12 | 确认 AUD-002：真实 SQL 故障造成文件/DB 不一致；组件收到 false 后仍显示“已保存” | 文件写满、实际窗口退出、并发保存等未实测 |
| 笔记路径 | NOTE-05、BAK-03 | 确认 AUD-003：外部题目 ID 经导入和建笔记服务写到 userData 外 | 只证明父目录可控、随机 UUID 文件名，不是任意指定文件覆盖 |
| 软删除统计 | DATA-04、DATA-05、DATA-10、BAK-07 | 确认 AUD-004：已删除 AC/访问仍计入状态、明细和日统计 | 触发于带 tombstone 的导入；正常 UI 硬删除不属于该复现 |
| 导入冲突 | BAK-06 | 确认 AUD-005：账号/rating 差异未报告，单独导入无法选择覆盖 | 访问记录差异、其他表和多窗口交错未完全覆盖 |
| 题库筛选 | UI-01、PROD-05 | 确认 AUD-006：201 题中的唯一较早 solved 题被最近 200 条截断 | 平台/搜索/状态组合及大规模性能待查 |
| 行语义校验 | BAK-03、DATA-10 | 确认 AUD-007：负时长导入成功且写入派生统计 | 其他字段、异常日期、大小上限与资源开销待查 |
| 空笔记表示 | NOTE-03 | 确认 AUD-008：空正文回读旧标题，按 P3 记录 | 外部编辑、多窗口、旧数据迁移未全面覆盖 |
| 导入回滚 | BAK-09、DATA-06 | 通过当前 SQL 失败样本：整批回滚，integrity/FK 检查正常 | 只覆盖一个失败点，不等同于全部故障恢复通过 |
| 安全信任与凭据 | SEC-02、SEC-04、OJ-07、PRIV-06 | 保留 S-01、S-02 两条只读线索；跨源动态复现因工具自动审核拒绝而受阻 | 未确认远程越权或凭据泄漏；其余安全项仍需检查 |

本批未修改业务代码；新增 `.repro` 脚本只用于保存审计证据，断言当前异常，不计入默认正确行为回归集合。第一阶段清单编制已完成，全项目审计尚未完成。

## 4. 执行方法

### 4.1 基本流程

1. 固定提交和构建模式，记录 OS、CPU、内存、DPI、Node/Electron 版本与启用功能。当前工作区变更另存 diff，不覆盖或撤回他人工作。
2. 建立临时 `userData`、临时数据库和合成题目/笔记/提交；对磁盘满、异常退出、恶意文件等实验使用独立测试进程。
3. 从 UI/网页/文件等入口追到 preload、IPC、service、repository、文件/网络出口，画清信任与所有权边界。
4. 先测正常路径，再测空值/上限/非法输入，再测异步交错、失败恢复和长期运行。
5. 把错误缩成最小复现，说明合理期望来自哪里，保留必要的截图、脱敏日志、SQL 对照和性能记录。
6. 对高风险或有争议结论做独立复核。代理总并发最多 2，即主代理加 1 个子代理；共享目录的构建/测试串行执行，避免争用输出目录。
7. 缺陷报告按严重性排列，记录通过项与未覆盖项。修复另行实施，修复后只跑受影响的专项及必需回归，不为追求次数重复全量测试。

### 4.2 常用验证技术

| 方法 | 适用问题 | 证据要求 |
|---|---|---|
| 代码追踪 | 越权、错归属、缓存失效、文件路径、错误处理 | 完整入口到副作用链，包含既有校验和限制。 |
| 单元/集成测试 | 去重、日期、映射、parser、规则、竞态 | 输入和期望来自业务事实，不照抄实现；确认改变关键行为会使测试失败。 |
| 真实 Electron + Playwright | preload、窗口、导航、DOM、编辑、焦点 | 临时 profile，验证真实状态变化，截图辅证；不能只断言页面存在。 |
| 受控 HTTP/HTTPS 服务 | 超时、重定向、异常 JSON、流式响应、请求次数 | 假 Key/假 Cookie，记录去向、取消、重试和体积，不把真实账号数据发往测试服务。 |
| SQLite 验证 | 导入合并、迁移、统计、软删除 | `integrity_check`、`foreign_key_check`、事实表与独立聚合对照、事务前后差异。 |
| 故障注入 | 磁盘错误、DB 锁、退出中断、失败清理 | 在确定的写入/回调阶段失败；恢复后检查数据，不能只断言抛错。 |
| 性能剖析 | CPU、RSS、GPU、I/O、主进程阻塞 | 进程树、持续采样、数据规模、重复次数、稳定期与峰值、对照场景。 |
| 有界模糊/属性测试 | URL、导入、IPC、脚本 metadata、verdict | 固定种子，限制输入/时间/内存，保存最小失败样本；只用合成数据。 |
| 产品验收 | 货不对板、流程不可用、误导 | UI/README 的具体承诺与实际结果一一对应，区分依赖第三方限制。 |

## 5. 测试场景与规模

以下是建议测试集，不是声称项目已经支持所有极限规模，也不是机械地执行所有组合。

### 5.1 数据与使用规模

| 场景 | 合成规模 | 关注点 |
|---|---|---|
| D0 首次使用 | 空数据库、无脚本、无 Key、未登录 | 启动、空态、默认配置和离线基本操作。 |
| D1 日常 | 1,000 题、10,000 提交、10,000 访问、100 笔记、少量图片 | 高频体验、搜索、统计、同步、备份基线。 |
| D2 长期积累 | 10,000 题、100,000 提交、100,000 访问、1,000 笔记 | SQL 索引、列表返回大小、导入/导出、启动与内存。 |
| D3 容量探索 | 从 D2 逐级增加至 10 倍，单独扩大图片/脚本资源 | 找拐点和保护边界，达到预设资源上限即停止。 |
| W0 资源隔离 | 内部首页、单空白测试页、单受控 OJ 页 | 分离 Electron 固定成本、应用成本和第三方页面成本。 |
| W1 正常多任务 | 1/4/8/16 标签；1/2/4 窗口 | 每标签增量、后台 CPU、切换、窗口关闭后释放。 |
| W2 生命周期循环 | 100 次开关/切题/转移；每批后等待稳定 | 进程、WebContents、listener、timer、Map、MessagePort 是否累积。 |
| W3 长时间运行 | 先 30 分钟筛查，再 4-8 小时实际工作负载 | 内存趋势、磁盘增长、睡眠恢复、失效定时器与网络占用。 |

窗口/标签数需结合运行时上限验证。会话序列化中的 16 窗口/128 总标签限制，不自动等同于运行时允许创建的上限；二者不一致可能造成重启后静默丢标签。

### 5.2 交叉条件

| 维度 | 必测条件 |
|---|---|
| 平台 | 七站分别验证；登录/未登录/过期、练习/比赛、本人/他人记录、SPA/整页跳转/iframe。 |
| 网络 | 离线、慢响应、断流、DNS 失败、证书错误、代理、401/403/429/5xx、错误 Content-Type、合法重定向。 |
| 文件与数据库 | 空文件、截断 JSON、旧版本、未来版本、重复业务键、非法外键、只读目录、文件占用、锁库、磁盘空间不足。 |
| 时间 | 北京时间跨午夜、月末/年末、闰日、错误日期、系统时区切换、时钟前后跳、睡眠/唤醒。 |
| 窗口与显示 | 1280x720、1920x1080、窄窗口、100%/125%/150%/200% DPI、多屏负坐标、拔屏、最小化、原生菜单/文件对话框。 |
| 输入与内容 | 中文 IME、长标题/URL、混合语言、emoji、长代码块、公式、损坏图片、超大图片尺寸、快速连续点击。 |
| 故障位置 | 请求发出后切题、await 期间换窗、保存中退出、转移中销毁、迁移中断、恢复中再次失败。 |

优先组合：带图笔记加恢复、正式提交加切题、凭据解密加导航、脚本授权加转移、比赛开始加 LLM 在途请求、大导入加磁盘失败。

### 5.3 性能判据

- 使用 production 或明确命名的测试构建，禁用会改变结果的 DevTools/热更新，并记录 Coach、脚本、页面资源是否开启。
- 同一环境至少 3 次比较；启动/高频交互适当增加次数。报告中位数、P95、峰值和样本量，单次 1.76 ms 不外推为全应用性能。
- 采集整个 Electron 进程树并区分 main、renderer、GPU。明确用 working set、private bytes 还是 RSS，避免简单相加共享内存造成误判。
- 主进程事件循环连续阻塞超过 100 ms、常用本地操作 P95 超过 300 ms、稳定空闲 CPU 持续超过约一个逻辑核的 2%，可作为启动调查的信号，不直接作为所有机器通用的失败标准。
- 同硬件同负载中位数/P95 退化超过 20% 且超过绝对噪声范围时追踪；内存连续三批生命周期循环持续增长、没有趋稳时做 heap/对象保留链分析。缓存预热和 Chromium 保留内存需要单独排除。
- 内存和安装包体积先测基线，再按目标设备确定预算；没有测量前不编造“应低于 100 MB”之类指标。
- 大任务允许耗时，但应有可理解的进度/失败结果，不能让整个应用长期失去响应、无上限占用内存或留下半成品数据。

## 6. 分模块详细清单

本节共 14 类、157 个检查项。每一项完成后记录状态和证据。下列条目均未因已有测试通过而自动关闭，条目数不代表缺陷数量。

### 6.1 产品承诺与流程闭环

入口：[项目介绍](../../.github/README.md)、[版本规划](../../VERSION_PLAN.md)、[BackupPanel.tsx](../../algo-electron/src/features/settings/BackupPanel.tsx)、各功能页面。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| PROD-01 | A | 七站“支持”是否具体兑现 | 建立站点乘能力矩阵：识题、登录、实时提交、手动同步、标题/语言/判定；不支持的能力应可辨识，不能用一个勾代表全部。 |
| PROD-02 | A | 备份/导出命名是否误导 | 对照实际文件范围和恢复流程；验证“完整备份”、学习数据、登录态、笔记图片的实际覆盖；结果见 BAK-01。 |
| PROD-03 | A | 学习时长、活跃、已解决是否名副其实 | 给出人工可计算的操作时间轴，对比 UI 与事实记录；后台挂页、休眠、未登录浏览不应被误称为有效学习。 |
| PROD-04 | B | AI Coach 的规则与 LLM 能力区分 | 无 Key、禁用、离线、失败降级时检查显示；规则建议不能伪装成模型推理，LLM 返回应有实际来源。 |
| PROD-05 | B | 核心流程是否形成闭环 | 从安装、打开题目、提交、记笔记、查统计到备份恢复走完；每步确认结果、退出和恢复入口，不以按钮存在为完成。 |
| PROD-06 | B | 用户脚本兼容程度 | 对照 UI/文档声称的 GM API、匹配规则、资源与更新；不兼容声明应有可解释反馈，不能“安装成功但无任何行为”。 |
| PROD-07 | B | 文档、版本、CI、发布物是否一致 | 核对版本号、支持 OS、命令、入口、CI 触发条件、changelog 与安装包；记录能导致误操作或验收遗漏的差异。 |
| PROD-08 | C | 展示稿、历史计划与当前功能混淆 | 对照根目录 showcase、历史方案和应用实际入口；未实现规划不得作为当前产品能力或当前缺陷重复统计。 |

### 6.2 Electron 安全与信任边界

入口：[main.ts](../../algo-electron/electron/main.ts)、[trustedSender.ts](../../algo-electron/electron/ipc/trustedSender.ts)、[payloadSchema.ts](../../algo-electron/electron/ipc/payloadSchema.ts)、[appProtocol.ts](../../algo-electron/electron/app/appProtocol.ts)、OJ preload 与脚本 bridge。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| SEC-01 | A | 所有窗口/弹窗的隔离配置 | 枚举创建、恢复、过户、OAuth popup 与桌宠分支；运行时确认 Node 禁用、隔离/sandbox 生效，继承 webPreferences 不能越界。 |
| SEC-02 | A | IPC sender、origin、frame、owner 校验 | 受控远程页面、子 frame、旧 WebContents、错误窗口调用各类 IPC；副作用应被拒，校验不能只靠 channel 名字。 |
| SEC-03 | A | 校验后的导航/销毁竞态 | 在 await 前后改变 URL、frame、tab owner 或销毁窗口；响应、权限或文件操作不得落到新页面/别的窗口。 |
| SEC-04 | A | preload 实际暴露面 | 分别检查壳、OJ、userscript preload；没有通用 IPC、可传任意代码/路径的通用本地接口，事件对象不暴露给页面。 |
| SEC-05 | A | IPC 总量与频率限制 | 测超深结构、多个大字符串/二进制、循环、非法字段、短时洪泛；单字段上限不等于整条消息/全局上限，主进程应可继续响应。 |
| SEC-06 | A | 导航、弹窗、协议与重定向 | 覆盖 HTTPS、禁止协议、userinfo、编码 host、about:blank、GET/POST popup、重定向和子 frame；策略既阻止越界，也不破坏合法登录。 |
| SEC-07 | A | `app://` 与 `note-asset://` 路径边界 | 测编码路径、双重编码、Windows 分隔符、UNC、ADS、符号链接/junction、跨笔记附件；需证明最终可读文件仍在授权范围。 |
| SEC-08 | A | 外部内容进入可信 renderer | 用合成恶意题名、脚本 metadata、Markdown/链接、LLM 输出、favicon 测 DOM 注入；确认净化/CSP/导航边界，不以 React 默认转义代替全部检查。 |
| SEC-09 | A | LLM Key 的出站目标 | 假 Key 验证自定义 base_url、HTTP、重定向、换域与测试连接；区分用户明确选择的服务和攻击者可替换的目标。 |
| SEC-10 | A | 构建时演示 Key 与测试开关 | 只用假标记值检查 Vite define、demo 脚本、asar、source map；有效共享 Key 不能随包分发，生产 smoke/dev 入口不得意外改变安全策略。 |
| SEC-11 | B | 浏览器权限是否按实际需要授权 | 主/子 frame、不同 origin 测摄像头、麦克风、通知、剪贴板、全屏、storage-access；核实允许权限的作用域和用户手势。 |
| SEC-12 | B | TLS、证书、代理和网络策略 | 无效证书应失败；核对 Chromium flags 与发布理由，避免全局绕过。对兼容性调整评估影响，不凭开关名字虚报明文传输。 |
| SEC-13 | B | CSP 是否符合生产需求 | 检查脚本、连接、图片、本地 localhost/WebSocket 的允许范围；用正常和恶意样本验证限制，宽策略是风险线索而非单独攻击证明。 |
| SEC-14 | B | SQL/模板/正则等解释器边界 | 追踪每个来自文件/IPC/网页的字符串；确认 SQL 值绑定、动态标识符白名单、脚本模板转义、正则长度和最坏运行时间。 |

### 6.3 凭据、Cookie 与隐私

入口：[CredentialVault](../../algo-electron/electron/credentials/CredentialVault.ts)、[credentialVaultCore.ts](../../algo-electron/electron/credentials/credentialVaultCore.ts)、capture/autofill、[CookieVault.ts](../../algo-electron/electron/cookies/CookieVault.ts)、日志与导出。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| PRIV-01 | A | 密码/Key 是否只在必要环节明文出现 | 假秘密贯穿输入、preload、main、DB、日志、UI、导出、错误和打包链；不向不需要它的窗口/持久文件传播。 |
| PRIV-02 | A | 加密不可用、解密失败、密钥轮换 | 使用替身加真实 safeStorage 专项，测错误 envelope/旧格式/用户账户变化；失败应明确，不能静默明文降级或不可解释清空。 |
| PRIV-03 | A | 自动填充是否绑定正确站点与页面 | 测相似域名、子域、页面跳转、密码重置页、iframe、隐藏表单和用户已输入值；只填正确页面且不自动提交。 |
| PRIV-04 | A | 凭据捕获是否超出登录范围 | 测注册、改密、无用户名、多密码字段、脚本触发 submit、错误登录；捕获/保存时机与 UI 承诺一致。 |
| PRIV-05 | A | 捕获与选择 token 的生命周期 | 取消、超时、导航、禁用站点、换窗、销毁后重放旧 captureId/requestId；不得保存或填充旧密码，pending 应释放。 |
| PRIV-06 | A | 多账号隔离与凭据删除 | 多窗口交错选择账号、删除时解密在途、同名更新；删除后活动记录和后续填充应一致，已缓存明文不得复活删除项。 |
| PRIV-07 | B | Cookie/session 清理语义 | 登录、退出、禁用站点、清缓存、应用重启；元数据与真实 session 一致。共享 session 导致同站不能双账号并行时应明确。 |
| PRIV-08 | A | 敏感数据是否藏在 URL/错误文本中 | 检查 query/hash/userinfo、路径、JSON 文本、嵌套对象、SDK 报错和模型响应；脱敏必须覆盖实际输出点。 |
| PRIV-09 | B | 删除、备份和磁盘残留 | 区分 UI 删除、软删除、SQLite WAL/备份/历史文件；对照产品隐私承诺验证，不把普通软删除误宣称为安全擦除。 |
| PRIV-10 | B | 本地优先与外发范围 | 关闭 LLM/脚本后记录应用自身请求，区分 OJ 页面流量；预连接、更新、AI 上下文的去向/触发条件应可解释。 |

### 6.4 数据模型、时间与统计

入口：[connection.ts](../../algo-electron/electron/db/connection.ts)、[migrate.ts](../../algo-electron/electron/db/migrate.ts)、repositories、[TrackingService.ts](../../algo-electron/electron/tracking/TrackingService.ts)。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| DATA-01 | A | schema 与真实运行库一致 | 新建库和各历史版本逐级迁移，核对列、默认值、索引、约束与文档，运行 integrity/foreign-key 检查。 |
| DATA-02 | A | 迁移失败与重试是否可恢复 | 在迁移中段、备份创建、恢复写入、marker 保存时失败；重新启动后原数据可恢复，无重复迁移或无提示死循环。 |
| DATA-03 | A | 业务唯一键与 UUID 映射 | 同题不同 URL、跨机 ID、不同平台同编号、重复输入批次；验证去重、外键与冲突语义，不串题或覆盖另一对象。 |
| DATA-04 | A | soft delete 是否贯穿所有查询 | 导入 tombstone 后查侧栏、详情、统计、建议、搜索与导出；检查关联查询是否遗漏 `deleted_at` 条件导致“删除后仍算”。 |
| DATA-05 | A | 首次 AC 与 solved 状态 | 多次 AC、晚到早期 AC、AC 撤销、提交换题、删除恢复；与独立事实计算对照，保证状态/首次时间/标记一致。 |
| DATA-06 | A | 多表写入事务 | 提交入库/题目关联/事件/统计任一环节故障；保证约定的原子性，补偿路径可证明，不遗留半条业务记录。 |
| DATA-07 | A | 活跃时间与停留时间 | 构造前台输入、失焦、后台、锁屏、睡眠、长时间不动序列；确认两种时间定义，排除挂机和多窗口重复累计。 |
| DATA-08 | B | 时间格式与时区 | 北京时间与带 offset/UTC 输入交叉、跨午夜、DST 主机、错误日历日期；不能仅正则匹配日期形式。 |
| DATA-09 | B | 跨日统计口径 | 23:50 到 00:10 的访问、跨年和闰日；实现若按开始日归属，UI/文档应一致，日总量与明细可解释。 |
| DATA-10 | A | 聚合与事实一致 | 使用独立测试计算 active、visited、solved、AC、平台分布、连续天数；覆盖空日、未来记录、删除和导入后的重算。 |
| DATA-11 | B | 增量重算与全量重算一致 | 同一合成事件集逐步写入和一次全量重算，结果应相同；反复重算不改变事实、不重复累加。 |
| DATA-12 | B | DB 锁、损坏、磁盘错误 | 临时库锁定、只读、损坏页、空间不足；主进程不得长期卡住或覆盖用户库，错误应定位到操作并保留恢复路径。 |
| DATA-13 | B | 索引、扫描与历史增长 | D1/D2 上 `EXPLAIN QUERY PLAN` 加耗时测试，查 LIKE、排序、相关子查询和全量读取；避免仅凭 SQL 外观判断 N+1 成本。 |

### 6.5 备份、导入、导出与恢复

入口：[backupService.ts](../../algo-electron/electron/backup/backupService.ts)、[learningDataExport.ts](../../algo-electron/electron/backup/learningDataExport.ts)、[registerBackupIpc.ts](../../algo-electron/electron/ipc/registerBackupIpc.ts)。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| BAK-01 | A | “完整备份”恢复闭环 | 合成带图笔记、脚本及资源、配置、凭据摘要和 session；列出 SQLite 与库外资产，仅恢复备份到干净 profile 后逐项核对并说明不可迁移项。 |
| BAK-02 | A | 备份有效性与同名覆盖 | 写入进行中备份、同秒重复备份、目标存在/只读/空间不足；校验可打开、数据一致，不把半成品或失败覆盖当成功。 |
| BAK-03 | A | 导入文件与行字段校验 | 缺字段、错类型、空 ID、负时间、无效日期、非法 verdict、异常 URL/JSON、数组中的 null；预览阶段应给清楚错误，不能写入坏数据。 |
| BAK-04 | B | 大文件和资源上限 | 合成递增文件/行数/单字段长度，测同步读取、解析、冲突列表、pending 保留的内存和主进程延迟；有界失败或可响应地完成。 |
| BAK-05 | A | 文件内部重复与跨库关联 | 同文件重复 UUID/业务键、缺失 problem/account、跨机重映射、重复 rating；预览计数与实际新增/更新/跳过一致。 |
| BAK-06 | A | 每张表的冲突覆盖语义 | 题目、访问、提交、日统计、账号、rating 都放入同键不同值；默认不静默覆盖，明确覆盖后更新允许字段。 |
| BAK-07 | A | 幂等性与派生重建 | 相同文件连续导入两次；AC 更早/撤销、访问移动日期、提交换题；事实不重复，旧/新题目和日期全部重建。 |
| BAK-08 | A | 预览到确认的身份绑定 | 两次预览交错、关闭页面、换窗、窗口销毁、文件变化、预览后库变化；确认必须对应用户看到的数据与冲突范围。 |
| BAK-09 | A | 失败原子性与导出文件安全 | 导入中 SQL/统计错误应整次回滚；导出中断或写满不能破坏已有有效文件并声称成功；记录恢复办法。 |
| BAK-10 | A | 导出隐私和格式演进 | 用合成敏感标记检查 URL/query/hash、UNC/POSIX/Windows 路径、原始 payload 与新增表；旧/未来 schema 明确处理，不能靠字段名想当然脱敏。 |
| BAK-11 | B | 恢复可操作性 | 按文档从备份恢复，核对进程关闭、WAL/SHM、路径/OS Key 绑定、迁移版本；恢复者无需猜关键步骤，失败有诊断。 |

### 6.6 OJ 适配与提交监测

入口：[adapters](../../algo-electron/electron/adapters/README.md)、[RealtimeSubmissionService.ts](../../algo-electron/electron/submissions/RealtimeSubmissionService.ts)、scrapers、[syncService.ts](../../algo-electron/electron/submissions/syncService.ts)、[提交设计](../DESIGN/SUBMISSION_MONITORING_DESIGN.md)。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| OJ-01 | A | 题目身份、规范 URL、标题 | 七站各取练习/比赛/别名/iframe/SPA 样本；同题不拆分、不同题不合并，标题回退不写“加载中”等占位文本。 |
| OJ-02 | A | 正式提交与运行样例区分 | run/sample/custom-test、编辑器提示、提交按钮失败等负例；只有满足正式提交证据的结果进入核心表。 |
| OJ-03 | A | 本人记录与公开状态区分 | 本人提交、他人详情、公开列表、历史切换用户；身份/提交意图不明确时不能污染个人数据。 |
| OJ-04 | A | 最终判定与中间状态 | queued/running/judging 到 AC/WA/TLE/CE/RE 等；最终只落一次，后续更正按业务规则更新。 |
| OJ-05 | A | 延迟结果是否串题/串窗 | 提交后立即切题、转移标签、关闭窗口再返回；提交绑定原始题目与账号，不能使用响应到达时的活动页。 |
| OJ-06 | A | 多来源去重与冲突 | 同一提交经网络 hook、DOM、轮询、手动/API 同步多次到达；幂等且更新时不被旧数据降级。 |
| OJ-07 | A | 上报 bridge 伪造与重放 | 受控页面/子 frame 伪造事件、旧 token、错 URL/平台/提交 ID；token 只证明通道来源时，不能把它误当平台数据真实性。 |
| OJ-08 | B | hook 安装时机与重复注入 | document-start、cached fetch/XHR、SPA、reload、快速导航；不漏监测、不叠加包装，不破坏站点返回值和异常行为。 |
| OJ-09 | B | 解析器对站点变化的鲁棒性 | 缺列、列顺序变化、不同语言、空单元格、时间/内存单位、状态图标；保存原始安全摘要并拒绝无法确定的值。 |
| OJ-10 | B | 手动/API 同步完整性 | 分页、条数上限、大账号、429、部分失败和重试；明确“抓到多少/写入多少/是否截断”，不把首批当全部历史。 |
| OJ-11 | B | 取消、离线与登录过期 | 断网、401/403、验证码、比赛权限；错误可见、不无限重试，失败不清空已有学习记录。 |
| OJ-12 | B | 真实站点集成 | 受控 fixtures 通过后，用已有授权的测试账号验证真实流程；需要真实提交时单列状态和操作范围，不能用模拟页面代替结论。 |

### 6.7 浏览器、多窗口与资源生命周期

入口：[TabManager.ts](../../algo-electron/electron/browser/TabManager.ts)、[WindowManager.ts](../../algo-electron/electron/windows/WindowManager.ts)、[TabTransferCoordinator.ts](../../algo-electron/electron/windows/TabTransferCoordinator.ts)、session stores、CoachPetWindow。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| WIN-01 | A | 单实例与启动失败 | 连续启动、锁失败、初始化中关闭、DB 失败；失败进程不写用户状态、不留下后台实例，界面给可定位结果。 |
| WIN-02 | B | 导航历史与合法 popup | 前进/后退、刷新、about:blank、POST/OAuth、opener/postMessage；既有安全策略下合法登录和页面打开可用。 |
| WIN-03 | A | 标签创建/转移/恢复一致性 | 过户中目标失败、源/目标销毁、重复操作；同一 WebContents 只有一个 owner，失败恢复顺序与活动态。 |
| WIN-04 | A | 会话保存是否丢失/泄露 | 保存中崩溃、旧文件、坏 JSON、超过数量上限；原子写入、合理回退、敏感 URL 净化，恢复项与用户预期相符。 |
| WIN-05 | B | 崩溃/无响应恢复 | 前后台 renderer 崩溃、恢复加载失败、重复重载/关闭；旧事件不能修改新 view，不卡住整个应用。 |
| WIN-06 | B | 隐藏、切换与销毁释放 | 循环关闭标签/窗口检查进程、views、listener、timer、pending Map、网络请求；已销毁页面不继续工作。 |
| WIN-07 | B | 退出与异步 flush | 关闭最后窗口、操作系统退出、写入失败、重复 quit；记录是否正常退出以及能恢复的最后状态，不无限阻止关闭。 |
| WIN-08 | B | 多屏/DPI/工作区坐标 | 负坐标、不同缩放、拔屏、任务栏变化、最大化还原；所有窗口和桌宠能找到、能拖动，命中区与显示一致。 |
| WIN-09 | B | 焦点与原生窗口层级 | 文件对话框、右键菜单、最小化、切换其他应用、桌宠三种 pin 模式；无焦点振荡、抢焦点、不可点或遮挡。 |
| WIN-10 | B | WebContentsView 布局覆盖 | 侧栏/查找条/通知同时出现、调整窗口、页面缩放；网页 view 不覆盖壳按钮，也不留下不可点击空区。 |
| WIN-11 | B | 快捷键、查找、缩放作用域 | 壳/网页/笔记/IME/子 frame 分别测试；同一按键不触发两次、查找迟到结果不串页、缩放按正确 origin 保存。 |
| WIN-12 | B | 运行时上限与恢复上限 | 开到上限、从多个窗口累计、恢复大量标签；限制有反馈，不静默截掉用户状态，启动时不无节制同时加载。 |

### 6.8 笔记、编辑器与附件

入口：[NoteService.ts](../../algo-electron/electron/notes/NoteService.ts)、[noteStorage.ts](../../algo-electron/electron/notes/noteStorage.ts)、[MilkdownEditor.tsx](../../algo-electron/src/features/problems/MilkdownEditor.tsx)、笔记页面和 API。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| NOTE-01 | A | 自动保存与切换隔离 | 连续输入后立刻切题/切笔记/换窗/关闭；待保存内容写到正确 noteId，旧读取/保存结果不能覆盖新编辑器。 |
| NOTE-02 | A | 文件/DB 双写失败 | 在文件成功 DB 失败、写文件中断、只读目录等位置注入故障；重新打开后内容一致或明确可恢复，不能误报已保存。 |
| NOTE-03 | B | 标题、正文与磁盘格式一致 | 创建空笔记、只改标题、改正文、清空后重开；磁盘 Markdown 标题/正文格式有稳定契约，空内容不误触旧缓存迁移。 |
| NOTE-04 | A | 外部编辑与多窗口并发保存 | 外部文件变化、两个编辑器改同笔记、文件被移动/删除；过期缓存不得无提示吞掉修改，明确采用何种冲突规则。 |
| NOTE-05 | A | 文件路径与题目 ID | 合成非法/导入 ID、路径片段、未知 problemId，验证写入前的存在性和目录限制；不得先在目标目录外写文件再因外键错误退出。 |
| NOTE-06 | A | 删除与残留 | 单条/按题批量删除、文件被占用、DB 删除失败；UI/DB/文件状态可解释，附件残留有诊断，不能静默留下重要隐私。 |
| NOTE-07 | B | 图片类型、大小与解码开销 | MIME/扩展不一致、损坏数据、巨大像素、小文件高解压量、粘贴超限；不把后缀验证当内容验证，失败不创建无用附件。 |
| NOTE-08 | B | Markdown/公式/代码往返 | 中英文、LaTeX、表格、代码、链接、撤销/重做，保存重开后语义不丢失，特殊链接不进入非授权本地路径。 |
| NOTE-09 | B | 大文档与资源释放 | 长文、密集图片、连续挂载/销毁编辑器，测输入延迟、IPC 体积、全量列表传正文成本及 editor/observer 释放。 |
| NOTE-10 | B | 失败和未保存状态可见 | API 返回 false、promise reject、最后一次防抖未 flush；有明确失败/重试或未保存状态，不能永久停在“保存中”。 |

### 6.9 用户脚本与下载

入口：[scripts](../../algo-electron/electron/scripts/README.md)、[UserScriptNetworkProxy.ts](../../algo-electron/electron/scripts/UserScriptNetworkProxy.ts)、[userScriptRuntimeBridge.ts](../../algo-electron/electron/scripts/userScriptRuntimeBridge.ts)、[DownloadManager.ts](../../algo-electron/electron/downloads/DownloadManager.ts)。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| SCRIPT-01 | A | 匹配、排除、frame 与执行时机 | `@match/include/exclude/noframes/run-at` 组合，SPA 变址、iframe、重复导航；只在应执行的页面与时机执行。 |
| SCRIPT-02 | A | 脚本与页面的权限隔离 | 页面主动窃取/伪造能力、脚本 A 调用脚本 B、伪造 port/revision/nonce；只有当前脚本授权的操作可达主进程。 |
| SCRIPT-03 | A | 禁用/删除/更新及时撤权 | 网络/延迟 end-idle 回调在途时禁用、更新、转移、换页；旧 generation 不再写值、发请求、展示菜单或安装回调。 |
| SCRIPT-04 | A | `@connect` 与精确 host 授权 | 首次请求、子域、跨 origin 跳转、IDN、IPv6、userinfo、私网/loopback；声明与实际授权都满足，网络可达范围符合产品策略。 |
| SCRIPT-05 | A | 请求凭据与头部过滤 | 假 Cookie/Authorization 测 anonymous、include、跨域重定向与响应头；明确哪些是用户授权的站点访问，禁止头不被脚本伪造。 |
| SCRIPT-06 | B | 请求资源上限和释放 | 超时为零/缺省、慢流、超大 body/header、并发满、redirect body、用户取消；请求槽与 reader 最终释放，不能永久耗尽。 |
| SCRIPT-07 | A | 首次授权的窗口与身份 | 授权框等待时换页、reload、过户、关窗；用户看到的脚本/来源/目标与实际放行一致，旧提示不得授权新请求。 |
| SCRIPT-08 | A | require/resource 与完整性 | 校验顺序、hash、重定向、过大/损坏资源、缓存缺失、声明漂移；确认后下载且事务一致，运行时不静默补取陌生内容。 |
| SCRIPT-09 | A | 远程安装预览与确认一致 | 预览后源更新、版本变化、重复确认、过期/取消、身份冲突；安装的是用户确认的版本和权限集合。 |
| SCRIPT-10 | A | 自动更新是否扩大权限 | 新增 grant/connect/资源、身份变化、版本降级、恶意 304；需要重新确认的变化不能静默生效。 |
| SCRIPT-11 | B | 脚本存储、文件编辑与配额 | GM values 总量、资源 BLOB、删除级联、文件 watcher 重载、文件占用和更新冲突；按脚本隔离且容量/失败反馈可解释。 |
| SCRIPT-12 | B | 下载路径、碰撞与页面轰炸 | 保留名、长名、双向字符、同名并发、页面连续下载、取消/断流；只写受管目录，不能覆盖任意文件或无上限耗盘。 |
| SCRIPT-13 | B | 下载与脚本安装分流 | 直接导航、重定向、popup、`will-download` 的 `.user.js` 行为一致；未确认脚本不执行，普通下载状态和实际落盘一致。 |

### 6.10 AI 教练正确性、成本与生命周期

入口：[CoachOrchestrator.ts](../../algo-electron/electron/coach/CoachOrchestrator.ts)、ContestGuard、HintLadder、[LlmHintService.ts](../../algo-electron/electron/coach/llm/LlmHintService.ts)、[ArkClient.ts](../../algo-electron/electron/coach/llm/ArkClient.ts)、AI recommendations。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| AI-01 | A | 比赛保护覆盖全部入口 | 主动/自动提示、聊天、升级、演示 IPC、后台比赛标签和在途返回；比赛模式按已定义策略阻止调用/显示，不只禁用按钮。 |
| AI-02 | A | 异步响应与会话归属 | 请求后切题、换窗、关闭、禁用/停止 Coach、配置变化；过期输出不显示、不错误扣额度或持久化到新题。 |
| AI-03 | A | 上下文最小化与提示注入 | 用假敏感标记和含恶意指令题面测试；未授权数据不外发，页面内容不能获得本地工具权限或改变事实数据。 |
| AI-04 | B | 提示等级与答案泄露 | 用有标准答案的合成/公开题覆盖 L1-L5，检查升级确认、模型违反约束、`reveals_solution` 缺失/错误；不能只信模型自评。 |
| AI-05 | B | 规则触发准确率与干扰 | 正常思考、连续错误、离开、阅读、多题切换序列，统计误报/漏报与频次；避免把长思考简单判成受挫。 |
| AI-06 | B | 模型响应结构与错误内容 | 空值、非 JSON、错类型、超长字段、不合法置信度、错误标签；边界校验和降级可靠，错误日志不含用户私有内容。 |
| AI-07 | B | 缓存正确性和容量 | 同题同等级但事件/模型/进度变化、TTL 过期、在途旧配置响应；缓存正确失效、有界或可清理，不误复用旧提示。 |
| AI-08 | B | 每日额度和费用控制 | 连点/并发、失败重试、重启、跨日、取消、缓存命中；额度语义与 UI 一致，不能把逻辑调用数误当实际计费次数。 |
| AI-09 | B | 超时、取消和重试 | 慢模型、断流、429/5xx、服务禁用；检查 SDK 重试带来的总延迟和重复计费，过期请求能否真正停止网络。 |
| AI-10 | B | 建议可追溯和统计偏差 | 从建议回到题目/提交/访问依据，样本不足、脏标签、删除记录和导入历史应有合理行为；不伪造“减少 80%”等未实测收益。 |
| AI-11 | B | 桌宠交互与资源成本 | 气泡、聊天、缩放、拖拽、透明区域穿透、关闭开关，测鼠标命中和 CPU；隐藏后不继续阻挡输入或高频轮询。 |
| AI-12 | C | SDK/模型兼容说明 | JSON mode、thinking 参数、token 字段、不同兼容服务响应；只有真正验证过的配置才写作兼容，失败原因可辨识。 |

### 6.11 性能、内存、CPU、磁盘与网络

入口：主进程同步操作、SQL 热点、[logger.ts](../../algo-electron/electron/shared/logger.ts)、浏览器生命周期、编辑器、脚本网络代理与 [性能门槛](../../algo-electron/tests/performance/checkRendererBundle.mjs)。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| PERF-01 | B | 冷启动、热启动、恢复启动 | 记录启动到窗口显示、到可输入、到恢复完成；分离迁移、资源加载、恢复标签和 Coach 初始化成本。 |
| PERF-02 | B | 包体积与首屏依赖闭包 | 测安装包、安装后磁盘、asar、JS/CSS 与所有首屏传递依赖，核查懒 chunk 是否仍被间接首屏加载；不只看 index 文件。 |
| PERF-03 | B | 主进程空闲与高频工作负载 | W0/W1 对照统计 CPU、event-loop delay、IPC 速率，区分第三方页面、用户脚本、监测和桌宠贡献。 |
| PERF-04 | B | 大任务阻塞 main | 大 JSON 解析/序列化、SQLite、同步日志/笔记/配置写、stats 重算并行触发；记录用户交互延迟和最长阻塞栈。 |
| PERF-05 | B | renderer 重渲染和大列表 | React/Chromium profiler 测侧栏、图表、笔记列表、聊天、TabStrip；查重复 IPC、全量数据传输、图表重建与布局抖动。 |
| PERF-06 | B | 长期内存与对象保留 | W2/W3 测 WebContents、DOM/editor、React 订阅、缓存、pending、port、buffer 保留链；确认释放事件与容量边界。 |
| PERF-07 | B | 峰值放大与二进制复制 | 同时请求脚本响应/图片、JSON 导入导出、IPC 结构化克隆；测 buffer、数组拼接和字符串副本叠加峰值。 |
| PERF-08 | B | 定时器、observer、轮询噪声 | 统计前后台定时器、MutationObserver、hook scan 与拖拽轮询；隐藏/销毁后停止，页面变化频繁时有背压或合并。 |
| PERF-09 | B | 网络并发、重试和去重 | 多窗同步、相同请求连点、离线重试、自动更新、重定向；记录实际请求数、流量、取消后存活和错误放大。 |
| PERF-10 | B | 数据库、缓存与磁盘增长 | 采样 DB/WAL、浏览器 cache、日志、下载、note assets、脚本资源、备份；确认保留与清理策略，用户可理解空间来源。 |
| PERF-11 | B | 电池、GPU 与动画 | 比较 Coach/动画/透明窗口开关，最小化与前台时 GPU/CPU/唤醒频率；不在隐藏状态持续执行无用途高刷新工作。 |
| PERF-12 | C | 开发/CI 占用成本 | 分开统计 node_modules、测试临时产物、构建缓存与发行包，测测试并发峰值与耗时；不把开发目录体积当终端用户安装体积。 |

### 6.12 UI、交互、可访问性与错误反馈

入口：[App.tsx](../../algo-electron/src/App.tsx)、[ShellRouter.tsx](../../algo-electron/src/components/ShellRouter.tsx)、features、components/ui、[Playwright UI](../../algo-electron/tests/ui/README.md)。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| UI-01 | B | 空态、加载、错误是否真实 | 每个读路径注入 reject、空数组、慢返回、部分失败；错误不伪装成“暂无记录”，有可理解反馈和恢复操作。 |
| UI-02 | A | 写入失败/成功状态 | 笔记、备份、配置、脚本启停/安装、删除返回 false/reject；按钮和提示反映真实结果，失败不留下“已保存/完成”。 |
| UI-03 | B | 连点、异步交错和操作互斥 | 双击确认、重复打开对话框、慢请求先后倒置；不能重复扣额度、错导入、旧响应覆盖新选择。 |
| UI-04 | B | 切页动画与命中层 | 快速切换、懒加载、动画降级/reduced motion；确认过渡伪元素消失、按钮真实可点，控制台生命周期警告追到实际分支。 |
| UI-05 | B | 窄窗口/DPI/长内容布局 | 用第 5 节视口及长文本测裁剪、重叠、滚动、按钮撑开；桌面应用按实际最小尺寸验收，不强加未支持的手机形态。 |
| UI-06 | B | 焦点、键盘与弹层 | Tab 循环、Escape、焦点返回、原生网页 view 与 modal；输入不漏到后台网页，打开/关闭不丢失焦点。 |
| UI-07 | C | IME 与文本编辑 | 中文输入候选确认、Enter 搜索、组合输入过程、粘贴换行；不能把 composing 中 Enter 当提交，光标位置不乱跳。 |
| UI-08 | C | 可访问名称与状态表达 | 图标按钮、错误消息、读屏、键盘可达、焦点可见、对比度；颜色不能成为唯一状态信号。 |
| UI-09 | B | 跨窗口数据刷新 | 一个窗口编辑/删除/同步/导入，另一个窗口正在查看；订阅与重读正确，不长时间显示已失效数据。 |
| UI-10 | C | 选择、撤销和危险操作 | 删除题目/笔记、批量操作、覆盖导入、脚本权限升级；确认内容清楚到对象和影响，取消后状态保持可理解。 |

### 6.13 测试有效性与工程可维护性

入口：[verify.mjs](../../algo-electron/tests/verify.mjs)、[vitest.config.ts](../../algo-electron/vitest.config.ts)、[ci.yml](../../.github/workflows/ci.yml)、架构守卫、electronMock 与模块 README。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| QA-01 | A | 高风险专项是否进入合适的门禁 | 列 ordinary PR、manual、release 对 DB/AI/safeStorage/打包/UI 的映射；真实数据和权限变更不能仅有纯 mock 检查。 |
| QA-02 | B | 测试发现与排除是否漏文件 | 核对 include/exclude、verify 手写名单、package scripts；测试存在但默认不执行要注明，新增文件被遗漏时可发现。 |
| QA-03 | B | Electron 替身是否掩盖真实行为 | 对照焦点/parent、navigation、destroy、IPC 结构化克隆、native ABI；关键差异由真实 Electron 用例覆盖。 |
| QA-04 | B | 测试是否能识别错误实现 | 对高风险逻辑做少量定向变异：去掉 owner 检查、交换 noteId、跳过事务等；测试应失败，不能只覆盖执行或固定源码文本。 |
| QA-05 | B | 异常与并发测试质量 | 检查 fake timer、固定 sleep、无 await、未处理 rejection、控制台警告、重试掩盖；本地/CI 可稳定复现失败。 |
| QA-06 | B | 覆盖率和性能门槛是否有效 | 关注关键分支遗漏与排除文件，预算与实际基线差距；守卫通过不能代替真实资源测量。 |
| QA-07 | B | 跨层契约是否一致 | preload、env.d.ts、schema、API helper、handler 返回值一一对照；运行时 null/false/error shape 与 TS 声明一致。 |
| QA-08 | B | 高耦合文件与重复逻辑 | 从实际变更链/重复 bug 查 main、TabManager、hook、IPC；只有造成修改遗漏、难测或职责冲突才报维护问题，不用行数定罪。 |
| QA-09 | B | 错误处理、日志和诊断 | 空 catch、吞 false、无限恢复分别追踪是否有用户反馈/脱敏诊断；预期拒绝与真实故障能区分，日志量有界。 |
| QA-10 | C | 类型逃逸、死代码和文档维护成本 | 追踪 any/as/raw、旧入口、无调用功能和重复文档；需展示具体错误或成本，不为“更整洁”提出无关重构。 |

### 6.14 依赖、构建、发布与运维

入口：[package.json](../../algo-electron/package.json)、[pnpm-lock.yaml](../../algo-electron/pnpm-lock.yaml)、[electron-builder.json5](../../algo-electron/electron-builder.json5)、[RELEASE_PROCESS](RELEASE_PROCESS.md)、CI 与发布流程。

| ID | 顺序 | 检查什么 | 方法与判定标准 |
|---|---|---|---|
| REL-01 | B | 干净环境可重复安装/构建 | 在独立环境按文档 `npm ci`，核对 Node 范围、镜像、lockfile、原生依赖和平台；不靠开发机已有 dist/node_modules 才成功。 |
| REL-02 | A | 打包产物的实际入口与原生依赖 | 真正启动 unpacked/安装包，检查 preload、app 协议、asar fuses、better-sqlite3 ABI 与资源；配置检查不代替执行。 |
| REL-03 | A | 公告依赖的实际影响 | 官方 audit、依赖链、受影响函数、输入可控性、是否随包发行；开发/运行时分别评级，验证升级兼容性，不直接 `audit fix --force`。 |
| REL-04 | A | 产物是否包含敏感/开发内容 | 枚举 asar/unpacked/resources/source maps、demo key、测试开关、日志/DB；只用假标记验证泄漏路径，发现真实秘密只报告存在性。 |
| REL-05 | B | Windows 安装/升级/卸载 | 标准用户、中文/空格/长路径、旧版升级、应用运行中安装、卸载保留数据/重装；按产品承诺检验数据库和配置。 |
| REL-06 | B | 版本、签名与来源完整性 | package/lock/安装器/About/release 一致，检查签名状态和发布文件校验；若未签名，按实际影响记录，不虚构发布已有签名。 |
| REL-07 | B | CI 供应链与发布权限 | Actions 引用、第三方依赖执行、缓存、PR/fork、secrets、artifact 上传；发布凭据不会被不可信 PR 使用，普通构建不越权发布。 |
| REL-08 | B | 平台支持范围 | Windows x64 作为主验收；配置中的 macOS/Linux 目标若公开承诺可用，验证 UA、safeStorage、路径和原生打包，否则明确未验收。 |
| REL-09 | B | 启动失败与故障诊断 | 日志轮转、fatal error、数据库恢复、renderer 自动重载；不反复崩溃刷屏，用户能找到脱敏诊断与具体恢复方法。 |
| REL-10 | B | 第三方组件/脚本/资源许可证 | 核对直接/间接依赖、字体、图片、用户脚本及内置资源来源和分发要求；记录实际不符项，不凭包名推断侵权。 |

## 7. 推荐执行批次与产出

### 第一批：数据与本地安全

优先 BAK-01、NOTE-01/02/05、DATA-03/04/05、OJ-02 至 OJ-07、SEC-01 至 SEC-10、PRIV-01 至 PRIV-06。先验证带图恢复、笔记双写、数据归属和远程页面到主进程的能力边界。

产出：确认缺陷、最小复现、受影响数据范围、可恢复性与修复建议。没有复现成功的安全线索保留为待验证，不填入严重漏洞数量。

### 第二批：资源与日常稳定性

执行 D1/D2、W0/W1/W2，对应 PERF、WIN、SCRIPT 网络资源、AI 缓存/取消和 UI 错误状态。先对照关闭 Coach/脚本与受控页面，再逐一开启，定位资源贡献。

产出：启动/交互延迟、进程树内存/CPU、磁盘增长、SQL 热点和生命周期对象趋势表，列出规模拐点及建议预算。

### 第三批：实机与发布

七站真实验收、多屏/DPI/休眠、4-8 小时运行、安装升级卸载与恢复演练。需要账号/特殊设备的条目先标识条件，独立工作继续进行。

产出：站点能力矩阵、实机验收结果、发布阻塞项和未覆盖条件。只有这三类证据都有，才适合形成“可发布程度”结论。

### 第四批：工程与产品一致性

整理 PROD、QA、REL 的剩余条目，合并重复根因，核对说明文字与实际能力。高价值的行为回归纳入适当门禁；不为增加测试数量而写实现镜像测试。

产出：按影响排序的技术债与文档纠偏清单，每项说明成本，避免以主观总分替代具体问题。

## 8. 命令参考

以下从 `algo-electron/` 执行，按本次改动/检查范围选择，避免同时运行会写同一 `tmp` 或构建目录的 suite。

```powershell
npm run typecheck
npm run typecheck:tests
npm run lint
npm run test:architecture
npm run test:security
npm run test:unit
npm run test:db
npm run test:ai
npm run test:coach
npm run test:electron
npm run test:ui
npm run test:performance
npm run test:packaging
npm run test:docs
```

依赖公告和依赖链是只读调查，下面命令不更改 npm registry 配置：

```powershell
npm audit --omit=dev --registry=https://registry.npmjs.org --json
npm audit --registry=https://registry.npmjs.org --json
npm explain fast-uri
npm explain @xmldom/xmldom
```

正式发布阶段再按 [发布流程](RELEASE_PROCESS.md) 运行完整验证、生产构建与安装包验收。性能、真实 OJ 和恢复测试仍需第 5/6 节的场景数据，命令通过不能代替。

## 9. 问题报告模板

```text
编号 / 对应检查项：
标题：用“触发条件 + 错误后果”描述
状态：线索 / 确认 / 通过 / 不适用 / 受阻 / 修复并复验
严重程度与理由：P0-P3，按实际影响评定
版本 / commit / 工作区 diff / OS / 构建模式：
前提：登录状态、权限、数据量、窗口/标签、配置
最小复现步骤：
预期结果及依据：产品说明、业务不变量、平台行为
实际结果：
证据：代码位置、测试、脱敏日志、截图、SQL 或测量记录
根因链：入口 -> 校验/状态 -> 副作用 -> 用户后果
影响范围：发生频率、数据范围、可恢复性、安全前提
已排除的解释：预期限制、第三方失败、旧产物、测试替身差异
修复建议：最小必要改动及代价
回归方法：能让错误实现失败的测试或实机步骤
剩余未知：没有验证的环境或规模
```

安全证据只记录假值或脱敏摘要；不把真实 Key、Cookie、密码、私有源码、用户数据库或未脱敏日志加入仓库。

## 10. 本阶段完成条件

- 已识别项目实际模块、入口、信任边界和现有验证体系。
- 已记录本轮实际执行结果，并区分历史结果和未执行项目。
- 已提供按风险排序的详细检查项、验证方法、场景/规模及判定标准。
- 已把明确的代码事实与尚待验证的影响分开，未宣称完成全量审计。
- 后续逐项执行时，必须填写证据和状态；不能把这份清单的条目数当成项目缺陷数量。
