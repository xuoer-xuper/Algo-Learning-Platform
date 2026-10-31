# 阶段 0b 类型感知 lint 债：no-unsafe-*、边界类型与 misused promises

## Goal

把阶段 0.4 显式暂缓的三组类型感知规则从 `off` 改为 `error`，并让 `pnpm lint` 保持 0 error 0 warning。这些不是"忘了开"，是实测后按风险分层的结果。

## Source Requirements

- 实测清单与分阶段开门的决定：`.trellis/tasks/09-17-phase-0-tooling-gates/design.md` §4、该任务的 `prd.md` R4（2026-09-17 修订）。
- 配置现状：`algo-electron/eslint.config.js` 的 `deferredTypedDebt`（唯一被关掉的规则清单）。
- 仓库红线：`.trellis/spec/project/domain-rules.md`、`.trellis/spec/shared/code-quality.md`（无 `any`、无 `!`、不吞错）。

## Scope（2026-09-17 实测，`eslint . --format json` 聚合）

| 规则 | 处数 | 分布 | 修法方向 |
| --- | --- | --- | --- |
| `explicit-module-boundary-types` | 128 | renderer 66（59 文件）/ main 62（32 文件） | 给导出函数、回调、返回对象补显式返回类型；面广但不动运行时 |
| `no-unsafe-member-access` | 50 | main 48（**7 文件**）/ renderer 2 | any 传播，集中在少数文件，收益密度最高 |
| `no-unsafe-assignment` | 40 | main 40（14 文件） | 补类型或改 `unknown` + 收窄 |
| `no-misused-promises` | 30 | renderer 29（10 文件）/ main 1 | async 传给 void 位置：`void` 包装或改签名 |
| `no-unsafe-call` | 19 | main 17（3 文件）/ renderer 2 | 同 no-unsafe-member-access |
| `no-unsafe-argument` | 7 | main 6 / renderer 1 | 参数侧收窄 |
| `no-unsafe-return` | 5 | main 3 / renderer 2 | 返回侧收窄 |
| **合计** | **279** | | |

测试侧还有一批**因作用范围而暂缓**的项（`tests/**` 目前维持 0.4 之前的规则面）：

- `no-explicit-any` 94（17 文件）、`no-unused-vars` 9、`prefer-const` 1，合计 104。
- 前置条件：给 `tests/` 建一个 projectService 能发现的 `tsconfig.json`（上游明确 `allowDefaultProject` 只适合少量配置文件：默认上限 8 个文件、glob 不允许 `**`），或改用 `parserOptions.project` 显式列出项目。方案在阶段 5（测试体系对齐）里一起定。

## Acceptance Criteria

- [ ] `eslint.config.js` 的 `deferredTypedDebt` 清空；`pnpm lint` 0 error 0 warning 且是 error 级别。
- [ ] `no-unsafe-*` 的归零方式是补类型或收窄 `unknown`，不是 `as any` / `as unknown as`。
- [ ] `pnpm typecheck`、`pnpm typecheck:tests`、`pnpm test:core` 全绿；改动有测试证据，不靠"没人跑到"。
- [ ] 若本任务同时升级 `tests/**` 的规则面，则那 104 处一并归零，并写清项目归属方案。
- [ ] 不使用任何 `eslint-disable` / `@ts-ignore`（main 的既有红线）。

## Out of Scope

- 新功能、目录搬迁（阶段 3/4/5 各自的范围）。
- 用 disable 指令或放宽规则换绿。

## Notes

- 建议顺序：先 `no-unsafe-member-access` + `no-unsafe-assignment`（集中在约 20 个文件，偿还收益最高），再 `explicit-module-boundary-types`（面广但机械），最后 `no-misused-promises`（与阶段 4 渲染层重构重叠，可那次一起做）。
- 本任务当前 `planning`，未 `task.py start`；等 0.4 归档后按父任务 `09-17-spec-alignment` 的排序排期。
