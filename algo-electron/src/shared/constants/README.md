# Shared Constants

## 1. 职责

`src/shared/constants/` 存放渲染层与主进程共享的封闭枚举常量。当前内容：

- `errorCodes.ts`——IPC 失败返回的 `code` 封闭集（VALIDATION / NOT_FOUND / CONFLICT / IO / EXTERNAL / FORBIDDEN），消费方见 `src/shared/types/common.ts` 的 `createOutputSchema`。

## 2. 当前实现程度

阶段 1 随 IPC 返回形状统一落地；新 code 必须先加入 `ERROR_CODE_VALUES` 元组（schema 按 `z.enum` 拒绝未知值）。

## 3. 边界与维护规则

- 只放"值封闭、双端共用"的常量；单端使用的字面量留在使用方。
- 值一经发布即视为 API：改名/删值是破坏性变更，需同步所有返回点与消费点。

## 4. 验证入口

- `pnpm exec vitest run tests/ipc`（`ipcOutputShapes.test.ts` 固定 code 集与拒绝行为）。
