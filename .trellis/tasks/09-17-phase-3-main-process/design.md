# 阶段 3 技术设计

## 0a. 发行加固同步优先契约（2026-11-17）

在A2d之前，先组合已发布2.0.1恢复协议与A1迁移协调器。完整评审见
`research/release-hardening-sync-design.md`；本节不表示实现或验证已经完成。

- 保留format1 checkpoint/backup manifest/resolution audit严格兼容；Drizzle尝试使用
  format2组合状态，记录legacy ledger、schema hash、Drizzle账本存在性及精确可信前缀。
  不用optional字段把旧记录静默解释成Drizzle尝试，也不改应用schema或版本。
- legacy与Drizzle源态都必须是已知连续前缀，目标不能回退且至少一边推进；Drizzle目标要求
  legacy到030。legacy源/目标都30时，Drizzle推进仍需备份和持久prepared记录。
- 恢复重放只到记录的目标：旧28→29不自动运行030或Drizzle；组合目标使用同一可信
  resource provider，验证全部当前资源后暂存目标prefix，通过官方migrator有界重放。
  当前库及checkpoint自述都不是物理目标的独立证明，keep-current不能覆盖用户后续数据。
- unresolved记录在开库前无条件阻断，包括pending为空或explicit migrations:[]；旧
  pendingMigrationKeys保留并验证，仅当备份+keys能唯一证明目标时才允许明确关联恢复。
- 保持恢复intent、displaced main/WAL/SHM、原错误+次要诊断、audit验证及resolved归档。
  冻结001–030、baseline SQL/meta、已发布tag/资产不变；原D盘未提交内容不参与同步。
- 独立复核、组合状态回归、真实强杀及test:all/build:win通过后，正常hooks提交/推送，
  用保留祖先的merge PR同步到Drizzle分支并跟CI；PR8继续draft、目标dev，不合入主线。

## 0. 启动评审与当前切片（2026-11-07）

本节优先于后续历史示例。依据`research/start-readiness.md`，第一交付A0只包括依赖、
完整schema、typed client与行为/结构等价测试。候选固定版本为drizzle-orm0.45.4、
drizzle-kit0.31.11，安装后按实际API和Electron ABI验证，不采用beta。

- A0新代码写`src/main/db/{schema,client}.ts`，旧`electron/db/connection.ts`仍拥有连接/备份/
  migration/关闭生命周期。工厂`createDrizzleClient(sqlite)`只包装传入连接，不能import即开库。
- schema覆盖25表；沿用现有snake_case列名及精确null/default/PK/unique/partialindex/CHECK/FK，
  不添加模板示例中的额外默认值或业务约束。82时间列映射timestamp_ms，读Date、写Date，
  DTO输出明确getTime，绝不把Date直接送IPC。BLOB使用buffer模式，0与null独立验证。
- A0提供`drizzle.config.ts`和`db:generate`，schema生成输出`drizzle/`，不运行push/migrate。
  用生成SQL构造空临时库，与生产0→30库逐表比较列/默认值/索引/FK和CHECK行为；生成物若
  自动命名约束导致非语义差异须明确比较，不因文字不同删约束。测试不使用用户数据库。
- A1基线引导必须验证连续1–30台账与真实schema，而非只看MAX=30；读取固定版本Drizzle
  migrator的hash/timestamp台账契约，缺资源/未知schema安全失败。Drizzle-only pending也必须
  触发原备份及failure marker，禁止绕开安全层。A0不提前写台账或激活此路径。
- `generate`读取schema代码和snapshot；数据库反向解析是`pull`，不能混称。A0只生成/核对
  schema，后续才固定不可变基线hash并打包资源。
- 现有IPC的返回形状（数组/对象/联合）保持，不套用下方示例改变公共接口。R4事务通知scope
  包住实际commit调用，部分autocommit语义不变。不新增tag或在dev执行release-it。
- 当前规模：25表、electron321个TS文件、250处prepare；排除迁移222处，repository162处。
  main1164/TabManager2494/CoachOrchestrator1474行，仅作分批规划，不硬套旧计数。

## A5a Notes File-Path Reads (2026-11-27)

Parent accepts research/a5-notes-queries.md and the independent
research/a5a-notes-file-path-review.md for this four-read slice only. A4d PR29
and handoff PR30 are integrated; base299b0e3 and PR8CI45994240435 pass before GO.
The executable contract is project/drizzle-notes-file-path.md.

- Add query-only electron/db/repositories/notes/file-path.ts, exporting
  findNoteFilePath(db: Database.Database, noteId: string). Schema/query-derived
  row return preserves empty file_path as found. Public builder selects only
  file_path with one bound equality and get; no filters/cache/global lifecycle.
- Replace only four lookup expressions/assertions and add one import. Each
  caller keeps getDb and every method tail, including content SELECT outside
  try and actual runtime NULL-ID equality through the unchanged batch list.
- Explicit supplied-handle use is the documented narrow repository exception;
  callers retain acquisition. Damaged-DDL errors retain native stage/class/code/
  injected identity; quoted missing-column wording may differ. No translation.
- Parent owns a dedicated runNotesStorageTest, only notes native external/
  RUN_AS_NODE removal, DB suite registration and
  Vitest exclusion, plus exact NoteService bare-SQL ratchet12-to8.
- Native harness investigation proves single-file ESM bundling hoists transitive
  external imports past local dynamic init wrappers. Parent approves notes-only
  splitting:true, output .mjs chunks under its own tmp/electron-tests subdirectory;
  bundleTest defaultfalse and all prior caller arguments/behavior stay unchanged.
