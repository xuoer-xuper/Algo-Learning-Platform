# AcWing Adapter

## 1. 职责

`electron/adapters/sites/acwing/` 负责 AcWing 题目识别、提交表格解析和实时提交结果解析。

## 2. 当前实现程度

- `index.ts` 组装 `acwingAdapter`。
- `problem.ts` 提供 `parseAcwingProblem(url)` 和 `matchAcwingSubmissionResult(url)`。
- `submissions.ts` 提供提交表格解析、实时 hook 脚本和实时 payload 解析。

## 3. 关键函数

- `parseAcwingProblem(url)`：从题目 URL 中解析 AcWing problem id 和 canonical URL。
- `parseAcwingSubmissionTables(tables, ctx)`：解析提交记录表格。
- `createAcwingRealtimeHookScript()`：生成实时提交结果监听脚本。
- `parseAcwingRealtimeSubmission(raw)`：把实时 payload 转为最终 `SubmissionData`。

## 4. 边界规则

- language、verdict、runtime、memory 以页面或接口结果中最终记录为准。
- pending/judging 状态不能返回可入库提交。
- 题目身份解析失败时让上层 fail closed 或使用已允许的兜底上下文。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\genericTableSiteAdapters.test.ts
```
