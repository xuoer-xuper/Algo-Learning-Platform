# 阶段 3 执行计划

前置：阶段 2 合入 dev。三个 PR：`refactor/drizzle`、`refactor/main-layout`（含 kebab-case）、`refactor/main-split`。

## 已验收切片：2.0.1 加固同步（2026-11-17）

用户要求发行后继续后续工作，先把已发布安全契约同步到Drizzle分支，再做A2d。
同步分支`codex/drizzle-release-sync`基于`20ee62c`，合并`dev 7d8da9c`并保留双父祖先。
在现有C盘干净worktree处理；原D盘规划改动和`.zcode`不动，不用stash/reset覆盖。

- 最小行为缺口：Drizzle A1默认迁移接管与2.0.1持久checkpoint/明确恢复尚未组合，
  不能让Drizzle-only pending、baseline adoption或legacy恢复绕过已发布保护。
- 变更归属：connection生命周期、SQLite备份适配及必要的legacy/Drizzle历史/恢复映射；
  同步守卫/测试清单/打包说明/lockfile保留双方能力。冻结001–030、baseline SQL/meta不改。
- [x] 研究并评审组合迁移/恢复契约，记录`research/release-hardening-sync-design.md`。
- [x] 合并代码与回归，覆盖已发布v2.0.1 checkpoint、Drizzle baseline/pending失败/中断/明确恢复。
- [x] 独立复核、frozen install、全量test:all（206文件1967用例/UI11）、build:win通过；
  合并提交57690f6正常hooks推送，PR15 CI44025304964全绿并以merge317cd9f合入Drizzle；
  PR8集成CI44025992234全绿，dev/master及已发布tag不变。
- [x] PR #8目标已恢复dev（发行合并自动删除dev曾导致改向master），仍draft；同步PR须保留祖先。
- 不在这片修改题目删除/DTO政策、目录布局、版本、已发布tag或Release；不把整个阶段3标完成。

## 已验收切片 A2d：题目删除（2026-11-19）

安全同步已合入Drizzle，独立设计预检通过`research/a2d-problem-delete.md`。
在C工作树`codex/drizzle-problem-delete`基于`317cd9f`实施；原D工作树不动。

- 最小缺口：deleteProblem仍为四分支UNION+四次原生DELETE，仅将构造转换Drizzle。
- 归属：problem/mutations.ts；删除差分测试/原SQL oracle；既有native repositories测试；
  DB suite注册与README/spec。upsert、schema、DTO、IPC、布局、迁移保护、版本均不改。
- 保留raw数值instant投影与原toLocalDay校验、UNION去重和所有tombstone行为；
  缺父行仍删children但false/无通知；notes不删除。保留native transaction及commit外通知scope。
- 顶层统计为删除COMMIT后独立重算；嵌套时是inner savepoint后仍在外层事务中，不能发明aftercommit调度。
- [x] 最小生产改写与原SQL差分回归，覆盖非法时间/NULL/空ID/缺父行/实际commit与savepoint/后续日期统计失败。
- [x] 独立复核、上海/纽约各41删除用例、test:db30文件341用例/native17、
  test:all206文件2005用例/UI11及build:check通过。
- [x] 正常hooks提交dcd8991并立即推送；PR16 CI44049450301全绿，
  2026-11-19 squash85b95dc合回Drizzle；PR8集成CI44505395427全绿。
  PR8仍draft/base dev，dev/master及已发布版本不变。

## 已验收切片 A2e：Omnibox最近访问候选（2026-11-19）

最小缺口：`listRecentVisitCandidates`仍为一条native CTE/INNER JOIN及手写row断言。
只转换这一条完整查询，不提前决定其余DTO的nullable-ID政策。研究见
`research/a2e-problem-reads.md`；实施前先独立预检，按同一边界实施/复核。

- 归属：`problem/omnibox.ts`的第二候选管线；现有omnibox测试的当前schema毫秒fixture、
  独立旧SQL/排序oracle及差分回归；native repositories用例；README/spec/验收记录。
- 用相同INNER JOIN证明非空FK与旧parent ID相等，投影`recent_visits.problem_id`；
  不加过滤、cast、假泛型、不修ID、不改schema/DTO/IPC或第一候选管线和最终排序去重。
