# Submission Repository

## 1. 职责

`electron/db/repositories/submission/` 是 `submissionRepository.ts` 的内部实现目录，负责 `submissions` 表的去重写入、按题目/平台查询，以及题目首次 AC 元数据刷新。

本目录不解析 OJ 页面、不执行站点 hook、不做题目关联、不刷新日统计。提交候选来自 `electron/adapters/` 和 `electron/submissions/`，题目关联、首次 AC 调用和统计刷新由 `SubmissionBatchWriter` 编排。

## 2. 当前实现程度

- `types.ts`：提交行和首次 AC 查询行类型。
- `mutations.ts`：按 `(platform, platform_submission_id)` 去重写入提交。
- `queries.ts`：按题目和平台查询提交，均按提交时间倒序。
- `firstAc.ts`：根据最早 AC 提交更新 `problems.status` 和 `first_solved_at`。
- `../submissionRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 写入：`upsertSubmission(data)`。
- 查询：`getSubmissionsByProblem(problemId)`、`getSubmissionsByPlatform(platform, limit?)`。
- 题目元数据刷新：`updateFirstAc(problemId)`。

## 4. 边界规则

- `upsertSubmission()` 只做提交去重和插入，不创建题目、不刷新统计。
- 去重依据是 `(platform, platform_submission_id)`；重复提交返回 `false`，不覆盖旧记录。
- `updateFirstAc()` 只在存在 AC 提交时更新题目，并保留更早的 `first_solved_at`。
- 所有批量写入应通过 `SubmissionBatchWriter`，由它统一处理题目关联、首次 AC 和统计刷新。
- 不记录 Cookie、用户源码、完整请求体或可复用登录态。
- Schema 变化必须先写 migration，再同步 `docs/DESIGN/DATABASE_SCHEMA.md` 和本目录 SQL。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
node node_modules\esbuild\bin\esbuild tests\submissions\submissionBatchWriter.test.ts --bundle --platform=node --format=esm --outfile=tmp\submissions-submissionBatchWriter.test.mjs
node tmp\submissions-submissionBatchWriter.test.mjs
```
