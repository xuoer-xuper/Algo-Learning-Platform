# Main Process (src/main)

## 1. 职责

`src/main/` 存放模板布局下的新主进程模块与环境声明，不可由渲染层直接访问：

- `env.d.ts`——`ProcessEnv` 增强（`APP_ROOT`、`VITE_PUBLIC` 等构建期注入变量），从阶段 1 前的 `electron-env.d.ts` 迁入（该文件已在阶段 2 删除）。
- `db/`——发布加固的旧迁移台账、物理 schema 校验及错误诊断辅助模块。
- `services/backup/lib/`——配置原字节保护与数据库升级尝试记录；不是完整 profile 备份功能。

## 2. 当前实现程度

发布加固仅增加必要小模块，数据库生命周期仍由 `electron/db/connection.ts` 拥有，配置入口仍在 `electron/app/config.ts`。这不表示阶段 3 的 Drizzle 或整个主进程迁移已合入，也不证明恢复/发行验收已完成。

## 3. 边界与维护规则

- 新模块遵循主进程数据库/服务分层；不得把纯共享类型放到主进程专属模块后由渲染层导入。
- 不在此扩大到任意路径恢复、全 profile 快照或自动覆盖升级后的新数据。
- 新增 env 变量必须在此声明，否则 `process.env.X` 在两个 typecheck 程序里都是 `string | undefined` 之外的报错源。

## 4. 验证入口

- `pnpm typecheck` / `pnpm typecheck:tests`（env 声明的正向/反向编译验证见 `tests/electron/mainStartupContract.test.ts`）。