- 保留64条最近访问窗口在JOIN/查询匹配之前，只有entered_at DESC，无新tie-break；
  原LIKE转义、父/visit墓碑、raw数字毫秒、query_only及生命周期行为不变。
- [x] 独立设计预检通过（`research/a2e-problem-reads-review.md`），允许第二管线实施。
- [x] 第二管线Drizzle查询与冻结原完整函数oracle完成，第一管线/排序去重不变。
- [x] 差分覆盖64范围、匹配/转义、tombstones、null/empty IDs、0/null毫秒、
  只读/事务可见性/关闭重开/无通知；保留当前函数未转换部分的NULL ID行为。
- [x] 独立代码复核无新增问题，focused60/60、typecheck/lint及test:db374/native19通过。
- [x] test:all206文件2038用例、UI11/native19、架构/打包/docs/安全/性能全门及build:check通过。
- [x] 正常hooks提交82a0163并立即推送，PR17 CI44521575932全绿后squash0927213合回Drizzle；
  PR8集成CI44522362714全绿。PR8保持draft/base dev，不发版、不归档阶段3。

## A5b Execution Boundary (2026-11-28)

- Branch codex/drizzle-notes-title-type starts at handoff squash41ef2e6.
- Gap: title/type metadata UPDATEs still use native SQL. Convert only query
  construction, preserving native bindings/results and all service orchestration.
- [x] Independent research/precheck accepted; parent persists explicit-DB write
  exception, raw BOTH SET placeholders, RunResult/two-changes-read contracts,
  disjoint test ownership and actual-driver acceptance before implementation.
- [x] Handoff PR8CI46101370107 passes; parent GO2026-11-28, cap3 total.
- [x] Worker1: explicit helpers/two substitutions, independent old oracle and
  focused differential suite. Worker2: native/app additions only, preserving
  previous groups and existing isolated runner lifecycle.
- [x] Parent: focused DB registration, exact8-to6 SQL ratchet and README/spec sync.
- [x] Independent full-diff review fixes two test typings; both types/lint/format
  and UTC7files261 pass. No production finding; prior native/app ASTs preserved.
- [x] Parent final DB43files1206/native71/realapp32, full227files2949/UI16 and
  build pass. All826source/57protected hashes and original D62dirty preserved.
- [ ] Normal hooks/commit/immediate push; featureCI/squash to Drizzle/PR8CI.

No other notes/full-read/IPC/UI/storage repair, release or phase archive. A5a
handoff work6189c5a/PR32CI46100897809/squash41ef2e6 has identical tested tree.
Phase3 and parent remain in_progress; PR8 stays draft/base dev.

## A5a Execution Boundary (2026-11-27)

- Branch codex/drizzle-notes-file-path starts at integrated299b0e3, after PR30
  featureCI45993272623 and PR8CI45994240435 pass. Parent GO2026-11-27.
- Gap: four identical native file-path lookups still require handwritten row
  assertions; convert only those reads to a shared public-builder query.
- [x] Inventory and independent precheck accepted; governing docs/spec persist
  explicit-handle row return, damaged-DDL diagnostic qualification, real-app
  native harness and parent-owned runner/config/ratchet decisions before GO.
- [x] Worker1: helper/four call sites, frozen old lookup/method/batch oracle,
  focused differential regression and append-only native query groups.
- [x] Worker2: isolated actual Electron/SQLite/storage/protocol test; only the new
  notes-file-path-storage.test.ts file, coordinated oracle imports if needed.
- [x] Parent: dedicated notes runner with split ESM to defer transitive externals
  and checked workspace cleanup after child exit; unchanged coach, DB registrations, exact
  Vitest exclusion/ratchet12-to8 and repository/notes/test READMEs.
- [x] Independent full review; both typechecks/lint and UTC6files164 focused/
  callers pass, original AST/native preservation and runner ownership verified.
- [x] Parent serial native65/realapp21, DB42files1109, full226files2852/UI16 and
  build pass;823source hashes and53protected paths stable, original D62dirty intact.
- [x] Work0e4054a passes normal hooks/immediate push; PR31CI46099297905 passes,
  squasheafbed7 has the same tested tree, PR8CI46099803141 passes. Keep PR8draft/
  base dev, no release or phase archive.