- First actual native run passes21 behavior groups but root cleanup before app
  exit fails EPERM; only Chromium session stores remain. Independent reviewer
  accepts runner-owned workspace notes-storage-* mkdtemp and required test-only
  ALGO_NOTES_TEST_ROOT; child validates containment/nonsymlink, owns resource
  teardown, parent checks lexical/real ownership and cleans after child exit.
  Preserve primary child errors if cleanup also fails; no live-root deletion or
  blind retry. Restore generic runElectronAppTest exactly, rather than extend its
  options for one caller. The rejected system-temp cleanup is not retried.
- Native app harness isolates userData/session/log paths before deferred imports,
  uses no window/bootstrap, checks containment for destructive work, and closes/
  unsubscribes/unregisters before cleanup with truthful exit. Protocol, if tested,
  uses real privilege-before-ready/handler-after-ready/fetch. Vitest mock setPath
  is not isolation; real-FS focused tests must override getPath explicitly.

Worker1 owns helper, four substitutions/import, frozen independent lookup/four
methods/batch oracle, focused differential tests and appended native repository
groups. Worker2 owns only tests/electron/notes-file-path-storage.test.ts and may
consume worker1's agreed oracle interface, never edit it. Parent owns all docs,
runner/config/ratchet, serial native/global/build gates and Git. Concurrency3 total;
workers do not delegate or revert each other's edits. Independent full review
follows freeze. All remaining notes/full-read/UI/write decisions remain pending.

## A4d Runtime / Historical Recompute Split (2026-11-27)

Parent accepts research/a4d-stats-recompute-design.md and its independent review,
plus research/a4d-boundary-reconciliation-review.md. A4c squash
aacbff0c2c1afe9df4fa2bda5698450f0d76e608 is the concrete accepted baseline; both
feature and integration CI pass before GO. Executable contracts live in
project/drizzle-stats-recompute.md and the narrow data-refresh.md exceptions.

- Add stats/recompute-runtime.ts exporting the two existing explicit-DB helper
  signatures. Only recompute.ts import changes; all three wrapper bodies remain.
  Current raw aggregate/range/UNION/order/JSON/UPSERT behavior is preserved.
- Keep recompute-core.ts,030 and shared time bytes and the030 direct execution
  branch unchanged. No global DB, runtime ORM/schema import, delegate or shared
  algorithm extraction enters the historical branch. Pin hashes and graph to
  aacbff0, not dynamic HEAD or self-derived current expectations.
- Generated INSERT12 versus original11 is accepted only on frozen030 physical
  columns/defaults. The deleted_at DEFAULT7 counterexample remains excluded;
  startup validators are unchanged and do not provide per-write guarantees.
- All facts convert before per-day writes. Narrow nullable cache keys only at
  their original late failure point, preserving earlier partial effects.
- Preserve prepare-before-JSON and original11 bindings/9 conflict UPDATE targets,
  native INTEGER overflow, no-order platform JSON and caller transaction ownership.
  Single success emits evenIGNORE0; all-days positive full success emits once,
  zero/throw emits none; selected dates emit per successful wrapper invocation.
- Exact-path freeze is an A4d/R1 constraint, not a perpetual R2 layout exception.
  A later historical-island move needs its own plan approval and exact path-map,
  import-graph/algorithm/history/recovery proof. Changed import bytes require
  explicit new evidence, not a false unchanged-hash claim. No relocation is
  approved now, no guard budget weakens and final electron/ removal remains.

Runtime implementer owns new runtime helper, wrapper import, independent frozen
core/wrapper oracle, differential tests, native groups and verify.mjs registration.
Historical-guard implementer owns only tests/db/stats-recompute-history.test.ts;
parent owns README/spec/task/docs/Git. Guard registration belongs to runtime
implementer. Both work directly without delegation, within total concurrency3.
Parent runs serial native/full/build/performance/recovery; independent full-slice
review follows freeze. Frozen030/history fixtures are not regenerated or repaired.

## A4c Insight Lists And Consumer Identity (2026-11-27)

Parent accepts research/a4c-insight-lists-contract-review.md after A4b2. Convert
only getTimeline/getRevisitStats/getWrongProblems/getUnreviewedProblems plus
corresponding output ID contracts and Dashboard row keys. All four use the
current lifecycle-owned handle, public builders and named LIMIT placeholders.
No new connection/cache/transaction/write/event/catch or output parser.

- Timeline selects the original six columns, raw occurred_at, all tombstones,
  nullable/empty IDs, occurred_at DESC only/default50. No joins or extra fields.
- Revisit projects problemVisits.problem_id as the existing joined NOT NULL
  equality witness; GROUP BY parent id, COUNT(visit.id), raw MAX(entered_at),
  HAVING count>1 and count DESC only. Anonymous visits affect MAX but not count.
- Wrong keeps active parents, all nonexact-AC children, correlated NOT EXISTS
  any exact AC including tombstones/NULL-ID rows, COUNT(child.id), raw MAX and
  original descending order. Use a public alias for the correlated table and
  fixed AC literals. Conservative nullable output is not a claim of NULL rows.
- Unreviewed keeps strict cutoff/status predicates, oldest-first/native limit,
  SQL CAST elapsed-day division. Prepare before first nowMillis, helper's second
  nowMillis and localDayBounds; bind [now,cutoff,limit] in original order. No
  precomputed or shared clock, timestamp Date decoder or calendar-day rewrite.
- Three shared output-ID schemas permit string|null; internal wrong/unreviewed
  follow. Request/instant/import/snapshot schemas and revisit string remain.
- Dashboard affected IDs use indexed authoritative shared types; problem-list
  platform_problem_id becomes required string. Wrong/unreviewed keys serialize
  [platform,platform_problem_id]; revisit retains string problem_id. Timeline
  serializes ['anonymous',index] for nullish IDs and ['id',id] otherwise, including
  empty string. Anonymous identity is explicitly positional across reorders.
