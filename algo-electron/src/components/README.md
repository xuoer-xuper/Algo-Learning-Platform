# Components 模块说明

## 1. 职责

`src/components/` 存放 renderer 共享 UI 组件。组件可以通过本目录 helper 完成窗口或标签等全局 UI 行为，但不应包含业务数据查询和复杂业务规则。

## 2. 当前实现程度

当前共享组件已覆盖应用壳浏览器工具栏、混合标签、内部页路由、窗口控制和错误降级。关键组件和 helper 如下：

- `ErrorBoundary.tsx`
  - 捕获 renderer 渲染错误。
  - 提供刷新页面的降级 UI。
- `ShellRouter.tsx`
  - 按活动 `TabInfo` 渲染首页、设置、统计、脚本、Coach 指标、题目详情和笔记等内部标签。
  - 保留现有 feature 文件名与 lazy chunk 边界；健康 web 标签返回空 DOM，崩溃 web 标签渲染恢复操作。
- `BrowserToolbar.tsx`
  - 顶部浏览器工具栏 UI。
  - 渲染首页、前进后退、刷新、地址栏、当前页提交抓取和全局面板入口。
  - 通过 props 接收导航、同步和打开面板回调，不直接持有业务状态。
- `TabBar.tsx` / `TabBar.css`
  - 多标签 UI。
  - 通过 `tabApi.ts` 创建、关闭、恢复、切换、剥离标签；支持中键关闭。
  - 监听 `onTabListChanged` 同步标签状态，并把活动标签的崩溃/无响应变化交给壳层渲染恢复页或 NoticeBar。
- `tabApi.ts`
  - 封装 `createTab`、`openInternalTab`、`closeTab`、`reopenClosedTab`、`switchTab`、`detachTab`、按 tabId 重载、无响应等待和 `onTabListChanged`。
  - 只处理标签 UI 所需的 preload 调用，不保存标签业务状态。
- `WindowControls.tsx`
  - 自定义窗口最小化、最大化、关闭按钮。
  - 监听窗口最大化状态。
- `windowApi.ts`
  - 封装 `isWindowMaximized`、`onWindowMaximized`、`minimizeWindow`、`maximizeWindow` 和 `closeWindow`。
  - 只服务窗口 chrome 控制，不查询业务数据。

## 3. 边界规则

- 共享组件应尽量通过 props 接收业务数据和回调。
- 不要在共享组件里直接查询题目、提交、统计、AI 数据。
- Electron 窗口/标签这类全局 UI 能力应优先放在 components 层 helper 中，新增调用必须有 preload 类型。
- 新增组件样式优先放组件附近；全局布局样式仍在 `App.css` / `index.css`。

## 4. 验证入口

修改共享组件后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及标签、窗口控制或内部页路由时追加运行对应 jsdom 测试和 `npm run test:ui`。
