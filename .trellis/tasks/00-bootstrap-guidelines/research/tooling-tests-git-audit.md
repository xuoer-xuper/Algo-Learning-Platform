# 测试 / 工具链 / 仓库卫生 / Git 习惯审计报告

> 审计日期：2026-09-17 ｜ 分支：dev（HEAD f5a24b3）｜ 只读审计，未改动任何仓库文件
> 基准：`.trellis/spec/` 下 electron-fullstack 官方模板（shared/code-quality.md、shared/git-conventions.md、shared/pnpm-electron-setup.md、backend/quality.md、backend/directory-structure.md、frontend/quality.md）
> 对照：`docs/GOVERNANCE/COMMIT_RULES.md`、`docs/GOVERNANCE/CONTRIBUTING.md`
> 所有计数均来自本次会话内实际执行的 `git ls-files` / `grep` / `node -e` 输出；未执行任何测试或 lint（只读）。

每条按 (a) 规范要求 (b) 为什么 (c) 现状证据 (d) 优先级 记录。优先级含义：**高** = 与模板硬性规则冲突且影响质量门；**中** = 结构性差异，值得在规范落地时决定"改项目"还是"改规范"；**低** = 风格差异或仅需记录。

---

## A. 测试

### A1. 目录结构：按模块分目录 vs 模板 setup/factories/mocks/unit/integration

- (a) 模板 `backend/directory-structure.md` 要求 `tests/{setup/, factories/, mocks/, unit/services/{domain}/{lib,procedures}/, integration/}`；单元测试 `{file}.test.ts`，集成测试 `{feature}.test.ts`，factory `{entity}.factory.ts`。
- (b) 模板按"测试类型"分层（mock 单测 vs 真库集成），使 setup/factory/mock 可复用，并让 `unit/` 与 `src/main/services/{domain}` 一一映射。
- (c) 现状：
  - `algo-electron/tests/` 下 git 跟踪 235 个文件，26 个按**业务模块**分的子目录（browser 28、components 25、db 24、coach 24、scripts 17、submissions 12、electron 11、ui 10、ipc 10、windows 9、security 9、app 7、adapters 6、parsers 5、tracking/shared/performance/packaging/downloads/architecture 各 4、integration/ai 各 3、shortcuts/docs/diagnostics 各 2）+ `verify.mjs` + `README.md`。
  - 后缀统计（跟踪文件）：`.test.ts` 161、`.test.tsx` 17、`.md` 27（每个子目录一个 README）、`.mjs` 15、纯 `.ts` 5、`.tsx` 3、`.repro.ts` 3、`.pw.spec.ts` 2、`.html` 2。
  - **无** `tests/factories/`、`tests/setup/`、`tests/mocks/` 目录（`ls -d` 三者均报 No such file）。
  - 无任何 `*.factory.ts` 文件；唯一 fixture 是 `tests/electron/fixtures/userScriptRuntimeOrdinaryPreload.ts`（+ README）。
  - Electron 替身在 `tests/electron/electronMock.ts`（模板位置应为 `tests/mocks/electron.ts`），通过 `vitest.config.ts` 的 `resolve.alias.electron` 全局注入，30 个测试文件直接引用它；另有 4 个文件自行 `vi.mock('electron')`。
  - `tests/integration/` 存在但只有 3 个文件；模板要求的"真库集成"实际散落在 `tests/db/`（由 `verify.mjs db` 在真实 Electron ABI 下跑 4 个文件）。
  - 只有 1 处目录级 vitest 覆盖配置：`tests/browser/auditWindowLifecycle.vitest.config.ts`（专门给 `.repro.ts` 用）。
- (d) **中**。项目按模块分目录是刻意且成体系的（27 个 README + `check-architecture.mjs` 守卫），与模板的按类型分层是两套合理方案；建议规范落地时**明确以项目现状为准并写进 backend/directory-structure.md**，而不是搬 235 个文件。但缺 `factories/` 是真实缺口（见 A1 补充：测试数据构造分散在各文件里，无 `resetAllCounters()` 之类共享入口）。

### A2. 测试与源码是否 co-located

- (a) `shared/code-quality.md` 示例允许 `src/utils/date-utils.test.ts` co-located + `src/__tests__/` 集成；`backend/quality.md` 与 `directory-structure.md` 要求 `tests/unit/`。两份模板自相矛盾。
- (b) co-located 便于就近维护；集中 `tests/` 便于统一 tsconfig/coverage include。
- (c) 现状：`git ls-files src | grep -E '\.(test|spec)\.tsx?$'` = **0**；`electron/` 同样 **0**；`__tests__` 目录 **0**。全部集中在 `tests/`，且 `tsconfig.json` include 只有 `["src","electron"]`，测试类型检查单独走 `tsconfig.tests.json`。
- (d) **低**。项目一致地采用集中式，与 backend 模板一致；只需在规范里删掉 code-quality.md 那段 co-located 示例避免误导。

### A3. 覆盖率门槛