- Keep URL click/Enter/Space actions, arrays, layout, loading-null/empty states
  and exact AI allowlist/count/time behavior. No loader/preload/IPC/exporter or
  period-summary runtime changes, generic widgets or styling changes.

DB worker owns four reads/imports, internal two ID types, independent original
SQL oracle/focused tests, native groups and DB runner. Consumer worker owns
three shared ID schemas, bounded analytics models/keys and three new IPC/UI/AI
regression files. Parent owns specs/docs/task/serial gates/Git. Independent review
follows both workers' freeze. No A4b2 overwrite or migration030/recompute edits.

## A4b1 Router Lifecycle Prerequisite (2026-11-23)

Parent accepts the independent reviewer recommendation after actual native CDP
stacks map all four warnings to the existing ShellRouter burst-effect flushSync.
Only ShellRouter.tsx and tests/components/transitions.test.tsx may change here.

- Burst branch uses direct setRenderTab; preserve skip/live-null/version order.
- Private maybeTransition callback receives nativeSnapshot:boolean: fallback
  invokes false synchronously, actual startViewTransition callback invokes true.
- Version guard runs before either update or flush. Direct fallback setRenderTab
  must not flush in the effect; native callback retains flushSync so the route
  wrapper is committed before Chromium captures its new state.
- Preserve clock calls,200ms threshold, same-ID path, promise rejection handling
  and identity-guarded settlement. No timers/microtasks/scheduler abstraction,
  added fallback cancellation, mount/unmount redesign, CSS or route API changes.
- Native-like test mocks queue callbacks and can deliver skipped stale callbacks.
  Test no-console burst/fallback (old-source mutation must fail), newest route,
  commit-before-native-callback-return, older settlement and handled rejections.
- Native daily test keeps zero-console and all data/hover/range checks. Screenshot
  readiness waits for actual Recharts line animation stroke-dasharray removal,
  not fixed delays or disabled production animations.

## A4b2 Streak And Ordered Day Validation (2026-11-20)

Parent accepts A4b2 from research/a4b-daily-reads-review.md as separate work after
A4b1 integration. Only getStreakDays SELECT/imports and stats/date.ts dayDiff
signature/ordered NULL guards change. Preserve all loops, today/clock timing,
thresholds (active>=300 OR submissions>0 OR solved>0), DESC day, tombstones and
no-grace-yesterday behavior. Schema-inferred nullable day is not filtered/coerced.

- dayDiff(later:string|null, earlier:string|null) checks later NULL immediately
  before existing localDayBounds(later), then checks earlier NULL immediately
  before existing localDayBounds(earlier). NULL raises TypeError Invalid local day.
- Never combine guards at entry: later9999-12-31 range failure must precede
  earlierNULL. Never prevalidate the full list or rows. Empty/onebad/twobad and
  clock failure outcomes stay distinct. Calendar UTC-ordinal arithmetic unchanged.
- No shared time helper or public request widening, UI/output/type/schema/030/
  recompute or other insight changes. Frozen oracle must freeze old dayDiff
  behavior independently, not import the newly modified helper on both sides.
- Required evidence: qualification edge299/300, NULL/single/pairs/invalid ranges,
  longest-before-clock/current pass, today/yesterday/future/gaps, no notifications,
  readonly/currenthandle and host UTC/Shanghai/NewYork/Apia calendar errors.

## A4b1 Daily Reads And Ordinal Chart Contract (2026-11-20)

Parent accepts research/a4b-daily-reads-contract.md and independent review's
A4b1 policy after A4a acceptance. Actual baseline allows multiple NULL daily
primary keys. Preserve their data, not narrow away null or invent sentinel days.

- Four trends.ts reads use current connection/public builders and schema column
  local_day:string|null. Daily/submission LIMIT uses named placeholders; keep
  negative/NaN/fraction/native errors and original DESC/ASC with no tie-break.
- Visited/AC branch remains if(days), including all-time0/-0/NaN; prepare before
  localDateDaysAgo then bind cutoff. Keep lexical >=, clock/error order,
  solved_problem_count for AC, no added filtering/time repair/normalization.
- Shared DailyActiveStats/TrendPoint/SubmissionTrendPoint allow string|null only
  for local_day. Preserve exported DailyActiveStat as shared type alias; AI
  daily_stats reuses same seven-field shape. No runtime exporter/loader/snapshot/
  period/IPC/preload change, input widening, or broad nullable day alias.
- Both TrendPanel charts retain arrays/metrics/ranges/layout/style; XAxis is
  type=category WITHOUT local_day dataKey, producing row ordinal positions.
  Tick and Tooltip label formatters map numeric CATEGORY (not callback index) to
  that same chart array. Narrow unknown to nonnegative integer with existing row,
  else empty label; no any/coercion/payload/secondary-index guesses.
- NULL alone displays 日期缺失; nonnull strings retain tick.slice(5) and full raw
  Tooltip labels, including empty/malformed text. Never change DTO/JSON/DB days or
  copy/merge/filter chart rows. A literal equal to that label still has its own slot.
- Intentional correction of proven NULL misassociation requires real component/
  Electron point-to-date and Tooltip assertions for both charts, allNULL/mixed/
  empty/malformed, All/finite ranges and viewports; selector probes are insufficient.
- No streak/dayDiff/recompute-core/030, input/writer/instant validators, privacy,
  event/transaction, CSS/widget/UI redesign or connection changes.

