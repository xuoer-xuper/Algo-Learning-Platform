# IPC Input Schemas

## 1. 职责

每个带参 IPC channel 的输入 schema（zod），按业务域一个文件，与 `electron/ipc/register*Ipc.ts` 一一对应；`electron/ipc/trustedSender.ts` 按位 `safeParse`，失败抛 `IpcPayloadError`（fail-closed，handler 不进入）。

## 2. 当前实现程度

- **命名**：导出元组以 `Input` 结尾（如 `getTrendsInput`），架构守卫（`tests/architecture/guards.mjs` 的 `countUnschemadIpc`）按该后缀识别"已声明 schema"的 handler。
- **形状**：`as const` 元组，按 handler 形参顺序排列。
- **`strict()`**：对象入参拒绝多余字段（白名单语义，如 `coach:saveConfig`）。
- **`z.unknown()` 棘轮**：无形状放行必须给理由，全仓上限 `RAW_IPC_SCHEMA_BUDGET = 4`（现都在 `browser.ts`），只减不增。
- **上限来源注释**：URL 4096、FQDN 253、标识符 200 等口径沿用旧 `payloadSchema` 的依据，改上限必须先改注释里的出处。

## 3. 边界与维护规则

- 域文件零 electron 运行时依赖（可 `import type` 引类型）；新增 import 前先确认传递闭包不含 electron。
- 改任何 schema 的语义边界（类型/上下限/拒绝集合）必须同步 `tests/ipc/ipcSchemas.test.ts` 的 Good/Bad 用例。

## 4. 验证入口

- `pnpm exec vitest run tests/ipc`（等价性与拒绝路径）。
- `pnpm test:architecture`（声明覆盖 + raw 棘轮反向验证在 `tests/architecture/guards.test.ts`）。
