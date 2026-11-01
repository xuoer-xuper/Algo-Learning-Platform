# 阶段 2 执行计划

分支：`refactor/phase-2-ipc-contract`；R5 单独 `feat/db-unix-ms-timestamps`。前置：阶段 1 合入 dev。

> **启动评审注记（2026-11-01，1.4 评审结论）**：
> ①**R4 路径勘误**：prd/implement 写的 `src/renderer/src/context|hooks/` 是阶段 4 的目标布局；本阶段明确"src/（渲染）不动"，正确路径为 `src/context/DataRefreshContext.tsx` 与 `src/hooks/useIpcQuery.ts`；
> ②**全部计数过时**（158/139/21/112/155/72/40/31/65/15/9 等）——以实施时 grep 实测为准并回填注记；
> ③**shared→electron 方向（阶段 1 复核 MEDIUM 项）**：R2 必须把 `COACH_PIN_MODES`/`SEARCH_ENGINE_IDS`/`THEME_PREFERENCES` 下沉到 `src/shared/`（electron 侧 re-export 或直接 import shared），否则渲染层经 @shared 消费阶段 1 schema 时会把主进程模块打进渲染包；同时建议加守卫"`src/shared/**` 不得 import `electron/`"；
> ④阶段 1 事实衔接：zod 4.6.7（discriminatedUnion 已实测）、`createOutputSchema`/`errorCodes`/13 域 `*Input` 已存在（R2 的实体类型与它们是兄弟层，勿重复）、架构守卫按 `*Input` 后缀识别、顶层 electron 导入必须跑一次 test:all（R2 教训）；
> ⑤新门遵守：verbatimModuleSyntax、prettier、jscpd 3%、test:ci 推送纪律、R1–R4 每节推送盯 CI、R5 单独分支单独 PR；
> ⑥R5 真实库 fixture：从本机 userData 复制后脱敏（prd 预授权路径），三时期（v1.0.0/beta.2/rc.1）各一份。

## Checklist

### R1 channel 常量

- [ ] 脚本抽取：`grep -rhoE "(invoke|send|on|handle)\('([a-z-]+:[A-Za-z]+)'" electron | sort -u` 生成 `channels.ts` 初稿（158 + 内部）。
- [ ] `tests/ipc/channels.test.ts` 快照当前值集合（先写测试再改代码）。
- [ ] 替换 preload 158 处、`register*Ipc.ts` 160 处、其余 4 处；`trustedSender` 参数收窄为 `IpcChannel`。
- [ ] 架构守卫：字面量预算 0；放行主进程 import `src/shared`。
- 验证：`pnpm test:core`；`pnpm vitest run tests/ipc`。commit `refactor(ipc): IPC channel 名集中为共享常量`。

> **R1 实测回填（2026-11-01 实施时 grep）**：唯一 channel 共 **178**（不是 158+内部：含
> `userscript:*` 3、`userscript-runtime:*` 2、`oj-*` 4、`log-to-main`、`realtimeSubmission:getStatus`、
> `download:result` 等）。调用点字面量实测：主进程注册 158、guarded 注册 1、preload 渲染侧
> 192（含 on/off 成对）、主进程推送 30——全部换用 `IPC_CHANNELS`；4 个原本就是常量的
> channel（`oj-submission:*` ×2、`userscript-runtime:*` ×2）改为从 shared 常量 re-export。
> 设计 §2 的 `IpcChannel` 直取推导在异构分组下塌成 `never`（keyof 并集 = 键集交集），
> 实施改为 mapped type。

### R2 shared types

- [ ] 从 `electron-env.d.ts` 按域拆 15 个文件到 `src/shared/types/`，实体用 zod。
- [ ] 主进程 72 处 `export interface` → `import type`（脚本：对 112 个名字 grep 定位）。
- [ ] 渲染 10 处 + 6 组副本删除改 import；`Pick/Omit` 处理子集。
- [ ] 删 `electron-env.d.ts`；`src/main/env.d.ts` 只留 `ProcessEnv`；`tsconfig.tests.json` include 改。
- 验证：`uniq -d` 同名导出 = 0；`pnpm typecheck` ×2。commit `refactor(shared): 跨进程类型收口到 src/shared/types`。