DB worker owns four reads/oracle/differential/native groups/DB runner. Contract/UI
worker owns selected types, TrendPanel and schema/AI/loader/component/UI regression
files. Parent owns docs/spec/task/global gates. Nonoverlapping ownership required.

## A4a Basic Statistics Read Contract (2026-11-20)

Parent accepts the independently reviewed three-function boundary in
`research/a4a-stats-basic-review.md`, after A3's integrated acceptance. Only
getPlatformDistribution/getProblemVisitStats/getLastActiveTime in insights.ts
and independent oracle/tests change. Existing signatures/callers stay unchanged.

- Wrap the lifecycle-owned current handle for each call; no new connection,
  cache, clock, transaction, events, migrations, validation or catches.
- Distribution retains COUNT(*) of active parents, exact platform grouping and
  descending count only. NULL IDs count; deleted_at0 is deleted; no new tie-sort.
- Visit stats retain exact problem_id equality, COUNT(*) and raw SQL COALESCE of
  SUM(duration), SUM(active), AVG(duration). Include NULL IDs/tombstones/orphans;
  AVG ignores NULL inputs rather than dividing by total visits. SUM integer
  overflow still throws. Helper sum/avg attach String decoders and are unsuitable.
- Real no-GROUP aggregate yields one row; preserve truthful optional type via
  explicit invariant throw only. Do not cast/assert/fabricate zero results.
- Latest returns raw occurred_at from descending row LIMIT1, with ??null. No MAX
  rewrite/overview delegation, Date/Number/String decoder, tombstone filter or
  fallback-to-now; epoch0/fraction/extreme diagnostic scalars remain native.
- Supported fixtures retain scalar keys/types/errors. Damaged qualified-column
  spelling may differ outside accepted schema, but failure stage/passthrough
  remains; no altered schema validation or universal arbitrary DDL promise.

Independent frozen three-function oracle and decisive native INTEGER-overflow/
NULL-AVG/raw-time cases must accompany the conversion. No other stats functions,
types, shared/IPC/preload/renderer/AI/privacy/overview/schema or layout changes.

## A3b2 First-AC Mutation Contract (2026-11-20)

Parent accepts `research/a3b-first-ac-review.md` and the corresponding original
function research. This is the two-function firstAc.ts slice on the frozen030
supported schema, not arbitrary modified DDL/view parity. It changes neither the
schema nor startup validation, and preserves the exported FirstAcRow facade.

- getDb then one nowMillis, same native handle, no cached adapter/transaction.
  updateFirstAc reads old parent time before earliest exact AC (even no parent).
  Raw projections bypass Date decoding; no filters/tie-breaks are added.
- Without AC do not construct/prepare/run UPDATE. With AC always execute the
  real conditional UPDATE even if parent missing or JS predicts no change.
  Same three SET targets and four bindings: AC, now, problemId, AC. Fixed solved
  literal and SQL-wrapped timestamp placeholders retain raw values and prepare
  ordering. Preserve synchronous errors; changes>0 alone emits problems/stats.
- After successful SQL/event, return old then new valid days via the unchanged
  helper and ordered Set. No-op still contributes dates; listener reentrancy
  must not cause earlier snapshots to be reread or events to move after dates.
- recompute prepares parent SELECT, aggregate SELECT and UPDATE, in that order,
  before Symbol.iterator access. Then eagerly new Set(problemIds), consuming all
  before writes and keeping first occurrences. Missing parents skip aggregation.
- Aggregate COUNT(*) and raw MIN(CASE exact AC) with no GROUP BY/decoder retain
  nullable child IDs/tombstones. Explicit throw for impossible undefined result
  is allowed; no cast, assertion, fabricated defaults or silent skip.
- Derive solved/attempted/unknown/visited exactly. SQL-wrap dynamic SET values;
  preserve six bindings and real null-safe IS NOT predicates, including no-op
  attempts. After each changed row emit, then append valid old/new dates. Keep
  partial autocommit failures, native FAIL effects, IGNORE changes0/no event,
  guarded listeners and caller-owned savepoint/real-COMMIT notification scopes.
- Qualified damaged-column wording may differ; native failure stage/passthrough
  remains. No retries/new validation/notification scheduling/DDL promises.

Implementation owns only firstAc.ts, independent frozen dual-function oracle,
differential tests, native repository cases and runner registration. Parent owns
task/spec/docs and serial native/full/build/Git. No mutation/read query/DTO/day
helper/event bus/import/batch/renderer/layout or release changes.

## A3b1 Submission Insert Contract (2026-11-20)

Parent explicitly accepts the independently reviewed frozen030 table scope in
`research/a3b-submission-writes{,-review}.md`. Convert only upsertSubmission,
not first-AC updates/recompute. Supported compatibility is complete rows/events,
argument/prepare order and native errors on the exact030 table/default0/NULL,
plus ordinary audit/IGNORE/FAIL/ABORT diagnostic triggers. This is not universal
parity after arbitrary DDL: generated INSERT names16 columns versus legacy14;
altered omitted defaults/renamed columns/view replacements provably differ.

- Do not weaken the validator or add per-write checks. Physical validation runs
  at startup/adoption with complete legacy and Drizzle count<=1; later histories
  use integrity checks. Open handles/test overrides are not per-write validation.
  Reassess later schema migrations, not silently rely on this scope forever.
- getDb/now ordering remains; prepared named-placeholder lookup selects only ID.
  Prepare BEFORE reading platform/key getters, then get with values in original
  order. Any existing row, including null/empty ID/tombstone, returnsfalse without
  UUID, INSERT preparation or notification. Do not cache insertion's second reads.
- On miss prepare typed INSERT BEFORE UUID/other input getters. Named placeholders
  cover original14 supplied values; raw SQL wraps timestamps to bypass Date
  encoding. Preserve property order, ??null, one captured now and delayed UUID.
  No conflict-upsert/RETURNING, new validation, decoder, transaction or cache.
