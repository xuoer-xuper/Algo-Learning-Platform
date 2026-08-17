# 快捷键测试

## 1. 职责

`tests/shortcuts/` 覆盖浏览器壳快捷键的解析和命令分发契约，确保壳
`BrowserWindow` 与 OJ `WebContentsView` 使用同一套快捷键语义。

## 2. 当前覆盖范围

- `shortcutDispatcher.test.ts`：覆盖新建/关闭/切换标签、地址栏聚焦、刷新、缩放、历史导航、DevTools 和无效输入忽略。
- 测试只验证纯快捷键模块，不启动真实 Electron；启动时机与真实 WebContents 事件由 Electron smoke 测试覆盖。

## 3. 关键文件

- `electron/shortcuts/shortcutDispatcher.ts`：快捷键解析和注入式命令分发入口。
- `electron/main.ts`：壳窗口快捷键绑定与命令执行。
- `electron/browser/TabManager.ts`：OJ view 快捷键绑定、标签切换和缩放动作。

## 4. 边界规则

- 新增快捷键必须先进入纯解析器，再由主进程注入动作；不要在 renderer 或站点脚本中复制快捷键判断。
- 未解析的按键不得调用 `preventDefault()`，避免破坏网页正常输入。
- 测试不得读取真实用户数据或启动共享登录态。

## 5. 验证入口

```powershell
cd algo-electron
npx vitest run tests/shortcuts
```
