# 阶段 1 执行计划

分支：`refactor/phase-1-infra-libraries`（R1/R2 可各自子分支再合入）。前置：阶段 0 已合入 dev。

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

## Rollback
- 每个 R 可独立 revert；无数据迁移。
- R3 若旧 config 加载出问题：`clearInvalidConfig: false` 保证不清空；回退 commit 即恢复旧读取器。