No full-row/type/IPC/UI/other notes writes or dual-store fixes in A5a. Later
notes slices still require bounded design review; phase3 remains in_progress.
Next A5b research/a5b-notes-title-type.md and independent precheck
research/a5b-notes-title-type-review.md recommend exactly title/type UPDATEs;
parent must persist explicit-handle write/raw-placeholder/native-result/error
and test ownership contracts before GO. Alternate-driver probes are not native
acceptance. No A5b production code is included in this handoff.

## A4d Execution Boundary (2026-11-27)

- Branch codex/drizzle-stats-recompute starts at A4c squashaacbff0 after
  PR28CI45978229533 and PR8CI45979282462 pass. Parent GO2026-11-27.
- [x] Independent design/reconciliation review and explicit parent acceptance of
  runtime frozen030 compatibility, late NULL failure, notification exceptions
  and A4d/R1 exact-path freeze with a separate future R2 relocation gate.
- [x] Runtime worker: new recompute-runtime.ts, import-only recompute.ts change,
  frozen independent old cores/wrappers oracle, focused differential/native tests
  and verify.mjs registrations for both focused and historical guard files.
- [x] Historical-guard worker: stats-recompute-history.test.ts pins accepted-base
  bytes/direct execution graph and migration-only explicit-DB independence.
- [x] Independent complete review, both typechecks/lint and caller regressions.
- [x] Parent serial DB41files1046/native60, full225files2789/UI16 and build pass;
  unchanged warmed benchmark0.97ms<50ms, history/recovery and819source/D hashes.
- [x] Work78f33b9 passes normal hooks/immediate push; PR29CI45989652010 passes,
  squashfb0dd45 has the same tested tree; PR8CI45991420238 passes.

R2 entry requires a separately approved historical-island relocation plan; exit
requires exact change accounting, graph/history/recovery equivalence and final
layout acceptance. Neither permission nor waiver is inferred from A4d.

A5a now follows its separately approved boundary above. The prior inventory and
precheck retain their historical future/not-approved status; governing approval
is this plan/design/PRD and project/drizzle-notes-file-path.md, not research alone.

## A4c Execution Boundary (2026-11-27)

- Branch codex/drizzle-insight-lists starts at squash93c0df2 after A4b2
  featureCI45955883109 and PR8CI45958456569 pass. Parent GO2026-11-27.
- [x] Independent precheck and explicit parent acceptance of nullable outputs,
  joined revisit ID witness and bounded Dashboard key/URL-action policy.
- [x] DB: four reads/internal types, frozen SQL oracle/differential suite,
  native repository groups and DB runner registration.
- [x] Consumer: three output ID schemas, indexed dashboard types/required tuple,
  tagged keys and focused schema/component/AI regressions.
- [x] Independent full-slice review, both typechecks/lint and focused callers;
  two native-test assertion defects fixed without changing production behavior.
- [x] Parent serial DB985/native52, full223files2728/UI16 and build pass;
  all815 source hashes plus original D62dirty/schema/030 unchanged.
- [x] Work54f0c25 normal hooks/immediate push; PR28CI45978229533 passes,
  squashaacbff0 has the same tested tree; PR8CI45979282462 passes.

Recompute A4d follows its separately accepted boundary above. Phase3 stays active.

## A4b2 Execution Boundary (2026-11-20)

- Begin after A4b1 integrated acceptance, separate branch from refactor/drizzle.
- Active branch codex/drizzle-streak starts at squash4d60368; A4b1 feature and
  PR8 integration CI passed before implementation GO on2026-11-25.
- [x] Independent precheck approved; parent accepts unchanged streak output and
  exact per-argument day validation/clock order with stats-local nullable guards.
- [x] Implement only streak SELECT and dayDiff; independent old loop/helper
  oracle,78 differential cases/four native groups and DB runner registration.
- [x] Independent full-slice review has no findings/fixes; both types/lint/format,
  UTC8files280 and other three zones80 each pass; original AST/SQL confirmed.
- [x] DB854/native48, full219files2568/UI16 and build:check pass; four-zone
  streak78 each,810 source hashes and original D62dirty unchanged.
