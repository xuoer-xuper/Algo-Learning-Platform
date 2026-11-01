# Main-process Shared (src/main)

## 1. 职责

`src/main/` 存放主进程侧、随渲染/共享代码一起由 Vite 处理的环境声明文件：

- `env.d.ts`——`ProcessEnv` 增强（`APP_ROOT`、`VITE_PUBLIC` 等构建期注入变量），从阶段 1 前的 `electron-env.d.ts` 迁入（该文件已在阶段 2 删除）。

## 2. 当前实现程度

仅环境声明；阶段 3 会把 `electron/` 的主进程代码迁到 `src/main/` 目录布局（本目录将随之成为主进程代码本体，见迁移计划阶段 3.1–3.4）。

## 3. 边界与维护规则

- 只放环境声明（`*.d.ts`）与主进程共享代码，不放业务逻辑。
- 新增 env 变量必须在此声明，否则 `process.env.X` 在两个 typecheck 程序里都是 `string | undefined` 之外的报错源。

## 4. 验证入口

- `pnpm typecheck` / `pnpm typecheck:tests`（env 声明的正向/反向编译验证见 `tests/electron/mainStartupContract.test.ts`）。
