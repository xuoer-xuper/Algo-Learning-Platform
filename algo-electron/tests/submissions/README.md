# Submission Tests

## 1. 职责

`tests/submissions/` 覆盖提交同步、实时监听、通用表格扫描、批量写入、诊断和 tab 激活约束。

## 2. 当前覆盖

- `genericTableScanner.test.ts`：通用提交表格扫描。
- `domScraperGenericIntegration.test.ts`：DOM scraper 与通用扫描组合。
- `realtimeHookInjector.test.ts`、`realtimeHookScriptLifetime.test.ts`：实时 hook 注入和生命周期。
- `realtimeSubmissionDiagnostics.test.ts`：实时监听诊断。
- `realtimeTabActivation.test.ts`：多标签活动页注入约束。
- `submissionBatchWriter.test.ts`：批量写入、去重和最终结果入库。
- `submissionPageContextResolver.test.ts`：提交页上下文和题目关联。
- `submissionWatcherCore.test.ts`：watcher core 状态机。
- `syncService.test.ts`：手动同步服务。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\submissions\realtimeTabActivation.test.ts
```

全量 submissions 测试可按 `tests/README.md` 中的批量 esbuild 命令运行。

## 4. 新增规则

提交监测行为变化必须在这里或 `tests/adapters/` 补对应用例。pending/judging 不入库、final 只入库一次、查看历史不重复写入、自测不入库是核心回归边界。
