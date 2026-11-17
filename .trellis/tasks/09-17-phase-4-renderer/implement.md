# 阶段 4 执行计划

前置：阶段 2 合入 dev。三个 PR：`refactor/renderer-layout`（R1）、`refactor/renderer-context-split`（R2+R3+R5）、`refactor/renderer-css`（R4）。

## PR A：目录迁移（零逻辑）
- [ ] 脚本 `scripts/migrate-renderer-layout.mjs`：`git mv src/{App,main,RendererRoot}.tsx src/renderer/src/`；`components/ui` → `components/ui`；壳层组件 → `components/layout`；`features/settings` → `features/settings`；其余 feature → `modules/<name>/components`；`use*.ts` → 对应 `hooks/`；`*Api.ts`（阶段 2 后剩余的）→ 对应 module `lib/`；`shared/*` → `lib/`；`styles/` 原样先移。
- [ ] 每个 module 建 `index.ts`、`constants.ts`（把散落常量搬入）、`types.ts`。
- [ ] `ShellRouter` lazy import 改 index；`vite.config.ts`、`index.html`、`tsconfig`、`vitest`、`tests/components` 路径同步。
- [ ] 守卫：module 内部 import 禁令。
- 验证：`git diff -M90% --stat`；`pnpm test:all`。commit `refactor(renderer): 渲染层迁到 src/renderer/src 模板布局`。

## PR B：Context + 拆分 + 状态治理
- [ ] `ShellActionsContext`、`AppPreferencesContext`；`App.tsx` 改 Provider 树；30+65 处 props 改 hook。
- [ ] 先给待拆组件加 `data-testid`；拆 `SessionTimelineView`、`TabStrip`、`App`（`NoticeBarStack`）。
- [ ] 布尔命名、返回类型、`useToast` 删除、`EVENT_TYPE_LABELS` 合并、`HomePage` `useMemo`。
- [ ] 15 个组件 `useIpcQuery` 收尾；`SiteManagementPanel`、`UserScriptManager` 骨架/空态；9 处吞错。
- [ ] `MilkdownEditor` ref 模式；`set-state-in-effect` 开启修复。
- [ ] 行数守卫（组件 300）。
- 验证：`pnpm test:ui` 重录基线；`pnpm test:all`。commit 按对象：`refactor(renderer): 引入 ShellActionsContext 消除 props drilling`、`refactor(ui): 拆分超长组件`、`fix(renderer): 加载态与错误处理对齐规范`。

## PR C：CSS 体系
- [ ] `styles/{index,tokens,base}.css`；`components/`、`layout/`、`pages/` 拆分 5 个大文件；删 `App.css` 与组件旁 import；`CoachPet` 独立入口。
- [ ] 旧别名 372 处 → `--color-*`（脚本替换 + 人工核对暗色）。
- [ ] BEM 重命名（脚本：按现有 `block-element` 规则生成映射表 → 同步改 css/tsx/Playwright）；`ui-*` 保留。
- [ ] Tailwind 工具类替换简单布局（人工，按模块推进）。
- [ ] `scrollbar-gutter` + hover 滚动条；裸 hex 守卫；CSS 行数守卫。
- 验证：`pnpm test:ui` 逐页截图对比（视觉应零变化）；`pnpm test:performance`。commit `style(renderer): CSS 单入口、token、BEM 与 Tailwind 工具类对齐规范`。

## Review Gates
- 每 PR squash 合入 dev；PR C 合入后人工在亮/暗两主题走一遍全部页面。

## Rollback
- 三个 PR 相互独立可 revert；PR C 的 BEM 映射表保留在 `scripts/` 供反向替换。
