# Renderer Shared 模块说明

## 1. 职责

`src/shared/` 存放 renderer 侧跨 feature 共享的纯展示常量和轻量工具。

本目录不访问 `window.electronAPI`，不保存 React state，不包含主进程业务规则。

## 2. 当前内容

- `display.ts`
  - `PLATFORM_NAMES`：平台完整展示名。
  - `PLATFORM_LABELS`：侧栏等紧凑位置使用的平台短标签。
  - `PLATFORM_URLS`：首页快捷入口 URL。
  - `PLATFORM_COLORS`：平台主色。
  - `STATUS_LABELS`：题目状态展示文案。
  - `STATUS_COLORS`：题目状态颜色。
  - `VERDICT_COLORS`：提交 verdict 颜色。
  - `CHART_COLORS`：统计图表通用颜色序列。

## 3. 边界规则

- 多个 feature 重复使用的展示映射应放到这里。
- 站点解析、提交解析、数据库状态枚举仍属于主进程模块。
- 新增平台时，应同步这里的展示名、颜色和快捷入口。
- 不要把组件 JSX、hooks 或 IPC helper 放进本目录。

## 4. 验证入口

```powershell
cd algo-electron
npm run typecheck
npm run test:ui
```

涉及平台名称、状态颜色或图表颜色时，还需要手测题目侧栏、题目详情、统计页和设置页，确认展示文案、颜色和窄屏布局没有错位。
