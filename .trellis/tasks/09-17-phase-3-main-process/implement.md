# 阶段 3 执行计划

前置：阶段 2 合入 dev。三个 PR：`refactor/drizzle`、`refactor/main-layout`（含 kebab-case）、`refactor/main-split`。

## PR A：Drizzle（`refactor/drizzle`，约 4 天）
- [ ] `pnpm add drizzle-orm && pnpm add -D drizzle-kit`；`drizzle.config.ts`；`db/client.ts`、`schema.ts`（21 表，从 `DATABASE_SCHEMA.md` + 001–030 抄列，时间列 `timestamp_ms`）。
- [ ] 在 030 之后空库上 `drizzle-kit generate` → `drizzle/0000_baseline.sql`；`migrate.ts` 三路径引导 + 测试。
- [ ] 逐域改写查询（顺序：problem → submission → stats → notes → site → user-script → credential → cookie → coach → rating → ai → backup）；每域改完跑 `pnpm vitest run tests/db tests/<域>`。
- [ ] `BARE_SQL_BUDGET` 守卫改规则；`learningDataExport.ts` 35 处裸 SQL 改 Drizzle 批量。
- [ ] `electron-builder.json5` `extraResources: drizzle/`；`tests/packaging` 白名单；`test:packaged-app` 验证打包后迁移可运行。
- [ ] `DATABASE_SCHEMA.md` 重写；`DATABASE_MIGRATION_ROLLBACK.md` 加 drizzle 流程。
- 验证：`pnpm test:all`；三份 fixture 库启动。commit 拆分按域。

## PR B：目录迁移 + kebab-case（`refactor/main-layout`，约 3 天，零逻辑变更）
- [ ] 写迁移脚本 `scripts/migrate-main-layout.mjs`：按 design §1 域映射表 `git mv` + 重命名 kebab-case + 批量改 import 路径（用 `ts-morph` 或 `tsc` 报错驱动修正）。
- [ ] `vite.config.ts`、`electron-builder.json5`、`tsconfig*.json`、`vitest.config.ts`、`tests/architecture` 路径常量、`tests/packaging` 白名单同步。
- [ ] 测试文件同步 `git mv` 到 `tests/unit/services/{domain}/`（临时，阶段 5 再分 lib/procedures）。
- [ ] 每域 README 随目录移动并改路径。
- [ ] 文件名守卫（自写 `check-architecture.mjs` 规则：非 `.tsx`、非 `use*.ts` 的文件必须 kebab-case）。
- 验证：`git diff -M90% --stat` 全是 rename；`pnpm test:all`。单 commit `refactor(main): 主进程迁到 src/main 模板布局并统一 kebab-case`。

## PR C：拆分与收敛（`refactor/main-split`，约 3 天）
- [ ] `index.ts` / `bootstrap-services.ts` / `app-context.ts` / `create-shell-window.ts` / `shell-shortcuts.ts`；守卫禁模块级 `let`。
- [ ] procedures 化：为每个 handler 建 procedure 文件（先脚本生成骨架，再把 handler 体移入）；3 个胖 handler 主体下沉；handler 体 ≤ 5 行守卫。
- [ ] TabManager 五分（design §5），每步跑 `tests/browser`。
- [ ] CoachOrchestrator 四分（design §6），每步跑 `tests/coach`。
- [ ] 收敛：`atomic-json-snapshot-store.ts`、`timing.ts`、`typed-emitter.ts`、`createGuardedIpc`、`site-registry.ts`、`randomUUID`、去重函数。
- [ ] `AppError` 基类 + 5 子类；procedure 全部 `logger.scope`。
- [ ] `SYSTEM_ARCHITECTURE.md` 重写目录树与数据流。
- 验证：行数守卫；jscpd < 2%；`pnpm test:all` + `pnpm build:win`。commit 按拆分对象。

## Review Gates
- 每 PR squash 合入 dev；PR C 合入后打 `v3.0.0-alpha.1`（release-it `--preRelease=alpha`，在 dev 上允许 alpha）。
- 阶段结束安装包在 rc.1 userData 升级启动 + 七站手测提交监测（红线 §6）。

## Rollback
- PR A：revert 代码，数据不受影响（同 schema）。
- PR B：revert 单 commit 即整体回退。
- PR C：按拆分对象 commit，可单独 revert。
