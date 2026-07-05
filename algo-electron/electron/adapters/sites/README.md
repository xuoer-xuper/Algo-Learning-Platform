# Built-in Site Adapters

## 1. 职责

`electron/adapters/sites/` 按站点存放内置 OJ adapter。每个站点目录负责把该站点的 URL、提交结果、表格和实时网络 payload 转换为统一的 `SiteAdapter` 能力。

本目录不管理站点启用状态、不读 Cookie、不写数据库、不注册 IPC。站点启用状态由 `electron/sites/` 和 repository 管理，写入由 `electron/submissions/` 管理。

## 2. 当前实现程度

已内置站点：

- `codeforces/`
- `acwing/`
- `nowcoder/`
- `vjudge/`
- `pta/`
- `luogu/`
- `leetcode/`

`index.ts` 导出 `builtinSiteAdapters`，供 `electron/adapters/registry.ts` 注册。registry 只消费列表，不承载站点细节。

## 3. 目录约定

站点目录推荐结构：

- `index.ts`：组装 `SiteAdapter`。
- `problem.ts`：题目 URL 匹配和 `ProblemIdentity` 解析。
- `submissions.ts`：提交记录、网络 payload、表格行解析。
- `hook.ts`：实时浏览器注入脚本。
- `tables.ts`：复杂提交表格解析。
- `urls.ts`：复杂 URL 构造和规范化。

不是每个站点都必须有所有文件；缺失文件代表该站点当前不需要对应分层。

## 4. 实时提交规则

- pending、judging、running、unknown 不入库。
- 自测、调试、run code、sample/custom test 不得触发正式提交写入。
- Nowcoder 和 VJudge 只接受官方提交/状态接口返回的结果，不用通用 DOM verdict observer 直接写入。
- VJudge 必须按 solution id，或当前用户+当前题目+提交时间窗口强关联；无法关联时不写入。
- 行为变化必须同步 `docs/DESIGN/SUBMISSION_MONITORING_DESIGN.md` 和 `docs/DESIGN/SITE_ADAPTER_GUIDE.md`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

Adapter 测试建议逐个 bundle 后运行：

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
