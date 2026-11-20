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
- `problemUpsert.test.ts` / `problem-upsert-oracle.ts`：A2c与冻结原三条SQL对照完整行/事件，覆盖bound-null实际UPDATE、六列SET触发语义、标题/字段/时间/软删除，以及语句失败、外层回滚/真实COMMIT失败、savepoint和partial autocommit；原生Electron另验null-ID通知和数值时间。
- `deleteProblem.test.ts` / `problem-delete-oracle.ts`：A2d四分支raw instant UNION和四条DELETE与冻结原SQL对照；保持非法时间拒绝、NULL/空/字面量ID、tombstone、孤儿false返回、notes、实际COMMIT/savepoint/外层回滚、第二日统计失败及事件时序。`test:db`同时注册删除与R4通知回归，原生repository套件另验成功删除和真实deferred-FK COMMIT失败。
- `problemReads.test.ts` / `problem-reads-oracle.ts`：A2f详情和访问Drizzle查询对照冻结原SQL完整行，保留nullable子ID、所有额外列、墓碑、COUNT(*)、100条提交上限、访问升序、raw毫秒、只读/事务/无通知及连接生命周期。原生repository用例另验绑定ID（包括Unicode/NUL）与nullable输出；共享输出schema测试覆盖允许null但拒绝错误类型，输入约束不放宽。
- `codeforcesSubmissionIdMigration.test.ts`：Codeforces 提交 ID migration 兼容。
- `problemContextMigration.test.ts`：题目上下文字段 migration 兼容。
- `backupImport.test.ts`：SQLite 备份、学习数据 JSON 导出/导入、冲突检测和 Cookie/`raw_json` 排除。
- `migrationSafety.test.ts`：迁移前备份、失败恢复、failure marker 阻断重试、三份轮换和 orphan visit 启动清理。
- `migrationInterruption.test.ts`：显式 `getKnownMigrations()` 的 format-1 兼容矩阵，真实 Electron RUN_AS_NODE 子进程在 fsync rendezvous 后阻塞，由父进程 SIGKILL 并等待 close；覆盖 durable prepared 后首条迁移 SQL 前、冻结030实际事务内完成 shadow 数据复制及 DROP TABLE 后、28→29 已提交但30未开始、30已提交但 checkpoint 未完成四个中断点。默认及 migrations:[] 重启均阻断，原备份按 hash/schema/integrity 复验；源态显式 retry-source、部分29先保留 displaced main/WAL/SHM 并受控恢复28后 retry-source、完整30用 keep-current 保留新数据。正常使用后独立启动故障不恢复旧快照，向前修复后新数据仍在。
- `drizzleMigrationInterruption.test.ts`：独立 native format-2 强杀矩阵；既有030登记基线与 Drizzle-only 数据迁移分别在 durable prepared（写入前）和全部台账提交但 checkpoint 未完成后暂停，由父进程 SIGKILL 并等待 close。默认、`migrations: []` 和显式资源重启均阻断，无 catch marker 也不能绕过；验证复合源备份、错误恢复方向拒绝、源态 `retry-source` 新尝试、目标态 `keep-current` 及保护副本保留新增行/epoch0/毫秒精度。Drizzle-only 不改物理 schema，证明恢复不能只比较 legacy/schema。
- `databaseInitialization.test.ts`、`sqliteMigrationBackup.test.ts`：用 test double 覆盖异步初始化和备份恢复纯逻辑，纳入全仓覆盖率统计。
- `dailyStatsPerformance.test.ts`：两年事实数据下的单日统计重算基准，硬门槛 `<50ms`。
- `omniboxSuggestions.test.ts`：Omnibox两个Drizzle候选管线对照冻结完整函数oracle，覆盖24/64候选上限、字段匹配、LIKE字面量转义、NULL parent/最新visit ID、原生JS null比较、raw时间、软删除与去重。
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

中断矩阵的 schema29 来自固定 rc1 SQL/hash，schema28 明确由固定 beta2(schema24) 加未修改的25–28迁移构造，行数据均为合成样本，不是旧版安装器或用户原库。测试只在 `tmp/migration-interruption-tests/case-*` 下操作，清理前验证绝对路径；子进程测试通过测试自有 logger/native prototype 接缝暂停，不添加生产崩溃开关、不修改001–030。
两份中断矩阵与 migrationSafety 一样是独立 native 套件，必须由 `tests/verify.mjs` 串行 bundle/执行，并从普通 Vitest 发现中排除。Drizzle 矩阵仅在 `tmp/drizzle-interruption-tests/case-*` 内使用合成数据和经相同可信 loader 校验的测试资源，冻结基线/001–030保持不变；通过 logger/native pragma 接缝等待，不增加生产崩溃开关。旧矩阵保持 format-1，不把030完成但基线未登记的复合部分状态当作最终目标。这些不是 Electron 主界面或 NSIS 安装验收。

数据库 schema、repository 写入规则或统计口径变更必须补这里。每个用例应使用临时 DB，不读取或修改用户真实数据。

第一批审计可单独执行 `node tests/db/runAuditDataIntegrity.mjs`。它启动真实 Electron 并在 `tmp/audit-20260911/` 新建 profile，保留合成证据；修复后需将对应 `.repro` 的异常断言转换为正确行为的回归用例。详见 [第一批审计报告](../../../docs/OPERATIONS/PROJECT_AUDIT_BATCH1_2026_09_11.md)。
