# 阶段 5 测试体系对齐

## Goal

测试目录、命名、基建与覆盖率门对齐模板 `backend/directory-structure.md`、`backend/quality.md`、`shared/code-quality.md`，并把测试数据构造集中到 factories。

## Requirements

### R1 目录结构（D4，中-20）
- `tests/setup/global-setup.ts`（临时 userData/DB 初始化、`TZ` 固定）、`tests/setup/test-helpers.ts`（`mkdtemp` 封装、`initTestDb()`、`createTestTabManager()`——收敛现 32/20/13 个文件里的样板）。
- `tests/factories/{problem,submission,note,site,user-script,credential,coach-event,coach-intervention}.factory.ts` + `index.ts`（barrel + `resetAllCounters()`）。
- `tests/mocks/electron.ts`（现 `tests/electron/electronMock.ts` 移入；`vitest.config.ts` alias 同步）、`tests/mocks/browser-window.ts`（`MockBrowserWindow`，26 文件在用）。
- `tests/unit/services/{domain}/{lib,procedures}/*.test.ts`（阶段 3 已临时放 `unit/services/{domain}/`，本阶段按 lib/procedures 再分）；`tests/unit/renderer/{components,hooks,modules}/`；`tests/integration/{database,ipc,submission-flow}/`。
- 守卫类脚本（`architecture/`、`security/`、`docs/`、`packaging/`、`performance/`）与 `verify.mjs`、`ui/`（Playwright）保留在 `tests/` 顶层，README 说明它们是模板之外的项目扩展。
- 26 个目录 README 合并为 `tests/README.md` + `unit/`、`integration/`、`factories/` 各一个（`test:docs` 覆盖规则同步）。

### R2 用例结构与命名（中-19）
- 每个测试文件顶层 `describe('<Subject>')`，procedure 测试内部四组：`Input Validation` / `Normal Operations` / `Error Handling` / `Boundary Conditions`（模板 `quality.md` Test Scenario Categories）；lib/组件测试至少 `describe` 一层。
- 1212 个用例名统一英文 `it('should …')`；21 个路径名用例重写为行为描述。
- `vi.hoisted` + `vi.mock` 顺序模板化；对依赖全局 alias 替身的测试不强制 `vi.mock`。
- 守卫：`tests/docs` 或自写规则——用例名不得是文件路径、不得含中文、必须以 `should` 开头；`describe` 缺失报错。

### R3 覆盖率门（中-20）
- `vitest.config.ts` `coverage.thresholds` 增加 glob 键：`'src/main/services/**/procedures/**': { lines: 80, functions: 80 }`、`'src/main/services/**/lib/**': 80`、`'src/main/ipc/**': 60`；全局棘轮 65/60/62/68 保留并按实测抬升。
- `coverage.include` 改 `src/**`；exclude 保留入口与 `.d.ts`。

### R4 环境与工具（低-22）
- `vitest.config.ts` 用 `test.projects`：`main`（node，`tests/unit/services`、`tests/integration`）与 `renderer`（jsdom，`tests/unit/renderer`），删 21 处 `@vitest-environment` 注释。
- `pnpm add -D @testing-library/jest-dom @testing-library/user-event`；`tests/setup/renderer-setup.ts` 引入 jest-dom matchers；组件测试改 `userEvent`。
- `tsconfig.tests.json` 恢复 `noUnusedLocals/Parameters`（测试替身用 `_` 前缀参数）。

### R5 `verify.mjs` 定位
- 保留为真实 Electron ABI / safeStorage / 打包冒烟的编排器；`test:core` = `lint + typecheck ×2 + jscpd + guards + vitest`（与模板 `lint && typecheck && test` 对齐并超集）；`test:all` 定义不变。
- `tests/README.md` 明确"Vitest 是唯一单元/集成 runner，verify.mjs 不做用例发现"。

## Acceptance Criteria

- [ ] `tests/` 顶层只有 `setup/ factories/ mocks/ unit/ integration/ ui/ architecture/ security/ docs/ packaging/ performance/ verify.mjs README.md`。
- [ ] `grep -rl "mkdtemp\|initDbAtPath" tests/unit tests/integration | wc -l` = 0（全部经 helpers/factories）。
- [ ] 用例名守卫 0 违规：0 中文、0 路径名、100% `should`、100% 有 `describe`。
- [ ] 目录级覆盖率门生效并通过；全局门 ≥ 70/65/68/73（当前实测值，作为新棘轮）。
- [ ] `grep -rn "@vitest-environment" tests` = 0；`test.projects` 两个项目各自通过。
- [ ] `pnpm typecheck:tests` 在 `noUnused*` 开启下 0 error。
- [ ] `pnpm test:core` 含 jscpd 与 guards；`pnpm test:all` 全绿；CI 时间不超过现状 +20%。

## Out of Scope

- 提高覆盖率本身（补测试是各阶段的事）；Playwright 用例重写（阶段 4 已按 testid 调整）。

## Notes

- 前置：R1 的目录重排需在阶段 3 PR B（源码迁移）之后；R2–R5 可在阶段 0 之后随时做。
- 1212 个用例改名是机械劳动，建议脚本先把中文名翻译为英文草稿再人工审。
