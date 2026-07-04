# Tests 目录说明

## 1. 职责

`tests/` 存放主进程核心逻辑、adapter、提交监测、parser、迁移和集成链路的 TypeScript 测试。

当前测试通过 `tests/run-tests.mjs` 统一编排。runner 只封装现有验证方式：纯逻辑测试使用 esbuild bundle 后由 Node 执行，真实 SQLite repository 测试仍使用 `ELECTRON_RUN_AS_NODE=1` 的 Electron Node 执行。

## 2. 目录覆盖

- `adapters/`
  - 站点 adapter、registry、实时 hook 字符串、提交 payload/table 解析。
  - 覆盖 Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode。
- `architecture/`
  - BrowserView、preload、renderer IPC、Nowcoder/VJudge 实时入库等架构红线检查。
- `ai/`
  - 本地 AI 建议规则、评分 helper、标签解析、可追溯性和敏感信息排除。
- `browser/`
  - OJ 提交 bridge 和 postMessage 转发。
- `db/`
  - 数据迁移辅助逻辑和 repository 临时数据库读写测试。
- `docs/`
  - Markdown 相对链接、README 覆盖、README 内容质量、总索引覆盖和 `npm run` 脚本引用一致性检查。
- `electron/`
  - Electron 应用启动 smoke test。
- `integration/`
  - 跨模块链路，例如 LeetCode 实时提交和题目标题提取 wiring。
- `ipc/`
  - Preload 白名单、IPC channel 映射和主进程 handler 契约。
- `parsers/`
  - URL 解析、自定义站点 pattern、浏览器标题清洗、标题兜底脚本。
- `packaging/`
  - electron-builder、NSIS、asarUnpack、打包输入白名单和敏感文件排除检查。
- `scripts/`
  - 用户脚本 metadata 解析和 match/include 规则。
- `security/`
  - `.env`、本地数据库、日志和高置信 Cookie/header 明文模式检查。
- `submissions/`
  - 通用表格扫描、DOM scraper、实时 hook 注入、诊断、tab 激活、批量写入、提交页上下文、watcher core、sync service。
- `ui/`
  - Renderer 关键页面截图验收 harness。

## 3. 标准验证命令

类型检查：

```powershell
cd algo-electron
npm run typecheck
```

核心验证：

```powershell
npm run test:core
```

架构红线检查：

```powershell
npm run test:architecture
```

敏感文件检查：

```powershell
npm run test:security
```

AI 规则和追溯测试：

```powershell
npm run test:ai
```

Adapter 测试：

```powershell
npm run test:adapters
```

Submissions 测试：

```powershell
npm run test:submissions
```

DB repository 测试：

```powershell
npm run test:db
```

文档一致性检查：

```powershell
npm run test:docs
```

打包配置检查：

```powershell
npm run test:packaging
```

Electron 启动 smoke test：

```powershell
npm run test:electron
```

Renderer 关键页面截图验收：

```powershell
npm run test:ui
```

全量验证：

```powershell
npm run test:all
```

`test:core` 会运行 typecheck、lint、architecture guard、security guard、IPC contract、AI 规则、用户脚本 metadata、browser、parser 和 integration 测试。`test:ai` 会额外运行 AI 输出可追溯性临时数据库测试。`test:all` 在此基础上追加 AI traceability、adapter、submissions、DB、docs、packaging、Electron smoke 和 UI screenshot 测试。

`better-sqlite3` 按 Electron ABI 编译，真实 SQLite repository 测试必须用 `ELECTRON_RUN_AS_NODE=1` 的 Electron Node 运行；`tests/run-tests.mjs` 已封装该路径。

单个测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\browser\ojBridge.test.ts --bundle --platform=node --format=esm --outfile=tmp\browser-ojBridge.test.mjs
node tmp\browser-ojBridge.test.mjs
```

## 4. 新增测试规则

- 行为变化必须优先补靠近变更点的测试。
- 架构红线和禁止回归规则放 `tests/architecture/`。
- adapter 行为放 `tests/adapters/`。
- AI 本地规则、评分 helper、输出格式、可追溯性和敏感信息排除放 `tests/ai/`。
- 提交写入、实时 watcher、sync service 放 `tests/submissions/`。
- URL 识别和标题清洗放 `tests/parsers/`。
- 用户脚本 metadata、匹配规则和脚本管理纯逻辑放 `tests/scripts/`。
- 敏感文件、仓库级隐私和高置信 token/header 模式检查放 `tests/security/`。
- migration 辅助逻辑和 repository 临时数据库读写放 `tests/db/`。
- 文档链接和 README 覆盖规则放 `tests/docs/`。
- 长期目录 README 的职责、实现程度、封装入口、边界和验证入口规则也放 `tests/docs/`。
- 长期 Markdown 和模块 README 是否进入 `docs/README.md` 总索引，也由 `tests/docs/` 守卫。
- 文档中的具体 `npm run <script>` 是否仍存在于 `package.json`，也由 `tests/docs/` 守卫。
- 打包配置、发布输入白名单和敏感文件排除规则放 `tests/packaging/`。
- preload 白名单、IPC channel 和主进程 handler 契约放 `tests/ipc/`。
- Electron 启动、窗口和基础 preload IPC smoke 放 `tests/electron/`。
- 跨模块数据流放 `tests/integration/`。
- Renderer 截图验收放 `tests/ui/`，生成图片只写入 `tmp/`，不得提交。
- 测试 bundle 输出统一写到 `tmp/`，不要提交生成产物。

## 5. 当前缺口

- Renderer UI 已有关键页面截图和布局断言，但完整交互路径仍需 `npm run dev` 手测。
- Electron session、CookieVault、真实 OJ 登录态依赖手测。
- 打包产物安装/卸载流程依赖人工验收。
