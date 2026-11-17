# 规范对齐：全面对齐 electron-fullstack 模板（父任务）

## Goal

以 `.trellis/spec/` 下的 electron-fullstack 模板为**唯一标准**，把仓库从遗留布局迁到模板布局。父任务持有决策、任务地图、跨阶段验收和最终集成评审；不直接实施代码。

## Source Requirements

- 用户决策（2026-09-17）：不为旧习惯或迁移成本保留任何现状；自研基础设施换官方库；TS 降到 6.1 之前最后稳定版并加工具门；AI 工具目录入库但排除缓存；查清重复造轮子；整顿版本管理；一切先写入计划再实施。
- 用户修订（2026-11-08）：已验收的 `dev` 可合入 `master` 发布 `2.0.1`、`2.0.2` 等后续版本，不等所有阶段完成；取消“全计划完成即发布 `3.0.0`”的绑定，最终版本与产品定位待用户新计划确认。此修订优先于归档决策中固定版本及强制独立维护线的安排，不改变兼容性与发布验收要求。
- 同日进一步确认：采用安全升级、可验证恢复、优先向前修复与有限降级；不要求任意版本无损降级，不再以内部迁移不能直接回退为由强制major或要求版本例外。独立加固任务先补齐发布前安全与验收闭环，发行继续暂停。
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
| 6 | `09-17-phase-6-cleanup-release` | 残留归档、文档重写、CHANGELOG 历史说明、README 徽章、发布流程收尾与最终验收（版本待定） | 3、4、5；阶段性发布不受此依赖限制 | 1 天 |
| 发布前 | `11-08-release-upgrade-safety` | 现有升级保护加固、恢复演练、发布工具和隔离安装验收 | 已完成dev成果；不等待阶段3–5 | 细化计划评审后执行 |

阶段 1 与 2 之间、3 与 4 之间可并行（不同文件）；阶段 5 的 5.1/5.3/5.4 可随时插入。

### 已完成阶段（2026-11-06）

- 阶段0、阶段1已归档。
- 阶段2的PR #6/#7已按顺序squash合入dev（`d9f5583`、`b74773b`），dev CI
  `42224226176`通过；R1-R5全部验收，任务归档到 `archive/2026-11/09-17-phase-2-ipc-contract`。
- 下一阶段为已存在的阶段3任务；先做Drizzle基础与迁移接入，再逐域查询迁移，目录搬迁独立。

## Constraints

- 每个子任务 = 一个 `feat/…` 或 `refactor/…` 分支 = 一次 squash 合入 `dev`（`git-workflow.md`）。
- 每个子任务合入前 `test:all` 全绿（阶段 0.2 之后为 `pnpm test:all`）。
- 领域红线（`domain-rules.md`）在任何阶段不得放松：WebContentsView 唯一、IPC 三道防线、Cookie/凭据不进渲染层、rated 比赛静默、迁移前备份。
- 新代码一律写到模板位置，即使所在模块尚未迁移（`migration-status.md`）。
- 已发布 tag 与 migration 001–029 不重写。
- 常规发布为已验收的 `dev` → `master` PR（`--no-ff`）→ tag + GitHub Release + 安装包，不要求等待全部阶段，也不是每次合入都必须发布。
- 每次发布审核完整待合入差异，包括已进入 `dev` 的数据迁移；未完成代码保留在功能分支。发布工具修复、全量测试、构建及安装升级验收必须在首次阶段性发布前完成，不能推迟到阶段6。
- 仅在 `dev` 不可发布且稳定线需要紧急修复时使用 `release/2.0` 等维护分支，从实际已发布 tag 建立（当前为 `v2.0.0`），不默认从旧 RC 建立；修复与发布元数据通过 PR 同步回 `dev`。
- 版本按实际交付和兼容性评估确认，不将所有成果自动视为 patch，也不因全部任务完成自动升 major；取消固定最终版本不代表降低迁移备份、恢复和风险说明要求。

## Cross-Child Acceptance Criteria

- [ ] `.trellis/spec/project/migration-status.md` 全部行的 "Today" 与 "Template target" 一致，随后该文件删除。
- [ ] `pnpm lint`（typescript-eslint 全套）0 error 0 warning；`pnpm typecheck` + `pnpm typecheck:tests` 0 error；prettier `--check` 通过。
- [ ] 非空断言 0、`any` 0、`console.*` 在 main 中 0（冒烟脚本与 preload 例外已在 eslint override 声明）。
- [ ] IPC channel 字面量 0；跨进程类型只在 `src/shared/types/` 定义一次。
- [ ] `electron/` 目录不存在；`src/{main,preload,renderer,shared}` 与模板 `directory-structure.md` 一致。
- [ ] 无自研 logger / payloadSchema / config 持久化 / migration runner；依赖含 zod、electron-log、electron-store、drizzle-orm、drizzle-kit。
- [ ] 数据库时间列全部 INTEGER 毫秒；旧库通过 migration 030 自动升级并有备份。
- [ ] `tests/` 结构与模板一致；覆盖率目录级门生效；jscpd < 3%。
- [ ] 发布可由经验证的 `release:prepare/build/check/draft/verify/publish` 流程完成；CHANGELOG 含历史版本号说明；README 徽章动态。
- [ ] 阶段性及最终发行版均有明确范围、确认的版本、`master` 上可追溯的源码、annotated tag 和完整 Release 资产；最终版本不再预设为 `3.0.0`，工具的 tag 落点须先与 Git 规范统一。
- [ ] 最终集成评审：在干净环境 `pnpm install && pnpm test:all && pnpm build:win`，安装包从支持的已发布版本升级启动并保留数据，覆盖 `v2.0.0`、`v2.0.0-rc.1` 及适用的中间发行版。

## Out of Scope

- 新功能、UI 视觉改版、站点 adapter 新增。
- Electron Forge（模板 README 明示 electron-builder）。
- 重写已推送的 git 历史或 tag。

## Notes

- 父任务不 `task.py start`；启动子任务 `09-17-phase-0-tooling-gates` 开工。
- 每个子任务归档后更新本文件 Task Map 的状态列，并更新 `migration-status.md`。
- 本次节奏与版本规划修订不授权立即合并 PR #8、打 tag 或发布安装包；阶段3继续保持 `in_progress`。
- 发布加固工作区基于dev，保留原分支的阶段3工作；其中阶段3元数据可能仍是规划快照，不据此改写原Drizzle分支状态。恢复发行须遵循加固任务的验收与确认门。
