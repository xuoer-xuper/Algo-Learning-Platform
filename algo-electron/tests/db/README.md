# DB Tests

## 1. 职责

`tests/db/` 覆盖 SQLite migration 辅助逻辑和 repository 读写行为。涉及 `better-sqlite3` 的测试需要用 Electron Node 运行。

## 2. 当前覆盖

- `codeforcesSubmissionIdMigration.test.ts`：Codeforces 提交 ID migration 兼容。
- `problemContextMigration.test.ts`：题目上下文字段 migration 兼容。
- `backupImport.test.ts`：SQLite 备份、学习数据 JSON 导出/导入、冲突检测和 Cookie/`raw_json` 排除。
- `migrationSafety.test.ts`：迁移前备份、失败恢复、failure marker 阻断重试、三份轮换和 orphan visit 启动清理。
- `databaseInitialization.test.ts`、`sqliteMigrationBackup.test.ts`：用 test double 覆盖异步初始化和备份恢复纯逻辑，纳入全仓覆盖率统计。
- `dailyStatsPerformance.test.ts`：两年事实数据下的单日统计重算基准，硬门槛 `<50ms`。
- `omniboxSuggestions.test.ts`：Omnibox 本地题目/访问建议的固定上限、字段匹配、稳定排序、LIKE 字面量转义、软删除过滤与去重。
- `statsDate.test.ts`：日期范围边界和 timestamp 日期提取。
- `repositories.test.ts`：临时 SQLite 文件中的迁移、题目 upsert、提交 upsert、唯一约束、首次 AC、日统计聚合、站点 seed、站点导入预览和 Cookie 元数据安全边界。
- `userScriptIdentityMigration.test.ts`：migration 025 的存量 canonical/local 分流、已删除行排序隔离和软删除部分唯一索引。
- `userScriptIdentityRepository.test.ts`：用户脚本精确身份、显示名独立编辑、local copy 默认值、空 namespace canonical 和 legacy canonical 原子认领/回滚。

## 3. 运行方式

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

纯 migration 辅助测试可用 `npx --yes tsx tests\db\<name>.test.ts` 运行。

Omnibox 建议聚焦测试：

```powershell
npm exec vitest -- run tests/db/omniboxSuggestions.test.ts
```

用户脚本身份聚焦测试：

```powershell
npm exec vitest -- run tests/db/userScriptIdentityMigration.test.ts tests/db/userScriptIdentityRepository.test.ts
```

## 4. 新增规则

数据库 schema、repository 写入规则或统计口径变更必须补这里。每个用例应使用临时 DB，不读取或修改用户真实数据。
