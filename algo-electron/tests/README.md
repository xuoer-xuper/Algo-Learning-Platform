# Tests 目录说明

## 1. 职责

`tests/` 存放主进程核心逻辑、adapter、提交监测、parser、迁移和集成链路的 TypeScript 测试。

当前测试不是通过统一 test runner 管理，而是使用 esbuild 将单个 `.test.ts` bundle 成 `.mjs` 后用 Node 执行。

## 2. 目录覆盖

- `adapters/`
  - 站点 adapter、registry、实时 hook 字符串、提交 payload/table 解析。
  - 覆盖 Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode。
- `ai/`
  - 本地 AI 建议规则、评分 helper、标签解析和 Markdown 输出纯逻辑。
- `browser/`
  - OJ 提交 bridge 和 postMessage 转发。
- `db/`
  - 数据迁移辅助逻辑和 repository 临时数据库读写测试。
- `electron/`
  - Electron 应用启动 smoke test。
- `integration/`
  - 跨模块链路，例如 LeetCode 实时提交和题目标题提取 wiring。
- `ipc/`
  - Preload 白名单、IPC channel 映射和主进程 handler 契约。
- `parsers/`
  - URL 解析、自定义站点 pattern、浏览器标题清洗、标题兜底脚本。
- `scripts/`
  - 用户脚本 metadata 解析和 match/include 规则。
- `submissions/`
  - 通用表格扫描、DOM scraper、实时 hook 注入、诊断、tab 激活、批量写入、提交页上下文、watcher core、sync service。
- `ui/`
  - Renderer 关键页面截图验收 harness。

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

DB repository 测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

`better-sqlite3` 按 Electron ABI 编译，真实 SQLite repository 测试必须用 `ELECTRON_RUN_AS_NODE=1` 的 Electron Node 运行；普通 Node/tsx 只适合不加载 native DB 的测试。

IPC contract 测试：

```powershell
npx --yes tsx tests\ipc\ipcContracts.test.ts
```

该测试静态验证 renderer preload 只能通过固定白名单方法访问 IPC，核心 browser/problem/tracking/settings channel 有稳定映射，且所有公开 send/invoke channel 都有主进程 handler。

AI 规则测试：

```powershell
npx --yes tsx tests\ai\recommendationRules.test.ts
```

该测试覆盖本地 AI 建议规则纯函数，不访问真实数据库或外部 LLM。

Electron 启动 smoke test：

```powershell
npx --yes tsx tests\electron\startupSmoke.test.ts
```

该测试会把真实 `electron/main.ts`、`electron/preload.ts`、`electron/browser/ojPreload.ts` bundle 到 `tmp/electron-startup-smoke/`，使用临时 `userData` 启动 Electron，并通过 preload IPC 创建默认 URL 标签验证主窗口、WebContentsView 加载和基础 IPC。测试不写入用户真实数据目录。

Renderer 关键页面截图验收：

```powershell
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

该测试把 `tests/ui/rendererScreenshotHarness.tsx` bundle 成本地 renderer harness，注入 mock `window.electronAPI`，用 Electron 捕获题库侧栏、统计页、设置页三张截图到 `tmp/ui-screenshots/`。Runner 会检查截图尺寸/大小、关键容器横向边界和统计页平台分布图形渲染，并在截图前扫描页面文本，拒绝包含 `Cookie`、`Set-Cookie`、`sessionid`、`csrf`、`token` 等敏感字段。

单个测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs
node tmp\browser-ojBridge.test.mjs
```

## 4. 新增测试规则

- 行为变化必须优先补靠近变更点的测试。
- adapter 行为放 `tests/adapters/`。
- AI 本地规则、评分 helper 和输出格式放 `tests/ai/`。
- 提交写入、实时 watcher、sync service 放 `tests/submissions/`。
- URL 识别和标题清洗放 `tests/parsers/`。
- 用户脚本 metadata、匹配规则和脚本管理纯逻辑放 `tests/scripts/`。
- migration 辅助逻辑和 repository 临时数据库读写放 `tests/db/`。
- preload 白名单、IPC channel 和主进程 handler 契约放 `tests/ipc/`。
- Electron 启动、窗口和基础 preload IPC smoke 放 `tests/electron/`。
- 跨模块数据流放 `tests/integration/`。
- Renderer 截图验收放 `tests/ui/`，生成图片只写入 `tmp/`，不得提交。
- 测试 bundle 输出统一写到 `tmp/`，不要提交生成产物。

## 5. 当前缺口

- Renderer UI 缺少自动化测试，涉及页面交互仍需 `npm run dev` 手测。
- Electron session、CookieVault、真实 OJ 登录态依赖手测。
- 打包产物安装/卸载流程依赖人工验收。
