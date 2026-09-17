# 阶段 2 执行计划

分支：`refactor/phase-2-ipc-contract`；R5 单独 `feat/db-unix-ms-timestamps`。前置：阶段 1 合入 dev。

## Checklist

### R1 channel 常量
- [ ] 脚本抽取：`grep -rhoE "(invoke|send|on|handle)\('([a-z-]+:[A-Za-z]+)'" electron | sort -u` 生成 `channels.ts` 初稿（158 + 内部）。
- [ ] `tests/ipc/channels.test.ts` 快照当前值集合（先写测试再改代码）。
- [ ] 替换 preload 158 处、`register*Ipc.ts` 160 处、其余 4 处；`trustedSender` 参数收窄为 `IpcChannel`。
- [ ] 架构守卫：字面量预算 0；放行主进程 import `src/shared`。
- 验证：`pnpm test:core`；`pnpm vitest run tests/ipc`。commit `refactor(ipc): IPC channel 名集中为共享常量`。

### R2 shared types
- [ ] 从 `electron-env.d.ts` 按域拆 15 个文件到 `src/shared/types/`，实体用 zod。
- [ ] 主进程 72 处 `export interface` → `import type`（脚本：对 112 个名字 grep 定位）。
- [ ] 渲染 10 处 + 6 组副本删除改 import；`Pick/Omit` 处理子集。
- [ ] 删 `electron-env.d.ts`；`src/main/env.d.ts` 只留 `ProcessEnv`；`tsconfig.tests.json` include 改。
- 验证：`uniq -d` 同名导出 = 0；`pnpm typecheck` ×2。commit `refactor(shared): 跨进程类型收口到 src/shared/types`。

### R3 window.api
- [ ] 新建 `src/preload/index.ts`（design §4）；`vite.config.ts` preload input 改路径。
- [ ] 多参数 invoke → 单对象（列出清单：`listRecentProblems(limit, platform, status)` 等，预计约 40 个）；主进程 handler 与 zod schema 同步。
- [ ] 渲染 155 处调用改 `window.api.<domain>.<method>`；删除退化的 `*Api.ts`。
- [ ] 删除 31 个无消费者的 preload 方法；守卫 `apiConsumers`。
- [ ] `electronMock.exposedMainWorld` 键名、`tests/ipc/preloadSurface`、`tests/components` 替身同步。
- 验证：临时删一个 preload 方法看 `tsc` 报错；`pnpm test:all`。commit `refactor(preload): 改为 window.api 并由 typeof 推导类型`。

### R4 数据刷新
- [ ] `dataEvents` EventEmitter + `main.ts` 广播；写路径接入（列表：problem/submission/notes/stats/site/userScript/credential/coach 的 mutations，`SubmissionBatchWriter`，`TrackingService`，`NoteService`，`learningDataExport` 导入，`syncService`）。
- [ ] preload `api.data.onChanged`；`DataRefreshContext`；`useIpcQuery`。
- [ ] 15 个组件迁移；`App.tsx` 4 处模板删除；`problems:updated` 标记 deprecated。
- [ ] Playwright `dataRefresh.pw.spec.ts`。
- 验证：`pnpm test:ui`。commit `feat(renderer): 数据变更订阅与 useIpcQuery`。

### R5 时间戳毫秒（独立分支）
- [ ] 准备三份脱敏真实库到 `tests/db/fixtures/`（**由用户提供或从本机 userData 复制后脱敏**）。
- [ ] `parseLegacyTimestamp` + 单测（3 格式 × 3 时区）。
- [ ] `030_timestamps_to_unix_ms.ts` 数组驱动 65 列；`upgradePath.test.ts`。
- [ ] `time.ts` 重写；`stats/date.ts`、`periodSummaryDates.ts` 改毫秒；repository 返回 `number`；shared types `z.number()`。
- [ ] 渲染 11 处 `formatForDisplay`；备份导出/导入 `schemaVersion`。
- [ ] `DATABASE_SCHEMA.md`、`DATABASE_MIGRATION_ROLLBACK.md`、`DATA_EXPORT_AND_IMPORT.md` 更新。
- 验证：`pnpm test:db`（真实 Electron ABI）；三份 fixture 升级通过；`pnpm test:all`。commit `feat(db): 时间戳迁移为 Unix 毫秒（migration 030）`。

## Review Gates
- R1–R4 一个 PR `refactor(ipc): 阶段 2 IPC 契约与共享层`；R5 单独 PR，描述附三份库升级前后对照表。
- 阶段结束：安装包在 rc.1 userData 上启动，数据完整，Dashboard 时间显示正确。

## Rollback
- R1–R4 无数据变更，revert 即可。
- R5：迁移失败自动恢复备份；合入后若发现换算错误，写 031 修正（不回写 030）。