- (a) `backend/quality.md`：Procedures > 80%、Lib/Helpers > 80%、IPC Handlers > 60%。
- (b) 按层设目标，让核心业务逻辑门槛高于薄封装层。
- (c) 现状 `vitest.config.ts` 是**全局单一门**：`thresholds: { statements: 65, branches: 60, functions: 62, lines: 68 }`。注释记录实测 67.37/62.79/64.90/70.27，档位沿革 56/53/54/59 → 61/57/58/64 → 65/60/62/68（"补完测试就把门跟上"的棘轮策略）。本地 `tmp/coverage/coverage-summary.json`（2026-09-05 生成，未跟踪）显示 statements 69.97 / branches 64.55 / functions 68.11 / lines 73.13。coverage include = `electron/**/*.ts, src/**/*.{ts,tsx}`，排除 `electron/main.ts`、`src/main.tsx`、`src/vite-env.d.ts`。9 个真实 Electron 套件被 `exclude` 挡在 Vitest 外，覆盖率不含它们。
- (d) **中**。全局 65% 与模板"procedures 80%"不可直接比较（模板按层，项目按全仓）。项目没有 `procedures/` 这个概念（见 directory-structure 审计）。建议：保留棘轮门，另加 per-directory 门（vitest `coverage.thresholds` 支持 glob key），对 `electron/db/**`、`electron/adapters/**` 等纯逻辑目录设 80%，对 `electron/ipc/**` 设 60%——这样既对齐模板意图又不推翻现有策略。

### A4. 测试文件模板与命名风格

- (a) 模板要求：`vi.hoisted()` 定义 mock → `vi.mock()` → 再 import 被测模块；`describe('X Procedure')` 下按 `Input Validation / Normal Operations / Error Handling / Boundary Conditions` 分组；用例 `it('should ...')` 英文。
- (b) 固定四类场景防止只测 happy path；`should` 句式让失败输出可读。
- (c) 现状（178 个 `.test.ts(x)`，1212 个 `it/test` 调用）：
  - 使用 `describe` 的文件 **61 / 178**；使用 `it(` 51 个，使用顶层 `test(` **121** 个（主流是扁平 `test()`，无 describe）。
  - `vi.hoisted` 17 个文件；`vi.mock(` 24 个文件（多数依赖全局 alias 替身，不需要 vi.mock）。
  - 四类 describe 分组名（Input Validation 等）出现 **0** 次。
  - 用例名以 `should` 开头 **11 / 1212**。
  - 用例名含中文 **661 / 1212**（约 55%），集中在 `coach`（17 文件）、`components`（15）、`ipc`（3）；`browser`（24）、`db`（21）、`scripts`（15）、`submissions`（11）等目录几乎全英文。**同一仓库中英混用**。
  - 21 个用例名直接等于文件路径（如 `test('adapters/adapterRegistry.test.ts', ...)`），信息量为零。
  - 抽查 5 文件：`tests/db/statsDate.test.ts`（顶层 `test('builds stable local-day range boundaries')`，英文陈述句）；`tests/browser/tabManagerLifecycle.test.ts`（顶层 `test('closing the active tab selects its right neighbor ...')`，英文行为句）；`tests/components/appContestNotice.test.tsx`（顶层 `test('shows a persistent layout notice ...')`，英文）；`tests/ipc/registerCredentialsIpc.test.ts`（顶层 `test('credentials IPC exposes only masked list ...')`，英文）；`tests/adapters/adapterRegistry.test.ts`（`test('adapters/adapterRegistry.test.ts')`，路径名）；另 `tests/app/themePreference.test.ts` 用 `describe` + `it('三档偏好与 Electron themeSource 同名，默认跟随系统')` 中文。
- (d) **中**。风格本身（英文行为陈述句、无 should）是可接受的现代 Vitest 风格，不必强改；真正的问题是 (1) 中英混用无规则，(2) 21 个路径名用例，(3) 无强制四类场景。建议规范里**明确选一种语言**（项目 commit 用中文、文档用中文，测试名建议统一中文或统一英文，二选一写死）并禁止路径名用例。

### A5. `npm test` 与 `tests/verify.mjs`