> **R2 实测回填（2026-11-01 实施时 grep）**：`electron-env.d.ts` 顶层类型声明 **111** 个
> （不是 112；含 `ElectronAPI` 与 `Window` 两个 API 面声明，域类型实为 109），按域拆成
> `src/shared/types/` 的 15 个文件 + `common.ts` 的 `IpcOutput`（`*Result` 七个手写镜像改为
> `IpcOutput<T>` 推导）。主进程同名声明（export + 局部）实测 **77 处分布于 28 个文件**
> （prd 写 72；含 `electron/coach/types.ts` 整文件删除改 import、3 个仓库 barrels 的
> `export type` 转指向 shared）；渲染层声明删除 **22 处分布于 8 个文件**——同名 10 +
> 改名 **9 组**（`HomeOverviewStats`、`SettingsOverviewStats`、`SidebarProblemRecord`、
> `HomeProblemRecord`(→`Pick<ProblemRecord,…>`)、`HomeRecommendation`、`ImportPreviewSite`、
> `SiteConfigView`、`NoteItem`(→`Omit<NoteRecord,'problem_id'>`)、两份
> `CodeforcesAccount`(→`PlatformAccount`)，另有 site 域 `ImportPreview`/`ImportConflict`
> 改用 shared 的 `SiteImportPreview`/`SiteImportConflict`，与 backup 域的旧同名收敛）。
> 常量下沉：
> `COACH_PIN_MODES`/`SEARCH_ENGINE_IDS`/`THEME_PREFERENCES` → `src/shared/constants/preferences.ts`
> （`src/shared/types/ipc/{coach,config}.ts` 对 electron 的反向 import 全部消除，
> "src/shared stays process-neutral" 守卫保持绿）。实测发现并修复的两处既有漂移：
> ① env.d.ts 的 `CoachConfig` 镜像漏了 `disclaimer_dismissed`（以 app/config.ts 存储形状为准）；
> ② env.d.ts 的 `coachTestLlmConnection` 返回类型误引主进程内部名 `LlmConnectionTestResult`
> （skipLibCheck 掩盖），已改 `LlmConnectionTestOutput`。`tsconfig.tests.json` include 换为
> `electron/preload.ts` + `src/main/env.d.ts`；ipcContracts 文本提取器收到
> `exposeInMainWorld` 对象字面量范围内（接口成员同名不再污染）。验证：typecheck ×2 = 0、
> lint 0/0、`uniq -d` = 0、test:core 1429 全绿、架构守卫 0/20。

### R3 window.api

- [ ] 新建 `src/preload/index.ts`（design §4）；`vite.config.ts` preload input 改路径。
- [ ] 多参数 invoke → 单对象（列出清单：`listRecentProblems(limit, platform, status)` 等，预计约 40 个）；主进程 handler 与 zod schema 同步。
- [ ] 渲染 155 处调用改 `window.api.<domain>.<method>`；删除退化的 `*Api.ts`。
- [ ] 删除 31 个无消费者的 preload 方法；守卫 `apiConsumers`。
- [ ] `electronMock.exposedMainWorld` 键名、`tests/ipc/preloadSurface`、`tests/components` 替身同步。
- 验证：临时删一个 preload 方法看 `tsc` 报错；`pnpm test:all`。commit `refactor(preload): 改为 window.api 并由 typeof 推导类型`。

### R4 数据刷新
> **暂停点（2026-11-01，用户指示 R3 完成后停下）**：R4 派发已被取消，仅产生了 channels.ts 的
> `DATA.CHANGED` 声明与 UPDATED @deprecated 注释（已丢弃，重启时按下方清单重做即可）。R1–R3
> 已推送且 CI 绿（1588b8b）；R4/R5 待后续会话继续。


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
