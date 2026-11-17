# Shared Types

## 1. 职责

`src/shared/types/` 存放渲染层与主进程共享的类型与校验定义。当前内容：

- `ipc/`——每个带参 IPC channel 的输入 schema（zod），按业务域拆分，见该目录 README。
- `data.ts`——八个逻辑失效域的 `DataTable` 与 `DataChangedPayload`，只包含域名，不包含用户数据。
- `<域>.ts`（problem/submission/stats/coach/browser/scripts/sites/credentials/cookies/
  notes/backup/ai/rating/config/window）——数据库实体的 IPC 输出形状与主进程→渲染层
  事件负载（zod schema + `z.infer`，仅编译期用的标量联合是纯 `export type`）。
  阶段 2 R2 从 `electron/electron-env.d.ts`（已删除）收口而来；`*Result` 输出联合
  用 `common.ts` 的 `IpcOutput<T>` 推导。

## 2. 当前实现程度

阶段 1 落地 `ipc/` 输入 schema（替换自研 payloadSchema 组合子）；阶段 2 R2 把
channel 常量（`../constants/`）与全部跨进程域类型迁入本目录，跨文件同名类型
（`grep -rhoE "^export (interface|type) \w+" electron src | sort | uniq -d`）清零。
阶段 3 引入 Drizzle 后，`$inferSelect` 与这里的实体输出 schema 对照、procedures 负责转换。

R5 的所有时间点（包含诊断、下载、待安装与 Coach 快照）采用 Unix 毫秒整数，schema 使用
`z.number().int()` 并保留原 optional/nullability。`local_day` 等日历键仍为字符串，时长维持
各自声明的单位；renderer 只在展示边界调用 `@shared/time` 格式化，不解析旧时间字符串。

## 3. 边界与维护规则

- 类型文件零 electron 运行时依赖（可以 `import type` 引 electron 侧类型，但不得引入会在渲染层打包的 electron 运行时模块）。
- 纯类型 import 必须写 `import type`（`verbatimModuleSyntax`）。

## 4. 验证入口

- 类型层：`pnpm typecheck` / `pnpm typecheck:tests`。
- schema 等价性与拒绝路径：`pnpm exec vitest run tests/ipc`。
- 架构守卫（schema 声明覆盖、raw 棘轮）：`pnpm test:architecture`。
