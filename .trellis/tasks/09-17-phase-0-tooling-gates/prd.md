# 阶段 0 工具门与工程底座

## Goal

把"规范靠自觉"变成"过不了门就提交不了"，并把工程底座（包管理、TS 版本、格式化、版本发布）切到模板标准。**不动业务代码**；业务代码只在为通过新 lint 规则而做的最小修改范围内变化（13 处非空断言）。

## Requirements

### R1 分支模型与 CI（D6）
- ~~推送 `dev` 到 origin~~ **已完成 2026-09-17**（`dev` track `origin/dev`）。
- ~~GitHub `master` 分支保护~~ **已完成 2026-09-17**（`gh api`）：必须 PR；required checks = `Fast core, packaging and docs guard` + `Electron and renderer smoke`（strict）；禁 force push / 删除；对话须解决；`enforce_admins=false`（solo 开发保留 admin 绕过，用于 release-it 在 master 提交）。仓库合并策略：squash（标题=PR 标题）+ merge commit，rebase 禁用，合并后删分支。
- 待做：`.github/workflows/ci.yml` `on.push.branches` 增加 `dev`；`pull_request` 触发全部 job。

### R2 pnpm（D17）
- 项目设置写在 `algo-electron/pnpm-workspace.yaml`：`nodeLinker: hoisted`、`shamefullyHoist: true`、`strictPeerDependencies: false`、`allowBuilds`（`esbuild`、`electron-winstaller`）。**2026-09-17 修订**：pnpm 12 只从 `.npmrc` 读认证/registry 设置，`nodeLinker`/`shamefullyHoist` 只能在 `pnpm-workspace.yaml` 设置，原 `.npmrc` 方案已失效。
- `package.json` 增加 `"packageManager": "pnpm@12.8.1"`（`npm view pnpm version` 的 latest）；删除 `package-lock.json`，生成 `pnpm-lock.yaml`。
- `postinstall` 内联（`install-electron --no && electron-builder install-app-deps`），**不**嵌套 `pnpm run`：pnpm 生命周期里嵌套调用会撞 `packageManager` 版本门。
- CI 改 `pnpm/action-setup@v4`（带 `package_json_file: algo-electron/package.json`，且置于 `setup-node` 之前）+ `pnpm install --frozen-lockfile`，缓存改 pnpm store（`cache: pnpm` + `pnpm-lock.yaml`）。
- `docs/GOVERNANCE/CONTRIBUTING.md`、`.github/COLLABORATION.md`、各 README 中 `npm run` → `pnpm run`；同时更新因此变红的守卫 `tests/packaging/check-packaging.mjs`（改为断言命令顺序 + 新增 `pnpm-workspace.yaml` 配置守卫）、`tests/docs/check-docs.mjs`（脚本引用检查接受 `pnpm run`）与它们的 README。

### R3 TypeScript 6.0.3（D19）
- `typescript` 7.0.2 → 6.0.3；`vite-plugin-electron` 1.1.1 → 1.1.2。
- `tsc --noEmit` 与 `tsc -p tsconfig.tests.json --noEmit` 0 error、0 弃用提示（6.0 对将在 7 移除的选项报提示，逐条改）。
- 若 vite-plugin-electron / vitest / esbuild 在 6.0 下有无法绕过的问题，回退 5.9.3，并在本 PRD Notes 记录原因。

### R4 typescript-eslint（D19、高-8）
- 替换 `@babel/eslint-parser` 为 `typescript-eslint` 8.x，`tseslint.configs.recommendedTypeChecked`，`parserOptions.projectService: true`。
- 规则：`@typescript-eslint/no-non-null-assertion` error、`no-explicit-any` error、`consistent-type-imports` error、`explicit-module-boundary-types` error、`no-floating-promises` error、`no-unused-vars`（`argsIgnorePattern: '^_'`）error、`no-console` error（override：`electron/app/startupSmoke.ts`、`electron/scripts/userscriptBootstrapPreload.ts` 允许）。
- 先修掉现有 13 处非空断言与 40 处渲染层缺返回类型，再开门；`eslint . --max-warnings 0` 0 error。
- 删除 `@babel/*` eslint 相关依赖。

### R5 prettier（D20）
- `prettier` + `.prettierrc`：`semi: false`、`singleQuote: true`、`printWidth: 100`、`trailingComma: 'all'`；`.prettierignore` 含 `dist*`、`release`、`tmp`、`pnpm-lock.yaml`。
- `eslint-config-prettier` 关闭冲突规则。
- 全仓一次性格式化，单独 commit `style: 全仓 prettier 格式化`（不与其他改动混合）。

### R6 husky + commitlint + lint-staged（D5、高-8）
- `commitlint.config.js`：extends `@commitlint/config-conventional`；`type-enum` = feat/fix/docs/refactor/test/chore/style/perf/ci；`scope-enum` = `git-workflow.md` 词表；`subject-case` 关闭（中文）。
- husky：`commit-msg` → `commitlint --edit`；`pre-commit` → 当前分支为 `master` 时拒绝 + `lint-staged`（prettier + eslint）+ `pnpm typecheck && pnpm typecheck:tests`；`pre-push` → `pnpm test:core`。

### R7 jscpd 门（低-22 补强）
- `jscpd` 进 `test:core`：`--threshold 3`，范围 `electron src`，报告到 `tmp/jscpd`。

### R8 路径别名（D9）
- `tsconfig.json` `paths: { "@shared/*": ["src/shared/*"] }`（目录在阶段 2 才有内容，先建空目录与 `index.ts`）；`vite.config.ts` renderer `resolve.alias`、`vitest.config.ts` alias 同步。
- `tsconfig.json` 增加 `verbatimModuleSyntax: true`。

