# Drizzle 数据库基础

## 1. 职责

描述 migration 030 后的完整 SQLite 结构，为已经打开的连接提供 typed ORM 包装，并安全接管 legacy 迁移之后的 Drizzle 台账与迁移资源。

## 2. 当前实现

25 张表包含旧迁移台账，82 个时间点使用 `timestamp_ms`。生产仍由 `electron/db/connection.ts` 拥有连接、pragma、备份、恢复和关闭；默认异步安全入口在 001–030 后验证结构并登记 Drizzle 基线。

同步 `initDbAtPath` 与显式 `options.migrations`（包括空数组）保持 legacy-only 测试语义。应用 repository 的逐域 ORM 改写不属于 A1，不能把迁移器接入误称为所有查询已完成转换。

## 3. 关键文件

- `schema.ts`：精确保留列、默认值、空值、主键、唯一/部分索引、CHECK 与外键。
- `client.ts`：`createDrizzleClient(sqlite)` 只包装传入的 `better-sqlite3` 连接，无 import-time 开库、第二连接或关闭行为。
- `migration-resources.ts`：在打开目标库之前验证编译固定的 tag、时间戳、SQL SHA256 与 journal，按开发 appRoot / 打包 resources 路径解析资源，不回退到 cwd。
- `schema-validation.ts`：在内存库中解析可信基线，对比完整物理结构与约束，并检查外键和数据库完整性；不打开第二个用户库。
- `migrate.ts`：验证两套连续台账，安全登记基线，再委托固定版本 Drizzle migrator 执行后续迁移。
- 根目录 `drizzle.config.ts`：供 `pnpm db:generate` 显式生成 SQL，不连接用户数据库。

## 4. 边界与维护规则

- Drizzle 时间列读出 `Date`，底层仍是 INTEGER 毫秒；写入用 `new Date(ms)`，返回公共 DTO 时显式 `.getTime()`，不能把 Date 直接送 IPC。
- 旧 SQLite 的 TEXT PRIMARY KEY 并未声明 NOT NULL。使用 table-level `primaryKey` 保留该语义，不顺手收紧历史数据约束。
- BLOB 使用 buffer 模式；未知 JSON 文本仍是文本，不自动解析或转换用户内容。
- `drizzle/0000_baseline.sql` 已固定；已有 030 库必须通过连续 legacy 台账及完整 schema 验证，之后只登记 `__drizzle_migrations`，不重复执行基线 CREATE。仅有 baseline 的重启也重新核对结构。
- Drizzle-only pending 同样需要备份。一次备份覆盖 legacy、基线及后续迁移；后一步失败必须恢复整个尝试，并用稳定的 `legacy:<version>` / `drizzle:<tag>` 阻止自动重试。
- `__drizzle_migrations.id` 遵循上游 `SERIAL PRIMARY KEY`，允许空值；正确性来自完整 hash/timestamp 前缀，不是最大时间戳或自增 id。
- 未知表、列、约束、view、trigger 或损坏台账拒绝启动，不擅自修复。后续非 baseline 版本需要自己的物理结构契约，不能拿旧基线误判或在空库重放任意 DML。
- 打包资源只包含 SQL 和 `meta/_journal.json`；生成快照不进入运行资源，不允许用环境变量替换生产迁移来源。
- 不修改发布过的 001–030，不在客户端管理 pragma、备份、事务通知或用户数据路径。

## 5. 验证入口

```powershell
pnpm db:generate
pnpm vitest run tests/db/drizzleSchema.test.ts tests/db/drizzleClient.test.ts
pnpm test:db
pnpm test:all
pnpm build:win
pnpm typecheck
pnpm typecheck:tests
```
