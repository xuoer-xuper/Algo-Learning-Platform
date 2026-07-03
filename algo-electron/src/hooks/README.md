# Hooks 模块说明

## 1. 职责

`src/hooks/` 存放 renderer 应用壳或跨组件复用的轻量 React hooks。Hook 可以编排 UI 状态和调用已有 `window.electronAPI` 能力，但不能包含数据库、Cookie、站点解析或提交监测业务规则。

## 2. 当前 hook

- `useAppModalState.ts`
  - 维护设置、统计、脚本、题目详情和笔记弹层的打开状态。
  - 打开非首页 modal 前捕获浏览器预览图并隐藏真实 `WebContentsView`。
  - 关闭 modal 时清理预览背景，并在非首页恢复浏览器 view。

## 3. 边界规则

- Hook 只封装 renderer 状态机和 UI 编排。
- 新增 IPC 调用必须先确认 `electron/preload.ts` 和 `electron/electron-env.d.ts` 已声明。
- 不在 hook 内读取 Cookie、SQLite、文件系统或网页 DOM。
- 对业务域强绑定的 hook 优先放在对应 `features/{domain}/` 内；只有应用壳或跨 feature 使用的 hook 放在这里。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及 modal、浏览器 view 显隐或导航时，还需要 `npm run dev` 手测对应入口。
