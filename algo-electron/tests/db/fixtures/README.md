# 历史数据库重建 Fixtures

## 1. 职责

从固定 Git 提交的历史 migration 与其相对依赖重建三个版本的结构，供升级测试使用。
这些是**历史代码重建结构 + 合成测试数据**，不是用户旧库、脱敏真实库或旧安装器运行结果。

## 2. 当前覆盖

- `v1.schema.sql`：v1.0.0，migration 001–021。
- `beta2.schema.sql`：tag v1.1.0-beta.2（package 2.0.0-beta.2），001–024。
- `rc1.schema.sql`：v2.0.0-rc.1，001–029。
- `provenance.json`：固定 commit、实际 package 版本、Git blob/SHA256、snapshot SHA256、
  结构对象与 migration 名称，以及生成时的 Node/SQLite 版本。

## 3. 关键文件与入口

`../regenerateHistoricalFixtures.mjs` 通过 Git blob resolver 执行对应提交的 migration
`.up` 及 helper 闭包；不加载历史 `connection.ts` 或应用入口。每版使用独立内存数据库，
迁移台账时间固定为合成值。SQL 结构由 `sqlite_master` 产生，不手写历史表结构。

`../historicalUpgradePath.test.ts` 在临时目录根据文本创建数据库，再添加明确的合成数据。
普通 CI 只读取提交的文本和 manifest，不依赖 Git tag、网络或真实用户数据。

## 4. 边界与维护规则

- 不提交 `.sqlite`/`.db` 文件，不改已发布 migration 001–029，不访问实际 userData。
- 重新生成需要完整的固定 Git 对象和当前依赖；命令失败时不得用 HEAD migration 冒充历史。
- 源码 SHA 证明来源，SQL SHA 防止 snapshot 意外漂移；升级测试另验证真实数据库行为。
- 结构生成时旧库为空，不能据此声称已验证 migration 001–021 对早期存量数据的所有清理。
- 此阶段只验证 21/24/29 → 29 的历史升级基础；**没有实现或验证 030 毫秒迁移**。
- 后续 030 应沿用这里的起始库并增加独立毫秒期望值、时区及失败恢复验收，不能仅改版本断言。

## 5. 验证入口

```powershell
cd algo-electron
node tests/db/regenerateHistoricalFixtures.mjs
pnpm vitest run tests/db/historicalUpgradePath.test.ts
pnpm test:db
```

连续两次运行生成器应得到逐字节相同的 SQL 与 manifest（同 Node/SQLite 环境）。