- Successful native run always emit submissions/problems/stats and returntrue,
  including RAISE(IGNORE) changes0; errors propagate without events. Preserve
  partial trigger FAIL effects and caller-owned transaction/savepoint/COMMIT
  notification semantics; no rollback/retry/aftercommit scheduling is introduced.
- Damaged-schema failures still propagate natively in original stage/order, but
  qualified builder identifiers may change error message spelling (for example
  submissions.platform). No blanket exact-message claim outside supported schema
  and no error rewriting to manufacture parity.

Freeze original function independently, inject deterministic UUID/clock only via
test seams, compare whole DB/events/outcomes and getter/prepare traces. Native
coverage includes duplicates/query_only, defaults/raw instants/nulls, INSERT
IGNORE/FAIL/ABORT and FK/unique/readonly errors, transaction/COMMIT failure. Pin
validator rejection for excluded default/column/view drift as boundary evidence,
not claim arbitrary schema equivalence. A3b2 remains separately reviewed later.

## A3a Submission Read Contract (2026-11-20)

After A2g, convert all four `submission/queries.ts` reads as one bounded slice.
Research and independent approval: `research/a3-submission-queries.md` and
`research/a3-submission-queries-review.md`. Mutations/first-AC writes remain A3b.

- Full-row readers preserve all16 baseline fields, nullable IDs/problem IDs,
  tombstones/orphans, exact bound equality and submitted_at direction only.
  Derive authoritative SubmissionRow from schema with four raw numeric time
  overrides; ProblemSubmissionRow becomes a type-only alias. Reuse a small
  module-local full-row projection; do not rewrite other problem queries.
- Platform LIMIT remains native bound default50 via named Placeholder; no clamp,
  validation, deduplication, Date/String decoder, catches or new ordering.
- Empty first-AC input returns[] before getDb/builder/prepare. Otherwise use one
  IN bind per original element, GROUP BY problem_id and raw numeric MIN. Keep
  verdict='AC' as a fixed SQL literal: binding AC would add a variable and shift
  the original native parameter-limit error boundary. No chunking/deduplication.
- Aggregate key stays schema-inferred string|null; only the internal Coach Map
  key widens. Public metrics derive string problem IDs from the existing input.
  TimelineSubmissionPoint.submission_id allows null, read-only end-to-end; no
  renderer action or key change. Other inputs/output times remain strict.
- ContextGatherer keeps its last10 ascending allowlist exactly; no extra fields
  leak to prompts. Known fixtures add both newly exposed baseline fields.
- Same getDb-owned connection, synchronous methods/errors, no adapter cache,
  transaction/writes/events/schema or lifecycle changes. Freeze all4 original
  SQL functions independently and compare rows/keys/error name/message/code.

Native tests must pin LIMIT and aggregate parameter-count boundary including
one-over-limit duplicates, NULL/time/tombstone semantics and lifecycle. Coach
integration covers nullable timeline IDs, string metrics IDs and zero minima;
existing LLM privacy/order tests stay intact. This is not a renderer redesign,
submission mutation migration, main layout change or release.

## A2g Recent List Contract (2026-11-20)

Design precheck approved `research/a2g-recent-problems-review.md`. Convert only
the final problem query, `getRecentProblems`, and explicitly make its existing
sidebar actions safe for unaddressable legacy IDs. This UI policy is intentional,
not a claim of SQL-only runtime equivalence. Keep every row and original-site
navigation; never repair/filter IDs, change stored constraints or weaken routes.

- Preserve platform truthiness, bound equality, original status CASE/COUNT(*)
  including tombstoned/NULL-ID children, active parents and last-visit DESC only.
  SQL LIMIT remains before the existing JS status filter. Use the typed installed
  API `.limit(sql.placeholder('limit')).all({ limit })` to forward all numeric
  values, including NaN/fractions/infinities, to native SQLite unchanged.
- Recent output ID and last-visit scalars are nullable; shared detail ID remains
  explicitly string. No new output parsing, Date decoding, fallback or coercion.
- Extract the exact main predicate to pure `src/shared/internal-page-id.ts` as
  `isInternalPageId`; main notes/detail/script-install and sidebar reuse it.
  Preserve UTF-16 length, trim, whitespace/control rules and all accepted values.
- Invalid sidebar IDs disable only notes/detail, with persistent ordinary text
  explaining why and that site navigation remains available. Include the reason
  in ListRow's existing accessible label, not only a disabled-button tooltip.
  Keep generic widgets and callback/route input types unchanged; narrow handlers.
- Both recent-list consumers use `JSON.stringify([platform, platform_problem_id])`
  as stable React identity, never as a replacement database ID.
- Freeze original SQL independently. Compare whole rows/errors, limits, status
  horizon, lifecycle/transactions/read-only/no-events; verify native Electron,
  schema distinction, predicate parity and valid/invalid UI actions plus layout.

No migrations, schema, release/version, unrelated queries, route shapes, generic
UI redesign, directory relocation or later-stage refactor belongs in this slice.

## A2f Nullable Read Contract (2026-11-20)

Independent precheck approved this bounded change; it converts the complete
omnibox problem-candidate pipeline, problem detail (parent and submissions), and
problem visits. Research: `research/a2f-nullable-contract.md`. Preserve actual
legacy results; widen only reachable nullable output IDs, including the shared
omnibox, embedded-submission and coach visit schemas. No row filtering, ID repair,
new validation, schema migration, or renderer behavior change belongs here.

