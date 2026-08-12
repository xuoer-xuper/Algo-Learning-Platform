# UI Tests

## 1. 职责

`tests/ui/` 覆盖 renderer 关键页面截图验收，主要检查布局边界、统计图渲染和敏感文本泄漏。

## 2. 当前覆盖

- `rendererScreenshotHarness.tsx`：注入 mock `window.electronAPI` 的截图 harness。
- `rendererScreenshots.test.ts`：用与产品一致的无边框 Electron 窗口捕获题库侧栏、统计页、设置页、LLM 设置、Coach 指标和笔记编辑器截图。测试将窗口尺寸作为宽、中、窄三种代表性夹具，始终按实际测得的 `.content-area`、`.modal-workspace` 和 `.modal-panel` 容器宽度验证布局，不把任何桌面分辨率当成产品契约；同时检查横向越界、容器边界、网格折叠、图表/编辑器实际渲染、ErrorBoundary 和敏感字段。

## 3. 运行方式

```powershell
cd algo-electron
npm run test:ui
```

截图分别输出在 `tmp/ui-screenshots/wide/`、`tmp/ui-screenshots/medium/` 和 `tmp/ui-screenshots/narrow/`，只用于本地验收，不提交。

可以同时设置 `ALP_SCREENSHOT_WINDOW_WIDTH` 和 `ALP_SCREENSHOT_WINDOW_HEIGHT` 验证其他原生窗口尺寸；测试下限直接复用主窗口的 `MAIN_WINDOW_BOUNDS`，当前为 `800×600`。

## 4. 新增规则

修改全局布局、统计页图表、设置页、题目侧栏或 modal 显隐逻辑时，优先扩展这里。mock 数据不能包含 Cookie、token、真实登录态或用户源码。
