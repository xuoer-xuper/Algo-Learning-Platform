# tests/components

## 职责

renderer 基础 UI 组件及壳层共享组件的 jsdom 测试：渲染结构、变体类名、交互回调、可达性属性与浏览器手势。

## 当前实现

`uiComponents.test.tsx` 覆盖 Icon/Button/IconButton/Input/Select/Textarea/Card/ConfirmDialog；`tabBar.test.tsx` 覆盖中键关闭、其他辅助鼠标键忽略，以及旧双击拆分入口被通知替代且不会调用 detach API。文件头以 `// @vitest-environment jsdom` 声明环境，其余测试仍默认 node 环境。

## 封装入口

使用 `@testing-library/react` 的 `render/screen/fireEvent`，断言走 Vitest 原生 `expect`；每个用例后 `cleanup()`。

## 边界规则

- 基础组件直接测展示契约；壳层共享组件通过模块边界 mock preload helper，不在组件内复制主进程状态机。
- 测试数据不得包含 Cookie/token 样式的敏感字符串（安全守卫扫描）。
- 新增组件必须同步补测试，守住覆盖率门槛（functions 余量极小，见重构计划 §2.6）。

## 验证入口

`npm run test:unit` / `npm run test:coverage`。
