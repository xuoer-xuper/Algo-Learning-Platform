# Tests 目录说明

## 1. 职责

`tests/` 存放主进程核心逻辑、adapter、提交监测、parser、迁移和集成链路的 TypeScript 测试。

当前测试不是通过统一 test runner 管理，而是使用 esbuild 将单个 `.test.ts` bundle 成 `.mjs` 后用 Node 执行。

## 2. 目录覆盖

- `adapters/`
  - 站点 adapter、registry、实时 hook 字符串、提交 payload/table 解析。
  - 覆盖 Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode。
- `browser/`
  - OJ 提交 bridge 和 postMessage 转发。
- `db/`
  - 数据迁移辅助逻辑。
- `integration/`
  - 跨模块链路，例如 LeetCode 实时提交和题目标题提取 wiring。
- `parsers/`
  - URL 解析、自定义站点 pattern、浏览器标题清洗、标题兜底脚本。
- `submissions/`
  - 通用表格扫描、DOM scraper、实时 hook 注入、诊断、tab 激活、批量写入、提交页上下文、watcher core、sync service。

## 3. 标准验证命令

类型检查：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

Adapter 测试：

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

Submissions 测试：

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

Parser 测试：

```powershell
$tests = Get-ChildItem tests\parsers -Filter *.test.ts
foreach ($test in $tests) {
  $out = Join-Path 'tmp' ('parsers-' + $test.BaseName + '.mjs')
  node node_modules\esbuild\bin\esbuild $test.FullName --bundle --platform=node --format=esm --outfile=$out | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node $out
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

单个测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs
node tmp\browser-ojBridge.test.mjs
```

## 4. 新增测试规则

- 行为变化必须优先补靠近变更点的测试。
- adapter 行为放 `tests/adapters/`。
- 提交写入、实时 watcher、sync service 放 `tests/submissions/`。
- URL 识别和标题清洗放 `tests/parsers/`。
- migration 辅助逻辑放 `tests/db/`。
- 跨模块数据流放 `tests/integration/`。
- 测试 bundle 输出统一写到 `tmp/`，不要提交生成产物。

## 5. 当前缺口

- Renderer UI 缺少自动化测试，涉及页面交互仍需 `npm run dev` 手测。
- Electron session、CookieVault、真实 OJ 登录态依赖手测。
- 打包产物安装/卸载流程依赖人工验收。
