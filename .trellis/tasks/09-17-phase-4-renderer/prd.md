# 阶段 4 渲染层重构到模板布局

## Goal

渲染进程从平铺的 `src/{components,features,hooks,shared,styles}` 迁到模板的 `src/renderer/src/{components/{ui,layout}, features/, modules/{name}/{components,hooks,context,constants.ts,types.ts,index.ts}, hooks/, context/, lib/, styles/}`，引入 Context 消除 props drilling，CSS 改为单入口 + tokens + BEM + Tailwind 工具类，补齐加载态与错误处理。

## Requirements

### R1 目录与模块边界（中-8、中-9，D3）
- `src/renderer/src/`：`main.tsx`、`App.tsx`、`components/ui/`（现 `ui/`）、`components/layout/`（`BrowserToolbar`、`TabStrip`、`WindowControls`、`ShellRouter`、`FindInPageBar`、`Omnibox`、`ErrorBoundary`、新 `NoticeBarStack`）、`features/{settings,navigation,theme}/`（横切）、`modules/{problems,notes,analytics,coach,scripts,home,credentials,sites}/`（领域）、`hooks/`（`useBrowserNavigation`、`useOmnibox`、`useIpcQuery`）、`context/`、`lib/`（`browserLayout`、`theme`、`rendererErrors`、`display`、`errors`）、`styles/`。
- 每个 module：`components/`、`hooks/`（`useX` 从根移入）、`context/`（如需）、`constants.ts`（`EVENT_TYPE_LABELS`、`NOTE_TYPE_LABELS` 等）、`types.ts`（仅模块私有 UI 类型；实体类型来自 `@shared`）、`index.ts` 公共导出。
- 跨模块只能 import 对方 `index.ts`；module 不 import 其他 module 的内部；`ShellRouter` 的 8 个 lazy import 改 `import('../../modules/x')`。守卫：`check-architecture.mjs` 加"module 内部路径不得被外部 import"。
- `vite.config.ts` root / `index.html` 路径同步；`tsconfig` include 同步。

### R2 Context（中-12）
- `context/ShellActionsContext.tsx`：`{ navigate, openTab, closeActiveTab, focusOmnibox }`；`context/DataRefreshContext.tsx`（阶段 2）；`context/AppPreferencesContext.tsx`（主题、字号，由主进程 electron-store 持久化，`state-management.md` 的 localStorage 改为 IPC）。
- `onNavigate` 30 处、`onClose` 65 处 props 改 `useShellActions()`；`App.tsx` 8 个 state 收进 Context 或 `useIpcQuery`，目标 < 200 行。

### R3 组件拆分与规范（中-13，`components.md`）
- `SessionTimelineView` 438 → 列表 + 明细 + 过滤三组件；`TabStrip` 432 → `TabStrip` + `TabItem` + `useTabKeyboardNav`；`App.tsx` → 布局 + `NoticeBarStack`。所有组件 < 300 行（守卫）。
- 40 处组件/hook 补显式返回类型（阶段 0 lint 已强制）。
- 33 处布尔 state 加 `is/has/should/can` 前缀。
- `useToast` 删除或接入（决定：删除，反馈统一 `NoticeBar`）。

### R4 CSS 体系（D14，中-14、中-15、中-16、低-12、低-13）
- `styles/index.css` 单入口：`@import 'tailwindcss'` → `tokens.css` → `base.css` → `components/*.css` → `layout/*.css` → `pages/*.css`。`App.css`、组件旁 `import './X.css'` 全部删除；`CoachPet` 窗口用 `styles/pet.css` 独立入口（分窗策略保留，两入口各自完整）。
- `tokens.css`：`@theme` + `:root` 语义 token；删除 372 处旧别名 `--bg/--text/--primary/--border`（改 `--color-*`），`index.css:100-129` 兼容块删除；暗色 `[data-theme="dark"]` 保留。
- BEM：463 个选择器改 `block__element--modifier`；Playwright 选择器同步。`ui-*` 前缀保留为 block 名。
- 5 个 > 500 行文件拆到 `components/` 或 `pages/`；每文件 < 500 行（守卫）。
- 简单布局（flex/gap/padding/文本尺寸）改 Tailwind 工具类；复杂/复用样式保持 BEM。目标：`className` 中工具类占比 > 30%。
- 17 个滚动容器 `scrollbar-gutter: stable`；滚动条默认隐藏 hover 淡入（`components.md` Notion 模式）。
- 裸 hex 守卫继续只允许 `tokens.css`。

### R5 加载态、错误、复用（中-11、中-17、中-18）
- 所有取数走 `useIpcQuery`（阶段 2）；`isLoading` 只在首载显示骨架，`isRefetching` 保持数据；`SiteManagementPanel`、`UserScriptManager` 加骨架与空态。
- 9 处吞错改 `reportRendererError`（`App.tsx` 5 处）或保留带注释的降级（4 处）。
- 重复常量合并；`HomePage.tsx:58-67` `useMemo`。
- `MilkdownEditor.tsx:137` 的 `eslint-disable` 用 ref 模式消除；`react-hooks/set-state-in-effect` 全局关闭改为逐处修复后开启。

## Acceptance Criteria

- [ ] `src/renderer/src/` 结构与 `frontend/directory-structure.md` 一致；每个 module 有 `index.ts`；跨模块内部 import 守卫 0 违规。
- [ ] `grep -rn "createContext" src/renderer` ≥ 3；`onNavigate`/`onClose` 作为 props 出现 ≤ 5 处（仅 `ui/` 通用组件）。
- [ ] 组件 > 300 行 0 个；CSS 文件 > 500 行 0 个；`App.tsx` < 200 行。
- [ ] `styles/index.css` 是唯一 `@import` 入口（`grep -rn "\.css'" src/renderer --include=*.tsx` 仅 `main.tsx` 与 `CoachPet` 入口）。
- [ ] `grep -c "var(--bg\|var(--text\|var(--primary\|var(--border" src/renderer` = 0；BEM 守卫（含 `__` 的类选择器占比 > 80%）。
- [ ] Tailwind 工具类命中 > 30% 的 `className`。
- [ ] `scrollbar-gutter` 出现 ≥ 17 处。
- [ ] `useState(true|false)` 变量名全部 `is/has/should/can` 前缀（lint 自定义规则或守卫）。
- [ ] `eslint-disable` 0；`react-hooks/set-state-in-effect` 开启且 0 报错。
- [ ] `pnpm test:ui`（Playwright 截图基线重录一次并人工核对）、`pnpm test:performance`（入口体积不超上限）、`pnpm test:all` 全绿。

## Out of Scope

- 视觉设计变更（token 值不变，只改组织方式）；新组件库引入。

## Notes

- 前置：阶段 2（`window.api`、`useIpcQuery`、`DataRefreshContext`）。与阶段 3 可并行。
- 顺序：R1（纯移动，单 PR，`git diff -M`）→ R2 → R3 → R5 → R4（CSS 最后，因 BEM 改名影响面最广，需要组件结构稳定后做）。
- 风险：BEM 重命名会使 Playwright 与 `tests/components` 的选择器大面积失效；改用 `data-testid` 作为测试选择器（模板未规定，但可隔离样式变更），在 R3 时先加 testid。
