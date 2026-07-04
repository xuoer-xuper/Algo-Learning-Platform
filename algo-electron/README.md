# algo-electron 子项目说明

## 1. 职责

`algo-electron/` 是桌面端实现目录，包含 Electron 主进程、React renderer、测试、构建配置和打包配置。

根目录文档负责项目级规则；本文件负责说明桌面子项目的开发入口、构建流程和目录边界。

## 2. 目录结构

- `electron/`：Electron 主进程、数据库、浏览器容器、adapter、提交监测、AI 本地规则等能力。
- `src/`：React renderer，负责 UI、页面组合和调用 `window.electronAPI`。
- `tests/`：主进程核心逻辑的 TypeScript 测试。
- `public/`：Vite 静态资源目录。
- `dist/`：renderer 构建产物，生成目录。
- `dist-electron/`：Electron 主进程/preload 构建产物，生成目录。
- `release/`：electron-builder 打包产物，生成目录。
- `tmp/`：本地测试 bundle 临时输出，生成目录。

## 3. 开发命令

```powershell
npm run dev
```

启动 Vite + Electron 开发环境。

```powershell
npm run typecheck
```

执行 TypeScript 类型检查。

```powershell
npm run lint
```

执行 ESLint。当前 lint 门槛要求零 warning；规则允许 DB row、网络 payload、测试 mock 等动态边界保留显式 `any`，收窄这些类型时应按模块逐步推进。

```powershell
npm run test:core
```

执行核心验证，包括类型检查、lint、architecture guard、IPC contract、AI 规则、用户脚本 metadata、browser、parser 和 integration 测试。

```powershell
npm run test:architecture
```

单独执行架构红线检查，覆盖 BrowserView、preload、renderer IPC、Nowcoder/VJudge 实时入库等禁止回归规则。

```powershell
npm run test:security
```

单独执行敏感文件检查，覆盖 `.env`、本地数据库、日志和高置信 Cookie/header 明文模式。

```powershell
npm run test:electron
```

执行 Electron 启动 smoke test。该测试使用临时 `userData`，验证主窗口、默认 URL 标签和基础 preload IPC。

```powershell
npm run test:ui
```

执行 renderer 关键页面截图验收。截图输出到 `tmp/ui-screenshots/`，覆盖题库侧栏、统计页和设置页，并检查关键容器越界与统计图表实际绘制。

```powershell
npm run test:adapters
npm run test:submissions
npm run test:db
npm run test:docs
npm run test:packaging
```

分别执行站点 adapter、提交监测、数据库 repository、文档一致性和打包配置测试。提交监测、repository、文档索引或打包配置相关改动必须跑对应 suite。

```powershell
npm run test:all
```

执行当前自动测试全集；包含文档一致性、打包配置、Electron smoke 和 UI screenshot，耗时比 `test:core` 更长。

仓库 CI 使用 `.github/workflows/ci.yml` 在 Windows runner 上执行 `npm ci` 和 `npm run test:all`。CI 不覆盖真实 OJ 登录态、七站提交手测或安装包安装/卸载验收。

```powershell
npm run build
```

执行 `tsc && vite build && electron-builder`，生成发行包。

```powershell
npm run build:win
```

显式执行 Windows NSIS x64 打包，输出到 `release/${version}`。
发布前必须按根目录 `docs/release-process.md` 完成版本/changelog、自动验证、产物检查、安装升级卸载验收和交接记录。

```powershell
npm run preview
```

预览 Vite renderer 构建产物，不等价于完整 Electron 运行验收。

## 4. 构建配置

- `vite.config.ts`
  - React renderer 使用 `@vitejs/plugin-react`。
  - Electron 构建使用 `vite-plugin-electron/simple`。
  - 主进程入口：`electron/main.ts`。
  - preload 入口：`electron/preload.ts` 和 `electron/browser/ojPreload.ts`。
  - `better-sqlite3` 作为主进程外部依赖处理。
- `electron-builder.json5`
  - `appId`: `com.algo.learning`。
  - `productName`: `AlgoLearningPlatform`。
  - 构建资源：`build/`，当前包含 Windows 图标 `icon.ico`。
  - 打包输入白名单：`dist`、`dist-electron`、`package.json` 和生产依赖；排除日志、本地数据库、`.env`、`tmp/`、`tests/`、`release/`。
  - `better-sqlite3` 原生 `.node` 文件通过 `asarUnpack` 解包，避免安装包运行时加载失败。
  - 输出目录：`release/${version}`。
  - Windows 目标：NSIS x64。
  - macOS 目标：DMG。
  - Linux 目标：AppImage。
- `tsconfig.json`
  - 覆盖 `src` 和 `electron`。
  - 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`。
- `tsconfig.node.json`
  - 覆盖 `vite.config.ts`。

## 5. 文档入口

- `electron/README.md`：主进程总览，说明根文件、子目录职责、封装入口和验证入口。
- `build/README.md`：electron-builder 图标资源和打包资源边界。
- `public/README.md`：Vite 静态资源和默认首页资源边界。
- `src/README.md`：renderer 总览。
- `src/components/README.md`：共享 UI 组件说明。
- `src/features/README.md`：业务功能页面说明。
- `tests/README.md`：测试目录和运行方式。

## 6. 边界规则

- Renderer 不直接访问 Node、SQLite、Cookie 或文件系统，只通过 `window.electronAPI` 调用 preload 暴露能力。
- 主进程 IPC/preload API 变更必须同步 `electron/preload.ts`、`electron/electron-env.d.ts`、renderer 调用点和相关文档。
- 生成目录 `dist/`、`dist-electron/`、`release/`、`tmp/` 不作为源码维护。
- 不把 Cookie、用户源码或完整请求体写入日志或文档示例。
