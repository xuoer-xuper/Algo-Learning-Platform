# src/components/ui

## 职责

应用级基础 UI 组件库（设计系统 B1.2/B1.3 产物）：Button/IconButton、Input/Select/Textarea、Card、ConfirmDialog 与统一 SVG 图标集。所有 feature 的按钮、表单控件、确认框、图标必须从本目录取用，禁止再各自手写样式类或使用 Unicode/emoji 图标。

## 当前实现

- `icons.tsx`：`Icon` 组件 + `IconName` 联合类型，24 viewBox / 1.8 描边 / currentColor，`data-icon` 便于测试定位。
- `Button.tsx`：`Button`（primary/secondary/ghost/danger × md/sm，可带图标）、`IconButton`（纯图标，title 必填并同步 aria-label）。
- `fields.tsx`：`Input`/`Select`/`Textarea`/`Card` 样式化原生控件。
- `ConfirmDialog.tsx`：统一确认对话框（portal 到 body、z-index 200、Esc/遮罩取消、danger 变体、附加内容插槽），替代原生 `window.confirm`。
- `Dialog.tsx`：内部页通用对话框，带标题/描述、焦点陷阱、Esc/遮罩关闭和关闭后焦点恢复。
- `DropdownMenu.tsx`：内部页命令菜单，支持方向键、Home/End、禁用项、外部点击和 Portal 定位。
- `Toast.tsx`：短时状态反馈，带 live region、自动消退、操作和关闭按钮。
- `NoticeBar.tsx`：布局让位型通知条，供 web 标签场景使用；不使用 fixed/absolute 浮层。
- `ui.css`：组件样式，全部取值自 `src/index.css` 的设计 token，禁止裸 hex。

## 封装入口

统一从 barrel 导入：`import { Button, Icon, ConfirmDialog } from '../../components/ui'`（`index.ts` 同时引入 `ui.css`）。

## 边界规则

- 组件不查业务数据、不调 `window.electronAPI`（沿用 components 层既有边界）。
- ConfirmDialog 仅可在内部页/弹层上下文使用（WebContentsView 已摘除时）；web 标签激活场景的询问走通知条（重构计划 §4 浮层三分法）。
- Dialog/DropdownMenu/Toast 仅用于内部页；web 标签场景的询问和下载状态使用 NoticeBar，让内容区域主动让位。
- NoticeBar 必须保持普通文档流布局，不得改成 fixed/absolute 浮层。
- 新增图标只能加进 `icons.tsx` 的 `ICON_PATHS`；新增组件变体先改本目录再在 feature 使用。

## 验证入口

`npm run test:unit`（`tests/components/uiComponents.test.tsx`，jsdom + @testing-library/react）；视觉回归走 `npm run test:ui`。
