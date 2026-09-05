# UI Tests

## 1. 职责

`tests/ui/` 覆盖 renderer 关键页面截图验收，主要检查布局边界、统计图渲染和敏感文本泄漏。

## 2. 当前覆盖

- `rendererScreenshotHarness.tsx`：注入 mock `window.electronAPI` 的截图 harness；内部页 URL 与标题直接复用生产 `internalPage` 契约，标签列表、切换、排序和关闭行为由 mock 事件模型驱动。
- `rendererScreenshots.pw.spec.ts`：由 Playwright Test 驱动与产品一致的无边框 Electron 窗口。壳面流程捕获 Omnibox 全内容区建议和题库侧栏；内部页流程覆盖学习统计、设置、脚本管理、Coach 指标、题目详情、本地笔记六类标签，并额外捕获 LLM 设置区域。每类内部页都验证新标签数量、活动标签 ARIA、`algo://` 地址栏、切回首页、再次激活和标签关闭，不再依赖截图浮层或页面面板假设。
- 笔记流程在三档窗口中直接切换到另一题的笔记标签，确认编辑器先清空，再通过真实 Milkdown 编辑和自动保存验证新内容只写入新题笔记，原笔记正文保持不变。
- 宽、中、窄窗口只是代表性夹具；布局断言读取实际 `.content-area`、`.main-content` 和 `.shell-route-*` 容器尺寸，不把桌面分辨率当成产品契约。测试同时检查 Omnibox 打开时摘除内容区和侧栏、Escape 后恢复、横向越界、网格折叠、图表/编辑器渲染、ErrorBoundary 和敏感字段，并在窄窗口真实创建 13 个标签验证横向溢出、空白窗口拖动区和 pointer 排序。
- `electronScreenshotApp.mjs`：Playwright 专用 Electron 主进程入口，不访问真实 userData、OJ 登录态或网络。
- `coachPetHarness.tsx` / `coachPetMouseCapture.pw.spec.ts`：真实透明 Electron 窗口中的生产桌宠组件，验证本体、气泡、自由对话与透明空白的命中区域，并实际调用原生 `setIgnoreMouseEvents`；截图输出到 `tmp/coach-pet-ui/`。该用例验证原生开关与 Chromium 几何边界，跨应用真实鼠标、DPI 和多屏拖拽仍需手测。

## 3. 运行方式

```powershell
cd algo-electron
npm run test:ui
```

截图分别输出在 `tmp/ui-screenshots/wide/`、`tmp/ui-screenshots/medium/` 和 `tmp/ui-screenshots/narrow/`，只用于本地验收，不提交。

失败 trace 输出在 `tmp/playwright/`，可使用 `npx playwright show-trace <trace.zip>` 查看操作、DOM 和截图。

可以同时设置 `ALP_SCREENSHOT_WINDOW_WIDTH` 和 `ALP_SCREENSHOT_WINDOW_HEIGHT` 验证其他原生窗口尺寸；测试下限直接复用主窗口的 `MAIN_WINDOW_BOUNDS`，当前为 `800×600`。

## 4. 新增规则

修改全局布局、Omnibox、统计页图表、设置页、题目侧栏或内部页标签切换时，优先扩展这里。内部页断言必须以 `.shell-route-*`、活动 tab 和受控 `algo://` 地址为边界，不重新引入浮窗容器或截图背景契约。mock 建议只使用本地历史与题目数据，其他 mock 数据也不能包含 Cookie、token、真实登录态或用户源码。
