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
  - 保留首页、前进后退、刷新、当前页提交抓取和同步消息；原四个全局入口收敛为一个调用原生应用菜单的 more 按钮。
  - 应用菜单锚点取按钮左下角的整数屏幕坐标，renderer 不绘制会被 WebContentsView 遮挡的菜单浮层。
- `Omnibox.tsx` / `Omnibox.css` / `useOmnibox.ts`
  - 地址栏 draft 与活动标签 URL 分离；普通 Enter 把原始输入交给主进程三分流，选择本地建议时导航其 URL。
  - 聚焦后通知主进程摘除活动 view，并由 App 用普通文档流建议面板替换整个内容区；blur、Escape 和卸载保证恢复 view。
  - 本地建议使用 140ms debounce 与请求序号隔离迟到响应，支持空查询、错误空列表降级、方向键/Enter/Escape、IME composing、Ctrl+L 与 combobox/listbox/option ARIA。
- `FindInPageBar.tsx`
  - 通过固定 preload 事件显示活动 web 标签的查找状态，query/next/previous/close 全部走主进程 requestId 状态机。
  - 以普通文档流 38px 占位，不能改为 fixed/absolute，也不能遮挡 `WebContentsView`。
- `NoticeBar`（`components/ui/NoticeBar.tsx`）
  - 承载下载完成/取消/中断和无响应提示；主进程同步调整活动 view bounds，renderer 不绘制浮层。
- `TabStrip.tsx` / `TabStrip.css`
  - Chrome 风格混合标签 UI，渲染 favicon、内部页领域图标、加载 spinner 和崩溃状态图标。
  - 支持 pointer capture 拖拽排序、中键关闭、关闭/新建动效、窄屏横向滚动和活动标签自动滚入可视区。
  - 标签交互区明确为 `no-drag`，仅保留右侧空白为窗口拖动区，避免与 `-webkit-app-region: drag` 冲突。
  - 监听 `onTabListChanged` 同步主进程事实状态，并把活动标签的崩溃/无响应变化交给壳层渲染恢复页或 NoticeBar。
- `tabApi.ts`
  - 封装 `createTab`、`openInternalTab`、`closeTab`、`reopenClosedTab`、`switchTab`、`reorderTab`、`moveTabToNewWindow`、`finishTabDrag`、按 tabId 重载、无响应等待和 `onTabListChanged`；旧 `tab:detach` 已退役并由完整壳过户通道替代。
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
- 新增组件样式优先放组件附近；全局布局样式仍在 `App.css` / `index.css`。Omnibox 面板必须占文档流，不得改回 absolute/fixed 浮层。

## 4. 验证入口

修改共享组件后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及标签、窗口控制或内部页路由时追加运行对应 jsdom 测试和 `npm run test:ui`。
