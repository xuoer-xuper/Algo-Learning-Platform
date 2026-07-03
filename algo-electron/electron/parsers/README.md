# Parsers 模块说明

## 1. 职责

`electron/parsers/` 是题目 URL 和标题识别兼容层。它面向行为追踪、页面标题补全和自定义站点规则，把 URL 转换为统一 `ProblemIdentity`。

新提交监测主线在 `electron/adapters/`；本模块继续作为题目识别和旧 parser 兼容入口存在。

## 2. 当前实现程度

- 内置站点识别已委托到 `electron/adapters/registry.ts`。
- 支持用户站点配置中的 `problemUrlPatterns`。
- 支持自定义 parser adapter 注册。
- 支持浏览器标题清洗和题目标题兜底脚本。
- 支持导航前 URL 规范化，目前主要处理 Codeforces。

## 3. 文件职责

- `registry.ts`
  - `setEnabledSitesFetcher(fetcher)`：注入启用站点配置读取函数。
  - `registerAdapter(adapter)`：注册自定义 parser。
  - `getAdapter(id)`：按 id 返回 parser adapter。
  - `getAdapterForUrl(url)`：按 URL 找启用站点 parser。
  - `parseConfigUrl(url, siteId, domains, patterns)`：按站点配置 pattern 解析。
  - `parseUrl(url)`：统一题目 URL 解析入口。
- `browserTitle.ts`
  - `cleanBrowserProblemTitle(title, options)`：清理浏览器标题中的站点品牌、题号和噪声。
  - `resolveBrowserTitleProblemIdentity(url, title, parseUrl)`：用 URL 身份加标题补全题目。
- `problemTitleFallback.ts`
  - `createProblemTitleFallbackScript(url)`：为部分站点生成页面内标题兜底脚本。
- `titleValidation.ts`
  - `isBadScrapedTitle(title)` / `isValidScrapedTitle(title)`：判断抓取标题质量。
  - `hasCjkText(title)`：判断是否含中文字符。
  - `shouldReplaceScrapedTitle(existing, incoming)`：决定是否用新标题覆盖旧标题。
- `navigateUrl.ts`
  - `resolveNavigateUrl(url)`：导航前 URL 规范化。

## 4. Pattern 规则

`parseConfigUrl()` 支持路径和查询参数中的占位符，例如：

```text
/contest/{contestId}/problem/{problemIndex}
/problem?id={problemId}
```

解析结果会生成：

- `platform`
- `platformProblemId`
- `canonicalUrl`
- `contestId`
- `problemIndex`
- `confidence: 'url'`

## 5. 边界规则

- 新站点提交监测不要放回 `parsers/`，应放到 `adapters/sites/{site}/`。
- `parseUrl()` 必须尊重站点启用状态。
- 标题清洗不能覆盖有效人工标题，覆盖逻辑以 `shouldReplaceScrapedTitle()` 为准。
- 页面内兜底脚本只能读取标题文本，不应读取源码、Cookie 或提交内容。

## 6. 测试入口

```powershell
cd algo-electron
$tests = Get-ChildItem tests\parsers -Filter *.test.ts
foreach ($test in $tests) {
  $out = Join-Path 'tmp' ('parsers-' + $test.BaseName + '.mjs')
  node node_modules\esbuild\bin\esbuild $test.FullName --bundle --platform=node --format=esm --outfile=$out | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node $out
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```
