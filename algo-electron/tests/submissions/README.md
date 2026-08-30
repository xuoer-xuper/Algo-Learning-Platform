# Submission Tests

## 1. 职责

`tests/submissions/` 覆盖提交同步、实时监听、通用表格扫描、批量写入、诊断和 tab 激活约束。

## 2. 当前覆盖

- `genericTableScanner.test.ts`：通用提交表格扫描。
- `domScraperGenericIntegration.test.ts`：DOM scraper 与通用扫描组合。
- `realtimeHookInjector.test.ts`、`realtimeHookScriptLifetime.test.ts`：实时 hook 注入和生命周期。
- `realtimeSubmissionDiagnostics.test.ts`：实时监听诊断。
- `realtimeTabActivation.test.ts`：切标签页的 `active-tab-changed` 页面事件、子 frame 迟到加载对 dom-ready 的可见性门、以及实时服务只对能暴露新文档的 reason 转发注入。
- `submissionBatchWriter.test.ts`：批量写入、去重、最终结果入库和受影响日期定向重算。
- `submissionPageContextResolver.test.ts`：提交页上下文和题目关联。
- `submissionWatcherCore.test.ts`：watcher core 状态机。
- `syncService.test.ts`：手动同步服务。

## 3. 运行方式

```powershell
cd algo-electron
npm exec vitest -- run tests/submissions
```

单个文件在后面加路径即可。这里的测试都走 vitest 的 `electron` 别名（`tests/electron/electronMock.ts`），用裸 tsx 直接跑单文件会解析不到。

## 4. 新增规则

提交监测行为变化必须在这里或 `tests/adapters/` 补对应用例。pending/judging 不入库、final 只入库一次、查看历史不重复写入、自测不入库是核心回归边界。