- [x] Workc45e86f passed normal hooks; bounded UI incident investigation then one
  unchanged push retry green. PR27CI45955883109/squash93c0df2 and PR8CI45958456569
  pass; tested tree identical. See A4b2 verification and prepush incident review.

## A4b1 Native UI Blocker (2026-11-23)

- [x] Actual CDP stacks and independent review identify router burst-effect misuse;
  parent approves bounded direct-update/native-snapshot split, not warning filters.
- [x] Implement only ShellRouter lifecycle fix and transition tests; original-source
  regression proof, both typechecks and scopedlint, independent review.
- [x] Re-run exact native daily spec with final line-animation screenshots, then
  full/native/build gates with fresh source snapshot before ordinary commit/push.

## A4b1 Execution Boundary (2026-11-20)

- Branch codex/drizzle-daily-trends, baseA4a squashac7478d after both CI gates.
- [x] Independent precheck and explicit parent acceptance of nullable read types
  and limited chart safety exception, not full old-UI equivalence.
- [x] DB worker: trends.ts four reads, frozen oracle/differential suite, native
  repository groups and verify.mjs DB registration; exact clock/prepare retained.
- [x] Contract/UI worker: three local_day output schemas, DailyActiveStat alias/
  AI shared type, ordinal TrendPanel axes/labels and schema/AI/loader/component/
  real UI regressions. No loader/runtime exporter/privacy rewrite.
- [x] Independent full cross-layer review, both typechecks/lint/focused regressions.
- [x] Parent serial native/full/build, chart point/Tooltip UI assertions and visual
  screenshot inspection, stable source/D hashes. Preserve data/inputs/versions.
- [x] Work66760b6 normal hooks/immediate push; PR26CI45606492783 passed,
  squash4d60368 has the same tested tree; PR8CI45608688612 passed.

Streak A4b2, list A4c and historical-aware recompute A4d remain separate. This
boundary does not approve their implementation or complete the parent phase.

## A4a Execution Boundary (2026-11-20)

- Branch codex/drizzle-stats-basic, based on A3b2 squashfa13260 after both CI gates.
- Gap: three basic stats reads still use native queries/manual assertions. Keep
  existing behavior, public signatures and caller ownership; no query consolidation.
- Implementer owns only three functions/imports in stats/insights.ts, independent
  stats-basic-reads-oracle.ts, stats-basic-reads.test.ts, native repository cases
  and DB runner registration. Parent owns spec/docs/task/Git and serial gates.
- [x] Full A4 inventory and independent A4a precheck approved; parent records
  raw aggregate/time, native overflow and unchanged public contract before coding.
- [x] Three reads implemented with43 independent differential and4 native groups;
  INTEGER overflow seeds exact literals/typeof. Per-read full state/ledger checked.
- [x] Independent review fixes native fixture-only migration-clock comparison;
  no product findings. Both typechecks/lint and5files103 focused tests pass.
- [x] Corrected test:db677/native40, test:all2364/UI14 and build:check pass;
 802product/config/test hashes and original D62dirty unchanged.
- [x] Worke98da9b normal hooks; initial prepush Windows EPERM investigated without
  source change,3x49focused and fullhook retry green. PR25CI44725568294/squash
  ac7478d/PR8CI44728103063 green; tested trees identical.

A4b nullable daily keys, A4c nullable insight IDs and A4d historical migration-aware
recompute remain separately designed work; no silent scope expansion.

## A3b2 Execution Boundary (2026-11-20)

- Branch: `codex/drizzle-first-ac`, created from merged A3b1 integration.
- Gap: two firstAc.ts mutations still use native SQL/manual row assertions.
  Convert using real Drizzle SELECT/UPDATE without changing the accepted state,
  prepare/iteration, native-error, day or notification contracts.
- Implementer owns firstAc.ts, frozen original first-AC oracle, new differential
  suite, native repository cases and DB runner registration. Parent owns metadata,
  spec/docs, serial global/native/UI/build gates and Git; reviewer owns evidence.
- [x] Independent A3b2 design approved; parent records explicit accepted boundary
  before implementation. A3b1 must finish feature/integration CI first.
