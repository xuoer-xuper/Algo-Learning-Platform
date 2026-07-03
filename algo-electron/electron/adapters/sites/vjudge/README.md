# VJudge Adapter

## 1. 职责

`electron/adapters/sites/vjudge/` 负责 VJudge 题目识别、正式提交弹窗网络状态解析、solution 详情解析和提交记录强关联。

## 2. 当前实现程度

- `index.ts` 组装 `vjudgeAdapter`。
- `problem.ts` 解析题目 URL、提交结果 URL、页面题目信息和 raw problem 上下文。
- `submissions.ts` 解析 `/status/data/` 状态数据和 solution 详情数据。
- `hook.ts` 监听正式提交接口、状态接口和详情数据。

## 3. 关键函数

- `parseVjudgeProblem(url)`：解析题目身份。
- `parseVjudgeProblemText(value)`：解析 VJudge 页面中的远程题目标识。
- `getVjudgePageProblem(url)`：从当前页面 URL 提取题目上下文。
- `statusCellsMatchPageProblem(...)`：判断状态行是否匹配当前题目。
- `parseVjudgeStatusData(raw)`：解析强关联的状态接口结果。
- `parseVjudgeSolutionData(raw)`：解析 solution 详情页/接口结果。
- `createVjudgeStatusHookScript()`：生成正式提交和状态接口监听脚本。

## 4. 边界规则

- 不使用通用 DOM verdict observer 写入，避免公开状态行或页面文本误入库。
- 优先用 solution/submission id 关联最终状态。
- 没有 id 时必须同时匹配当前题目、当前用户和提交时间窗口；无法关联则不写入。
- 最新匹配行仍 pending 时不回退旧 final 记录。
- 弹窗转圈期间不能提前入库。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\specializedScraperSiteAdapters.test.ts
npx --yes tsx tests\submissions\submissionWatcherCore.test.ts
```
