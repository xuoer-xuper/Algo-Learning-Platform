# Tests 目录说明

## 1. 职责

`tests/` 存放主进程核心逻辑、adapter、提交监测、parser、迁移和集成链路的 TypeScript 测试。

纯 Node 单元/集成测试由 Vitest 发现、隔离和报告，renderer 关键交互与截图由 Playwright Test 驱动真实 Electron。架构、安全、文档、打包和性能守卫继续使用独立脚本。`tests/verify.mjs` 是验证编排器，不实现测试发现、断言或报告；它只负责组合 suite，以及启动必须匹配 Electron ABI 或使用 `safeStorage` 的少数专项测试。

测试工具边界：

- Vitest 是默认测试 runner。纯函数、业务服务、adapter、parser、IPC 契约和无需 Electron 生命周期的集成测试都应直接注册为 Vitest 用例。
- Playwright Test 是 renderer UI/E2E runner。真实窗口交互、容器响应式布局、截图、ErrorBoundary 和 preload 到 renderer 的用户路径放在 `tests/ui/`。
- Electron 专项测试只覆盖 Node runner 无法真实证明的边界，包括 `better-sqlite3` Electron ABI、`safeStorage`、主进程启动和打包应用加载。
- `tests/verify.mjs` 只做跨工具串行编排和 Electron 进程启动。不要在其中添加自研用例发现、断言、重试或覆盖率实现；这些能力分别交给 Vitest 和 Playwright。

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
  - Electron 应用启动 smoke test，以及 Vitest Electron test-double 的薄壳契约测试。
- `downloads/`
  - 受控下载路径、DownloadManager 结果状态和 `.user.js` 安装请求路由。
- `diagnostics/`
  - 浏览器导航/标题提取/用户脚本注入的可注入诊断记录；只保存状态元数据，不保存页面内容、凭据或脚本源码。
- `integration/`
  - 跨模块链路，例如 LeetCode 实时提交和题目标题提取 wiring。
- `ipc/`
  - Preload 白名单、IPC channel 映射和主进程 handler 契约。
- `parsers/`
  - URL 解析、自定义站点 pattern、浏览器标题清洗、标题兜底脚本。
- `packaging/`
  - electron-builder、NSIS、asarUnpack、打包输入白名单和敏感文件排除检查。
- `performance/`
  - Renderer 初始入口体积和重型依赖按需 chunk 检查。
- `scripts/`
  - 用户脚本 metadata 解析和 match/include 规则。
- `security/`
  - `.env`、本地数据库、日志和高置信 Cookie/header 明文模式检查。
- `submissions/`
  - 通用表格扫描、DOM scraper、实时 hook 注入、诊断、tab 激活、批量写入、提交页上下文、watcher core、sync service。
- `ui/`
  - Renderer 关键页面截图验收 harness。

## 3. 标准验证命令

纯 Node 测试、watch 和覆盖率：

```powershell
cd algo-electron
npm run test:unit
npm run test:watch
npm run test:coverage
```

覆盖率只统计 `electron/` 与 `src/` 生产代码，报告写入 `tmp/coverage/`。当前全局基线为 statements 28%、branches 34%、functions 24%、lines 29%；新增测试应逐步上调门槛，不能通过把测试文件计入覆盖率来抬高数字。

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

Renderer 性能门槛：

```powershell
npm run test:performance
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

`test:core` 会运行 typecheck、lint、architecture guard、security guard，以及核心 Vitest 用例。`test:ai` 会额外运行 AI 输出可追溯性临时数据库测试。`test:all` 会执行带覆盖率门槛的全部 Vitest 用例，再追加 Electron ABI、docs、packaging、performance、Electron smoke 和 Playwright UI 测试。

`better-sqlite3` 按 Electron ABI 编译，真实 SQLite repository 测试必须用 `ELECTRON_RUN_AS_NODE=1` 的 Electron Node 运行；`tests/verify.mjs` 已封装该路径。把这类测试直接放进普通 Node Vitest 环境只能验证 Node ABI，不能替代 Electron ABI 验证。

单个测试：

```powershell
npx vitest run tests\coach\arkClient.test.ts
npx playwright test tests\ui\rendererScreenshots.pw.spec.ts --grep "narrow container"
```

## 4. 新增测试规则

- 行为变化必须优先补靠近变更点的测试。
- 默认先判断被测代码是否需要真实 Electron 生命周期：不需要时使用 Vitest；需要真实 renderer 用户路径时使用 Playwright；只有 ABI、`safeStorage`、启动或打包边界才增加 Electron 专项验证。
- 不为了删除验证编排器而把纯逻辑测试搬进 Playwright，也不通过 Vitest mock 掉原生运行时后宣称 Electron ABI 已通过。
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
- Renderer 截图和交互验收放 `tests/ui/`，使用 Playwright Test，生成图片与 trace 只写入 `tmp/`，不得提交。
- 只有 Electron ABI/safeStorage 测试允许保留临时 bundle，输出统一写到 `tmp/electron-tests/`，不要提交生成产物。
- Electron 绑定模块在 Vitest 中使用 `tests/electron/electronMock.ts`，但不得以 mock 测试替代真实 Electron 专项验证。

## 5. 当前缺口

- Renderer UI 已有关键页面截图和布局断言，但完整交互路径仍需 `npm run dev` 手测。
- Electron session、CookieVault、真实 OJ 登录态依赖手测。
- 打包产物安装/卸载流程依赖人工验收。
