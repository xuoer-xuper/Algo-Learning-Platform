# 数据库迁移与回滚策略

## 1. 目标

本文说明 SQLite 数据库迁移失败、升级失败和需要回滚时的处理策略。它是所有未来 schema 变更必须挂靠的恢复规范。

当前数据库：

- 引擎：SQLite
- 访问库：`better-sqlite3`
- 数据库路径：`app.getPath('userData')/data/algo-learning.sqlite`
- 迁移记录表：`schema_migrations`
- 迁移执行入口：`electron/db/connection.ts` 和 `electron/db/migrate.ts`

## 2. 基本原则

- migration 只向前执行，不在用户真实数据库上自动降级。
- 每个 migration 在 `db.transaction()` 中执行；失败时该 migration 的 SQL 和版本记录一起回滚。
- 每次 schema 变更必须同步 `docs/DATABASE_SCHEMA.md`。
- 任何升级、修复或回滚前，先关闭应用并备份整个 `<userData>` 目录。
- 恢复优先级：备份恢复 > 新 migration 修复 > 手动 SQL 修复。
- 不要在业务代码里临时 `ALTER TABLE` 或建表。

## 3. 数据文件

需要一起处理：

- `<userData>/data/algo-learning.sqlite`
- `<userData>/data/algo-learning.sqlite-wal`
- `<userData>/data/algo-learning.sqlite-shm`

如果启用 WAL，只复制 `.sqlite` 可能丢失最新写入。备份和恢复时应整体复制 `data` 目录，或在应用关闭后复制三类文件。

## 4. 升级前备份

发布安装包或运行新 migration 前：

1. 关闭应用。
2. 复制整个 `<userData>` 到备份目录。
3. 备份目录建议命名为：

```text
AlgoLearningPlatform-backup-YYYYMMDD-HHmm
```

4. 确认备份内至少包含：

```text
data/algo-learning.sqlite
config.json
notes/
userscripts/
```

5. 再启动新版本应用。

## 5. 迁移失败识别

常见错误：

- `Database not initialized`
- `SQLITE_ERROR`
- `database disk image is malformed`
- `no such table`
- `duplicate column name`
- `UNIQUE constraint failed`
- 启动后卡死或主窗口空白，并伴随 migration 日志。

检查项：

```sql
SELECT version, name, applied_at
FROM schema_migrations
ORDER BY version;
```

期望：

- 版本连续。
- 最后一个版本等于 `connection.ts` 中 `allMigrations` 的最高版本。
- 失败 migration 不应写入 `schema_migrations`，因为迁移在事务内执行。

## 6. 失败恢复流程

### 6.1 用户恢复

1. 关闭应用。
2. 复制当前 `<userData>` 到 `*-failed` 目录保留现场。
3. 用升级前备份覆盖 `<userData>`。
4. 启动旧版本或已修复的新版本。
5. 确认题目、提交、笔记和统计可读取。

### 6.2 开发者定位

1. 不在用户真实数据库上调试。
2. 复制失败数据库到临时目录。
3. 用临时库运行 repository 测试或一次性验证脚本。
4. 检查失败版本 migration 的 SQL 是否满足：
   - 可重复跳过已存在对象。
   - 不破坏既有数据。
   - 新字段有合理默认值或允许 NULL。
   - 唯一索引建立前已清理重复数据。
5. 修复方式优先新增下一版本 migration。

## 7. 回滚策略

### 7.1 已发布版本

已发布版本不应通过删除 `schema_migrations` 或手动降版本回滚。原因：

- SQLite schema 可能已部分变化。
- 用户数据可能已经按新版本写入。
- 旧代码未必理解新字段或新约束。

正确做法：

1. 用备份恢复到升级前状态；或
2. 发布新的修复 migration，把数据修到兼容状态。

### 7.2 开发阶段

仅限本地开发临时数据库：

- 可以删除临时数据库重新跑 migration。
- 可以修改尚未发布且未进入用户数据的 migration。
- 不能对用户真实数据库这么做。

## 8. 新 migration 编写规则

每次新增 migration：

1. 文件名使用三位版本前缀，例如 `019_add_xxx.ts`。
2. 导出常量名与版本匹配，例如 `migration019`。
3. 在 `connection.ts` 的 `allMigrations` 中按顺序追加。
4. `version` 必须唯一递增。
5. `name` 描述真实动作。
6. `up(db)` 必须能在事务中执行。
7. 同步 `docs/DATABASE_SCHEMA.md`。
8. 如涉及 repository，补临时数据库测试。
9. 如涉及统计口径，补重算或聚合测试。

建议 SQL 风格：

```sql
CREATE TABLE IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
```

新增列要评估重复执行和旧 SQLite 能力。当前已有 migration 使用 try/catch 处理重复列，后续应优先设计为可检测、可恢复的迁移。

## 9. 数据修复 migration

数据修复 migration 应满足：

- 先查询受影响数据范围。
- 只修改明确受影响行。
- 保留可追溯依据，例如通过字段值、平台、版本范围筛选。
- 不写 Cookie、源码、完整请求体到日志或新字段。
- 能在空数据库、旧数据库和已修复数据库上安全运行。

示例类型：

- 清理错误标题。
- 回填题目上下文。
- 规范提交 ID。
- 修复重复索引前的数据冲突。

## 10. 验证命令

基础验证：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npm run lint
```

真实 SQLite repository 测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

启动验证：

```powershell
npx --yes tsx tests\electron\startupSmoke.test.ts
```

schema 变更后还要人工核对：

- `docs/DATABASE_SCHEMA.md` 和 migration 列表一致。
- `schema_migrations` 最高版本与 `connection.ts` 一致。
- 新表/新字段有 repository 或明确预留说明。
- 打包产物不包含测试库、临时库或本地真实数据库。

## 11. 用户数据恢复检查

恢复后检查：

- 应用能启动。
- 题目列表可打开。
- 题目详情和提交记录可读。
- 笔记列表和图片附件可读。
- 统计页可打开，必要时执行日统计重算。
- 站点配置、默认首页、用户脚本仍存在。

若恢复后统计异常但题目、提交、访问事实数据存在，优先重算统计，不要手工编辑 `user_daily_stats`。

## 12. 禁止事项

- 禁止让用户直接修改真实数据库，除非已有备份且步骤明确。
- 禁止删除 `schema_migrations` 来伪造回滚。
- 禁止只复制 `.sqlite` 而忽略 WAL/SHM。
- 禁止在 renderer 或 preload 中执行迁移。
- 禁止 migration 读取 Cookie、浏览器 session 或远程网页。
- 禁止在迁移日志、文档或测试 fixture 中写入 Cookie、用户源码或完整请求体。
