# Drizzle 生成结构

## 1. 职责

保存经过结构等价验证的不可变基线、后续迁移 SQL 和 Drizzle Kit 元数据，供安全迁移及生成使用。

## 2. 当前内容

- `0000_baseline.sql`：与已发布 001–030 的最终结构相同的25表基线，不包含用户数据，A1 起固定字节及可信身份。
- `meta/`：Drizzle Kit 生成的 snapshot 和 journal。

## 3. 入口

在 `algo-electron/` 执行 `pnpm db:generate`。配置读取 `src/main/db/schema.ts`，
不连接数据库；无 schema 变化时再次运行不会新增 migration。

## 4. 边界与维护规则

A1 默认异步启动先验证资源/journal/hash，再检查连续旧台账及完整物理结构，备份后只将基线登记为已应用，不在已有应用表上执行基线 CREATE。后续 SQL 委托固定版本 Drizzle migrator。
可信身份在 `src/main/db/migration-resources.ts`，基线 tag=`0000_baseline`、when=`1794022401703`、SHA256=`b92f46f0e3cf2258b73dd4c1845c4646640b2f7d98309ef96d681bbf2bc20216`。禁止重新生成/修改已接受基线或通过编辑台账绕过校验。
新增迁移需审查生成 SQL、显式更新可信列表、补对应结构契约及备份/恢复回归。只打包 SQL 和 `meta/_journal.json`；snapshot 是生成来源，不是运行时可信清单。
生成的 UNIQUE 约束由 Kit 编译为命名唯一索引；测试核对约束语义和完整索引多重集，不仅比较表数量。

## 5. 验证入口

```powershell
pnpm db:generate
pnpm vitest run tests/db/drizzleSchema.test.ts tests/db/drizzleClient.test.ts
pnpm test:db
pnpm test:packaging
```
