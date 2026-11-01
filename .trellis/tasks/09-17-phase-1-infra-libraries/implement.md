# 阶段 1 执行计划

分支：`refactor/phase-1-infra-libraries`（R1/R2 可各自子分支再合入）。前置：阶段 0 已合入 dev。

> **启动评审注记（2026-11-01，1.4 评审结论）**：
> ①prd/design/implement 写于 09-17，v2.0.0 合并 + 阶段 0 全仓 prettier 格式化后**行号与计数必然漂移**——文中所有 file:line 与数量（102 处 appLogger、196 处组合子、35/23 处返回形状、6 处 errorMessage 直返）一律以实施时 `grep` 实测为准，把实测数回填到各节注记；
> ②R3 验证里的 `pnpm test:app` **脚本不存在**，配置测试在 `tests/app/`、归 `pnpm test:unit`（或定向 `pnpm exec vitest run tests/app`）；
> ③新代码遵守阶段 0 新门：`verbatimModuleSyntax`（纯类型 import 用 `import type`）、prettier（lint-staged 自动）、jscpd 3% 门（替换量大，重写时留意别引入成段复制）；
> ④推送纪律照旧：本地 `pnpm test:ci` 五步全绿才推（pre-push 门强制），推送后 `gh run watch` 盯 CI；
> ⑤五个依赖（zod/electron-log/electron-store/zod-to-json-schema）全是纯 JS 包，不触发 pnpm `allowBuilds`，无需改 pnpm-workspace.yaml。

## Checklist

### R1 zod
- [ ] `pnpm add zod`；建 `src/shared/types/ipc/{browser,coach,scripts,sites,stats,problem,notes,backup,credentials,cookies,rating,submissions,ai,config}.ts`（与 13 个 `register*Ipc.ts` 一一对应）。
- [ ] 改 `trustedSender.ts` 泛型签名与 `parseOrReject`（见 design §1）。
- [ ] 逐文件替换 13 个 `register*Ipc.ts` 的 schema 元组（196 处）；每改一个跑 `pnpm vitest run tests/ipc/<对应>`。
- [ ] `check-architecture.mjs`：`countUnschemadIpc` 识别 `z.`；`RAW_IPC_SCHEMA_BUDGET` 统计 `z.unknown()`。
- [ ] 删 `payloadSchema.ts`、改测试。
- 验证：`pnpm test:core`；`pnpm vitest run tests/security`。

### R2 electron-log
- [ ] `pnpm add electron-log`；重写 `electron/shared/logger.ts`（design §2）。
- [ ] 102 处调用改 scope（`grep -rn "appLogger\." electron | wc -l` 归零）。
- [ ] `tests/shared/logger.test.ts` 改测 hook 脱敏；`tests/electron/startupSmoke` 加"启动前日志落盘"断言。
- 验证：`pnpm test:electron`。

### R3 electron-store + envSetup
- [ ] `pnpm add electron-store zod-to-json-schema`；重写 `config.ts`；删 4 个 normalizer 与 `isStored*`。
- [ ] 加 rc.1 真实 `config.json` 样本到 `tests/app/fixtures/`，断言加载后字段齐全。
- [ ] 新建 `envSetup.ts`，`main.ts` 首行 import；`architecture` 守卫加"main.ts 第一个 import 必须是 envSetup"。
- [ ] TROUBLESHOOTING 加 `-dev` 说明。
- 验证：`pnpm dev` 观察 userData 路径；`pnpm test:app`。

### R4 返回形状
- [ ] `src/shared/types/common.ts` + `src/shared/constants/errorCodes.ts`。
- [ ] `grep -rn "{ ok:" electron src` 列表逐个改；渲染层 `*Api.ts` 与组件同步。
- [ ] 6 处 `errorMessage(error)` 直返改固定文案。
- 验证：`pnpm test:unit`；`pnpm test:ui`（错误提示文案变化可能影响截图）。

### R5 时间止血
- [ ] 三处 `toISOString` 改 `toBeijing`；删两份复制。
- [ ] `tests/coach/coachFeedbackStore.test.ts` 加东八区 `computeSince` 用例（`TZ=Asia/Shanghai` 与 `TZ=UTC` 各跑一次）。
- 验证：`pnpm vitest run tests/coach`。

## Review Gates
- 每个 R 一个 commit：`refactor(ipc): zod 替换 payloadSchema`、`refactor(shared): electron-log 替换自研日志`、`refactor(app): electron-store 替换配置持久化并隔离开发数据目录`、`refactor(ipc): 统一 IPC 返回形状`、`fix(coach): 修复时间格式混用导致的比较偏差`。
- 阶段结束 `pnpm test:all` + `pnpm build:win` + 安装包在 rc.1 用户目录上启动验证配置不丢。
- PR：`refactor(shared): 阶段 1 基础设施换库`。
- **阶段收口门实测（2026-11-01）**：
  - `pnpm test:all` 首跑拍出 R2 真回归：`ai-traceability`（RUN_AS_NODE 段）被新 logger 的顶层 `import { app } from 'electron'` 炸掉（纯 Node 下 electron 解析为 npm 路径字符串，无具名导出）——10-31 全绿是因为旧 logger 无此导入。修复 `2178ff1`：命名空间导入 + 运行时判空降级（app 不可用即关文件 transport，与旧观察行为对齐），复跑 **ALL-EXIT=0 完整全绿**（ai/db/coach 三段逐一确认，startupSmoke pre-ready 断言未弱化）。Vitest 别名与 RUN_AS_NODE 是两条不同的 electron 解析路径，R2 当时的验证面（app 态 + vitest mock）覆盖不到前者——此教训记入检查清单：凡新增顶层 electron 导入，必须跑一次 test:all。
  - `pnpm build:win` 首跑拍出打包烟测过时断言：`checkPackagedApp` 仍断言"败者不写共享日志"，与 R2 语义（electron-log 立即落盘，拒绝记录是诊断证据）冲突——vitest 契约测试改了、打包烟测漏改。修复后 **exit 0 全链**。
  - 收口门两连击恰好证明了"每阶段末跑 test:all + build:win"这条门的存在价值：两处都是 per-section 验证面覆盖不到的缝隙。
- 安装包冒烟：rc.1 配置兼容性由 `tests/app/configCompatibility.test.ts`（真实 rc.1 样本）自动化覆盖；人工启动验证待开发者（预期首次 dev 启动数据目录带 `-dev` 后缀、为空库）。

## Rollback
- 每个 R 可独立 revert；无数据迁移。
- R3 若旧 config 加载出问题：`clearInvalidConfig: false` 保证不清空；回退 commit 即恢复旧读取器。