- (a) 模板 `backend/quality.md`：`npm test` 跑全部；`npm test -- <file>` 跑单文件；`npm run test:coverage`；`git-conventions.md` Pre-Commit 清单只有 typecheck / lint / `npm test` 三项。
- (b) 单一入口降低认知负担，CI 与本地一致。
- (c) 现状：
  - `"test": "npm run test:unit"`，`"test:unit": "vitest run"` —— **等价于 `vitest run`**（多一层间接）。
  - `package.json` 里 `test*` 脚本共 **20 条**（test, test:unit, test:watch, test:coverage, test:core, test:ai, test:architecture, test:security, test:adapters, test:submissions, test:db, test:docs, test:packaging, test:packaged-main, test:packaged-app, test:performance, test:electron, test:ui, test:coach, test:all）。
  - `tests/verify.mjs`（273 行）是**跨工具串行编排器**：6 个 suite（core / ai / db / electron / coach / all）。`core` = tsc + tsc -p tsconfig.tests.json + eslint + check-architecture + check-sensitive-files + 全量 vitest；`all` 再加 9 个真实 Electron 套件（esbuild 打包后用 `electron.exe` / `ELECTRON_RUN_AS_NODE` 跑）、docs、packaging、performance、Playwright。它自身不做用例发现/断言（README 明确边界）。
  - 独立 `.mjs` 脚本入口 15 个（architecture 2、docs 1、packaging 3、performance 2、security 1、ui 3、components/db/performance 的 runAudit* 3、verify 1）。
  - CONTRIBUTING.md 要求 commit 前跑 `test:core + test:docs + test:packaging`（对应 CI `fast-guard`），与模板"lint && typecheck && test"三步在**内容上是超集**，但命令名不同。
- (d) **低**。这套编排是为真实 Electron ABI 测试而生的必要复杂度，且有文档。差异只在命名：模板的 `npm run lint && npm run typecheck && npm test` 在本项目等价于 `npm run test:core`（还多了架构/安全守卫）。规范落地时把 `test:core` 写成项目的"pre-commit 标准命令"即可。注意 `npm test` 本身**不含** typecheck/lint，不能单独当门。

### A6. 组件测试基建（jsdom / testing-library）

- (a) 模板未专门规定；`frontend/quality.md` 只要求 lint/typecheck。
- (b) `.test.tsx` 需要 DOM 环境。
- (c) 现状：`jsdom@29.1.1`、`@testing-library/react@16.3.2` 已装；`happy-dom`、`@testing-library/jest-dom`、`@testing-library/user-event`、`@testing-library/dom` **未装**（无 `toBeInTheDocument` 等 matcher，无 setupFiles）。`vitest.config.ts` 全局 `environment: 'node'`；**17 个 `.test.tsx` 全部**在文件头写 `// @vitest-environment jsdom`（另 4 个 `.test.ts` 也用了，共 21 个文件），19 个文件 import `@testing-library`。没有 `tests/components/` 级别的 vitest 配置。`tests/components/README.md` 明确记录了"文件头声明环境，其余默认 node"的约定。
- (d) **低**。机制可用且有文档。若组件测试继续增长，可考虑用 vitest `test.projects`（或 `environmentMatchGlobs`）按目录切环境，省掉每文件注释。

---

## B. 工具链

### B1. ESLint：babel-parser 而非 typescript-eslint

- (a) `shared/code-quality.md` 核心规则：禁止 `!` 非空断言、禁止 `any`；`frontend/quality.md`：`pnpm lint` 0 errors 0 warnings，禁止未使用 import/变量（`_` 前缀豁免）。这些在 ESLint 里对应 `@typescript-eslint/no-non-null-assertion`、`no-explicit-any`、`no-unused-vars`。
- (b) TS 语义规则只有 typescript-eslint 能查；babel 只做语法。
- (c) 现状 `algo-electron/eslint.config.js`：
  - parser = `@babel/eslint-parser@8.0.1` + `@babel/preset-typescript`；插件仅 `react-hooks@7.1.1`、`react-refresh@0.5.4` + `@eslint/js` recommended。
  - `'no-undef': 'off'`、`'no-unused-vars': 'off'`（注释说明：TypeScript 7 领先于 typescript-eslint 的 type-aware parser，暂用 babel）。
  - **无** `no-non-null-assertion`、**无** `no-explicit-any`、无 `prefer-const` 之外的 TS 规则。未使用变量由 `tsconfig.json` 的 `noUnusedLocals/noUnusedParameters: true` 兜底（但 `tsconfig.tests.json` 关掉了这两项，测试里的未使用变量**无人检查**）。
  - `node_modules/@typescript-eslint` 与 `node_modules/typescript-eslint` 均**不存在**；`typescript@7.0.2`。
  - 项目 `lint` 脚本 = `eslint . --report-unused-disable-directives --max-warnings 0`（比模板严格：warning 也算失败）。
  - 实际代码状态（grep 粗算）：`electron/ + src/` 中非空断言 `x!.` / `x!)` 模式 **0** 处；`: any` / `as any` / `<any>` **8** 处，其中 5 处是注释里的历史说明，实际代码约 3 处；`eslint-disable` 全仓仅 **1** 处。即代码本身已基本满足模板规则，只是**没有 lint 规则守着**。
- (d) **高**。模板两条核心规则目前完全靠人工/注释维持。建议：(1) 先验证 `typescript-eslint` 最新版是否支持 TS 7.0.x（其 peer range 通常写 `>=4.8.4 <7.1.0` 之类，需在 npm 查一次；本次只读未安装）；若支持则切换 parser 并开 `no-non-null-assertion`、`no-explicit-any`、`@typescript-eslint/no-unused-vars`（`argsIgnorePattern: '^_'`）；(2) 若不支持，至少加一个 `check-architecture.mjs` 风格的守卫用正则扫 `!\.`/`as any` 做棘轮。

