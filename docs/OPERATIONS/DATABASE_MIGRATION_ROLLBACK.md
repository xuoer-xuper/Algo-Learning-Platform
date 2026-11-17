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
- 每次 schema 变更必须同步 `docs/DESIGN/DATABASE_SCHEMA.md`。
- 任何升级、修复或回滚前，先关闭应用并备份整个 `<userData>` 目录。
- 升级成功且已进入正常使用后，优先发布修复版保留新增数据。恢复旧快照需要明确确认，不能因后续服务失败自动触发。
- 不要在业务代码里临时 `ALTER TABLE` 或建表。

## 3. 数据文件

需要一起处理：

- `<userData>/data/algo-learning.sqlite`
- `<userData>/data/algo-learning.sqlite-wal`
- `<userData>/data/algo-learning.sqlite-shm`

如果启用 WAL，只复制 `.sqlite` 可能丢失最新写入。备份和恢复时应整体复制 `data` 目录，或在应用关闭后复制三类文件。

### SQLite 以外的保护范围

SQLite 快照与学习数据 JSON 都不是整个用户目录的备份：

- 学习数据 JSON v2 包含约定的六类学习数据表；支持 v1/v2 导入，拒绝未来格式，不承诺旧应用能导入 v2。
- SQLite 保存笔记数据及文件引用；引用不包含独立 Markdown 文件和图片附件字节。须分别保留 `notes/` 及其 `assets/` 子目录，恢复数据库不能重建已丢失的图片。
- `config.json`、`userscripts/` 脚本文件、浏览器会话和窗口快照有独立生命周期。030 不改写笔记、图片和脚本文件；数据库恢复不回退这些文件，也不保证登录态能跨机器或账户复用。
- 数据库和配置副本可能包含敏感值及加密 envelope。保存在现有账户的受保护本地目录，不解密、不上传、不共享，不纳入发行资产。

### 自动配置归一化保护

自动改写已有非规范配置前，应用将原字节保存在：

```text
<userData>/config-normalization-backups/config-before-normalization-<sha256>.json
```

摘要使用原文件字节的 SHA256。应用刷盘、重开并逐字节验证副本，再在同一目录暂存和验证归一化配置，确认原文件未被并发修改后 rename 替换。rename 失败不会退回原地写入。`.partial` 仅为暂存材料，不能作为已验证恢复点；启动不会自动恢复这些残片。

规范配置、缺失配置和坏 JSON 不自动改写或备份。保护失败时只在内存使用归一化值，保留原文件。用户主动保存设置仍使用 electron-store，不创建这种快照，也不将旧快照覆盖后来保存的设置。已有同名副本须再次重开校验才可复用；旧副本不自动清理。

保护逻辑拒绝配置、备份及父路径的符号链接/junction，也拒绝多重硬链接文件。POSIX 使用仅账户可访问的模式，Windows 继承 profile ACL；不会修复已有 ACL，也不承诺抵御恶意并发路径替换或所有断电情况。诊断只包含固定原因码，不包含解析器片段、配置正文、envelope 或配置绝对路径。

仅恢复配置时，先关闭应用，将现有配置和恢复材料另存到受保护目录。优先修正当前配置或向前修复。确需恢复时，在隔离副本上验证所选 JSON 的 SHA256 与文件名一致且能解析，不输出正文。核对要改变的设置并得到确认后再替换，保留较新副本。归一化前副本不含后续设置，也不能解除数据库失败记录；禁止删除数据库 marker/台账伪装恢复。

定向回归为 `algo-electron/` 下的 `pnpm exec vitest run tests/app/configNormalizationBackup.test.ts`。使用合成字节/envelope、真实临时文件和磁盘/权限/损坏注入；结果不等于真实用户目录或安装升级验收。

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
3. 在隔离副本上验证指定恢复点、数据库完整性和笔记附件可用性，确认其覆盖范围；不能把 `.sqlite` 或 JSON 当作完整 `<userData>` 快照。
4. 升级后已经使用的数据库优先用新版修复。确需恢复源状态时，另存当前状态后只替换经确认的文件。旧应用必须配套其认识的数据格式，不能只换旧 executable 继续读写新库。
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

### 6.3 当前升级尝试与受控解除

