# tests/components

## 职责

renderer 基础 UI 组件（`src/components/ui/`）的 jsdom 组件测试：渲染结构、变体类名、交互回调与可达性属性。

## 当前实现

`uiComponents.test.tsx` 覆盖 Icon/Button/IconButton/Input/Select/Textarea/Card/ConfirmDialog 的渲染与交互路径；文件头以 `// @vitest-environment jsdom` 声明环境，其余测试仍默认 node 环境。

## 封装入口

使用 `@testing-library/react` 的 `render/screen/fireEvent`，断言走 Vitest 原生 `expect`；每个用例后 `cleanup()`。

## 边界规则

- 只测 `src/components/ui/` 的展示组件；不 mock `window.electronAPI`，业务组件测试不放这里。
- 测试数据不得包含 Cookie/token 样式的敏感字符串（安全守卫扫描）。
- 新增组件必须同步补测试，守住覆盖率门槛（functions 余量极小，见重构计划 §2.6）。

## 验证入口

`npm run test:unit` / `npm run test:coverage`。
