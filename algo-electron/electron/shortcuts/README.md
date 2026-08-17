# Browser Shortcut Dispatcher

## 1. 职责

`shortcutDispatcher.ts` 是壳与 OJ view 共用的浏览器快捷键词汇表，负责
统一解析和分发，不让快捷键逻辑散落在页面或站点脚本中。

## 2. 当前实现程度

当前实现覆盖以下浏览器命令：

- `Ctrl/Cmd+T`: create a tab
- `Ctrl/Cmd+W`: close the active tab
- `Ctrl/Cmd+Tab` and `Ctrl/Cmd+Shift+Tab`: move to the next/previous tab
- `Ctrl/Cmd+1..8`: activate a tab by position
- `Ctrl/Cmd+L`: focus and select the shell address bar through `ui:command`
- `F5` or `Ctrl/Cmd+R`: reload the active OJ tab
- `Ctrl/Cmd+=`, `Ctrl/Cmd+-`, `Ctrl/Cmd+0`: adjust/reset active-tab zoom
- `Alt+Left` and `Alt+Right`: navigate history
- `Ctrl/Cmd+Shift+I` or `F12`: toggle the shell DevTools window

## 3. 封装入口与关键文件

`shortcutDispatcher.ts` is the single browser shortcut vocabulary for the
frameless shell and every OJ `WebContentsView`. It contains only pure key
normalisation and injected command dispatch; Electron window state stays in
`main.ts` and `TabManager`.

关键入口为 `resolveShortcut()`、`dispatchShortcut()`、
`electron/main.ts` 的壳绑定和 `electron/browser/TabManager.ts` 的 view
绑定。

## 4. 边界规则

The main process calls `event.preventDefault()` only after a command is
resolved, so ordinary page text input remains untouched. The native menu is
explicitly set to an empty template to prevent Electron `default_app` menu
accelerators from closing the frameless window.

## 5. 验证入口

```powershell
cd algo-electron
npx vitest run tests/shortcuts tests/ipc/ipcContracts.test.ts
```
