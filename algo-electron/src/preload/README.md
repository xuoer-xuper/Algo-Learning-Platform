# Preload 模块说明

## 1. 职责

`src/preload/index.ts` 是 renderer 唯一的跨进程入口：以域分组的 `api` 对象（17 个域 +
`browserLayout` 布局常量）经 `contextBridge.exposeInMainWorld('api', api)` 暴露白名单能力，
并以 `declare global { interface Window { api: typeof api } }` 让 renderer 类型直接从实现推导
（删掉任何一个方法，对应调用点当场 tsc 报错）。

`as Promise<X>` 全仓只允许出现在本文件——`ipcRenderer.invoke` 返回 `Promise<any>`，这里是
唯一合法的断言点，X 一律来自 `../shared/types/`。

## 2. 当前内容

- `index.ts`
  - 域分组 `api` 对象：`browser` / `tab` / `window` / `problem` / `submissions` / `cookies` /
    `credentials` / `stats` / `ai` / `notes` / `sites` / `scripts` / `backup` / `config` /
    `rating` / `coach` / `data`。
  - `data.onChanged`：订阅 `{ tables: DataTable[] }` 逻辑域失效通知；`problem.onUpdated` 保留原无 payload 契约一版，已标记 deprecated，新页面不应再订阅。
  - `subscribe<T>(channel: IpcChannel)`：主进程 → 渲染进程订阅的统一形态（剥 event、返回退订
    函数）；全部 `on*` 方法经此，`ipcRenderer.on/off` 只在这里各出现一次。
  - `InputOf<S>`：单对象通道的参数类型从 `../shared/types/ipc/*` 的 zod schema 推导
    （type-only import，运行时零开销）。
  - `browserLayout`：唯一的非函数成员，`main.tsx` 同步读取的布局常量。

## 3. 边界规则

- 不暴露通用 `ipcRenderer` / `send` / `invoke` 能力（架构守卫 + `tests/ipc/preloadSurface` 双层拦截）。
- 多参数 invoke 在阶段 2 R3 已收成单对象参数；任何方法至多转发一个实参（preloadSurface 按
  此断言）。
- 每个暴露的方法必须有渲染层调用者：`tests/ipc/apiConsumers.test.ts` 守住零基线，删方法先删
  调用点，加方法必须带调用点一起提。唯一兼容豁免为待下版删除的 `problem.onUpdated`。
- channel 名一律引用 `../shared/constants/channels.ts` 的 `IPC_CHANNELS`（R1 守卫：字面量预算 0）。
- channel 字符串值即契约，不改名；新增 IPC 按
  channel 常量 → `src/shared/types/ipc/` 输入 schema → `src/shared/types/` 输出类型 → 本文件
  域方法 → renderer 调用点（`*Api.ts` 或 `src/hooks/`）的顺序成套落。

## 4. 验证入口

```powershell
cd algo-electron
pnpm run typecheck
npx vitest run tests/ipc/preloadSurface.test.ts tests/ipc/ipcContracts.test.ts tests/ipc/apiConsumers.test.ts
pnpm run test:electron
```