### B2. TypeScript 配置与 path alias

- (a) `backend/quality.md`：renderer 用 `@shared` alias，main 用相对路径；tsconfig `paths` 与 Vite `resolve.alias` 必须同步。
- (b) renderer 深层相对路径难读。
- (c) 现状：三份 tsconfig（`tsconfig.json`、`tsconfig.node.json`、`tsconfig.tests.json`）**均无 `paths` / `baseUrl`**；`vite.config.ts`、`vitest.config.ts` 中无 `@shared/@main/@renderer` alias（vitest 只有 `electron → electronMock` 一条）。`strict: true` + `noUnusedLocals/Parameters` + `noFallthroughCasesInSwitch` + `isolatedModules`；`moduleResolution: bundler`；lib ES2020。`tsconfig.tests.json` 单独把 `tests/` 纳入 tsc（extends 主配置，lib 提到 ES2022，关掉 noUnused*），并挂进 `test:core` 门（注释记录补上时暴露 129 个错误）。`typecheck` 脚本只跑主 tsconfig，`typecheck:tests` 单独存在。
- (d) **中**。项目目录不是模板的 `src/main | src/renderer | src/shared` 三分（是 `electron/` + `src/` + `electron/shared/`），因此 `@shared` alias 的前提不成立；但 renderer 到 `electron/shared` 的相对路径问题同样存在。建议规范里按项目实际路径决定是否引入 alias；若引入，必须同时改 `tsconfig.json` paths + `vite.config.ts` renderer alias + `vitest.config.ts` alias 三处。

### B3. Vite 配置

- (a) 模板 `pnpm-electron-setup.md` 基于 Electron Forge + 三份 vite.*.config.ts；`backend/quality.md` 要求三份配置各自声明 alias。
- (b) Forge 的三配置结构是模板假设。
- (c) 现状：单一 `vite.config.ts` 用 `vite-plugin-electron/simple@1.1.1`（main/preload/renderer 在一个对象里）+ `electron-builder@26.15.3` 打包，**不用 Forge**（`@electron-forge/cli` 未装）。main 用 `rolldownOptions.external: ['better-sqlite3']`（Vite 8 rolldown），无 alias。`NODE_ENV=test` 时 renderer 置 undefined。
- (d) **低**。这是稳定技术栈（memory 里"固定技术栈"），不应为对齐模板换成 Forge。规范落地时把 pnpm-electron-setup.md 里 Forge 段落标注为"不适用"，或替换为 vite-plugin-electron + electron-builder 的等价说明。

### B4. 包管理器

- (a) `frontend/quality.md`："Use pnpm"，"npm install # Don't"；`pnpm-electron-setup.md` 要求 `.npmrc`（`node-linker=hoisted`、`shamefully-hoist=true`）、`packageManager: "pnpm@..."`、`pnpm-lock.yaml`。
- (b) monorepo 场景 pnpm 更快、更省盘。
- (c) 现状：**npm**。`algo-electron/package-lock.json`（跟踪，457 KB）；`.npmrc` 根与子目录均**不存在**；`packageManager` 字段**不存在**；`engines: { node: ">=22.18.0 <25" }`；无 `pnpm-lock.yaml`/`yarn.lock`；CI 用 `npm ci` + `cache: npm`；`postinstall` = `install-electron --no && electron-builder install-app-deps`。不是 monorepo（根目录无 package.json）。
- (d) **低**。模板的 pnpm 理由（monorepo）在本项目不成立，且 npm 已在 CI 稳定运行。建议**不换**，但补 `"packageManager": "npm@<当前版本>"` 字段（corepack 可读，防止有人用 pnpm 混入），并在规范里把 pnpm 章节标为不适用。

### B5. 格式化

- (a) 模板 spec 文件本身是 prettier 风格（对齐表格、单引号、无分号）；`frontend/quality.md` 无显式 prettier 要求。
- (b) 统一格式减少 diff 噪音。
- (c) 现状：**无 prettier**（未安装、无 `.prettierrc`、package.json 无 `prettier` 键）；有 `.editorconfig`（UTF-8、2 空格、LF、Windows 脚本 CRLF）和 `.gitattributes`（binary 类型）。CONTRIBUTING §5 明确"不要在一个 PR 中只因为格式工具重写大量无关文件"。代码风格实际统一为无分号 + 单引号（vite/vitest 配置可见）。
- (d) **低**。可选。若加 prettier，必须一次性全仓格式化并单独一个 `style:` commit；否则保持现状并在规范里写明"格式由 .editorconfig 约束，不引入 prettier"。

### B6. lint/typecheck/test 脚本对齐

