# DB Tests

## 1. 职责

`tests/db/` 覆盖 SQLite migration 辅助逻辑和 repository 读写行为。涉及 `better-sqlite3` 的测试需要用 Electron Node 运行。

## 2. 当前覆盖

- `codeforcesSubmissionIdMigration.test.ts`：Codeforces 提交 ID migration 兼容。
- `problemContextMigration.test.ts`：题目上下文字段 migration 兼容。
- `repositories.test.ts`：临时 SQLite 文件中的迁移、题目 upsert、提交 upsert、唯一约束、首次 AC、日统计聚合、站点 seed 和站点导入预览。

## 3. 运行方式

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

纯 migration 辅助测试可用 `npx --yes tsx tests\db\<name>.test.ts` 运行。

## 4. 新增规则

数据库 schema、repository 写入规则或统计口径变更必须补这里。每个用例应使用临时 DB，不读取或修改用户真实数据。