- [x] Two mutations implemented;77 frozen-oracle differential cases and6 native
  groups cover status/day/raw-value/iterator/prepare/trigger/transaction branches.
- [x] Independent complete-diff review no findings/fixes; both typechecks/scoped
  lint and6files175 focused/caller tests pass; oracle AST/SQL verified.
- [x] Serial test:db634/native36, test:all2321/UI14 and build:check pass;800
  source hashes/D62dirty stable. Real deferred-FK COMMIT and UTC/NewYork77 each pass.
- [x] Workeb5103f normal hooks/immediate push, PR24CI44691480140 green;
  squashfa13260 same tested tree; PR8CI44692300627 green.

A4 statistics and later domains/layout remain unfinished. Do not archive phase3.

## A3b1 Execution Boundary (2026-11-20)

- Branch: `codex/drizzle-submission-upsert`, based on A3a squash001e23a.
- Gap: submission duplicate lookup/INSERT still native/manual assertion. Convert
  this one mutation with explicit frozen030 compatibility scope; do not touch
  firstAc.ts, read queries, orchestration, schema or runtime validation.
- Implementer owns submission/mutations.ts, independent original function oracle,
  submission-upsert differential tests, native repository cases and DB suite list.
- Parent owns accepted boundary/task/spec/README, serial gates, Git/handoff.
- [x] Research and independent precheck approved supported030 scope; parent
  explicitly accepts it and records excluded DDL/view differences, startup/count
  guard limits and damaged-column diagnostic spelling differences before coding.
- [x] Prepared lookup/INSERT and original ordering/raw-time/duplicate/IGNORE
  semantics implemented with independent40 differential and4 native cases.
- [x] Independent full-diff check: no actionable issues or product fixes; both
  typechecks/scoped lint and oracle/trace/caller-focused regressions pass.
- [x] Parent test:db557/native30, test:all2244/UI14, build:check pass; all798
  product/test hashes and original D62dirty preserved.
- [x] Work6674920 normal hooks/immediate push; PR23CI44684516349 green,
  squash1a39af0 into Drizzle; tested tree identical and PR8CI44685222637 green.

A3b2 updateFirstAc/recompute and later domains/layout remain unfinished.

## A3a Execution Boundary (2026-11-20)

- Branch: `codex/drizzle-submission-reads`, based on A2g squash `6c42a38`.
- Gap: four submission reads still use native SQL/manual rows; SELECT* returns16
  fields and NULL IDs while the14-field type and timeline schema deny them.
- DB implementer owns submission queries/types, problem row type alias, frozen
  SQL oracle/new differential suite, native repository cases and DB registration.
- Cross-layer implementer owns Coach internal Map type, timeline output schema,
  known ContextGatherer fixture additions, timeline/metrics/schema tests. No
  renderer or ContextGatherer production change; no query/mutation changes.
- Parent owns specs/task/README/architecture docs, serial full/native/UI/build
  gates, Git and handoff. Workers preserve other owned edits; no recursive agents.
- [x] Research and independent precheck approve all4 reads; fixed AC literal must
  preserve the exact original aggregate parameter count and native failure limit.
- [x] Implement four reads, schema-derived full rows/alias, nullable timeline and
  internal Map policy; independent43-case SQL oracle and native3 new cases.
- [x] Independent full-diff check found no issues;5 files192 focused tests and
  both typechecks/scoped lint pass. No product/test changes during final gates.
- [x] Parent test:db517/native26, test:all2204/UI14, build:check serially pass;
  all796 product/test hashes and original D62dirty baseline unchanged.
- [x] Work1e46732 normal hooks/immediate push; PR22CI44680385928 green and
  squash001e23a into Drizzle. PR8CI44681049295 green, draft/base dev unchanged.

No A3b writes, later domain queries, main-layout/splits or release work in A3a.

## A2g Execution Boundary (2026-11-20)

- Branch: `codex/drizzle-recent-problems`, based on `32cd84d` in the C worktree.
- Gap: recent SQL/type declarations hide nullable IDs and the sidebar offers
  internal actions the existing main route predicate rejects. Preserve query
  results and site navigation; explicitly disable only unaddressable actions.
- DB implementer owns problem queries/types and shared problem output schema,
  independent recent SQL oracle/differential tests, native repository cases and
  DB suite registration. No other domain or schema/migration changes.