- (a) 模板：`npm run lint`、`npm run typecheck`、`npm test`、`npm run test:coverage`。
- (c) 现状四个脚本**全部存在且语义一致**：`lint` = eslint 全仓 max-warnings 0；`typecheck` = `tsc --noEmit`；`test` = `vitest run`；`test:coverage` = `vitest run --coverage`。额外有 `typecheck:tests`。
- (d) **低**。已对齐。唯一提醒：模板 pre-commit 三连 `lint && typecheck && test` 在本项目漏掉 `typecheck:tests`、架构/安全守卫，应以 `test:core` 为准。

### B7. 日志库

- (a) `backend/quality.md` Forbidden Patterns：`console.log` → 用 `electron-log`。
- (b) 结构化、可轮转、可搜索。
- (c) 现状：`electron-log` **未安装**；自研 `electron/shared/logger.ts`（197 行）：5 级别、文件轮转（2 MB × 3 归档）、敏感键脱敏（authorization/cookie/csrf/password/token/api-key 正则）、URL 脱敏、pending 队列上限。22 个文件 import 它。`electron/` 下残余 `console.log(` 5 处、`console.*` 共 9 处。
- (d) **低**。自研 logger 功能覆盖 electron-log 的核心，且多了 Cookie/token 脱敏（项目隐私红线需要）。**不建议替换**；规范落地时把"用 electron-log"改为"用 `electron/shared/logger`"，并把 9 处 `console.*` 列入清理或加 lint `no-console` 规则（`electron/**` 范围）。

---

## C. 仓库卫生

### C1. 疑似残留文件的跟踪状态

用 `git -c core.quotepath=off ls-files --error-unmatch` + `git check-ignore` 逐一确认：

| 路径 | 跟踪？ | .gitignore 命中？ | 大小 | 最后提交 | 判断 |
| --- | --- | --- | --- | --- | --- |
| `algo-coach-showcase.html` | **跟踪** | 否 | 40 KB | 5207d3a 2026-07-01 "refactor: 重构 OJ 适配层…" | 营销落地页 HTML，与 refactor commit 混入，无任何文档引用 → **残留** |
| `release-notes.txt` | **跟踪** | 否 | 709 B | 4ca7f1d 2026-08-11 | 内容是 v2.0.0-beta.2 的 changelog 片段，`docs/PRODUCT/CHANGELOG.md` 已是正式 changelog → **残留/重复** |
| `AI_HANDOFF.md` | **跟踪** | 否 | 10.8 KB | 67e0fa7 2026-09-17（最近还在更新） | 被 `docs/README.md` 与 `PROJECT_AUDIT_CHECKLIST.md` 引用；memory 说"旧文档体系已清理"但它仍活跃 → **不是残留，是活文档**，但与 `.trellis/` 任务体系职责重叠 |
| `VERSION_PLAN.md` | **跟踪** | 否 | 2.4 KB | 97fab60 2026-09-05 | 被 `README.md`、`docs/README.md` 引用 → 活文档 |
| `AGENTS.md` | **跟踪** | 否 | 1 KB | f5a24b3 | Trellis 生成的入口，正常 |
| `tmp/`（根） | 未跟踪 | **ignored** | dir | — | 工作区垃圾，安全 |
| `algo-electron/build.log` | 未跟踪 | ignored (`*.log`) | 108 B | — | 安全 |
| `algo-electron/build-b2-validation.log` | 未跟踪 | ignored | 31 KB | — | 安全 |
| `algo-electron/tests-tsc4.log` | 未跟踪 | ignored | 44 KB | — | 安全 |
| `algo-electron/tmp-dev-nowcoder.log` | 未跟踪 | ignored | 1.2 KB | — | 安全 |
| `algo-electron/tsconfig.node.tsbuildinfo` | 未跟踪 | ignored (`*.tsbuildinfo`) | 93 KB | — | 安全 |
| `algo-electron/tmp/`、`release/`、`dist/`、`dist-electron/` | 未跟踪 | ignored | dir | — | 安全 |
| `algo-electron/docs/REFACTOR_HANDOFF.md` | **跟踪** | 否 | 9.1 KB | c8dd226 2026-09-01 | "B1 设计系统落地交接"，被 `check-architecture.mjs` 注释和 `BROWSER_SHELL_REFACTOR_PLAN.md` 引用 → 阶段性交接文档，B 阶段已完成（B5 已验收）→ **可归档** |
| `algo-electron/docs/TASKS.md` | **跟踪** | 否 | 36.5 KB | 872df87 2026-08-11 | "AI Coach 任务路线图"，仅被 `ai coach技术栈.md` 互引 → **与 .trellis/tasks 职责重叠，可归档** |
| `algo-electron/docs/ai coach技术栈.md` | **跟踪** | 否 | 17 KB | 7d9b265 2026-07-07 | 文件名含空格+中文，`git ls-files` 默认输出为 `"algo-electron/docs/ai coach\346\212\200\346\234\257\346\240\210.md"`（转义），会破坏任何按行解析 ls-files 的脚本（本次统计中它被计成一个独立"顶层目录" `"algo-electron`） → **重命名为 ASCII 无空格** |

