# Renderer 全局样式

## 1. 职责

`src/styles/` 按功能域维护原 `App.css` 中的应用级样式，降低单文件体积，同时保持现有选择器、层叠顺序和视觉效果不变。

## 2. 当前实现

- `app-shell.css`：窗口壳、工具栏、标签栏、侧栏、modal 和通用状态。
- `settings.css`：设置页、站点配置、用户脚本和 LLM 配置。
- `home.css`：首页快捷入口。
- `problem-detail.css`：题目详情。
- `dashboard.css`：统计页和图表布局。
- `notes.css`：笔记弹窗、编辑器和预览。
- `coach.css`：Coach 指标、时间线和相关响应式样式。
- `scripts.css`：用户脚本管理弹层（列表、启停状态、站点绑定编辑器）。

## 3. 入口与顺序

`src/App.css` 是唯一聚合入口，并按上述顺序使用 `@import`。这个顺序属于样式行为的一部分；移动规则或调整导入顺序前必须检查层叠影响。

## 4. 维护边界

- 组件私有样式优先放在对应 feature 目录，只有应用级或跨组件规则放在这里。
- 不得在多个文件复制同一选择器；需要覆盖时应靠近所属功能，并明确检查层叠顺序。
- 样式拆分不得改变 IPC、组件行为或设计视觉。
- 颜色只能写 `var(--color-*)`，裸 hex 由 `test:architecture` 拦（白名单只有三个 token 定义文件）。语义色不单独承义 —— 徽标、状态点这类地方必须同时有文字标签，口径与 `src/shared/display.ts` 一致。
- 这里的局部类只负责**布局与本地几何**，边框/圆角/配色/focus ring 一律由 `src/components/ui/` 的基类给。要覆盖基类几何必须显式写死（例如 `.ui-icon-btn` 是 28×28，侧栏行只放得下 20×20），不要指望 `@import` 顺序帮你压过去。

## 5. 验证入口

```powershell
npm run test:ui
npm run test:performance
```

截图测试必须覆盖题库、统计、设置、LLM 设置、Coach 指标和笔记编辑器，并确认没有空白内容、ErrorBoundary、裁切或重叠。