The detail parent equality on the baseline TEXT/BINARY ID proves its returned ID
equals the string parameter. A bound-parameter projection can express that proof
without asserting a nullable column is a string. Do not replace the ID with the
original JS input after querying: native UTF-8 round trips may normalize text.
Use the existing detail-only `submissionRecordSchema.id.nullable()` rather than
adding a duplicate detail schema. Review: `research/a2f-nullable-contract-review.md`.
Keep every baseline row field,
raw millisecond scalar, original aggregate/tombstone policy, and both query limits.
The omnibox comparator must retain legacy JS null/string comparison, not introduce
new null ordering. Freeze the original SQL as an independent differential oracle.

A2f deferred recent-list conversion because nullable IDs reach string-only
sidebar actions and internal routes. The later A2g contract above resolves that
policy; A2f alone never claimed this query, later domains or whole-phase completion.

## 1. 目标目录

### A2e Omnibox最近访问候选（A2d集成后）

完整设计见`research/a2e-problem-reads.md`。只替换`listRecentVisitCandidates`一条
CTE/INNER JOIN查询，沿用当前连接创建typed adapter。原`p.id = recent_visits.problem_id`
INNER JOIN让输出ID必然等于NOT NULL的访问FK，直接选后者获得诚实string推断；
这不解决第一候选管线可输出NULL问题，不得加filter/coercion/assertion悄悄改变政策。

先取所有活跃访问按entered_at DESC的64条窗口，再JOIN活跃parent并匹配四字段或visit URL；
不把匹配/parent过滤推入CTE，不改tie排序。时间投影用raw scalar，避免Date截断/隐式转换。
原第一管线、trim/256截断、match参数、最终rank/recency/source/ID/URL排序、去重/8条上限不变。
冻结完整旧函数作为独立oracle，比对公开输出和实际异常；正常当前schema fixture改数字毫秒，
不改历史迁移fixture。native ABI补范围与空ID/NULL visit ID/epoch0；完整门与CI后再合Drizzle。

### A2d 题目删除（发行安全同步验收后）

依据`research/a2d-problem-delete.md`及独立预检，只替换四分支UNION和四次DELETE。
同一native连接的typed adapter使用`sql<number | null>`原始instant投影；不由Date decoder
截断小数/容忍非法值，不添加tombstone或父行存在性过滤。单条distinct UNION和原toLocalDay
验证保持，notes不加入删除范围。保留submissions→visits→activity→problem顺序与同步boolean。

native transaction仍被外层withDataChangeTransaction包住；实际COMMIT失败、savepoint及
外层回滚必须丢弃对应通知。不存在父行时仍删除children但返回false、不重算/发事件。
统计重算保留在本函数事务调用之后；顶层每个日期单独提交，失败停止后续日期且仅warn，
已删除事实及较早日期不回滚。嵌套调用的统计仍受调用方事务控制，不新增全局aftercommit机制。

原SQL独立oracle对照行/返回值/错误/事件/告警；实际deferred FK产生COMMIT失败，覆盖
DST/epoch0/负时间/非法时间、空及引号ID、缺父行、notes、第二日重算失败、关闭重开和native ABI。

### A2c 题目 upsert（三条语句，A2b交付后实施）

独立复核已确认 `research/a2c-problem-upsert.md` 可不改变nullableID政策完成转换。
只改 `upsertProblem` 的lookup/update/insert和相关测试，`deleteProblem`及所有DTO查询不动。

- lookup包括tombstone；现有NULL ID通过 `eq(problems.id, sql.param(existing.id))` 保留
  `id = ?`绑定NULL的UPDATE无匹配语义，仍实际run以保留query_only/schema错误；不提前返回、
  不改IS NULL、不修ID、不改platform/key更新、不用conflict-upsert。成功仍发既有通知。
- 六个SET列保持：canonical_url、contest_id、problem_index、title、last_visited_at、updated_at。
  CASE/COALESCE保留值及UPDATE OF触发语义，missing/null保留旧值、空字符串可覆盖。
- 原标题质量判断、UUID、insert-only source、visited状态、非复活tombstone和捕获一次的
  毫秒时间不变。Date只在ORM写入层使用，不改schema/defaults或引入事务/cache。
- 测试原三语句oracle对比完整行/事件，覆盖null/空/引号ID、query_only-null错误、UPDATE OF、
  标题矩阵、0/毫秒、source/status/tombstone、外层commit/rollback/延迟FK提交失败/savepoint。
  裸SQL仅为测试oracle或DB允许的静态表达式，不用sql.raw隐藏整个旧查询。

### A2b 身份查找与单独 UI 诊断边界

A2a之后只转换 `findProblemIdByPlatformKey` 的单条SELECT，保持平台/题号精确大小写敏感
绑定、`deleted_at IS NULL`及同步 `string | null`。NULL ID/缺行返回null，空ID保持空字符串；
同文件其他查询不变。使用当前连接typed adapter，对照原SQL验证只读、事务可见性、无R4通知
和关闭重开，接入test:db及原生Electron用例。nullable DTO/upsert政策不在本块决定。

独立测试诊断切片仅修改 `tests/ui/`：此前两次原生拖拽未重排、一次visible/focused前置
检查失败没有足够事件证据。为失败添加有界pointer/capture/DnD/focus记录、finishDrag输入/
结果、窗口visible/focused/minimized/loading/cursor/bounds快照；观测器保持原返回值及异常。
事件监听不做geometry/style同步读取，详细快照仅失败后采集；记录/附件失败不得掩盖原始错误。
保留原生操作、顺序/阈值/超时及断言，不改生产组件、不加重试/延时/强制focus/合成release。
补诊断器行为测试，独立提交；不将诊断增强称为修复了尚未确定的UI失败根因。

