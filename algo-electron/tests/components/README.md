# tests/components

## 职责

renderer 基础 UI 组件及壳层共享组件的 jsdom 测试：渲染结构、变体类名、交互回调、可达性属性与浏览器手势。

## 当前实现

`searchEnginePanel.test.tsx` 覆盖搜索引擎读取、自定义模板行内校验、主进程返回配置回填和保存错误。

`noteTabIsolation.test.tsx` 通过真实路由、笔记面板和编辑器保存逻辑，覆盖跨题笔记标签、同标签更换题目、同题不同标签的状态隔离，切换前标题和正文的防抖 flush、旧读取迟到，以及同标签元数据更新保留编辑器；只在 Crepe 和数据 API 边界使用替身。

`rendererErrors.test.ts` 覆盖 `src/rendererErrors.ts` 的 rejection 兜底、挂载前补发、同错误累计次数、关闭与退订，以及 `errorMessage` 对 Error/普通对象/null/循环引用的取值；`appErrorNotice.test.tsx` 覆盖读失败进错误通知栏、首帧补发、重复合并计次，以及显隐时对主进程 `setErrorNoticeVisible` 的通知（通知栏占布局高度，主进程不知情会被 WebContentsView 盖住）；`settingsPanelReadErrors.test.tsx` 覆盖 LLM/Coach/Codeforces 三个面板「读失败」与「本来没配置」的区分，以及 Coach 保存失败后的开关回滚。

`uiComponents.test.tsx` 覆盖 Icon/Button/IconButton/Input/Select/Textarea/Card/ConfirmDialog；`uiPrimitives.test.tsx` 覆盖 Dialog/DropdownMenu/Toast/NoticeBar 的焦点、键盘、live region 与文档流行为；`appContestNotice.test.tsx` 覆盖比赛提示与用户脚本 host 授权提示的回放、允许/拒绝和固定安全展示字段；`credentialsPage.test.tsx` 覆盖账户页脱敏显示、无密码输入、重命名、确认删除和新标签更新密码；`cardGovernance.test.ts` 守住 Dashboard/Coach、首页和设置三组统计卡片统一消费 Card；`controlGovernance.test.ts` 守住侧栏/笔记头部/脚本编辑器/崩溃屏的裸控件已换成 ui/ 原语（含 `Select size="sm"`、`Textarea` 而非 `textarea.ui-input`）、局部类只留布局锚点，以及笔记徽标与实心填充前景色走 token 而非裸 hex；`iconGovernance.test.ts` 守住关闭/删除/时间轴/详情链接/笔记空态的统一功能图标，CoachPet SVG 作为插画例外保留；`tokenGovernance.test.ts` 守住 spacing/圆角/阴影/时长/缓动 token、单一 `:root`、组件语义圆角消费和暗色语义色双值；`tabStrip.test.tsx` 覆盖首次同步、favicon/loading/internal 图标、pointer 拖拽排序、拖拽后 click 抑制、关闭动效、中键和横向滚轮；`omnibox.test.tsx` 覆盖 draft/活动 URL 隔离、debounce/request sequence、空查询、IME、键盘与 pointer 建议提交、Ctrl+L、ARIA、卸载恢复和原生 more 菜单锚点。文件头以 `// @vitest-environment jsdom` 声明环境，其余测试仍默认 node 环境。

## 封装入口

使用 `@testing-library/react` 的 `render/screen/fireEvent`，断言走 Vitest 原生 `expect`；每个用例后 `cleanup()`。

## 边界规则

- 基础组件直接测展示契约；壳层共享组件通过模块边界 mock preload helper，不在组件内复制主进程状态机。
- 测试数据不得包含 Cookie/token 样式的敏感字符串（安全守卫扫描）。
- 新增组件必须同步补测试，守住覆盖率门槛（functions 余量极小，见重构计划 §2.6）。

## 验证入口

`npm run test:unit` / `npm run test:coverage`。
