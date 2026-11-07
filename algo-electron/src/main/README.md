# Main-process Shared (src/main)

## 1. 职责

`src/main/` 存放主进程侧、随渲染/共享代码一起由 Vite 处理的环境声明文件：

- `env.d.ts`——`ProcessEnv` 增强（`APP_ROOT`、`VITE_PUBLIC` 等构建期注入变量），从阶段 1 前的 `electron-env.d.ts` 迁入（该文件已在阶段 2 删除）。

## 2. 当前实现程度

环境声明及阶段3 A0的`db/`基础：完整Drizzle schema与无副作用客户端包装。现有`electron/`入口、连接生命周期、repository和迁移仍保持原位，后续分批迁移。

## 3. 边界与维护规则

- 只放主进程模块和环境声明，不放renderer组件；`db/`目前不在import时开库或接管迁移。
- 新增 env 变量必须在此声明，否则 `process.env.X` 在两个 typecheck 程序里都是 `string | undefined` 之外的报错源。

## 4. 验证入口

- `pnpm typecheck` / `pnpm typecheck:tests`（env 声明的正向/反向编译验证见 `tests/electron/mainStartupContract.test.ts`）。