### A2a 题目总览只读查询（A1验收后的下一切片）

以 `research/a2-problem-queries.md` 为行为清单，只转换现有 `problem/overview.ts` 的四条
查询，保持同步函数及兼容导出口；不移动目录，不改schema、事务、IPC或其他域。

- 每次用 `createDrizzleClient(getDb())` 包装当前连接，不缓存已关闭连接、不新增全局ORM单例。
- 总题数/平台分布只过滤 `problems.deleted_at IS NULL`；用 `count()` 而非 nullable id 的
  `count(id)`，分布只按count降序，不新增同分排序保证。
- 今日访问保持本地日期 `[start,end)` 与distinct problem_id，不增加join或软删除过滤；
  参数用 `new Date(ms)`，由timestamp_ms列编码。最近活跃仍包含tombstone事件，返回number/null，
  epoch0不能变null。
- 新增真实临时库行为测试、旧SQL oracle对照、生命周期/只读/R4无事件断言，纳入test:db。
  原生Electron repository测试补numeric/epoch0证据。
- nullable TEXT PK与非空ID DTO政策、recent状态filter-after-limit、写入事务与omnibox分别留到
  后续切片；不要用类型断言、改schema或过滤掉存量数据偷渡政策。

### A1 启动契约（2026-11-07，优先于旧基线示例）

A0已提交`e1e3ae0`，PR #8 CI `42337708058`全绿；下一切片按
`research/a1-migration-protocol.md`接安全迁移器，不改业务repository或目录。

- 默认`initDbAtPathWithMigrationSafety`先校验编译固定的Drizzle SQL/hash/journal，再开库；
  生产`initDb`显式提供appRoot/packaged资源路径。测试可显式传资源集合，不新增可重定向SQL的
  生产环境变量。同步`initDbAtPath`与显式`options.migrations`（含[]）仍legacy-only。
- legacy台账必须是已知连续prefix且名字正确；有业务表却没台账不是新库。旧库升级到30后
  验证完整物理schema，再登记基线，不执行基线CREATE到已有表。现有baseline-only库也验结构。
- 默认ledger使用已安装Drizzle定义，全部记录须是已知hash/timestamp的连续prefix，不依赖
  upstream只看最大timestamp。未知/重复/未来/损坏ledger拒绝；baselinehash和when固定不重生成。
- 结构对照以hash已验证SQL在内存库构造的metadata为基准，忽略仅Drizzle ledger；只规范化
  A0证明的隐式UNIQUE/index表达差异。其他表、列、CHECK、索引、FK、view/trigger漂移失败。
  日后已应用非baseline迁移时不再拿旧结构比较，必须按对应版本契约扩展验证，不能空库重放任意DML。
- 基线登记与后续Drizzle-only迁移都算pending写入；一次SQLite backup覆盖legacy→baseline→
  later全部步骤。failure marker保留旧pendingMigrations，另加optional pendingMigrationKeys，
  键为`legacy:<version>`/`drizzle:<tag>`，不伪造numeric版本号。原错误/恢复错误分开。
- `src/main/db`新增resource/schema-validation/migrate模块；metadata查询允许在这一DB边界，
  SQL守卫扩大扫描而非整体豁免src。资源仅复制SQL和journal到packagedresources/drizzle。
- 新增fresh/21/24/29/30/已登记/后续失败恢复/资源缺失损坏/伪造台账/结构漂移/explicitoverride
  测试，真实Electron与打包应用核对实际resource和baselineledger。A1不发布、不操作用户原库。

```
algo-electron/src/main/
├── index.ts                     # 入口 < 150 行
├── env-setup.ts                 # 阶段 1 的 envSetup 移入
├── env.d.ts                     # ProcessEnv
├── app/
│   ├── bootstrap-services.ts    # 构造 AppContext（原 whenReady 265 行）
│   ├── app-context.ts           # 22 个单例的类型化容器
│   ├── single-instance.ts  main-process-errors.ts  startup-smoke.ts  theme-controller.ts  chromium-flags.ts  app-protocol.ts
├── db/
│   ├── client.ts  schema.ts  migrate.ts  drizzle.config.ts
│   ├── legacy-migrations/001_… 030_…   # 只供新库建到基线
│   └── migration-backup.ts      # 原 backup/sqliteMigrationBackup.ts
├── ipc/
│   ├── index.ts                 # registerIpc(ctx)
│   ├── guard/{trusted-sender.ts, payload-limits.ts}
│   └── {problem,submission,stats,ai,notes,backup,site,user-script,credential,cookie,coach,browser,window,download,rating,config}.handler.ts
├── services/
│   ├── logger.ts                # electron-log（阶段 1）
│   ├── data-events.ts           # 阶段 2
│   └── {domain}/
│       ├── types.ts
│       ├── procedures/*.ts
│       ├── lib/**
│       └── README.md
└── lib/                         # 主进程内共享：errors.ts timing.ts typed-emitter.ts atomic-json-snapshot-store.ts time.ts
```
`drizzle/` 迁移 SQL 放 `algo-electron/drizzle/`，`electron-builder.json5` `extraResources` 打包（模板 `database.md` 的 `process.resourcesPath` 路径）。

### 域映射（旧 → 新）

