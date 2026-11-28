# Submission Repository

## 1. 职责

`electron/db/repositories/submission/` 是 `submissionRepository.ts` 的内部实现目录，负责 `submissions` 表的去重写入、按题目/平台查询，以及题目首次 AC 元数据刷新。

本目录不解析 OJ 页面、不执行站点 hook、不做题目关联、不刷新日统计。提交候选来自 `electron/adapters/` 和 `electron/submissions/`，题目关联、首次 AC 调用和统计刷新由 `SubmissionBatchWriter` 编排。

## 2. 当前实现程度

- `types.ts`：从Drizzle schema推导完整16字段提交行，四个时间字段以raw number/null输出；首次AC聚合键保留schema的nullable类型。
- `mutations.ts`：按 `(platform, platform_submission_id)` 去重写入提交。
- `queries.ts`：Drizzle按题目查询升序/倒序完整提交、按平台倒序限量查询，以及批量查询首次AC；顺序只按原submitted_at，不新增tie-break。
- `firstAc.ts`：通过Drizzle更新最早AC和导入后的提交状态，使用raw时间投影与参数保留原生语义。
- `recomputeProblemSubmissionState()`：导入覆盖后按最终提交重建状态和首次 AC，返回新旧首次 AC 日期。
- `../submissionRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 写入：`upsertSubmission(data)`。
- 查询：`getSubmissionsByProblem(problemId)`、`getSubmissionsByProblemAsc(problemId)`、`getSubmissionsByPlatform(platform, limit?)`、`getFirstAcByProblemIds(problemIds)`。
- 题目元数据刷新：`updateFirstAc(problemId)`。
- 覆盖导入重建：`recomputeProblemSubmissionState(problemIds)`，由导入事务调用，返回需要重算统计的首次 AC 日期。

## 4. 边界规则

- `upsertSubmission()` 只做提交去重和插入，不创建题目、不刷新统计。
- 去重依据是 `(platform, platform_submission_id)`；重复提交返回 `false`，不覆盖旧记录。
- `updateFirstAc()` 只在存在 AC 提交时更新题目，并保留更早的 `first_solved_at`。
- `recomputeProblemSubmissionState()` 用于可替换提交的导入路径：首次 AC 可以前移、后移或清空；有提交无 AC 时为 `attempted`，无提交时回到 `visited`（原为 `unknown` 的保留）。提交行的纳入范围与现有查询、统计口径一致。
- 所有批量写入应通过 `SubmissionBatchWriter`，由它统一处理题目关联、首次 AC 和统计刷新。
- 不记录 Cookie、用户源码、完整请求体或可复用登录态。
- Schema 变化必须先写 migration，再同步 `docs/DESIGN/DATABASE_SCHEMA.md` 和本目录 SQL。

- 读取保留墓碑、NULL提交ID、完整字段和raw数值时间，不新增过滤/事务/通知；ProblemSubmissionRow仅为本域SubmissionRow的类型别名。
- 平台LIMIT用typed placeholder保持原生错误；首次AC空数组在getDb前返回，非空数组每项绑定一次（包括重复值），固定AC字面量不占绑定参数，保留原生最大变量边界。
- 首次AC用raw MIN，避免Date截断/String解码；Coach内部Map允许nullable键但公开指标仍以输入string题目ID构造。只读时间轴submission_id允许null，不改请求/路由或LLM最后10条的字段白名单。
- A3a转换四个读取，A3b1转换去重插入，A3b2转换首次AC更新/导入重算；本域应用查询已使用Drizzle，不改变兼容导出口。
- 插入兼容范围是冻结030表结构/default0与NULL；Drizzle列举16列而旧SQL仅14列，不承诺改省略列/default或替换view后仍等价。启动校验只在已完成legacy且Drizzle账本<=1时精确比对，不是每次写入重验；校验器不放宽。
- lookup和INSERT均先prepare，再按原顺序读取参数/生成UUID。存在行即false（包括NULL/空ID/墓碑），不准备INSERT或通知；miss后平台/题号按原逻辑再次读取，raw时间不经Date转换。
- INSERT成功即true并通知，即使诊断IGNORE触发器导致changes0；失败保留原生异常/语句副作用，不新增事务或重试。任意受损结构的限定列错误措辞可能不同，不改写错误制造等价。

- 首次AC更新仍先读题目旧时间，再查最早精确AC；无AC不准备UPDATE，有AC即真实执行条件UPDATE，即使题目缺失或预测无变化。raw时间不经Date解码。
- 导入重算先准备题目/聚合/UPDATE三个语句，再完整消费去重输入；空输入也准备，迭代器抛错前不处理已产出的ID。COUNT(*)保留NULL提交ID，状态及IS NOT条件不改。
- 两种首次AC写入只在changes>0时通知；成功IGNORE不通知（区别于插入）。通知后按旧/新顺序返回有效日期，无变化仍保留日期；事务、savepoint及实际COMMIT由调用者拥有。

## 5. 验证入口

```powershell
cd algo-electron
pnpm typecheck
pnpm typecheck:tests
pnpm run test:unit tests/db/submission-reads.test.ts tests/db/submission-upsert.test.ts tests/db/submission-first-ac.test.ts
pnpm test:db
```

`test:db`通过统一runner执行真实Electron/better-sqlite3原生回归，检查退出状态；不把单独GUI Electron进程的启动成功当作测试通过。
