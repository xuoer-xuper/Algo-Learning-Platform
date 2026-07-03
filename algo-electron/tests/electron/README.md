# Electron Tests

## 1. 职责

`tests/electron/` 覆盖真实 Electron 启动链路、preload 白名单和 WebContentsView 基础可用性。

## 2. 当前覆盖

- `startupSmoke.test.ts`：bundle 真实 main/preload/OJ preload，使用临时 `userData` 启动 Electron，验证主窗口、基础 IPC、默认 URL 标签和 WebContentsView 加载。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\electron\startupSmoke.test.ts
```

## 4. 新增规则

修改启动顺序、窗口创建、IPC 注册时机、preload 路径、`TabManager` 初始化或 smoke 专用环境变量时，需要扩展这里。测试必须使用临时目录，不触碰真实登录态。
