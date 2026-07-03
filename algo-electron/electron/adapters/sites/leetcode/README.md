# LeetCode Adapter

## 1. 职责

`electron/adapters/sites/leetcode/` 负责 LeetCode CN 题目识别、submit/check 网络结果解析和题目身份补全。

## 2. 当前实现程度

- `index.ts` 组装 `leetcodeAdapter`。
- `problem.ts` 解析题目 slug、题目 URL 和提交结果 URL。
- `submissions.ts` 解析 LeetCode 提交最终结果并补题目身份。
- `hook.ts` 监听正式提交和 submit check 网络结果。

## 3. 关键函数

- `extractLeetcodeTitleSlugFromUrl(url)`：从题目 URL 提取 title slug。
- `matchLeetcodeProblem(url)` / `parseLeetcodeProblem(url)`：判断并解析题目身份。
- `parseLeetcodeSubmissionResult(raw)`：解析提交最终结果。
- `resolveLeetcodeProblemIdentity(submission, raw)`：用 URL、slug 或 raw 上下文补题目身份。
- `createLeetcodeRealtimeHookScript()`：生成实时网络监听脚本。

## 4. 边界规则

- pending、started、judging 不能入库。
- verdict 以 submit check 的最终状态为准，不用页面中间状态提前写入。
- title slug 是题目关联关键字段，缺失时必须 fail closed 或等待可验证上下文。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\leetcodeAdapter.test.ts
npx --yes tsx tests\submissions\submissionWatcherCore.test.ts
```
