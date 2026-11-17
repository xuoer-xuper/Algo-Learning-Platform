# Main Process (src/main)

## 1. 职责

`src/main/` 存放模板布局下的新主进程模块与环境声明，不可由渲染层直接访问：

- `env.d.ts`：`ProcessEnv` 增强（`APP_ROOT`、`VITE_PUBLIC` 等构建期变量），从旧 `electron-env.d.ts` 迁入。
- `db/`：Drizzle schema、既有连接包装、可信迁移资源及台账协调，同时保留发布加固的历史/物理 schema 校验、错误诊断和显式恢复模块。
- `services/backup/lib/`：配置原字节保护与数据库升级尝试记录；不是完整 profile 备份功能。

## 2. 当前实现程度

阶段 3 已有 Drizzle A0/A1 基础及题目总览、平台键查找、upsert 三个有界查询切片；本轮正在同步 2.0.1 的升级安全机制。连接生命周期仍由 `electron/db/connection.ts` 拥有，配置入口仍在 `electron/app/config.ts`，其余 repository 和主进程目录按计划逐批迁移。当前分支不是已发布 2.0.1，也不表示 Drizzle 或整个阶段 3 已完成验收。

## 3. 边界与维护规则

- 新模块遵循主进程数据库/服务分层；纯共享类型不得置于主进程专属模块后由渲染层导入。
- `createDrizzleClient` 只包装已打开连接，不在 import 时开库或创建第二个用户库；迁移通过连接拥有者的安全入口执行。
- 不扩大到任意路径恢复、全 profile 快照或自动覆盖升级后新增数据。
- 新增 env 变量必须在 `env.d.ts` 声明，并通过两个 typecheck 程序。

## 4. 验证入口

- `pnpm typecheck` / `pnpm typecheck:tests`；环境声明的编译验证见 `tests/electron/mainStartupContract.test.ts`。
- 数据库及恢复检查见 [db/README](db/README.md)，打包与安装检查见 [tests/packaging/README](../../tests/packaging/README.md)。
