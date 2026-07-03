# Luogu Adapter

## 1. 职责

`electron/adapters/sites/luogu/` 负责洛谷题目识别、实时提交结果解析、提交记录页解析和题目上下文补全。

## 2. 当前实现程度

- `index.ts` 组装 `luoguAdapter`。
- `problem.ts` 解析洛谷题目 URL，并构造 canonical URL。
- `submissions.ts` 生成实时 hook，解析实时提交结果和 raw problem 信息。

## 3. 关键函数

- `parseLuoguProblem(url)`：解析题目身份。
- `buildLuoguProblemUrl(problemId)`：生成 canonical URL。
- `matchLuoguSubmissionResult(url)`：识别提交结果页。
- `createLuoguRealtimeHookScript(siteId)`：生成实时 hook。
- `parseLuoguRealtimeSubmission(raw)`：解析最终提交结果。
- `parseLuoguRawProblemInfo(submission)`：从提交 rawJson 中补题目信息。

## 4. 边界规则

- judging、waiting、compiling 等中间状态不能入库。
- 提交记录中的数字列不能被误当作语言；语言应来自明确字段或可信文本。
- 题目上下文优先来自当前页面和 raw problem 信息。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\genericTableSiteAdapters.test.ts
```
