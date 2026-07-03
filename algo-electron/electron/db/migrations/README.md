# DB Migrations

## 1. 职责

`electron/db/migrations/` 保存 SQLite schema 和数据修正 migration。每个文件只描述一次不可变迁移动作，由 `electron/db/connection.ts` 按顺序加载。

本目录不放 repository 查询、不写运行期业务逻辑、不读取网页或 IPC payload。

## 2. 当前实现程度

当前 migration 版本为 `001` 到 `018`：

- `001_initial.ts`：初始问题、访问、事件等基础结构。
- `002_submissions.ts`：提交记录相关结构。
- `003`、`004`：Codeforces canonical URL 修正。
- `005_daily_stats.ts`：日统计结构。
- `006_rating.ts`：账号和 rating 历史。
- `007_site_configs.ts`：站点配置。
- `008`、`009`：用户脚本记录和文件字段。
- `010`、`011`：笔记结构和内容字段。
- `012`、`013`：代码片段表创建后撤销。
- `014`、`015`：AI 上下文快照和 AI 输出。
- `016`、`017`：题目上下文修正和回填。
- `018_normalize_codeforces_submission_ids.ts`：Codeforces 提交 ID 归一化。

## 3. 编写规则

- 文件名使用三位递增版本号，例如 `019_add_xxx.ts`。
- 每个文件导出 `migrationNNN`，包含 `version`、`name`、`up(db)`。
- `version` 必须唯一且递增。
- `up(db)` 会由迁移执行器放进事务运行，内部不要手动提交事务。
- 新 migration 必须加入 `connection.ts` 的迁移列表。
- schema 变更必须同步根目录 `DATABASE_SCHEMA.md`。

## 4. 边界规则

- 已发布 migration 不应改写语义；需要修正时追加新版本。
- 不在 migration 中访问 Electron app、session、Cookie 或网络。
- 数据修正必须可重复安全执行到“已执行则跳过”的迁移模型中。
- 不写入用户源码、Cookie 或完整请求体。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

新增 migration 后还需要用临时空库确认从 001 到最新版本完整迁移成功。
