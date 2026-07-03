# Nowcoder Adapter

## 1. 职责

`electron/adapters/sites/nowcoder/` 负责牛客题目识别、正式提交网络状态解析、提交记录表格解析和题目上下文补全。

## 2. 当前实现程度

- `index.ts` 组装 `nowcoderAdapter`。
- `problem.ts` 解析题目 URL 和提交结果 URL。
- `submissions.ts` 解析 `nowcoder-judge-status` 等网络 payload。
- `tables.ts` 解析牛客提交记录表格。
- `hook.ts` 监听正式提交按钮/接口和官方提交状态接口。

## 3. 关键函数

- `parseNowcoderProblem(url)`：解析题目身份。
- `matchNowcoderSubmissionResult(url)`：识别提交结果相关 URL。
- `parseNowcoderJudgeStatusPayload(raw)`：只从官方网络状态 payload 解析最终提交。
- `parseNowcoderSubmissionTables(tables, ctx)`：解析提交记录表格。
- `createNowcoderJudgeStatusHookScript()`：生成正式提交网络监听脚本。

## 4. 边界规则

- 实时入库只接受官方提交/状态接口结果，不接受通用 DOM verdict observer。
- 自测、调试、样例测试、custom test、run 请求必须清除或标记为非正式 intent。
- 自测输入框、自测结果面板、弹窗 DOM 文本不得触发写入。
- WA/失败类网络字段优先于 AC 文案，避免正式错误被误判为正确。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\genericTableSiteAdapters.test.ts
```

手测牛客时同时覆盖正式 AC、正式 WA、自测通过和自测错误。