- UI implementer owns pure shared ID helper, unchanged main reuse, sidebar/home
  keys and invalid actions, minimal local CSS, focused component/browser tests
  and affected local READMEs. No generic widget or input-route changes.
- Parent owns task/spec/architecture docs, serial global/native/UI/build gates,
  Git integration and handoff. Workers must not revert each other's edits.
- [x] Research and independent design precheck establish typed LIMIT placeholders,
  exact route-predicate sharing, persistent accessible explanation and tuple keys.
- [x] Implement bounded DB/output-type and UI/helper changes with independent tests.
- [x] Independent full-diff check: no findings; both typechecks/lint and9 files161 tests pass.
- [x] Parent test:db474/native23, test:all2157/UI14, build:check pass; responsive
  invalid-ID screenshots inspected. Original D62 dirty hashes unchanged.
- [x] Work377cf4f normal hooks/immediate push; PR21CI44675893865 green, squash
  6c42a38 into Drizzle. PR8CI44676609924 green; draft/base dev, no release/archive.

Then continue submission and stats queries using separately reviewed boundaries.
The remaining main-layout/splits and later phases are not completed by A2g.

## A2f Execution Boundary (2026-11-20)

- Branch: `codex/drizzle-problem-read-contract`, based on `6b66ad5` in the C worktree.
- Gap: remaining native detail/visits/omnibox queries hide reachable nullable IDs.
  Replace those complete query boundaries and make their output types truthful.
- Production ownership: `problem/queries.ts`, `problem/omnibox.ts`,
  `problem/types.ts`; shared problem/submission/coach output schemas only for the
  nullable IDs actually emitted. Preserve recent-list implementation, other
  queries, renderer behavior, input validation and connection ownership.
- Test ownership: independent original-SQL oracle; focused detail/visit and
  omnibox differential cases; real Electron repository coverage; DB suite list,
  affected README and contract tests. Parent owns task/spec/docs and full gates.
- [x] Independent design precheck approved; SQL-bound identity projection is
  required (not JS input replacement), and existing embedded submission ID schema
  becomes nullable. See `research/a2f-nullable-contract-review.md`.
- [x] Implement and compare raw rows/errors/events, null/empty/literal IDs,
  tombstones, ordering/limits, raw instants and lifecycle against frozen SQL.
- [x] Independent code check found no actionable issues; both typechecks/lint,
  independent focused156 and native22 passed. `test:db`31 files433 tests passed.
- [x] Parent `test:db`433/native22, `test:all`2104/UI11, `build:check` passed.
- [x] Work4cef9ea正常hooks立即推送；PR19CI44657463867通过，squash2112734
  合回Drizzle。PR8集成CI44658098990全绿。
- [x] PR19 merged into Drizzle; PR8 remains draft/base dev. Session19 and this
  handoff record bounded completion without archiving phase3 or changing v2.0.1.

A2f deferred recent-list nullable-ID actions; the A2g boundary above now governs them.
No active phase is complete merely because this slice is accepted.

## 启动切片 A0（2026-11-07）

用户已授权合并阶段2并继续后续任务；阶段2的dev CI通过。先在`refactor/drizzle`执行A0，
不把后续查询替换/目录迁移一起混入首批。具体决策以design §0为准。

- [x] 固定Drizzle0.45.4/kit0.31.11，配置schema生成命令。
- [x] `src/main/db/schema.ts`精确描述030后25表与82个timestamp_ms列。
- [x] `src/main/db/client.ts`提供无副作用的既有连接包装，不开第二库。
- [x] 生成SQL临时库和现有0→30库做结构/约束等价；Date/epoch0/null/BLOB/事务回滚验证。
- [x] 两次typecheck、lint、test:all、build:check与独立检查通过（194文件/1574用例、UI11/11）。
- [x] A0提交`e1e3ae0`已推送，PR #8 CI `42337708058`通过。
- [x] A0收口后执行A1安全迁移账本/打包资源；业务查询留到后续独立切片。

验收记录：[A0 Drizzle基础](./a0-verification-2026-11-07.md)。A0不接管生产迁移，不宣称整个阶段3完成。

