# IPC Tests

## 1. 职责

`tests/ipc/` 覆盖 preload 白名单、IPC channel 映射、主进程 handler 注册和 renderer 访问边界。

## 2. 当前覆盖

- `ipcContracts.test.ts`：静态验证公开 send/invoke channel 都有主进程 handler，事件订阅有发送源，并确认 renderer 不能拿到通用 `ipcRenderer` 或内部 channel。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\ipc\ipcContracts.test.ts
```

## 4. 新增规则

新增、删除或改名 IPC/Preload API 时必须更新这里，同时同步 `electron/preload.ts`、`electron/electron-env.d.ts`、renderer helper 和 `electron/ipc/README.md`。
