# DB Tests

## 1. 职责

`tests/db/` 覆盖 SQLite migration 辅助逻辑和 repository 读写行为。涉及 `better-sqlite3` 的测试需要用 Electron Node 运行。

## 2. 当前覆盖

- `drizzleSchema.test.ts`：固定基线SQL与生产0→30结构的25表列/默认值/null/PK、完整索引、FK和CHECK等价，并验证约束行为。
- `drizzleClient.test.ts`：传入连接无副作用包装、Date毫秒/epoch0/null、BLOB及事务回滚；`repositories.test.ts`另在真实Electron ABI验证相同契约，不激活Drizzle迁移器。
- `drizzleMigrationResources.test.ts`：可信SQL/journal完整集合、hash/顺序/时间/路径、缺失或篡改资源在开库前拒绝，以及开发/打包解析路径。
- `drizzleMigrationSafety.test.ts`：默认异步安全入口的新库/030基线登记、幂等重启、Drizzle-only备份、后续迁移失败全量恢复、同tag修复后重试阻断、backup期间资源变更、无额外R4通知与显式legacy-only override。
- `drizzleMigrationValidation.test.ts`：完整legacy/Drizzle前缀、隐藏列/默认值/CHECK/索引/FK/DDL子句、注释伪装与baseline-only重启结构漂移；拒绝未知结构且不默默修复。
- `problemOverview.test.ts`：A2a四条总览Drizzle只读查询与原SQL等价，覆盖nullable ID按行计数、本地日期边界、tombstone、epoch0/null/毫秒、无写入/通知及关闭重开；原生Electron仓库套件补数字输出验证。
- `problemLookup.test.ts`：A2b平台题号查ID与原SQL对照，保留大小写/空白/字面量绑定、NULL/空ID和deleted_at=0语义，验证只读、无通知、事务及关闭重开和数据库异常传播；原生Electron另验字面量、大小写、NULL/空ID和软删除边界。
- `codeforcesSubmissionIdMigration.test.ts`：Codeforces 提交 ID migration 兼容。
- `problemContextMigration.test.ts`：题目上下文字段 migration 兼容。
- `backupImport.test.ts`：SQLite 备份、学习数据 JSON 导出/导入、冲突检测和 Cookie/`raw_json` 排除。
- `migrationSafety.test.ts`：迁移前备份、失败恢复、failure marker 阻断重试、三份轮换和 orphan visit 启动清理。
- `databaseInitialization.test.ts`、`sqliteMigrationBackup.test.ts`：用 test double 覆盖异步初始化和备份恢复纯逻辑，纳入全仓覆盖率统计。
- `dailyStatsPerformance.test.ts`：两年事实数据下的单日统计重算基准，硬门槛 `<50ms`。
- `omniboxSuggestions.test.ts`：Omnibox 本地题目/访问建议的固定上限、字段匹配、稳定排序、LIKE 字面量转义、软删除过滤与去重。
- `statsDate.test.ts`：日期范围边界和 timestamp 日期提取。
- `historicalUpgradePath.test.ts`：按固定历史 Git 源码重建的文本 schema 加合成数据，验证 21/24/29 → 30 → Drizzle基线的真实 SQLite 安全升级、82列数值时间、关系/约束、备份、幂等与失败恢复；不依赖 CI Git 历史。来源和再生步骤见 `fixtures/README.md`。
- `migration030.test.ts`：外键事务使用边界、rowid/view/trigger保留、AI JSON精确转换、晚期非法值回滚、SQLite数值毫秒TEXT及旧伪日期桶兼容，其他错误继续拒绝。
- `repositories.test.ts`：临时 SQLite 文件中的迁移、题目 upsert、提交 upsert、唯一约束、首次 AC、日统计聚合、站点 seed、站点导入预览和 Cookie 元数据安全边界。
- `userScriptIdentityMigration.test.ts`：migration 025 的存量 canonical/local 分流、已删除行排序隔离和软删除部分唯一索引。
- `userScriptIdentityRepository.test.ts`：用户脚本精确身份、显示名独立编辑、local copy 默认值、空 namespace canonical 和 legacy canonical 原子认领/回滚。
- `userScriptRuntimeMigration.test.ts`：migration 027 metadata 回填拆分、JSON/CHECK/UNIQUE/FK/BLOB 约束、级联删除和后续迁移失败恢复。
- `userScriptRuntimeRepository.test.ts`：用户脚本 027 字段 round-trip、GM values、资源缓存、host 授权 revoke/revive 和更新状态合并。
- `siteLoginAutofillMigration.test.ts`：migration 028 的登录 URL pattern、用户名/密码选择器字段和七站 seed 回填。
- `siteCredentialLabelMigration.test.ts`：migration 029 的凭据可选显示名字段和幂等升级。
- `auditDataIntegrity.repro.ts`：2026-09-11 审计证据，包含备份附件、笔记双写、导入路径/删除标记/冲突/负时长、题库筛选和回滚对照；断言当前异常，不属于默认回归集合。

## 3. 运行方式

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

纯 migration 辅助测试可用 `npx --yes tsx tests\db\<name>.test.ts` 运行。

Omnibox 建议聚焦测试：

```powershell
npx vitest run tests/db/omniboxSuggestions.test.ts
```

用户脚本身份聚焦测试：

```powershell
npx vitest run tests/db/userScriptIdentityMigration.test.ts tests/db/userScriptIdentityRepository.test.ts
```

## 4. 新增规则

数据库 schema、repository 写入规则或统计口径变更必须补这里。每个用例应使用临时 DB，不读取或修改用户真实数据。

第一批审计可单独执行 `node tests/db/runAuditDataIntegrity.mjs`。它启动真实 Electron 并在 `tmp/audit-20260911/` 新建 profile，保留合成证据；修复后需将对应 `.repro` 的异常断言转换为正确行为的回归用例。详见 [第一批审计报告](../../../docs/OPERATIONS/PROJECT_AUDIT_BATCH1_2026_09_11.md)。
