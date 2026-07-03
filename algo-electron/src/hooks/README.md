# Hooks 模块说明

## 1. 职责

`src/hooks/` 存放 renderer 应用壳或跨组件复用的轻量 React hooks。Hook 可以编排 UI 状态并通过本目录 helper 调用已有 preload 能力，但不能包含数据库、Cookie、站点解析或提交监测业务规则。

## 2. 当前 hook

- `useAppModalState.ts`
  - 维护设置、统计、脚本、题目详情和笔记弹层的打开状态。
  - 打开非首页 modal 前捕获浏览器预览图并隐藏真实 `WebContentsView`。
  - 关闭 modal 时清理预览背景，并在非首页恢复浏览器 view。
- `useBrowserViewVisibility.ts`
  - 根据首页状态和 modal 预览背景控制真实 `WebContentsView` 显隐。
  - 首页隐藏浏览器 view，非首页且没有 modal 背景时恢复浏览器 view。
  - 保持 React 页面和 Electron view 的覆盖关系集中在应用级 hook 内。
- `useBrowserNavigation.ts`
  - 维护浏览器 URL、首页状态、侧栏宽度和当前页同步提示。
  - 封装地址栏跳转、首页、前进、后退、刷新、URL 变化监听、侧栏宽度同步和当前页提交抓取。
  - 将 App 壳层的浏览器 IPC 调用集中到一个应用级 hook。
- `browserShellApi.ts`
  - 封装浏览器预览、`WebContentsView` 显隐、URL 监听、导航、侧栏宽度和当前页提交抓取 preload 调用。
  - 只服务应用壳 hooks，不保存 React state，不包含站点解析、提交监测或数据库规则。

## 3. 边界规则

- Hook 只封装 renderer 状态机和 UI 编排。
- Hook 内部优先调用 `browserShellApi.ts` 等本目录 helper，不直接散落新的 `window.electronAPI` 调用。
- 新增 IPC 调用必须先确认 `electron/preload.ts` 和 `electron/electron-env.d.ts` 已声明。
- 不在 hook 内读取 Cookie、SQLite、文件系统或网页 DOM。
- 对业务域强绑定的 hook 优先放在对应 `features/{domain}/` 内；只有应用壳或跨 feature 使用的 hook 放在这里。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及 modal、浏览器 view 显隐或导航时，还需要 `npm run dev` 手测对应入口。
