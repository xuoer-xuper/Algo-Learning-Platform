# Components 模块说明

## 1. 职责

`src/components/` 存放 renderer 共享 UI 组件。组件可以调用 `window.electronAPI` 完成窗口或标签等全局 UI 行为，但不应包含业务数据查询和复杂业务规则。

## 2. 当前组件

- `ErrorBoundary.tsx`
  - 捕获 renderer 渲染错误。
  - 提供刷新页面的降级 UI。
- `ModalLayer.tsx`
  - React modal 容器。
  - 支持浏览器预览背景和侧栏宽度偏移。
  - 用于设置、统计、脚本、题目详情、笔记等弹层。
- `BrowserToolbar.tsx`
  - 顶部浏览器工具栏 UI。
  - 渲染首页、前进后退、刷新、地址栏、当前页提交抓取和全局面板入口。
  - 通过 props 接收导航、同步和打开面板回调，不直接持有业务状态。
- `TabBar.tsx` / `TabBar.css`
  - 多标签 UI。
  - 通过 `window.electronAPI` 创建、关闭、切换、剥离标签。
  - 监听 `onTabListChanged` 同步标签状态。
- `WindowControls.tsx`
  - 自定义窗口最小化、最大化、关闭按钮。
  - 监听窗口最大化状态。

## 3. 边界规则

- 共享组件应尽量通过 props 接收业务数据和回调。
- 不要在共享组件里直接查询题目、提交、统计、AI 数据。
- Electron 窗口/标签这类全局 UI 能力可以调用 `window.electronAPI`，但新增调用必须有 preload 类型。
- 新增组件样式优先放组件附近；全局布局样式仍在 `App.css` / `index.css`。

## 4. 验证入口

修改共享组件后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及标签、窗口控制或 modal 时需要 `npm run dev` 手测。
