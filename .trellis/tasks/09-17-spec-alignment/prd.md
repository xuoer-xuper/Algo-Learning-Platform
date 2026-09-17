# 规范对齐：全面对齐 electron-fullstack 模板（父任务）

## Goal

以 `.trellis/spec/` 下的 electron-fullstack 模板为**唯一标准**，把仓库从遗留布局迁到模板布局。父任务持有决策、任务地图、跨阶段验收和最终集成评审；不直接实施代码。

## Source Requirements

- 用户决策（2026-09-17）：不为旧习惯或迁移成本保留任何现状；自研基础设施换官方库；TS 降到 6.1 之前最后稳定版并加工具门；AI 工具目录入库但排除缓存；查清重复造轮子；整顿版本管理；一切先写入计划再实施。
- 决策记录 D1–D24、7 阶段计划、版本管理审计 V1–V10：`.trellis/tasks/archive/2026-09/00-bootstrap-guidelines/research/spec-alignment-plan.md`
- 问题清单（高 9 / 中 23 / 低 22）：同目录 `spec-alignment-report.md`
- 重复造轮子审计（A 类 13 / B 类 15）：同目录 `reinvented-wheels-audit.md`
- 项目红线：`.trellis/spec/project/domain-rules.md`
- Git 工作流：`.trellis/spec/project/git-workflow.md`
- 迁移状态表：`.trellis/spec/project/migration-status.md`

## Task Map

| 顺序 | 子任务 | 交付物 | 前置 | 估时 |
|---|---|---|---|---|
| 0 | `09-17-phase-0-tooling-gates` | 分支保护、pnpm、TS 6.0.3、typescript-eslint、prettier、husky/commitlint/lint-staged、jscpd、alias、release-it、COMMIT_RULES | 无 | 2 天 |
| 1 | `09-17-phase-1-infra-libraries` | zod、electron-log、electron-store + userData 隔离、返回形状统一、时间 bug 止血 | 0 | 4 天 |
| 2 | `09-17-phase-2-ipc-contract` | channel 常量、shared types、`window.api`、DataRefresh + useIpcQuery、时间戳毫秒迁移 | 1 | 5 天 |
| 3 | `09-17-phase-3-main-process` | Drizzle、`src/main/services` 布局、main.ts / TabManager / CoachOrchestrator 拆分、收敛项、kebab-case | 2 | 10 天 |
| 4 | `09-17-phase-4-renderer` | `src/renderer/src` 布局、Context、组件拆分、CSS 体系、加载态与吞错 | 2 | 6 天 |
| 5 | `09-17-phase-5-tests` | tests 结构、命名、覆盖率门、vitest projects | 0（5.2 重排需 3.2 之后） | 4 天 |
| 6 | `09-17-phase-6-cleanup-release` | 残留归档、文档重写、CHANGELOG 历史说明、README 徽章、RELEASE_PROCESS、v3.0.0 | 3、4、5 | 1 天 |

阶段 1 与 2 之间、3 与 4 之间可并行（不同文件）；阶段 5 的 5.1/5.3/5.4 可随时插入。

## Constraints

- 每个子任务 = 一个 `feat/…` 或 `refactor/…` 分支 = 一次 squash 合入 `dev`（`git-workflow.md`）。
- 每个子任务合入前 `test:all` 全绿（阶段 0.2 之后为 `pnpm test:all`）。
- 领域红线（`domain-rules.md`）在任何阶段不得放松：WebContentsView 唯一、IPC 三道防线、Cookie/凭据不进渲染层、rated 比赛静默、迁移前备份。
- 新代码一律写到模板位置，即使所在模块尚未迁移（`migration-status.md`）。
- 已发布 tag 与 migration 001–029 不重写。
- 对齐期间如需给用户发修复版，从 `v2.0.0-rc.1` 拉 `release/2.0` 分支，不与 `dev` 混合。

## Cross-Child Acceptance Criteria

- [ ] `.trellis/spec/project/migration-status.md` 全部行的 "Today" 与 "Template target" 一致，随后该文件删除。
- [ ] `pnpm lint`（typescript-eslint 全套）0 error 0 warning；`pnpm typecheck` + `pnpm typecheck:tests` 0 error；prettier `--check` 通过。
- [ ] 非空断言 0、`any` 0、`console.*` 在 main 中 0（冒烟脚本与 preload 例外已在 eslint override 声明）。
- [ ] IPC channel 字面量 0；跨进程类型只在 `src/shared/types/` 定义一次。
- [ ] `electron/` 目录不存在；`src/{main,preload,renderer,shared}` 与模板 `directory-structure.md` 一致。
- [ ] 无自研 logger / payloadSchema / config 持久化 / migration runner；依赖含 zod、electron-log、electron-store、drizzle-orm、drizzle-kit。
- [ ] 数据库时间列全部 INTEGER 毫秒；旧库通过 migration 030 自动升级并有备份。
- [ ] `tests/` 结构与模板一致；覆盖率目录级门生效；jscpd < 3%。
- [ ] 版本发布可由 `pnpm release` 一条命令完成；CHANGELOG 含历史版本号说明；README 徽章动态。
- [ ] `v3.0.0` 在 `master` 的 `--no-ff` merge commit 上打 annotated tag 并有完整 Release 资产。
- [ ] 最终集成评审：在干净环境 `pnpm install && pnpm test:all && pnpm build:win`，安装包可从 `v2.0.0-rc.1` 的 userData 升级启动并保留数据。

## Out of Scope

- 新功能、UI 视觉改版、站点 adapter 新增。
- Electron Forge（模板 README 明示 electron-builder）。
- 重写已推送的 git 历史或 tag。

## Notes

- 父任务不 `task.py start`；启动子任务 `09-17-phase-0-tooling-gates` 开工。
- 每个子任务归档后更新本文件 Task Map 的状态列，并更新 `migration-status.md`。
