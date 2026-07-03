# Codeforces Adapter

## 1. 职责

`electron/adapters/sites/codeforces/` 负责 Codeforces 和 Gym 的题目识别、提交结果解析、实时表格监听和 API 同步数据转换。

## 2. 当前实现程度

- `index.ts` 组装 `codeforcesAdapter`。
- `problem.ts` 解析 problemset、contest、gym 题目 URL。
- `submissions.ts` 解析 Codeforces API submission、提交表格和实时表格 payload。
- `hook.ts` 生成实时提交表格监听脚本。
- `urls.ts` 构造和规范化 problemset、contest、gym URL。

## 3. 关键函数

- `parseCodeforcesProblem(url)`：解析题目身份。
- `parseCodeforcesApiSubmission(submission)`：把 Codeforces API submission 转成 `SubmissionData`。
- `parseCodeforcesSubmissionTables(tables, ctx)`：解析提交页表格。
- `parseCodeforcesRealtimeTablePayload(raw)`：解析实时表格 payload。
- `resolveCodeforcesProblemIdentityFromSubmission(submission, raw)`：从提交记录补题目身份。
- `createCodeforcesRealtimeHookScript()`：生成实时 hook。
- `buildCodeforcesProblemUrl(...)` / `resolveCodeforcesNavigateUrl(url)`：URL 构造和导航规范化。

## 4. 边界规则

- 题库页和比赛页提交记录都应等待最终 verdict；队列中/判题中不能入库。
- API 同步与实时监听都必须归一到同一 `platformSubmissionId` 口径。
- Gym URL 不能被规范化成普通 contest URL。
- 不记录源码、Cookie 或完整请求体。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\codeforcesAdapter.test.ts
npx --yes tsx tests\submissions\submissionWatcherCore.test.ts
```
