# 前端重写交接文档（B1 设计系统落地）

> 日期：2026-08-16 ｜ 任务：B1.1-B1.5 前端视觉重写 + B0.6 组件测试基建切片（用户指令"直接先重写前端"，提前于 B0 执行）
> 总纲：[BROWSER_SHELL_REFACTOR_PLAN](../../docs/DESIGN/BROWSER_SHELL_REFACTOR_PLAN.md)（B0-B6 七阶段，本次只做视觉层，不动结构与主进程）

## 1. 本次完成了什么

### B1.1 设计 token 唯一源（`src/index.css`）

- 方向：「竞技控制台」——冷调纸白底 + 群青主色 `#2f5fe0` + 等宽数据声线。
- Tailwind v4 `@theme` 定义全部 token（色/字体/圆角/阴影/动效时长与缓动），`:root` 保留旧变量名（`--bg`/`--text`/`--border`/`--primary` 等）作兼容别名——**存量 CSS 不改即吃到新值**。
- 删除了 `app-shell.css` 里的第二份冲突 `:root`（原两份靠加载顺序定胜负的问题根除）；补齐了被引用但从未定义的 `--accent`/`--bg-code`。
- 暗色模式 token 双值已按 D6 决议预留（`[data-theme="dark"]` 块，未启用，B5.4 验证后开闸）。
- 附带全局质量底座：统一 `:focus-visible` 焦点环、低存在感滚动条、`::selection`、`prefers-reduced-motion` 全局降级、`.mono`/`.num` 数据声线工具类。

### B1.2/B1.3 基础组件库与图标集（`src/components/ui/`）

- `Button`（primary/secondary/ghost/danger × md/sm，可带图标）、`IconButton`、`Input`/`Select`/`Textarea`、`Card`、`ConfirmDialog`（portal、z-200、Esc/遮罩取消、danger 变体、附加内容插槽）。
- `Icon` 统一图标集（22 个名称，24 viewBox/1.8 描边/currentColor），**全应用禁止再出现 Unicode 符号/emoji/散装内联 SVG**。
- 样式在 `ui.css`，全部取值 token，禁裸 hex。用法见 `src/components/ui/README.md`。

### B1.4 原生 confirm() 清零（6 处 4 文件）

全部替换为 `ConfirmDialog`：站点删除（SiteManagementPanel）、脚本删除（UserScriptManager）、笔记两处（NotePanelModal）、题目删除二连问合并为**单对话框 + 「同时删除本地笔记」勾选**（ProblemDetail，按计划 B1.4 指定设计）。

### B1.5 全站风格统一

- 壳层（我方直改）：工具栏/标签栏/窗口控制/侧栏/弹层容器全部 token 化重写；地址栏改药丸形等宽字体（omnibox 的视觉先行，行为 B2.5 再动）；弹层新增入场动画（`modal-pop`/`overlay-in`，160ms ease-out）；标签与工具栏 Chrome 式连体。
- 五个 feature（并行代理改造）：设置、统计 Dashboard、Coach 指标、脚本管理（Tailwind 孤岛收编）、笔记/题目详情、首页。ProblemDetail 结束了对 settings 类名的寄生（迁至 `.detail-*`）。
- 色彩治理（`src/shared/display.ts`）：Catppuccin 暗色粉彩全部替换为浅色面高对比档；**图表色板经 dataviz 校验器验证**（白面 6 槽，相邻对 CVD ΔE≥8/常视力 ΔE≥15 通过；三个低对比槽位以图例+工具提示补救——已在图表中保留）；平台色定位为"带文字标签的身份色"，禁止单独承义或直接当图表系列色。

### B0.6 切片：组件测试基建（D1 决议）

- 新增 devDependencies：`jsdom`、`@testing-library/react`（仅测试用，不进打包）。
- `vitest.config.ts` include 扩展 `tests/**/*.test.tsx`；组件测试用文件头 `// @vitest-environment jsdom` 声明环境，其余测试不受影响。
- 首批组件测试：`tests/components/uiComponents.test.tsx`（13 用例，覆盖 ui/ 全部组件），守住 functions 覆盖率余量。

## 2. 设计系统使用规范（后续开发必读）

1. **颜色只能来自 token**（`src/index.css`）或 `display.ts` 的语义色表；任何 CSS/TSX 出现新裸 hex 视为违规。**该规则已有守卫**（`test:architecture` 的 `colors come from design tokens, not bare hex`），此前只是文字约定 —— 白名单是三个颜色定义文件（`index.css`、`coach/styles/tokens.css`、`display.ts`），其余 `src/` 下任何 CSS/TS/TSX 出现裸 hex 即失败。
2. **按钮/输入/确认框/图标必须用 `src/components/ui/`**；新增图标加进 `icons.tsx` 的 `ICON_PATHS`。
3. **数据声线**：数字/ID/verdict/计数一律等宽+tabular-nums（`.num` 类或 `var(--font-mono)`）。
4. **动效**：只用 `var(--duration-*)` + `var(--ease-out)`；不要写死毫秒；reduced-motion 已全局处理。
5. **ConfirmDialog 边界**（计划 §4 三分法）：仅内部页/弹层上下文可用；web 标签激活场景的询问等 B2 的 NoticeBar。
6. **图表**：系列色按 `CHART_COLORS` 槽位固定分配（不取模循环）；饼图留白描边；图例+Tooltip 不可删（低对比槽位的补救手段）；换色板必须重跑 dataviz 校验器。