新版本在首次迁移写入前记录 `<userData>/data/algo-learning.sqlite.migration-attempt.json`，
绑定数据库身份、尝试 UUID、源/目标台账、源 schema 摘要和已验证备份 SHA256。
`prepared`、`restoring`、`restored`、`restore-failed` 都会阻止正常启动，包括目标迁移已提交、
没有 pending migration 的情况。不能删除记录、修改 state 或删除台账行来解除。

出现可验证记录时，启动故障提示会给出本次 UUID 和两条维护命令。先完全关闭应用，保留
当前 profile 及备份/恢复材料，再根据已经核验的状态选择操作；命令中的占位符须替换为
本机提示的 UUID：

```powershell
& '<安装目录>\AlgoLearningPlatform.exe' '--resolve-upgrade=<本次UUID>' '--resolution=keep-current'
& '<安装目录>\AlgoLearningPlatform.exe' '--resolve-upgrade=<本次UUID>' '--resolution=retry-source'
```

这两个命令用途不同，不应连续照抄执行：

- `keep-current`：用于目标迁移已完整提交，但完成记录未落盘。它在源备份的临时副本上重放
  已知迁移，得到独立目标 schema，核对当前库台账、schema、外键和完整性；先保护当前库，
  当前目标已达本版 schema 时再清理孤立访问并复验，持久化 `resolved-keep-current`。
  历史目标仍低于本版 schema 时不执行新版清理，下次正常启动先建立新恢复点升级。
  不会将旧库覆盖到当前库。
- `retry-source`：仅在原故障已排除、当前库已恢复并精确匹配源状态时使用。它验证源状态和
  已记录的恢复文件集合、保护当前库，记录 `resolved-retry-source` 后退出；命令本身不迁移。
  下次正常启动才建立新的验证恢复点并尝试升级。

维护入口必须拿到当前安装 profile 的单实例锁，不接受数据库/备份/profile 路径参数，也不
接受冒烟环境重定向。另一个实例存在、参数错误或检查失败时非零退出，不启动正常服务、
主题配置写入、窗口或业务 IPC。成功提示后应正常重启应用；重复执行会重新验证已有证据。

当前状态保护副本位于 `<userData>/backups/resolutions/`，对应
`<attemptId>.<resolution>.json` 审计从 prepared 到 verified。原尝试记录及失败 marker
继续保留，并通过 UUID 关联结果。新尝试会归档已解决的旧记录；不能把删除文件当成成功。
部分迁移状态、未知未来库、错误 UUID、源备份损坏或恢复材料不完整均保持阻断。

旧版失败 marker 没有 UUID 时，应用只读核对本 profile 身份、指定源备份和已知迁移范围，
由原 marker 原字节 SHA256 和数据库身份生成确定的 UUID。首次显式命令会保存原 marker
原字节审计、关联记录和升级记录，再给保留的 marker 加关联 ID。单纯启动不会自动改写
这些材料。关联中断可重新验证；缺失、损坏或来源不明的旧材料需要在隔离副本上排查，
不能补一个空 marker 或借用其他数据库的备份强行通过。

旧记录按当时目标验证：2.0.0 只认识001–029，其失败 marker 不会列出030。恢复工具以
已验证源台账加原 pending 列表核对已知连续前缀，并只重放该段。确认旧源或旧目标后，
下一次正常启动再单独保护并升级到当前版本；不会给旧记录补写它从未执行过的迁移。

正常启动也会重新验证解除记录、当前状态保护副本及遗留关联审计。缺少或不匹配的审计
仍会阻止启动，不能只把 state 文本改成 resolved 来解除保护。

### 6.4 数据库替换范围

自动恢复只针对尚未暴露给正常业务的本次升级失败。恢复前重新验证指定独立 SQLite
快照及其 hash，暂存候选并记录意图；已关闭的 main/WAL/SHM 被完整保留到同级
`algo-learning.sqlite.recovery-<attemptId>/`，随后才安装、复验源库。多文件 rename
不具备单次原子性，中途失败会保留材料并阻断，不自动删除残片或猜测哪个副本正确。

安装旧版本不执行这些验证，也不会让旧程序突然认识新格式。需要回退时，必须先在副本上
验证旧格式恢复点，保留升级后当前数据并明确可恢复范围；030 前快照不含后续新增数据。
正常使用后的服务故障不会触发旧快照覆盖，优先向前修复。

