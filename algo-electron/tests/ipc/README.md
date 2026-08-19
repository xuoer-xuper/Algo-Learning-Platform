# IPC Tests

## 1. 职责

`tests/ipc/` 覆盖 preload 白名单、IPC channel 映射、主进程 handler 注册和 renderer 访问边界。

## 2. 当前覆盖

- `ipcContracts.test.ts`：静态验证公开 send/invoke channel 都有主进程 handler，事件订阅有发送源（含 `userscript:hostPermissionRequested`），并确认 renderer 不能拿到通用 `ipcRenderer` 或内部 channel。
- `registerScriptsIpc.test.ts`：覆盖父窗口绑定、导入创建/覆盖/副本/取消、legacy 原子认领、源文件保护、版本确认默认值和 `scripts:save` 白名单。
- `registerBrowserShellIpc.test.ts`：覆盖 Omnibox 内部页/搜索/危险协议三分流、面板摘挂 payload 校验、原生 AppMenu 坐标白名单，以及按 sender owner 路由的用户脚本 host prompt 查询/回执。

## 3. 运行方式

```powershell
cd algo-electron
npm exec vitest -- run tests/ipc
```

## 4. 新增规则

新增、删除或改名 IPC/Preload API 时必须更新这里，同时同步 `electron/preload.ts`、`electron/electron-env.d.ts`、renderer helper 和 `electron/ipc/README.md`。