结论：`.gitignore` 对 `*.log`、`tmp/`、`*.tsbuildinfo`、`release/`、`dist/` 均生效，**没有构建产物/日志被跟踪**（`git ls-files | grep -E '(^|/)(tmp|release|dist|dist-electron)/'` = 0）。真正的残留是 3 个根目录文件 + 3 个 `algo-electron/docs/` 阶段文档。

优先级：`algo-coach-showcase.html`、`release-notes.txt` **中**（无引用、可直接删）；`ai coach技术栈.md` 重命名 **中**（脚本可靠性）；`REFACTOR_HANDOFF.md`/`TASKS.md`/`AI_HANDOFF.md` **低**（先决定 `.trellis/` 接管后再归档到 `docs/ARCHIVE/`）。

### C2. 跟踪文件总数与分布

- `git ls-files | wc -l` = **982**。
- 顶层：`algo-electron` 744、`.trellis` 90、`.grok` 49、`.agents` 46、`docs` 25、根文件 10、`.github` 9、`.codex` 8、（1 个转义路径见 C1）。
- `algo-electron/` 二级：`electron` 370、`tests` 235、`src` 118、根文件 13、`docs` 3、`build` 3、`public` 2、`scripts` 1。
- 观察：`.agents/skills` 与 `.grok/skills` 有 **43 个相同相对路径**（f5a24b3 同一 commit 引入），疑似 Trellis 为多 AI 客户端各复制一份；加 `.codex/` 共 103 个 AI 工具配置文件占仓库 10.5%。是否全部跟踪值得在 Trellis 规范里明确（低优先级，记录）。

### C3. 备份/副本/大文件

- `grep -iE '\.(bak|orig|old|tmp|swp)$|copy|副本|~$|\(1\)|_old|-old|backup'` 命中 9 个，**全部**是 `electron/backup/`、`registerBackupIpc.ts`、`BackupPanel.tsx`、`backupImport.test.ts` 等**真实备份功能模块**，非残留 → 真实副本文件 **0**。
- `git ls-tree -r -l HEAD` 中 > 1 MB 的 blob：**0**。> 200 KB：`algo-electron/package-lock.json` 457 KB（正常）、`docs/DESIGN/BROWSER_SHELL_REFACTOR_PLAN.md` 234 KB（单个 Markdown 234 KB 偏大，是 B0–B6 全程账本；低优先级，可考虑拆分或归档已完成阶段）。
- 优先级：**低**。

### C4. README 数量

- `git ls-files | grep -c 'README\.md$'` = **108**（其中 `tests/` 下 27 个，即每个测试子目录一个）。这是项目约定（`test:docs` 有覆盖率检查），不是问题。记录。

---

## D. Git 习惯

### D1. Commit 信息格式

- (a) 模板 `git-conventions.md`：`type(scope): description`，英文，scope 从 db/ipc/ui/auth/project/settings 选；示例中 `docs:`、`chore:` 可无 scope。项目 `COMMIT_RULES.md`：`类型: 中文说明`，无 scope，类型多一个 `ci`；禁止 update/wip/misc 等。
- (b) 两者都是 Conventional Commits 变体；冲突点是**语言**（英/中）和 **scope 是否必需**。
- (c) 最近 60 条（`git log --format=%s -60`）：
  - `类型: 说明`（无 scope）**45** 条；`类型(scope): 说明` **11** 条（scope 用过 coach ×6、ci ×2、test ×2、ui ×1）；不符合两种格式的 **4** 条：
    - `design: 完成 Q4 设计系统零散漂移收口`（design 不是合法 type）
    - `tests: 新增分层与设计系统守卫`（应为 test）
    - `renderer: 收口 tsx 层 window.electronAPI 直连`（renderer 是 scope 不是 type）
    - `renderer: 补齐读路径错误处理与全局 rejection 兜底`
  - 另有 `release: 发布 v2.0.0-rc.1 候选版本` —— `release` 在模板和 COMMIT_RULES 都不是合法 type（应为 `chore(release):` 或 `chore: 发布 …`）。
  - 类型分布：fix 13、docs 12、test 11、refactor 9、feat 5、chore 5、renderer 2、tests 1、release 1、design 1。
  - 全部 60 条说明为中文（含 CJK）。
  - 早期 commit 里 `fix(test)` 把 test 当 scope，与 `test:` type 语义重叠——scope 词表未定义。
  - 每 commit 触及文件数：min 1、median 5、max **195**；> 20 文件的 commit **9 / 60**（如 c8dd226 "B5 落地分区导航、暗色模式、桌宠置顶三模式与 Latex" 一次提交四个功能，违反 COMMIT_RULES §6 和模板 Atomic 原则）。
  - 无 commit 签名（`%G?` 最近 20 条全 N）。
- (d) **中**。93% 符合项目自己的格式，但 (1) 4+1 条非法 type，(2) scope 用法无词表、时有时无，(3) 9 条大杂烩 commit。没有 commitlint/husky 守卫（见 D4），全靠自觉。

### D2. 分支模型

