# UI Tests

## 1. 职责

`tests/ui/` 覆盖 renderer 关键页面截图验收，主要检查布局边界、统计图渲染和敏感文本泄漏。

## 2. 当前覆盖

- `rendererScreenshotHarness.tsx`：注入 mock `window.electronAPI` 的截图 harness。
- `rendererScreenshots.test.ts`：用 Electron 捕获题库侧栏、统计页、设置页、LLM 设置、Coach 指标和笔记编辑器截图，并在固定的 1280×900 CSS viewport 下检查横向越界、图表/编辑器实际渲染、ErrorBoundary 和敏感字段。虚拟屏幕较小时会调整 zoom factor，避免宿主显示器尺寸改变布局基线。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

截图输出在 `tmp/ui-screenshots/`，只用于本地验收，不提交。

可以用 `ALP_SCREENSHOT_WINDOW_WIDTH` 和 `ALP_SCREENSHOT_WINDOW_HEIGHT` 模拟较小的 CI 虚拟屏幕；布局 viewport 仍必须归一化到基线尺寸。

## 4. 新增规则

修改全局布局、统计页图表、设置页、题目侧栏或 modal 显隐逻辑时，优先扩展这里。mock 数据不能包含 Cookie、token、真实登录态或用户源码。