定向验证使用 `pnpm test:db`：包括真实 SQLite 备份/恢复、错误注入、受控解除，以及
Electron 子进程在写入前、030 事务中、迁移间、最终提交后被强杀的回归。真实安装升级、
附件/配置/脚本保留、卸载重装仍须另做隔离 NSIS 验收。

## 7. 回滚策略

### 7.1 已发布版本

已发布版本不应通过删除 `schema_migrations` 或手动降版本回滚。原因：

- SQLite schema 可能已部分变化。
- 用户数据可能已经按新版本写入。
- 旧代码未必理解新字段或新约束。

正确做法：

1. 正常使用后的问题优先新增修复迁移，保留后续记录。
2. 受控恢复前保留当前状态并验证源格式快照。旧恢复点不含后来新增的记录、笔记或设置，不承诺任意无损降级。

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
7. 同步 `docs/DESIGN/DATABASE_SCHEMA.md`。
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

migration 025 在创建用户脚本身份唯一索引前保留全部存量行：每组活动同名脚本中最早记录保持 legacy canonical，其余活动记录改为 `local:<id>` 并关闭自动更新；已软删除记录不参与 canonical 排名。回滚到旧版本时应恢复迁移前 SQLite 备份，不要手工删除 local copy 或把 namespace 批量改回 `NULL`，否则会重新制造身份冲突。

migration 026 创建 `site_credentials` 作为凭据数据地基。活动行必须保存 V1 safeStorage envelope，软删除同时清空 envelope；同站点同用户名再次保存由 repository revive 原 tombstone。回滚时优先恢复迁移前备份，不要手工删除 `schema_migrations` 或复制凭据表数据到普通 JSON 导出。

migration 027 扩展 `user_scripts` metadata，并从存量源码重新拆分旧版混存的 `@match/@include`；同时创建 values、BLOB 资源、host 授权和更新状态四张级联表。SQLite 无法可靠地通过简单 `down` 删除新增列，因此 027 失败或需要回到旧版本时必须恢复迁移前完整数据库备份，不能只删除四张表或手工把版本号改回 026。自动迁移安全测试已覆盖 027 成功后紧随 migration 失败时恢复到无新增列/表的原数据库。

## 10. 验证命令

### migration 030 的恢复边界

030 将既有 25 张表的 82 个时间点列转换为 INTEGER 毫秒，包含迁移台账。
历史 001–029 不重写；新库仍先执行旧迁移再转换。备份使用 SQLite backup API，避免漏掉 WAL。

- runner 在进入 030 事务前暂时关闭外键；在同一个事务中重建表、转换已知时间、重建索引、
  更新台账并运行外键/完整性检查，结束后恢复原外键状态。禁止在已有外层事务里开启此模式。
- 不能将无效时间静默置 NULL；非法日期、无法识别格式或不支持的 AI context 版本均让事务
  失败，安全入口恢复升级前备份并写 failure marker。错误信息不包含原始用户字段值。
- 无后缀本地时间使用迁移系统时区；固定 UTC+8 的脚本/凭据/runtime 列按历史契约解释。
  DST 不存在的时间拒绝，重复时间按 JS 较早时刻处理，缺失的历史歧义不伪称已恢复。
- 早期洛谷数值毫秒写入 TEXT 所留下的 `.0` 形式按已有毫秒值无损转换；非零小数、溢出或
  不支持的数字文本仍安全失败，不能用失败后批量置空来“修好”迁移。
- 早期 `substr(timestamp,1,10)` 生成的十位数字日统计键是已知派生缓存错误。030仅清理该
  明确形状并按事实重建，合法日期桶保留元数据，原缓存留在备份；其他非法日键仍失败回滚。
- 回到不支持 INTEGER 时间的旧应用前，必须在关闭应用后恢复**030 前**的完整备份，不能只
  把 schema_migrations 的30删掉或把整数批量转成任意字符串。
- 若已发布后发现换算策略问题，新增031修复，不修改已执行的030；修复前同样先备份。
- 验收使用历史 Git 重建的21/24/29结构+合成数据，及现有真实样本的隔离副本，明确分开
  报告。禁止在用户正在使用的源数据库上试跑。

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

- `docs/DESIGN/DATABASE_SCHEMA.md` 和 migration 列表一致。
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
