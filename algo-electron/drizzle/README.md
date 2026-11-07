# Drizzle 生成结构

## 1. 职责

保存 schema 代码生成的候选基线 SQL 和 Drizzle Kit 元数据，供结构等价验证。

## 2. 当前内容

- `0000_baseline.sql`：与已发布 001–030 的最终结构相同的25表候选基线，不包含用户数据。
- `meta/`：Drizzle Kit 生成的 snapshot 和 journal。

## 3. 入口

在 `algo-electron/` 执行 `pnpm db:generate --name baseline`。配置读取 `src/main/db/schema.ts`，
不连接数据库；无 schema 变化时再次运行不会新增 migration。

## 4. 边界与维护规则

A0 **不启用迁移器**，不将此 SQL 应用到已有数据库，不写 `__drizzle_migrations`。
A1必须先验证连续旧台账、真实结构、资源/hash及备份恢复契约，才能将基线作为已应用记录。
生成的 UNIQUE 约束由 Kit 编译为命名唯一索引；测试核对约束语义和完整索引多重集，不仅比较表数量。

## 5. 验证入口

```powershell
pnpm db:generate --name baseline
pnpm vitest run tests/db/drizzleSchema.test.ts tests/db/drizzleClient.test.ts
```