- (a) 模板：`type/description` feature 分支（feat/xxx、fix/xxx），PR 合并；未规定 dev 分支。
- (c) 现状：本地分支 `dev`（当前）、`master`；远程只有 `origin/master`（**dev 未推送**）。`git log --all --merges | wc -l` = **0**；总 commit 248（`--all` 与 HEAD 相同，即所有历史都在一条线上）。`git log --all --graph` 是一条直线。`master...dev` = 0 / 2（dev 领先 2 个 commit：67e0fa7 审计归档、f5a24b3 Trellis 初始化）。`git config init.defaultBranch` = master。CI `on.push.branches` = `[main, master]` + `pull_request`——**push 到 dev 不会触发 CI**，只有开 PR 才会。
- 结论：248 个 commit 全部直接落在 master（dev 是 2026-09-17 才开的）；从未用过 feature 分支、PR、merge。
- (d) **高**（对"想采用 dev→master 流程"的用户而言这是起点）。

### D3. 作者身份与 AI 署名

- `git log -1 --format='%an <%ae>'` = `xuper <dr.xuoer@gmail.com>`。
- 作者分布：`xuper <dr.xuoer@gmail.com>` 191、`xuoer-xuper <dr.xuoer@gmail.com>` 48、`xuper <xuoer-xuper@users.noreply.github.com>` 9。同一人三种身份（GitHub 会按 email 关联，但 `git shortlog` 会分成三行）。committer 分布与作者完全相同。当前 `git config user.name/email` = xuper / dr.xuoer@gmail.com（与 memory 规则一致）。
- `Co-Authored-By` trailer：**0** 条；`Generated with` / claude / codex / copilot / grok 关键词：**0** 条。符合 memory "不加 Co-Authored-By" 规则。
- (d) **低**。可用 `.mailmap` 把三个身份合并成一行（不改历史）。

### D4. 协作基建

- `.github/`：`workflows/ci.yml`（4 个 job：fast-guard / renderer-smoke / validate / packaged-smoke，全部 windows-latest，Node 22.23.2，`npm ci`）、`pull_request_template.md`（中文，含变更类型、边界确认、验证清单）、`ISSUE_TEMPLATE/`（bug_report.yml、submission_monitoring.yml、config.yml）、`COLLABORATION.md`。
- **无** `CODEOWNERS`；**无** `.husky/`（根与 algo-electron 均无）；package.json 无 `husky`、`lint-staged`、`@commitlint/*`、`commitlint` 键；`git ls-files | grep -i commitlint` = 0。
- 即：commit 格式、pre-commit 门（`test:core`）**没有任何本地强制**，只在 PR 时由 CI 兜底——而项目至今 0 个 PR，所以 CI 只在 push master 时跑。
- (d) **高**。这是"规范写了但没人执行"的根因。至少加 commitlint（config-conventional + 允许中文 subject + 自定义 type 列表）+ husky `commit-msg`；`pre-commit` 跑 `lint && typecheck`（`test:core` 11 s 也可接受）。

### D5. Tag

- `git tag -l`：v0.1.0-alpha、v0.2.0、v0.3.0、v0.4.0、v0.5.0、v0.6.0、v1.0.0、v1.1.0-beta.1、v1.1.0-beta.2、v2.0.0-rc.1（10 个，semver 规范，`v` 前缀一致）。
- `VERSION_PLAN.md` 提到 v2.0.0-rc.1 是"本地版本标签"——是否已 push 到 origin 本次未验证（只读，未执行 `git ls-remote`）。
- (d) **低**。tag 习惯良好；建议规范里写明 tag 只打在 master 的 merge commit 上并 `git push --tags`。

---

## E. 关于开发习惯的判断

用户设想：**master 只放稳定版；在 dev 分支开发；完成后合并回 master；commit 用 Angular 规范 + 中文信息。**

### E1. 总体评价

方向正确，且与两份规范都不冲突：

- 模板 `git-conventions.md` 只规定 commit 格式和 feature 分支命名，**没有规定 dev/master 双主干**——加一个 dev 是它的超集，不是违反。
- 项目 `COMMIT_RULES.md` 本来就是"Angular/Conventional 类型 + 中文"，用户的想法就是现状规范，只是要把 scope 的规则补上。
- 从 D2 看，项目从 0 merge、0 PR 起步，"dev→master" 是**最小可行的第一步**，比直接上完整 git-flow 更容易坚持。

### E2. 需要补充的六点

1. **dev 之上仍然要有短生命周期的 feature 分支**（模板要求 `feat/xxx`、`fix/xxx`）。只有 dev 一条线时，两个并行任务（例如 Trellis 的 `00-bootstrap-guidelines` 和一个 fix）会互相夹杂，回滚困难。建议：`feat/<task-id>` 或 `fix/<描述>` 从 dev 切出，完成后合回 dev；dev 稳定后合回 master。小修（typo/docs）可直接在 dev 上提交。分支名用英文 kebab-case（模板要求，且 Windows/URL 友好）。

