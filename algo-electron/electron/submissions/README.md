# Submissions 模块说明

## 1. 职责

`electron/submissions/` 是提交记录采集和写入协调层。它接收 adapter 解析出的 `SubmissionData`，完成实时监听、手动同步、题目关联、去重写入和统计刷新。

本模块不解析站点业务细节；站点差异应放在 `electron/adapters/sites/{site}/`。本模块也不改变数据库 schema、Cookie 策略或 Preload API。

## 2. 当前实现程度

- 实时提交监测：已覆盖 Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode。
- 手动提交同步：保留 Codeforces API 同步和当前页面 DOM/表格同步。
- 写入路径：统一经过 `SubmissionBatchWriter`，负责题目关联、提交 upsert、首次 AC 和统计刷新。
- 诊断路径：`RealtimeSubmissionDiagnostics` 记录 IPC、页面识别、hook 注入、检测结果，供验收面板查看。
- 手动同步 IPC：`electron/ipc/registerSubmissionsIpc.ts` 注册 `submissions:*` channel；实时提交 IPC 仍由 `RealtimeSubmissionService.registerIpc()` 管理。

七站手测已通过；后续变更仍需要重新运行 adapter/submissions 测试，并按站点复测高风险路径。

## 3. 实时监听数据流

```text
TabManager dom-ready / navigate / active-tab
  -> RealtimeHookInjector
  -> adapter.injectHookScript()
  -> oj-submission:detected IPC
  -> RealtimeSubmissionService
  -> SubmissionWatcher
  -> SubmissionWatcherCore
  -> adapter.parseSubmissionResult()
  -> adapter.resolveProblemIdentity()
  -> SubmissionBatchWriter
  -> repositories / SQLite
```

核心保护在 `SubmissionWatcherCore`：

- payload 必须包含有效 `pageUrl`。
- payload adapter、页面 URL、sender URL 必须匹配同一站点。
- 站点必须启用。
- adapter 必须解析出最终提交。
- `TESTING` 和 `UNKNOWN` 不允许写入。
- 同一 `platform:platformSubmissionId` 在进程内去重。

## 4. 手动同步数据流

```text
SyncService
  -> Codeforces adapter.syncSubmissions(handle)
  -> 或 scrapeCurrentPage(browserHost)
  -> GenericTableDomExtractor / 站点专用 scraper
  -> SubmissionPageContextResolver
  -> SubmissionBatchWriter
```

手动同步用于历史提交页或当前提交记录页，不替代实时 submit intent。打开提交记录、刷新历史页、查看提交详情不应伪造一次实时提交。

## 5. 核心封装

- `RealtimeSubmissionService`
  - `attachTabManager(tabManager)`：绑定 DOM ready、导航、激活标签页事件。
  - `registerIpc()` / `dispose()`：注册和卸载 `oj-submission:detected`、`realtimeSubmission:getStatus`。
  - `getStatus()`：返回诊断状态。
  - `withPageTitle(payload, senderUrl, senderTitle)`：给实时 payload 补浏览器标题，供题目身份兜底。
- `RealtimeHookInjector`
  - `inject(host, url)`：按 URL 找实时 adapter，检查站点启用状态后注入脚本。
  - `executeWithRetry(host, url, code)`：处理 SPA/远端页面 frame 未就绪的短重试。
- `SubmissionWatcher`
  - Electron 外壳，连接窗口通知和默认写入依赖。
- `SubmissionWatcherCore`
  - 纯核心状态机，负责校验、fail-closed、去重、题目身份解析和调用写入。
- `SubmissionBatchWriter`
  - `write(options)`：批量写入入口。
- `submissionRepository`
  - 兼容入口在 `electron/db/repositories/submissionRepository.ts`，内部实现和边界说明在 `electron/db/repositories/submission/README.md`。
  - 只负责 `submissions` 表去重插入、按题目/平台查询和首次 AC 元数据刷新。
- `SubmissionProblemAttacher`
  - `attachProblem(submission, platform, pageProblemDbId?)`：按当前页面、sourceUrl、rawJson 中的站点上下文补 `problemId`。
  - `ensureProblem(identity)`：缺题目时先 upsert problem 再关联提交。
  - 站点专用关联规则：Codeforces、PTA、Luogu、Nowcoder、VJudge。
- `SyncService`
  - `syncCodeforces(handle)`：Codeforces API 同步。
  - `syncVjudge()`：VJudge 当前页面同步。
  - `syncCurrentPage()`：通用当前页面提交同步。
- `registerSubmissionsIpc(options)`
  - `getSyncService()`：延迟获取 `SyncService` 实例，避免 IPC 模块直接持有启动期尚未初始化的服务。
  - 注册 `submissions:syncCodeforces`、`submissions:syncVjudge`、`submissions:syncCurrentPage`。
- `SubmissionPageContextResolver`
  - `resolveSubmissionPageContext(url, submissions, deps)`：从当前提交页 URL 和提交 raw 信息推断页面题目。
- `realtimeSubmissionFilter`
  - `pickFinalRealtimeSubmission(submissions)`：从候选中选最终结果，过滤 pending/unknown。

## 6. Scraper 封装

- `scrapers/domScraper.ts`：当前页面抓取总入口，按 adapter 和站点专用 scraper 分发。
- `scrapers/GenericTableDomExtractor.ts`：在页面内提取标准表格结构。
- `scrapers/GenericTableScanner.ts`
  - `hasSubmissionLikeTable(table)`：判断表格是否像提交记录。
  - `selectBestSubmissionTable(tables)`：从多个表格里选择最可信的提交表。
  - `scanGenericSubmissionTable(table, options)`：输出统一 `SubmissionData[]`。
- `scrapers/ptaScraper.ts`：PTA 专用提交记录、实时弹窗和问题 id 解析。
- `scrapers/luoguScraper.ts`：Luogu 专用提交记录数据解析。

## 7. 写入规则

- 所有持久化提交必须经过 `SubmissionBatchWriter`。
- `SubmissionBatchWriter` 只负责编排批量写入、首次 AC 和统计刷新。
- `SubmissionProblemAttacher` 只消费 `SubmissionData` 和 `ProblemIdentity`，不抓网页、不发请求。
- 新提交写入后才刷新首次 AC 和统计。
- 题目关联优先级：当前页面身份 > 提交 rawJson/sourceUrl > 站点专用上下文字段。
- 不写入 Cookie、用户源码或完整请求体。

## 8. 测试入口

推荐在 `algo-electron/` 下执行：

```powershell
node node_modules\typescript\bin\tsc --noEmit
```

Submissions 测试建议逐个 bundle 后执行：

```powershell
$tests = Get-ChildItem tests\submissions -Filter *.test.ts
foreach ($test in $tests) {
  $out = Join-Path 'tmp' ('submissions-' + $test.BaseName + '.mjs')
  node node_modules\esbuild\bin\esbuild $test.FullName --bundle --platform=node --format=esm --outfile=$out | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node $out
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```