## 当前切片 A1：安全迁移基线接入

- [x] 编译可信migration标识与resourceloader，禁止路径逃逸/未知hash/journal顺序错误。
- [x] legacy连续台账、baseline物理schema和Drizzle记录prefix校验，安全baseline adoption。
- [x] 默认异步安全入口装配legacy/Drizzle，pending合并备份与兼容failurekeys；explicitoverride保持。
- [x] 打包SQL/journal到resources并测试，架构守卫覆盖新DB路径且不放开其他main模块SQL。
- [x] 增加fresh/历史升级/结构漂移/坏台账/资源/后续失败恢复/重试阻断/原生打包验收。
- [x] 独立复核无遗留问题；test:all197文件/1665用例、UI11/11、build:win通过。
- [x] A1提交`1ba968b`已推送，CI `42373778745`两项全绿；继续A2a。

验收记录：[A1安全迁移接管](./a1-verification-2026-11-07.md)。基线SQL/冻结legacy未改，用户原库未操作。

## 已验收切片 A2a：题目总览只读查询

详见 `research/a2-problem-queries.md`；A1与A2a均已推送且CI通过。

- [x] 只转换 `problem/overview.ts` 四条查询，保留同步输出、日期边界、现有tombstone语义及零值。
- [x] `problemOverview.test.ts`覆盖空库、nullable ID计数、distinct/day边界、tombstone、epoch0、
  毫秒、旧SQL结果对照、关闭重开与无写入/无通知；接入test:db并补原生ABI用例。
- [x] 独立复核、typecheck/lint、test:db、test:all；更新领域README及规范。
- [x] 提交`3869fe2`已推送，CI `42375070997`两项全绿；最新build:win也通过。

验收记录：[A2a题目总览](./a2a-verification-2026-11-07.md)。阶段3仍in_progress，PR #8保持draft。

## 已验收切片 A2b：按平台题号查找ID

- [x] 只转换 `findProblemIdByPlatformKey` 的单条SELECT；原string/null接口已经覆盖nullable ID，
  保留empty-string ID、大小写敏感、精确绑定和deleted_at=0过滤，不改其他queries/mutations。
- [x] 对照原SQL测试命中/缺失/平台key不匹配、引号/通配符字面量、NULL/空ID、tombstone、
  只读/无通知/关闭重开；独立复核通过，DB25文件/172用例及原生14/14通过。
- [x] 提交`5b13d85`已推送，CI `42379159788`全绿；上轮日志提交已随UI诊断推送。
- [x] upsert已研究/独立复核bound-null策略可保留现有行为；DTO读查询政策仍未决定。
  null-ID UPDATE不更新但仍通知，不能悄悄改成isNull/按平台key更新或conflict-upsert。

## 已验收切片 A2c：题目 upsert

设计见 `research/a2c-problem-upsert.md`，独立复核和完整门通过，已提交推送且CI全绿。

- [x] 仅替换upsert的三条语句并移除旧row断言，保留真实bound-null UPDATE、六列SET、时间/标题/字段/通知契约。
- [x] 35个新oracle/事务/异常/nullableID回归接入test:db，并补原生Electron场景。
- [x] 独立复核、typecheck/lint、test:db26文件207用例、test:all201文件1737用例/UI11通过。
- [x] build:win通过，包含NSIS和真实打包双实例/资源台账。
- [x] 提交`2bba47e`已推送，CI `42381032242`两项全绿；最新build:win/打包资源和UI门通过。

验收记录：[A2c题目Upsert](./a2c-verification-2026-11-07.md)。A2d删除已完成，
见本页顶部和[A2d验收](./a2d-verification-2026-11-17.md)；DTO读查询/omnibox仍待独立切片。

原生tab-drag诊断已单独交付；`research/a1-pre-push-drag-incident.md`保留未定位的瞬时
失败证据，不能以复测通过宣称根因已修。若再次失败先读取新增附件，再决定后续修正。

## 独立验收：原生 UI 失败诊断

