# Adapter 模块说明

## 1. 职责

`electron/adapters/` 是站点能力适配层，负责把不同 OJ 的页面、接口和表格结构转换成项目内部统一数据：

- 题目身份：输出 `ProblemIdentity`。
- 提交记录：输出 `SubmissionData`。
- 实时监听：提供站点专用浏览器注入脚本。
- 手动同步：解析当前页面表格或站点 API 返回值。

本模块不直接写数据库，不管理 Cookie，不注册 IPC，也不改变站点启用状态。

## 2. 当前实现程度

已内置并接入 registry 的站点：

| 站点 | 目录拆分 | 实时 hook | 提交解析 | 手动同步/表格 |
| --- | --- | --- | --- | --- |
| Codeforces | `problem.ts`、`submissions.ts`、`hook.ts`、`urls.ts` | 已实现 | API、实时表格 | 已实现 |
| AcWing | `problem.ts`、`submissions.ts` | 已实现 | 实时结果、表格 | 已实现 |
| Nowcoder | `problem.ts`、`submissions.ts`、`tables.ts`、`hook.ts` | 已实现 | 网络评测结果 | 已实现 |
| VJudge | `problem.ts`、`submissions.ts`、`hook.ts` | 已实现 | 网络状态、详情兜底 | 已实现 |
| PTA | `problem.ts`、`submissions.ts` | 已实现 | 实时结果、专用 scraper | 已实现 |
| Luogu | `problem.ts`、`submissions.ts` | 已实现 | `_contentOnly=1` / 降级数据 | 已实现 |
| LeetCode | `problem.ts`、`submissions.ts`、`hook.ts` | 已实现 | submit check 接口 | 已实现 |

七站实时提交监测已按手测收口。后续修改必须继续满足 `docs/submission-monitoring-design.md` 的 fail-closed 规则。

## 3. 目录约定

站点主线目录为 `electron/adapters/sites/{site}/`：

- `index.ts`：组装并导出 `SiteAdapter`，只做函数连接。
- `problem.ts`：题目 URL 匹配、题目身份解析、站点题号辅助函数。
- `submissions.ts`：提交 payload、接口结果、表格行转换为 `SubmissionData`。
- `tables.ts`：站点提交记录表格解析。
- `hook.ts`：浏览器注入脚本生成函数。
- `urls.ts`：复杂 URL 规范化和构造。

`electron/adapters/registry.ts` 只负责注册和查找 adapter；站点细节必须留在站点目录。

## 4. 核心类型

`types.ts` 定义 adapter 对外契约：

- `SiteAdapter`：站点适配器主接口。
- `ParseContext`：题目解析上下文。
- `SubmissionDetectionPayload`：实时 hook 上报给主进程的 payload。
- `TableParseContext`：表格解析上下文，当前主要提供 `now()`。
- `SubmissionScrapeContext`：手动同步时浏览器页执行脚本的抽象。
- `SyncContext`：站点主动同步上下文，例如 Codeforces handle。

`SiteAdapter` 的关键函数：

- `matchProblem(url)`：判断 URL 是否是该站点题目页或可注入页。
- `parseProblem(url, ctx)`：解析题目身份。
- `matchSubmissionResult(url)`：判断提交详情或提交记录 URL。
- `injectHookScript()`：返回浏览器注入脚本。
- `parseSubmissionResult(raw)`：把实时 payload 转换成最终提交。
- `resolveProblemIdentity(submission, raw)`：实时提交后补题目身份。
- `parseSubmissionTables(tables, ctx)`：解析通用 DOM 表格。
- `scrapeSubmissions(ctx)` / `syncSubmissions(ctx)`：站点专用同步入口。

## 5. 共享封装

- `registry.ts`
  - `registerAdapter(adapter)`：注册 adapter。
  - `getAdapter(id)`：按 id 查找。
  - `getAdapterForUrl(url)`：按题目或提交页 URL 查找。
  - `getRealtimeAdapterForUrl(url)`：只返回支持实时 hook 的 adapter。
  - `getRealtimeAdapterIds()`：提供诊断页展示支持站点。
- `sites/index.ts`
  - `builtinSiteAdapters`：内置站点列表，registry 从这里消费。
- `verdictMap.ts`
  - `normalizeVerdict(raw)`：归一化 AC、WA、TLE、MLE、RE、CE、PE、OLE、TESTING 等结果。
- `browserTitleIdentity.ts`
  - `resolveProblemIdentityFromBrowserTitle(adapter, raw)`：用浏览器标题作为题目身份兜底。
- `shared/genericSubmission.ts`
  - 兼容导出入口，实际实现已拆到 `shared/text.ts`、`shared/tables.ts`、`shared/frontendVerdictPayload.ts`、`shared/frontendVerdictHook.ts`。
  - `stripHtml(value)`：移除 HTML 并压缩空白。
  - `parseRuntimeMs(raw)` / `parseMemoryKb(raw)`：解析耗时和内存。
  - `extractLanguage(raw)`：从文本中提取语言。
  - `findColumnIndex(headers, keywords)`：根据表头关键词定位列。
  - `scanBestTable(tables, platform, prefix, ctx)`：选择并解析最像提交记录的表格。
  - `parseRealtimeTablePayload(raw)`：解析实时 hook 上报的表格 payload。
  - `parseFrontendVerdictPayload(raw)`：解析前端结果面板 payload，仅用于允许 DOM 结果的站点。
  - `createFrontendVerdictHookScript(adapterId)`：生成通用前端结果 observer。

## 6. 适配规则

- 默认 fail closed：pending、judging、running、unknown 不入库。
- 正式提交 intent 是实时写入边界；自测、调试、run code、sample/custom test 不得触发写入。
- Nowcoder 和 VJudge 不允许回退到通用 DOM verdict observer 作为实时写入来源。
- 注入脚本不得记录 Cookie、用户源码或完整请求体。
- 行为变化必须补 `tests/adapters`、`tests/submissions` 或 scraper 测试。

## 7. 测试入口

推荐在 `algo-electron/` 下执行：

```powershell
node node_modules\typescript\bin\tsc --noEmit
```

Adapter 测试建议逐个 bundle 后执行，避免环境通配符差异：

```powershell
$tests = Get-ChildItem tests\adapters -Filter *.test.ts
foreach ($test in $tests) {
  $out = Join-Path 'tmp' ('adapters-' + $test.BaseName + '.mjs')
  node node_modules\esbuild\bin\esbuild $test.FullName --bundle --platform=node --format=esm --outfile=$out | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node $out
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```
