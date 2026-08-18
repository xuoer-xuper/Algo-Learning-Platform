# tests/components

## 职责

renderer 基础 UI 组件及壳层共享组件的 jsdom 测试：渲染结构、变体类名、交互回调、可达性属性与浏览器手势。

## 当前实现

`searchEnginePanel.test.tsx` 覆盖搜索引擎读取、自定义模板行内校验、主进程返回配置回填和保存错误。

`uiComponents.test.tsx` 覆盖 Icon/Button/IconButton/Input/Select/Textarea/Card/ConfirmDialog；`uiPrimitives.test.tsx` 覆盖 Dialog/DropdownMenu/Toast/NoticeBar 的焦点、键盘、live region 与文档流行为；`cardGovernance.test.ts` 守住 Dashboard/Coach、首页和设置三组统计卡片统一消费 Card；`iconGovernance.test.ts` 守住关闭/删除/时间轴/详情链接/笔记空态的统一功能图标，CoachPet SVG 作为插画例外保留；`tokenGovernance.test.ts` 守住 spacing/圆角/阴影/时长/缓动 token、单一 `:root`、组件语义圆角消费和暗色语义色双值；`tabStrip.test.tsx` 覆盖首次同步、favicon/loading/internal 图标、pointer 拖拽排序、拖拽后 click 抑制、关闭动效、中键和横向滚轮；`omnibox.test.tsx` 覆盖 draft/活动 URL 隔离、debounce/request sequence、空查询、IME、键盘与 pointer 建议提交、Ctrl+L、ARIA、卸载恢复和原生 more 菜单锚点。文件头以 `// @vitest-environment jsdom` 声明环境，其余测试仍默认 node 环境。

## 封装入口

使用 `@testing-library/react` 的 `render/screen/fireEvent`，断言走 Vitest 原生 `expect`；每个用例后 `cleanup()`。

## 边界规则

- 基础组件直接测展示契约；壳层共享组件通过模块边界 mock preload helper，不在组件内复制主进程状态机。
- 测试数据不得包含 Cookie/token 样式的敏感字符串（安全守卫扫描）。
- 新增组件必须同步补测试，守住覆盖率门槛（functions 余量极小，见重构计划 §2.6）。

## 验证入口

`npm run test:unit` / `npm run test:coverage`。