### R9 release-it（D24）
- `release-it` + `@release-it/conventional-changelog`；`.release-it.json`：`git.commitMessage = "chore(release): 发布 v${version}"`、`git.tagName = "v${version}"`、`git.tagAnnotation = "v${version}"`、`git.requireBranch = master`、`git.requireCleanWorkingDir`、`github.release = true`、`github.assets = ["release/${version}/*.exe", "release/${version}/*.blockmap", "release/${version}/latest.yml"]`、`plugins.@release-it/conventional-changelog.infile = docs/PRODUCT/CHANGELOG.md`、`preset: conventionalcommits`、`hooks.before:init = ["pnpm test:all", "pnpm build:win"]`。
- scripts：`"release": "release-it"`；预发布 `pnpm release -- --preRelease=rc`。
- 只做配置与 `--dry-run` 验证，本阶段不发布。

### R10 COMMIT_RULES 重写
- `docs/GOVERNANCE/COMMIT_RULES.md` 与 `.trellis/spec/project/git-workflow.md` 一致：格式、type 表、scope 词表、必带规则、分支模型、合并方式、husky 门、release-it。

## Acceptance Criteria

- [ ] `git push origin dev` 触发 CI 且 `fast-guard` 通过；对 `master` 直接 push 被 GitHub 拒绝（保护已开，待 ci.yml 加 dev 后验证触发）。
- [ ] 干净目录 `pnpm install --frozen-lockfile && pnpm test:all && pnpm build:win` 全绿；`test:packaged-main` 确认 better-sqlite3 在 hoisted 布局下可加载。
- [ ] `node_modules/typescript/package.json` 版本 6.0.3；`pnpm typecheck` / `pnpm typecheck:tests` 0 error 0 deprecation。
- [ ] `pnpm lint` 0 error 0 warning，且 `eslint.config.js` 含 R4 全部规则；故意加一行 `const x = y!.z` 使 lint 红。
- [ ] `pnpm prettier --check .` 通过。
- [ ] `git commit -m "update"` 被 commit-msg 钩子拒绝；`git commit -m "feat(coach): x"` 通过；在 `master` 上 commit 被 pre-commit 拒绝。
- [ ] `pnpm test:core` 包含 jscpd 且通过（当前 1.76%）。
- [ ] `import x from '@shared/index'` 在 renderer 与 vitest 中可解析。
- [ ] `pnpm release --dry-run` 输出下一版本、CHANGELOG 片段与将上传的资产列表，无错误。
- [ ] `COMMIT_RULES.md` 更新；`test:docs` 通过。

## Out of Scope

- 任何业务逻辑修改；目录搬迁；换库（阶段 1）。
- 实际发布版本。

## Notes

- 前置：无。这是所有后续阶段的门。
- 顺序建议：R2 → R3 → R4 → R5（格式化在 lint 规则定稿后做一次）→ R6 → R7 → R8 → R9 → R1 → R10。R1 放最后是因为分支保护开启后本阶段的 PR 才好走通。
- 风险：pnpm hoist 对 electron-builder `asarUnpack` 白名单的影响，用 `test:packaging` + `test:packaged-app` 验。
- R2 实施发现（2026-09-17，细节见 `design.md` §2）：
  - `corepack enable` 在本机被 `EPERM`（需管理员权限写 `C:\Program Files\nodejs`）拒绝；改用 pnpm 自身的 `packageManager` 版本切换（裸 `pnpm` 在项目内 11.21.0 → 12.8.1）与 `corepack prepare`，仓库不依赖 corepack 已 enable。
  - pnpm 12 把被忽略的依赖构建脚本从警告升级为 `ERR_PNPM_IGNORED_BUILDS` **安装失败**；`allowBuilds` 是必需配置而非可选优化。
  - `electron` 与 `better-sqlite3` 自身没有 install/postinstall 脚本，Electron 二进制与 native ABI 重建全靠根 `postinstall`；`better-sqlite3` 使用 `prebuilds/*.node`。
  - 文档范围只改 `CONTRIBUTING.md`、`.github/COLLABORATION.md` 与各 README；历史叙述类文档（CHANGELOG、`*PLAN`、审计、TASKS、`AI_HANDOFF.md`、`VERSION_PLAN.md`、`RELEASE_PROCESS.md`）随 6.3 文档重写处理，不改写历史（`migration-status.md` 已记）。
- 顺带治本的既有缺陷（不属 0.2 产出，但阻塞 0.2 的验收命令 `pnpm test:all`）：
  - `pnpm test:coverage` 在"覆盖率插桩 + forks 池全量并行"下会红：Testing Library 的 `findBy*`/`waitFor` 默认只轮询 1000ms，`tests/coach/coachMouseEventDedupe.test.ts` 里等「关闭对话」按钮的断言单独跑 345ms 通过、全量跑 1157ms 才就绪，于是超时。**换包管理器之前的 npm 依赖图上同样失败（基线 2/2）**，是既有缺陷。
  - 处理：新增 `tests/setup/testing-library-timeout.ts`（`asyncUtilTimeout` → 5000ms，仅 jsdom 生效）挂到 `vitest.config.ts` 的 `setupFiles`，并把 `@testing-library/dom`（`configure` 的宿主）提升为直接 devDependency，不再借传递依赖。不放松任何断言，连续 3 次 `pnpm test:coverage` 全绿（169 文件 / 1362 用例）。
  - `pnpm test:docs` 的 6 条既有红灯同批清掉，口径见 0.10。
