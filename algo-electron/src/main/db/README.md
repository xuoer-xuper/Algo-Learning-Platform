# Drizzle 数据库基础

## 1. 职责

描述 migration 030 后的完整 SQLite 结构，并为生命周期管理者已经打开的连接提供 typed ORM 包装。

## 2. 当前实现

A0 仅引入 schema、客户端和生成配置。25 张表包含旧迁移台账，82 个时间点使用 `timestamp_ms`。
生产仍由 `electron/db/connection.ts` 执行 001–030、备份及 failure marker；本目录尚未接管迁移。

## 3. 关键文件

- `schema.ts`：精确保留列、默认值、空值、主键、唯一/部分索引、CHECK 与外键。
- `client.ts`：`createDrizzleClient(sqlite)` 只包装传入的 `better-sqlite3` 连接，无 import-time 开库、第二连接或关闭行为。
- 根目录 `drizzle.config.ts`：供 `pnpm db:generate` 显式生成 SQL，不连接用户数据库。

## 4. 边界与维护规则

- Drizzle 时间列读出 `Date`，底层仍是 INTEGER 毫秒；写入用 `new Date(ms)`，返回公共 DTO 时显式 `.getTime()`，不能把 Date 直接送 IPC。
- 旧 SQLite 的 TEXT PRIMARY KEY 并未声明 NOT NULL。使用 table-level `primaryKey` 保留该语义，不顺手收紧历史数据约束。
- BLOB 使用 buffer 模式；未知 JSON 文本仍是文本，不自动解析或转换用户内容。
- `drizzle/0000_baseline.sql` 是 A0 的候选结构输出，未激活 migrator，也未写 `__drizzle_migrations`。A1 先验证台账及恢复契约再接线。
- 不修改发布过的 001–030，不在客户端管理 pragma、备份、事务通知或用户数据路径。

## 5. 验证入口

```powershell
pnpm db:generate --name baseline
pnpm vitest run tests/db/drizzleSchema.test.ts tests/db/drizzleClient.test.ts
pnpm test:db
pnpm typecheck
pnpm typecheck:tests
```
