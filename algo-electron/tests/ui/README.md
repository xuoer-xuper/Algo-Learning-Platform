# UI Tests

## 1. 职责

`tests/ui/` 覆盖 renderer 关键页面截图验收，主要检查布局边界、统计图渲染和敏感文本泄漏。

## 2. 当前覆盖

- `rendererScreenshotHarness.tsx`：注入 mock `window.api`（域分组形状，类型指向 preload 的 `typeof api`）的截图 harness；内部页 URL 与标题直接复用生产 `internalPage` 契约，标签列表、切换、排序和关闭行为由 mock 事件模型驱动。
- `rendererScreenshots.pw.spec.ts`：由 Playwright Test 驱动与产品一致的无边框 Electron 窗口。壳面流程捕获 Omnibox 全内容区建议和题库侧栏；内部页流程覆盖学习统计、设置、脚本管理、Coach 指标、题目详情、本地笔记六类标签，并额外捕获 LLM 设置区域。每类内部页都验证新标签数量、活动标签 ARIA、`algo://` 地址栏、切回首页、再次激活和标签关闭，不再依赖截图浮层或页面面板假设。
- 笔记流程在三档窗口中直接切换到另一题的笔记标签，确认编辑器先清空，再通过真实 Milkdown 编辑和自动保存验证新内容只写入新题笔记，原笔记正文保持不变。
- 宽、中、窄窗口只是代表性夹具；布局断言读取实际 `.content-area`、`.main-content` 和 `.shell-route-*` 容器尺寸，不把桌面分辨率当成产品契约。测试同时检查 Omnibox 打开时摘除内容区和侧栏、Escape 后恢复、横向越界、网格折叠、图表/编辑器渲染、ErrorBoundary 和敏感字段，并在窄窗口真实创建 13 个标签验证横向溢出、空白窗口拖动区和 pointer 排序。
- `electronScreenshotApp.mjs`：Playwright 专用 Electron 主进程入口，不访问真实 userData、OJ 登录态或网络。
- `coachPetHarness.tsx` / `coachPetMouseCapture.pw.spec.ts`：真实透明 Electron 窗口中的生产桌宠组件，验证本体、气泡、自由对话与透明空白的命中区域，并实际调用原生 `setIgnoreMouseEvents`；截图输出到 `tmp/coach-pet-ui/`。该用例验证原生开关与 Chromium 几何边界，跨应用真实鼠标、DPI 和多屏拖拽仍需手测。
- 原生交互夹具先等待窗口可见、原生聚焦及 document focus；透明窗口放到屏幕内且避开实际桌面光标，避免 CDP 虚拟输入与原生转发混用。捕获断言读取主进程同步应用的状态，而非异步回执后的 Node 镜像；新增延迟旧回执回归，失败附原生状态/鼠标事件诊断，不关闭 forwarding 或放宽断言。
- `native-input-diagnostics.ts`：截图窗口保留最近256条pointer/capture/DnD/focus与finishDrag调用/结果记录；热路径不读布局。原生就绪或拖拽断言失败时，在关闭窗口前附加renderer记录及visible/focused/minimized/loading/cursor/bounds快照；采集/附件各有2秒上限，失败不替换原断言错误。包装保留API的this、参数、返回promise和值/异常；观察拒绝会将promise标记为已处理，不宣称保留全局unhandledrejection行为。该功能仅增补证据，不修复尚未定位的瞬时输入问题，不增加重试/强制focus或替代拖拽。
- `native-input-diagnostics.test.ts`：验证记录容量、无热路径布局读取、API返回/异常透明性、清理、可序列化eval函数、只读快照及失败附件保留原错误。
- `dataRefresh.pw.spec.ts`：临时 SQLite 中的真实 Codeforces 同步链路验收。`dataRefreshMain.ts` 使用生产 SyncService、batch writer、带 sender/schema 校验的 IPC 注册、preload 和数据广播 bridge；测试仅替换预期 Codeforces HTTP 响应且禁止外网。`dataRefreshHarness.tsx` 同时挂载生产 Dashboard 和 ProblemDetail，验证提交后两秒内自动更新且不重挂载。窗口隐藏，context isolation/sandbox 保持开启，userData 在任何 DB/logger 初始化前重定向到 `tmp/` 并在退出后清理，不访问实际学习数据或登录态。

## 3. 运行方式

```powershell
cd algo-electron
pnpm run test:ui
```

截图分别输出在 `tmp/ui-screenshots/wide/`、`tmp/ui-screenshots/medium/` 和 `tmp/ui-screenshots/narrow/`，只用于本地验收，不提交。

失败 trace 输出在 `tmp/playwright/`，可使用 `npx playwright show-trace <trace.zip>` 查看操作、DOM 和截图。

可以同时设置 `ALP_SCREENSHOT_WINDOW_WIDTH` 和 `ALP_SCREENSHOT_WINDOW_HEIGHT` 验证其他原生窗口尺寸；测试下限直接复用主窗口的 `MAIN_WINDOW_BOUNDS`，当前为 `800×600`。

## 4. 新增规则

修改全局布局、Omnibox、统计页图表、设置页、题目侧栏或内部页标签切换时，优先扩展这里。内部页断言必须以 `.shell-route-*`、活动 tab 和受控 `algo://` 地址为边界，不重新引入浮窗容器或截图背景契约。mock 建议只使用本地历史与题目数据，其他 mock 数据也不能包含 Cookie、token、真实登录态或用户源码。
