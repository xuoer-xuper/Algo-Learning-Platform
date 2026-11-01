# Shared Types

## 1. 职责

`src/shared/types/` 存放渲染层与主进程共享的类型与校验定义。当前内容：

- `ipc/`——每个带参 IPC channel 的输入 schema（zod），按业务域拆分，见该目录 README。

## 2. 当前实现程度

阶段 1 落地 `ipc/` 输入 schema（替换自研 payloadSchema 组合子）；阶段 2 会把 channel 常量与更多跨进程类型迁入本目录。

## 3. 边界与维护规则

- 类型文件零 electron 运行时依赖（可以 `import type` 引 electron 侧类型，但不得引入会在渲染层打包的 electron 运行时模块）。
- 纯类型 import 必须写 `import type`（`verbatimModuleSyntax`）。

## 4. 验证入口

- 类型层：`pnpm typecheck` / `pnpm typecheck:tests`。
- schema 等价性与拒绝路径：`pnpm exec vitest run tests/ipc`。
- 架构守卫（schema 声明覆盖、raw 棘轮）：`pnpm test:architecture`。