## 3. 刻意没做的（防止误会）

- **结构一律未动**：浮窗仍是截图替身机制（B2 拆）、标签/拆分窗口/快捷键/多窗口（B0/B2/B3）、主进程零改动、IPC 零改动。
- 桌宠视觉（`pet.css`/`bubble.css`）未动——独立风格，B5.5 处理置顶策略与尺寸解耦时一并定调。
- Playwright 断言的类名与按钮 title 全部原样保留（`.modal-panel`/`.settings-cols`/`.dashboard-close`/`button[title="统计"]` 等），测试选择器迁 data-testid 留在 B0.6 主任务。
- 暗色模式只预留 token 未启用（D6）。

## 4. 验证结果

全部门槛绿（2026-08-16 合流后实测）：

| 门槛 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm run lint`（--max-warnings 0） | 0 error / 0 warning |
| `npm run test:coverage` | 36 文件 329 用例全过；覆盖率 **28.91 / 34.66 / 24.60 / 29.63**（门槛 28/34/24/29），四项均较基线 28.79/34.51/24.19/29.54 **不降反升**——新增组件测试抵消了新 TSX 稀释 |
| `npm run test:performance` | entry 192,201 字节不变（余量 91.3%）；5 个懒加载 chunk 完好 |
| `npm run test:docs` / `test:architecture` / `test:security` | 全部通过（新目录 README 五要素 + 索引已登记） |
| `npm run test:ui` | **三视口（1280×800 / 1024×720 / 800×600）× 6 页面全部通过**：契约选择器、响应式折叠断点、无横向溢出、无 pageerror、敏感文本扫描、截图体积 |

裸 hex 审计：样式文件仅剩 3 处刻意保留——主按钮/危险按钮白字 `#fff`、窗口关闭键悬停红 `#e81123`（Windows 系统惯例色）。

> **2026-08-30 更新（质量收口 Q4）**：这 3 处已收成 token，样式文件裸 hex 归零。
> `#fff` → `--color-on-fill`（实心填充上的前景色；不能用 `--bg-card` 代替，后者深色主题下变 `#1e222c`，而压在 accent/danger 饱和底上的前景两个主题都得是白），
> `#e81123` → `--color-sys-close`（取值不变，注明来自 Windows 自身、不属本设计系统语义色板）。
> 同时补上了本节缺失的守卫，并清掉 `NOTE_TYPE_COLORS`（3 个 Catppuccin 深色值当浅卡片上的文字色，徽标对比度只有 1.2~1.9:1）与 `ErrorBoundary.tsx` 的 Tailwind `red-50/600/900`。

## 4.1 本次改动清单（git status 摘要）

- 新增：`src/components/ui/`（组件库+图标+README）、`src/styles/scripts.css`、`tests/components/`（13 用例+README）、`docs/REFACTOR_HANDOFF.md`（本文）
- 重写：`src/index.css`（token 源）、`app-shell.css`、`TabBar.css`、`settings.css`、`dashboard.css`、`coach.css`（桌宠部分未动）、`home.css`、`notes.css`、`problem-detail.css`、`display.ts`
- 组件改造：壳层 4 件（Toolbar/TabBar/WindowControls/ProblemSidebar）+ settings 全部面板 + analytics 全部 + CoachMetricsView + SessionTimelineView + scripts 三件 + NotePanelModal/ProblemDetail + HomePage
- 配置：`package.json`（+jsdom、@testing-library/react devDeps）、`vitest.config.ts`（include .test.tsx）、仓库级 `docs/README.md`（索引 2 行）

## 5. 已知风险与后续建议

- 弹层打开仍有截图替身的固有延迟与"网页冻结成图"限制——这是 B2 要拆除的机制，本次只加了入场动画缓解突兀感。
- 图标为手绘 path，若后续想换 lucide-react 等图标库需评估 entry 体积（当前余量极大，非阻塞）。
- 新组件库的采用是"替换式"而非"强制式"——本次已把可见主路径全部替换，若发现漏网的旧按钮类（12+ 套按钮类的残留），按 §2 规范顺手迁移即可。
- 下一步建议：回到计划主线从 **B0.1（快捷键地基）** 开工；或若想先看得见收益，B0.8/B0.9/B0.10（兜底/单实例/数据层）风险最低。