2. **合并方式明确写死**：
   - feature → dev：**squash merge**（一个 feature 一个 commit，commit 信息就是 PR 标题，天然符合 `类型(scope): 说明`；也顺手解决 D1 里"一次 195 个文件"的问题——大杂烩留在 feature 分支内部无所谓）。
   - dev → master：**merge commit（`--no-ff`）**，保留"这一版包含哪些 feature"的树形结构，并在该 merge commit 上打 tag。**不要** rebase master。
   - 禁止在 master 上直接 commit（GitHub 分支保护 + 本地 `pre-commit` 检查当前分支名可以硬拦）。

3. **PR 是必需的，即使一个人开发**：CI `ci.yml` 的触发条件是 `pull_request` + push master，**dev 分支 push 根本不跑 CI**（D2）。要么给 `on.push.branches` 加 `dev`，要么强制走 PR。建议两者都做：push dev 跑 `fast-guard`；PR 到 master 跑全部 4 个 job。PR 模板已有，直接用。

4. **scope 规则要定**。用户说"Angular 规范"——Angular 规范里 scope 是**可选**的，模板示例里 `docs:`/`chore:` 也无 scope，所以"无 scope 也合法"没问题。但项目现状 scope 用法混乱（`fix(test)` 把 type 当 scope、`renderer:` 把 scope 当 type、`design:`/`release:` 自造 type）。建议在 COMMIT_RULES.md 增加一张 scope 词表，直接取自 `algo-electron/electron/` 与 `src/` 的一级目录 + 横切关注点，例如：`adapters | ai | app | backup | browser | coach | cookies | credentials | db | diagnostics | downloads | ipc | parsers | preload | renderer | scripts | shared | shortcuts | submissions | tracking | windows | ui | docs | ci | release | deps`，并规定：`feat`/`fix`/`refactor`/`perf` **必须**带 scope，`docs`/`chore`/`test`/`style`/`ci` **可选**。type 列表固定为 feat/fix/docs/refactor/test/chore/style/perf/ci（与模板 8 个 + 项目 ci 合并），`release` 改写为 `chore(release): 发布 vX.Y.Z`。

5. **用 commitlint + husky 把规则变成门**（D4）。`@commitlint/config-conventional` 默认 `subject-case` 规则对中文无影响（中文没有大小写），只需覆盖 `type-enum` 和 `scope-enum`。husky `commit-msg` 跑 commitlint，`pre-commit` 跑 `npm run lint && npm run typecheck`（或直接 `test:core`）。没有这一步，D1 的 5 条非法 type 会继续出现。

6. **tag 与发布节奏**：只在 master 的 merge commit 上打 `vX.Y.Z`，RC/beta 用 `-rc.N`/`-beta.N`（现有 10 个 tag 已遵守）。`release-notes.txt` 删掉，release 内容统一进 `docs/PRODUCT/CHANGELOG.md`；打 tag 前 CHANGELOG 的"未发布"段落改成版本号。`git push --follow-tags` 保证 tag 上远程。

### E3. 与模板"英文 commit"的冲突如何处理

模板 `frontend/quality.md` 末尾写 "All documentation must be written in English"，`git-conventions.md` 示例全英文。项目 commit、文档、PR 模板、issue 模板、测试目录 README 全部中文，且已有 248 条中文 commit。**建议在 `.trellis/spec/shared/git-conventions.md` 落地时明确改为：type/scope 用英文小写（保证 commitlint 可解析、`git log --grep` 可用），description 用中文**——这就是用户当前的习惯，只需把它从"默认"变成"规范"。不要为了对齐模板改成英文描述，那会造成新旧历史两种语言。

### E4. 一句话结论

用户的习惯 = COMMIT_RULES.md 现状 + 一个 dev 分支，是正确且可行的起点；缺的是 **feature 分支 + PR 触发 CI + squash/no-ff 规则 + scope 词表 + commitlint/husky 门**。前三项让"master 只放稳定版"真正成立，后两项让"Angular + 中文"不再依赖自觉。

---

## 附：本次审计执行的关键命令（便于复核）

```
git ls-files | wc -l                                   # 982
git ls-files tests | awk -F/ '{print $2}' | sort | uniq -c
git ls-files src electron | grep -E '\.(test|spec)\.tsx?$' | wc -l   # 0
grep -lE '^\s*describe\(' <178 test files> | wc -l      # 61
grep -hE "^\s*(it|test)\(['\"\`][^'\"\`]*[一-鿿]" ... | wc -l          # 661 / 1212
ls -d node_modules/@typescript-eslint node_modules/typescript-eslint   # both absent
git ls-tree -r -l HEAD | awk '$4 > 1048576'             # none
git log --all --merges --oneline | wc -l                # 0
git log --format='%an <%ae>' | sort | uniq -c           # 191 / 48 / 9
git log --grep='Co-Authored-By' --oneline | wc -l       # 0
git tag -l                                              # 10 tags
```
