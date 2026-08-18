# UI Tests

## 1. 职责

`tests/ui/` 覆盖 renderer 关键页面截图验收，主要检查布局边界、统计图渲染和敏感文本泄漏。

## 2. 当前覆盖

- `rendererScreenshotHarness.tsx`：注入 mock `window.electronAPI` 的截图 harness。
- `rendererScreenshots.pw.spec.ts`：由 Playwright Test 驱动与产品一致的无边框 Electron 窗口，捕获 Omnibox 全内容区建议、题库侧栏、统计页、设置页、LLM 设置、Coach 指标和笔记编辑器截图。宽、中、窄窗口只是代表性夹具；断言读取实际 `.content-area`、`.main-content` 和 `.shell-route-*` 容器尺寸，不把桌面分辨率当成产品契约。测试同时检查 Omnibox 打开时摘除内容区和侧栏、Escape 后恢复、横向越界、网格折叠、图表/编辑器渲染、ErrorBoundary 和敏感字段，并在窄窗口真实创建 13 个标签验证横向溢出、空白窗口拖动区和 pointer 排序。
- `electronScreenshotApp.mjs`：Playwright 专用 Electron 主进程入口，不访问真实 userData、OJ 登录态或网络。

## 3. 运行方式

```powershell
cd algo-electron
npm run test:ui
```

截图分别输出在 `tmp/ui-screenshots/wide/`、`tmp/ui-screenshots/medium/` 和 `tmp/ui-screenshots/narrow/`，只用于本地验收，不提交。

失败 trace 输出在 `tmp/playwright/`，可使用 `npx playwright show-trace <trace.zip>` 查看操作、DOM 和截图。

可以同时设置 `ALP_SCREENSHOT_WINDOW_WIDTH` 和 `ALP_SCREENSHOT_WINDOW_HEIGHT` 验证其他原生窗口尺寸；测试下限直接复用主窗口的 `MAIN_WINDOW_BOUNDS`，当前为 `800×600`。

## 4. 新增规则

修改全局布局、Omnibox、统计页图表、设置页、题目侧栏或内部页标签切换时，优先扩展这里。mock 建议只使用本地历史与题目数据，其他 mock 数据也不能包含 Cookie、token、真实登录态或用户源码。