- [x] 有界事件/finishDrag观测、失败窗口状态附件；不改产品行为、断言、超时或重试策略。
- [x] 15个行为测试验证记录容量、调用方返回/错误传播、只读快照和失败附件保留原错误。
- [x] 独立复核与真实UI门通过（完整门200文件/1702用例、UI11/11）；若再次失败使用新证据分类，不无限重复推送碰绿。
- [x] 诊断独立提交`a8f093e`正常推送，CI `42378532852`全绿，同时带上未推送日志提交`7d35ed0`。

## PR A：Drizzle（`refactor/drizzle`，约 4 天）
- [x] Drizzle依赖、`drizzle.config.ts`、`src/main/db/client.ts`、`schema.ts`（25表，A0先验证）。
- [x] schema代码经`drizzle-kit generate`生成基线，与030结构验证后固定；A1安全`migrate.ts`三路径引导及Drizzle-only pending备份 + 测试。
- [ ] 逐域改写查询（顺序：problem → submission → stats → notes → site → user-script → credential → cookie → coach → rating → ai → backup）；每域改完跑 `pnpm vitest run tests/db tests/<域>`。
- [ ] `BARE_SQL_BUDGET` 守卫改规则；`learningDataExport.ts` 35 处裸 SQL 改 Drizzle 批量。
- [x] `electron-builder.json5` `extraResources: drizzle/`；`tests/packaging` 白名单；`test:packaged-app` 验证打包后迁移可运行。
- [x] `DATABASE_SCHEMA.md` 标明schema映射及Drizzle台账；`DATABASE_MIGRATION_ROLLBACK.md` 加Drizzle流程，域查询变化时继续同步。
- 验证：`pnpm test:all`；三份 fixture 库启动。commit 拆分按域。

## PR B：目录迁移 + kebab-case（`refactor/main-layout`，约 3 天，零逻辑变更）
- [ ] 写迁移脚本 `scripts/migrate-main-layout.mjs`：按 design §1 域映射表 `git mv` + 重命名 kebab-case + 批量改 import 路径（用 `ts-morph` 或 `tsc` 报错驱动修正）。
- [ ] `vite.config.ts`、`electron-builder.json5`、`tsconfig*.json`、`vitest.config.ts`、`tests/architecture` 路径常量、`tests/packaging` 白名单同步。
- [ ] 测试文件同步 `git mv` 到 `tests/unit/services/{domain}/`（临时，阶段 5 再分 lib/procedures）。
- [ ] 每域 README 随目录移动并改路径。
- [ ] 文件名守卫（自写 `check-architecture.mjs` 规则：非 `.tsx`、非 `use*.ts` 的文件必须 kebab-case）。
- 验证：`git diff -M90% --stat` 全是 rename；`pnpm test:all`。单 commit `refactor(main): 主进程迁到 src/main 模板布局并统一 kebab-case`。

## PR C：拆分与收敛（`refactor/main-split`，约 3 天）
- [ ] `index.ts` / `bootstrap-services.ts` / `app-context.ts` / `create-shell-window.ts` / `shell-shortcuts.ts`；守卫禁模块级 `let`。
- [ ] procedures 化：为每个 handler 建 procedure 文件（先脚本生成骨架，再把 handler 体移入）；3 个胖 handler 主体下沉；handler 体 ≤ 5 行守卫。
- [ ] TabManager 五分（design §5），每步跑 `tests/browser`。
- [ ] CoachOrchestrator 四分（design §6），每步跑 `tests/coach`。
- [ ] 收敛：`atomic-json-snapshot-store.ts`、`timing.ts`、`typed-emitter.ts`、`createGuardedIpc`、`site-registry.ts`、`randomUUID`、去重函数。
- [ ] `AppError` 基类 + 5 子类；procedure 全部 `logger.scope`。
- [ ] `SYSTEM_ARCHITECTURE.md` 重写目录树与数据流。
- 验证：行数守卫；jscpd < 2%；`pnpm test:all` + `pnpm build:win`。commit 按拆分对象。

## Review Gates
- 每PR验证后squash合入dev；发版遵守项目master/release-it规则，需要单独授权，不在dev自动打alpha tag。
- 阶段结束安装包在 rc.1 userData 升级启动 + 七站手测提交监测（红线 §6）。

## Rollback
- PR A：revert 代码，数据不受影响（同 schema）。
- PR B：revert 单 commit 即整体回退。
- PR C：按拆分对象 commit，可单独 revert。
