# Renderer 模块说明

## 1. 职责

`src/` 是 React renderer 层，负责应用 UI、页面状态、用户交互和通过 `window.electronAPI` 调用主进程能力。

Renderer 不直接访问 Node.js、SQLite、Electron session、Cookie 或文件系统。所有跨进程能力必须经 `electron/preload.ts` 暴露，并在 `electron/electron-env.d.ts` 中声明类型。

## 2. 当前实现程度

- 主应用壳：`App.tsx`。
- 入口：`main.tsx`。
- 全局样式：`index.css`、`App.css` 及 `styles/` 中的功能样式入口。
- 共享组件：`components/`。
- 业务功能页面：`features/`。
- 应用级 hook：`hooks/`。
- 共享展示常量：`shared/`。
- 当前 UI 覆盖：首页、内嵌浏览器工具栏、标签栏、题目侧栏、题目详情、笔记面板、统计面板、设置、用户脚本管理。

## 3. 文件职责

- `main.tsx`：React root 挂载，并在挂载前安装全局错误监听。
- `rendererErrors.ts`：renderer 读路径错误通道。持有模块级状态（故不放 `shared/`），提供 `reportRendererError` / `subscribeRendererErrors` / `dismissRendererError`，以及 `installRendererErrorHandlers` 兜底未处理的 promise rejection。
- `App.tsx`：renderer 顶层布局、浏览器状态接线和内部页入口编排。
- `App.css`：按稳定顺序导入 `styles/` 下的应用壳和功能样式。
- `styles/`：按应用壳、设置、首页、题目、统计、笔记和 Coach 拆分的全局样式。
- `index.css`：Tailwind 入口和全局基础样式。
- `vite-env.d.ts`：Vite 类型声明。
- `components/`：可复用 UI 组件。
- `features/`：按业务域拆分的页面/面板。
- `hooks/`：应用壳或跨 feature 的轻量 React hooks。
- `shared/`：跨 feature 的纯展示常量和轻量 helper。

## 4. App 数据流

```text
用户操作
  -> React component state
  -> feature/components/hooks helper
  -> window.electronAPI.*
  -> electron/preload.ts
  -> ipcMain handler in electron/main.ts
  -> main-process services/repositories
  -> renderer Promise result or event callback
```

`App.tsx` 负责：

- 浏览器 URL 和导航回调接线；状态和 IPC 编排由 `hooks/useBrowserNavigation.ts` 管理，工具栏 UI 由 `components/BrowserToolbar.tsx` 渲染。
- 订阅活动标签并交给 `components/ShellRouter.tsx` 渲染内部页或 web 标签故障页；web view 的挂载由主进程 `TabManager` 根据标签类型决定。
- 侧栏宽度同步给主进程 `TabManager`。
- 设置、统计、脚本、Coach 指标、题目详情和笔记入口统一调用 `tab:openInternal`，不再维护独立 modal 状态或截图背景。

## 5. IPC 边界

Renderer 只能通过 `window.electronAPI` 使用 preload 白名单能力；业务组件、共享组件和应用壳 hooks 应优先调用本域 `*Api.ts` helper，再由 helper 访问 preload。

当前 helper 分层：

- `features/{domain}/*Api.ts`：封装业务页面需要的主进程能力。
- `components/tabApi.ts`、`components/windowApi.ts`：封装标签栏和窗口控制能力。
- `hooks/browserShellApi.ts`：封装浏览器壳层导航、URL 订阅、侧栏宽度和当前页同步能力。

当前 preload 能力分组：

- 浏览器与窗口：导航、刷新、返回、窗口按钮、标签管理。
- 题目：最近题目、详情、删除、更新通知。
- 提交：Codeforces/VJudge/当前页同步、实时提交诊断。
- 统计：概览、趋势、时间线、错题、复习、统计重算。
- Rating：Codeforces handle、rating 同步、历史。
- 站点：内置/自定义站点配置、导入导出。
- Scripts：用户脚本导入、配置、启用和删除。
- Notes：笔记 CRUD、图片保存、打开目录。
- AI：上下文导出、复习建议、薄弱分析、阶段总结、复习计划、AI 输出保存。

新增 IPC 时必须同步：

1. `electron/preload.ts`
2. `electron/electron-env.d.ts`
3. renderer 调用点
4. 相关模块 README

`electron/electron-env.d.ts` 是 renderer 侧权威类型入口；新增或变更 preload 方法时必须同步返回值类型，避免在 renderer helper 中用 `any` 或重复断言补洞。

## 6. 目录边界

- 共享控件放 `components/`。
- 业务页面和面板放 `features/{domain}/`。
- 应用壳或跨 feature 的状态机 hook 放 `hooks/`。
- 多个 feature 复用的展示常量放 `shared/`。
- 主进程数据结构不要直接复制到 renderer 多处；必要时在组件附近定义最小展示类型。
- 复杂业务规则优先放主进程 service/repository，renderer 只负责展示和交互。
- 新增大型功能时先建立 feature 目录，不要继续膨胀 `App.tsx`。

## 7. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及 UI 行为时还需要运行：

```powershell
npm run dev
```

并手测对应页面、modal、浏览器 view 显隐和 IPC 返回。