| 旧目录 | 新域 |
| --- | --- |
| `db/repositories/problem`, `problemVisitRepository`, `tracking/` | `services/problem`（visits 归 problem） |
| `db/repositories/submission`, `submissions/`, `adapters/shared/frontendVerdict*` | `services/submission` |
| `db/repositories/stats`, `ai/` | `services/stats`, `services/ai` |
| `notes/` | `services/notes` |
| `backup/`（除迁移备份） | `services/backup` |
| `sites/`, `parsers/`, `adapters/`, `db/repositories/site` | `services/site`（`lib/adapters/<site>/`） |
| `scripts/`, `db/repositories/userScript*`, `downloads/userScriptNavigation` | `services/user-script` |
| `credentials/`, `db/repositories/credential` | `services/credential` |
| `cookies/`, `db/repositories/cookieRecord` | `services/cookie` |
| `coach/`, `db/repositories/coach` | `services/coach` |
| `browser/`, `contextMenus/browserContextMenu`, `shortcuts/` | `services/browser` |
| `windows/`, `contextMenus/appMenu` | `services/window` |
| `downloads/`（其余） | `services/download` |
| `rating/`, `db/repositories/account` | `services/rating` |
| `diagnostics/` | `services/diagnostics` |
| `app/config.ts` | `services/config` |
| `shared/` | `src/main/lib/` |

## 2. procedure 形状（模板 `api-module.md`）

```ts
// services/problem/procedures/list-recent.ts
const log = logger.scope('problem:list-recent')
export function listRecentProblems(input: ListRecentProblemsInput): ListRecentProblemsOutput {
  const parsed = listRecentProblemsInput.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message, code: 'VALIDATION' }
  try {
    const rows = db.select().from(problems).where(...).orderBy(desc(problems.lastVisitedAt)).limit(parsed.data.limit).all()
    return { success: true, data: rows.map(toProblemRecord) }
  } catch (error) {
    log.error('failed', { error })
    return { success: false, error: 'Failed to list problems', code: 'IO' }
  }
}
```
- handler：`handleFromShell(IPC_CHANNELS.PROBLEM.LIST_RECENT, [listRecentProblemsInput], (_e, input) => listRecentProblems(input))`。
- 校验发生两次（guard 层 zod + procedure 内 safeParse）是刻意的：guard 保证 wire 安全，procedure 保证可脱离 IPC 单测。同一 schema 对象，无重复定义。
- `Date` ↔ 毫秒：Drizzle `timestamp_ms` 返回 `Date`，`toProblemRecord` 用 `.getTime()`（模板 `timestamp.md`）。

## 3. Drizzle 基线引导

```ts
// db/migrate.ts
export function runMigrations(sqlite, db): MigrationResult {
  const legacyVersion = readLegacyVersion(sqlite)          // schema_migrations 最大 version 或 null
  if (legacyVersion === null) runLegacy(sqlite, legacyMigrations /* 001–030 */)
  else if (legacyVersion < 30) runLegacy(sqlite, legacyMigrations.filter(m => m.version > legacyVersion))
  markDrizzleBaselineIfMissing(sqlite)                     // 在 __drizzle_migrations 插入 0000_baseline 记录（hash 与文件一致）
  migrate(db, { migrationsFolder })                        // 0001+ 由 drizzle-kit 生成
}
```
- `0000_baseline.sql` 由 `drizzle-kit generate` 在 030 之后的空库上生成一次，之后**不再修改**。
- 测试：新库路径、rc.1 库路径、中途版本库路径三条。

## 4. AppContext

```ts
export interface AppContext {
  db: DrizzleDb; sqlite: Database
  windows: WindowManager; views: ViewRegistry; tabs: (w: AppWindow) => TabManager
  coach: CoachOrchestrator | null; pet: CoachPetWindow | null
  userScripts: UserScriptService; downloads: DownloadManager; credentials: CredentialVault; cookies: CookieVault
  submissions: RealtimeSubmissionService; tracking: TrackingService; sync: SyncService
  config: ConfigService; dataEvents: DataEvents; logger: Logger
}
```
`bootstrapServices(): Promise<AppContext>` 顺序构造；`registerIpc(ctx)` 与 `createShellWindow(ctx)` 只读 ctx。模块级 `let` 归零（架构守卫已禁 `win/tabManager` 单例，扩展为禁止 `src/main/index.ts` 有任何模块级 `let`）。

## 5. TabManager 拆分边界

| 新文件 | 职责 | 来源行（现 TabManager.ts） |
| --- | --- | --- |
| `tab-manager.ts` | 标签表、激活、公开 API | 类骨架 |
| `navigation-policy.ts` | `NavigationDecision`、URL 判定、阻止原因 | 与 `main.ts:307-316` 合并 |
| `view-lifecycle.ts` | `WebContentsView` 创建/挂载/销毁/bounds | `createView*`、`disposeView*` |
| `tab-events.ts` | 逐页导航/标题/加载事件发布 `{windowId, tabId, webContentsId, url, isMainFrame, reason}` | 事件回调块 |
| `tab-ordering.ts` | 排序、拆出、过户 | 与 `TabTransferCoordinator` 协作 |

原则：先按现有 19 个协作文件的边界提取，每提一块跑 `tests/browser`（28 文件）。

## 6. CoachOrchestrator 拆分边界

| 新文件 | 职责 |
| --- | --- |
| `coach-orchestrator.ts` | 接线、生命周期、对外 API |
| `contest-auditor.ts` | ContestGuard 事件 → 静默 + `coach_interventions` 审计写入（红线 §7） |
| `llm-hint-coordinator.ts` | 提示请求生命周期、过期结果丢弃、额度 |
| `session-event-router.ts` | `ProblemSessionTracker` 事件 → RuleEngine → 干预 |

## 7. 兼容 / 回滚
- R1 在旧目录完成并合入后再做 R2，保证 Drizzle 问题不与移动混淆。
- R2 PR 用 `git diff -M90%` 审阅：应全是 rename + import 路径变更。
- 回滚：R1 若在生产库出问题，Drizzle 与裸 SQL 读同一文件、同一 schema（030 之后），可 revert 代码不动数据。
