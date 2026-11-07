# 阶段 3 执行计划

前置：阶段 2 合入 dev。三个 PR：`refactor/drizzle`、`refactor/main-layout`（含 kebab-case）、`refactor/main-split`。

## 启动切片 A0（2026-11-07）

用户已授权合并阶段2并继续后续任务；阶段2的dev CI通过。先在`refactor/drizzle`执行A0，
不把后续查询替换/目录迁移一起混入首批。具体决策以design §0为准。

- [x] 固定Drizzle0.45.4/kit0.31.11，配置schema生成命令。
- [x] `src/main/db/schema.ts`精确描述030后25表与82个timestamp_ms列。
- [x] `src/main/db/client.ts`提供无副作用的既有连接包装，不开第二库。
- [x] 生成SQL临时库和现有0→30库做结构/约束等价；Date/epoch0/null/BLOB/事务回滚验证。
- [x] 两次typecheck、lint、test:all、build:check与独立检查通过（194文件/1574用例、UI11/11）。
- [x] A0提交`e1e3ae0`已推送，PR #8 CI `42337708058`通过。
- [x] A0收口后执行A1安全迁移账本/打包资源；业务查询留到后续独立切片。

验收记录：[A0 Drizzle基础](./a0-verification-2026-11-07.md)。A0不接管生产迁移，不宣称整个阶段3完成。

## 当前切片 A1：安全迁移基线接入

- [x] 编译可信migration标识与resourceloader，禁止路径逃逸/未知hash/journal顺序错误。
- [x] legacy连续台账、baseline物理schema和Drizzle记录prefix校验，安全baseline adoption。
- [x] 默认异步安全入口装配legacy/Drizzle，pending合并备份与兼容failurekeys；explicitoverride保持。
- [x] 打包SQL/journal到resources并测试，架构守卫覆盖新DB路径且不放开其他main模块SQL。
- [x] 增加fresh/历史升级/结构漂移/坏台账/资源/后续失败恢复/重试阻断/原生打包验收。
- [x] 独立复核无遗留问题；test:all197文件/1665用例、UI11/11、build:win通过。
- [x] A1提交`1ba968b`已推送，CI `42373778745`两项全绿；继续A2a。

验收记录：[A1安全迁移接管](./a1-verification-2026-11-07.md)。基线SQL/冻结legacy未改，用户原库未操作。

## 已验收切片 A2a：题目总览只读查询

详见 `research/a2-problem-queries.md`；A1与A2a均已推送且CI通过。

- [x] 只转换 `problem/overview.ts` 四条查询，保留同步输出、日期边界、现有tombstone语义及零值。
- [x] `problemOverview.test.ts`覆盖空库、nullable ID计数、distinct/day边界、tombstone、epoch0、
  毫秒、旧SQL结果对照、关闭重开与无写入/无通知；接入test:db并补原生ABI用例。
- [x] 独立复核、typecheck/lint、test:db、test:all；更新领域README及规范。
- [x] 提交`3869fe2`已推送，CI `42375070997`两项全绿；最新build:win也通过。

验收记录：[A2a题目总览](./a2a-verification-2026-11-07.md)。阶段3仍in_progress，PR #8保持draft。

## 下一切片 A2b：按平台题号查找ID

- [ ] 只转换 `findProblemIdByPlatformKey` 的单条SELECT；原string/null接口已经覆盖nullable ID，
  保留empty-string ID、大小写敏感、精确绑定和deleted_at=0过滤，不改其他queries/mutations。
- [ ] 对照原SQL测试命中/缺失/平台key不匹配、引号/通配符字面量、NULL/空ID、tombstone、
  只读/无通知/关闭重开；再按既定门独立复核、提交推送与CI。
- [ ] 后续upsert/DTO读查询先明确nullableID兼容策略。现有null-ID匹配在WHERE id=NULL下不更新
  但仍通知，不能悄悄改成isNull/按平台key更新或conflict-upsert。

单独待办：为native tab-drag失败补pointer/capture/finishDrag诊断，不混入查询迁移；
`research/a1-pre-push-drag-incident.md`保留未定位的瞬时失败证据，不能以复测通过宣称根因已修。

## PR A：Drizzle（`refactor/drizzle`，约 4 天）
- [x] Drizzle依赖、`drizzle.config.ts`、`src/main/db/client.ts`、`schema.ts`（25表，A0先验证）。
- [x] schema代码经`drizzle-kit generate`生成基线，与030结构验证后固定；A1安全`migrate.ts`三路径引导及Drizzle-only pending备份 + 测试。
- [ ] 逐域改写查询（顺序：problem → submission → stats → notes → site → user-script → credential → cookie → coach → rating → ai → backup）；每域改完跑 `pnpm vitest run tests/db tests/<域>`。
- [ ] `BARE_SQL_BUDGET` 守卫改规则；`learningDataExport.ts` 35 处裸 SQL 改 Drizzle 批量。
- [x] `electron-builder.json5` `extraResources: drizzle/`；`tests/packaging` 白名单；`test:packaged-app` 验证打包后迁移可运行。
- [x] `DATABASE_SCHEMA.md` 标明schema映射及Drizzle台账；`DATABASE_MIGRATION_ROLLBACK.md` 加Drizzle流程，域查询变化时继续同步。
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
- 每PR验证后squash合入dev；发版遵守项目master/release-it规则，需要单独授权，不在dev自动打alpha tag。
- 阶段结束安装包在 rc.1 userData 升级启动 + 七站手测提交监测（红线 §6）。

## Rollback
- PR A：revert 代码，数据不受影响（同 schema）。
- PR B：revert 单 commit 即整体回退。
- PR C：按拆分对象 commit，可单独 revert。
