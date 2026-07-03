# UI Tests

## 1. 职责

`tests/ui/` 覆盖 renderer 关键页面截图验收，主要检查布局边界、统计图渲染和敏感文本泄漏。

## 2. 当前覆盖

- `rendererScreenshotHarness.tsx`：注入 mock `window.electronAPI` 的截图 harness。
- `rendererScreenshots.test.ts`：用 Electron 捕获题库侧栏、统计页、设置页截图，并检查横向越界、平台分布图形和敏感字段。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

截图输出在 `tmp/ui-screenshots/`，只用于本地验收，不提交。

## 4. 新增规则

修改全局布局、统计页图表、设置页、题目侧栏或 modal 显隐逻辑时，优先扩展这里。mock 数据不能包含 Cookie、token、真实登录态或用户源码。
