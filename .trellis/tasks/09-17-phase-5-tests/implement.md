# 阶段 5 执行计划

两个 PR：`test/infra`（R3+R4+R5，可在阶段 0 后立即做）、`test/layout-naming`（R1+R2，阶段 3 PR B 之后）。

## PR A：基建（约 1.5 天）
- [ ] `pnpm add -D @testing-library/jest-dom @testing-library/user-event`。
- [ ] `vitest.config.ts`：`test.projects`（main/node、renderer/jsdom + `setupFiles`）；删 21 处环境注释。
- [ ] 目录级覆盖率 thresholds；全局门抬到实测 -2。
- [ ] `tsconfig.tests.json` 开 `noUnused*`，修报错（`_` 前缀）。
- [ ] `verify.mjs` core suite 顺序确认；`tests/README.md` 定位段落。
- 验证：`pnpm test:coverage`；`pnpm test:core`。commit `test: vitest 分项目环境、目录级覆盖率门与 jest-dom`。

## PR B：结构与命名（约 2.5 天）
- [ ] `tests/setup/`、`tests/factories/`、`tests/mocks/`；把 `mkdtemp`/`initDbAtPath`/`MockBrowserWindow`/`new TabManager(` 样板收进 helpers（脚本统计归零）。
- [ ] `git mv` 到 `unit/services/{domain}/{lib,procedures}`、`unit/renderer/`、`integration/`；`vitest.config.ts` include 改；README 合并。
- [ ] 用例改名脚本：提取 1212 条 → 生成英文 `should …` 草稿 → 人工审 → 应用；21 个路径名用例手写。
- [ ] `describe` 包裹与四组分类（procedure 测试）。
- [ ] 命名守卫接入 `test:core`。
- 验证：守卫 0 违规；`pnpm test:all`。commit `test: 测试目录、factories 与用例命名对齐模板`。

## Review Gates
- PR A 合入后 CI 时长对比；PR B 合入后 `test:docs` 通过。

## Rollback
- 两 PR 独立；PR B 的目录移动为单 commit。
