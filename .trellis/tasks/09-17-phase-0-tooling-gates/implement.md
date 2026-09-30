# 阶段 0 执行计划

前置：`dev` 分支干净；阶段 0 分支 `chore/phase-0-tooling-gates` 从 `dev` 切出。

## Checklist（按序）

### 0.2 pnpm
- [ ] `corepack enable`；`npm view pnpm version` 取 latest 写入 `packageManager`。
- [ ] 写 `algo-electron/.npmrc`；删 `package-lock.json`；`pnpm install`；提交 `pnpm-lock.yaml`。
- [ ] 改 `postinstall`；跑 `pnpm test:packaged-main`、`pnpm test:packaging`。
- [ ] `ci.yml`：`pnpm/action-setup@v4` + `actions/setup-node cache: pnpm`；`pnpm install --frozen-lockfile`。
- [ ] 文档 `npm run` → `pnpm`（`grep -rl "npm run" docs algo-electron/**/README.md .github`）。
- 验证：`pnpm test:all`。回滚点：commit `chore(deps): 切换到 pnpm`。
  - 追加（2026-09-17）：`test:all` 里的 `test:docs` 与 `test:coverage` 两处既有红灯已一并清掉（前者见 0.10，后者见 `prd.md` Notes 的 `tests/setup` 说明）。
  - `test:all` 仍会停在 `test:coach` 的 `coach-llmConfigStore`：该测试由 `runElectronAppTest` 打成 ESM 后在真实 Electron 应用态运行，`import { app } from "electron"` 报 "does not provide an export named 'app'"。**在基线 npm 图上同样复现**（`093df52` worktree + `npm ci` + 同样的 esbuild/electron 两步），改成 CJS 打包后换成 `app` undefined，说明是夹具设计问题而非依赖问题，属阶段 5（测试体系对齐）范围。因此 0.2 不用 `test:all` 全绿收口，改用：`pnpm install --frozen-lockfile` + `pnpm test:core` + `pnpm test:coverage`（3 次）+ `pnpm test:packaging` + `pnpm build:check` + 分支保护要求的两个 CI check。

### 0.3 TypeScript 6.0.3
- [x] `pnpm add -D typescript@6.0.3 vite-plugin-electron@1.1.2`（2026-09-17 完成，实测版本分别为 6.0.3 与 1.1.2）。
- [x] `pnpm typecheck`、`pnpm typecheck:tests`：两者均 0 error，且**没有**出现预期中的弃用提示——6.0.3 对 `tsconfig.node.json` 的 `composite` / `moduleResolution: bundler` 不报提示，因此没有需要逐条处理的项（不是"忽略了提示"：两份命令的输出为空且退出码为 0）。
- [x] `pnpm build:check` 通过：vite-plugin-electron 1.1.2 与 esbuild 0.28.2 正常，`Packaged main keeps better-sqlite3 external`。
- [x] 未回退：没有出现无法绕过的第三方类型错误（`@types/*`、vite、vitest、electron 的类型定义在 6.0.3 下均通过）。
- 验证：`pnpm test:core` 全绿（169 文件 / 1362 用例）。回滚点：commit `chore(deps): TypeScript 降级到 6.0.3`。

### 0.4 typescript-eslint
- [x] `pnpm add -D typescript-eslint eslint-config-prettier`（实测 typescript-eslint 8.71.0、eslint-config-prettier 10.1.8，后者 0.5 才接线）；`pnpm remove @babel/core @babel/eslint-parser @babel/plugin-syntax-jsx @babel/preset-typescript`。
- [x] 重写 `eslint.config.js`：`recommended` + `recommendedTypeChecked` + `projectService`，类型感知规则用 `files` 限定在 `src/**` + `electron/**`；`tests/**` 与根级 `*.config.ts` 走 parser-only 分支维持旧规则面。
- [x] 修完本节启用的规则违规（实测 73 处，原估 13+40）。**实测总量是 367 处 / 22 条规则**，差额按分阶段开门处理，见 `prd.md` R4（2026-09-17 修订）与 `design.md` §4。
  - 非空断言 30（原估 13）：`TabManager` 9、`CoachOrchestrator` 5、`rules.ts` 4、`omnibox` 2 等；`NavigationDecision` 改判别联合一次消 6 处。
  - base-to-string 7（新增 `electron/shared/textCoercion.ts` 的 `unknownToText`）、空接口 5、floating promises 4、prefer-const 3、console 3（`registerCoachIpc.ts` 改 `appLogger.debug`）、prefer-promise-reject-errors 2（新增 `toRejectionError`）、unbound-method 2、require-await 1、unused-vars 1、restrict-template-expressions 1、no-redundant-type-constituents 1；`consistent-type-imports` 与多余断言由 `eslint --fix` 处理。
  - `no-implied-eval` 3 处是用户脚本运行时的设计使然（`new Function` 编译用户数据后在页面主世界执行），按**文件级** override 关闭并写明理由。
  - 显式暂缓 279 处：`explicit-module-boundary-types` 128、`no-unsafe-*` 121、`no-misused-promises` 30 → `.trellis/tasks/09-30-typed-lint-debt`。
  - 复核中修掉子代理引入的两处行为回归：TabManager 收养失败的回滚落到了目标窗口的 registry（应为源窗口）、两个 `unknownToString` 把数字/布尔退化成 `[object Number]`。
- 验证：`pnpm lint` 0 error 0 warning；反向验证（临时放 `value.nested!.field` 立刻变红，撤销后恢复绿）；`pnpm typecheck` 0 error；`pnpm typecheck:tests` 0 error（干净状态，无 TS6305——根级配置不进 `tsconfig.node.json` 就是为了这个）；`pnpm test:core` 全绿（169 文件 / 1362 用例）。回滚点：commit `chore(lint): 接入 typescript-eslint 并修复现存违规`。

### 0.5 prettier
- [ ] `pnpm add -D prettier`；写 `.prettierrc`、`.prettierignore`。
- [ ] `pnpm prettier --write .`；**单独** commit `style: 全仓 prettier 格式化`。
- [ ] `eslint.config.js` 末尾加 `eslintConfigPrettier`。
- 验证：`pnpm prettier --check .`；`pnpm lint`。

### 0.6 husky + commitlint + lint-staged
- [ ] `pnpm add -D husky @commitlint/cli @commitlint/config-conventional lint-staged`；`pnpm exec husky init`。
- [ ] `commitlint.config.js`（type-enum、scope-enum、subject-case off）。
- [ ] `.husky/commit-msg`、`.husky/pre-commit`（分支检查 + lint-staged + typecheck ×2）、`.husky/pre-push`（`pnpm test:core`）。
- [ ] `package.json` `lint-staged`：`*.{ts,tsx,js,mjs,cjs}` → `prettier --write`、`eslint --fix`；`*.{md,json,css,yml}` → `prettier --write`。
- 验证：三条故意失败的 commit（非法 type、在 master、lint 错）均被拒。

### 0.7 jscpd
- [ ] `pnpm add -D jscpd`；`.jscpd.json`（threshold 3、format ts/tsx/css、ignore tests/dist/tmp、output tmp/jscpd）。
- [ ] `test:core`（`tests/verify.mjs` core suite）加 `jscpd` 步骤。
- 验证：`pnpm test:core` 输出 jscpd 通过。

### 0.8 alias + verbatimModuleSyntax
- [ ] 建 `algo-electron/src/shared/index.ts`（空导出，阶段 2 填充）。
- [ ] `tsconfig.json` `paths` + `verbatimModuleSyntax`；修由此产生的 `import type` 报错。
- [ ] `vite.config.ts` renderer `resolve.alias['@shared']`；`vitest.config.ts` 同。
- 验证：`pnpm typecheck`；一个临时测试 `import '@shared/index'` 通过后删除。

### 0.9 release-it
- [ ] `pnpm add -D release-it @release-it/conventional-changelog`；写 `.release-it.json`（见 `prd.md` R9）。
- [ ] `package.json` 加 `"release": "release-it"`。
- [ ] `pnpm release --dry-run --no-git.requireBranch`（在 dev 上试跑）。
- 验证：dry-run 输出正确。

### 0.1 分支保护与 CI（放最后）
- [ ] `ci.yml` `on.push.branches: [main, master, dev]`。
- [x] `git push -u origin dev`（2026-09-17 已完成）。
- [x] master 分支保护与仓库合并策略（2026-09-17 经 `gh api` 完成；用户已授权 gh 操作，见记忆 feedback_push_after_commit）。
- 验证：push dev 触发 CI。

### 0.10 COMMIT_RULES
- [ ] 重写 `docs/GOVERNANCE/COMMIT_RULES.md`；`pnpm test:docs`。
- [x] `pnpm test:docs` 在阶段 0 之前就存在的 6 条红灯已随 0.2 清掉（2026-09-17）。口径：
  - 3 条链接误报走守卫侧修复——扫描前去掉 fenced code 与行内代码（`grep -rnE "from ['\"](electron|fs|path|os|node:)"` 里的 `](...)` 被误读成相对链接），并排除平台工具生成、`trellis update` 会覆盖的 `.agents/`、`.claude/`、`.codex/`、`.dsh/`、`.grok/`（模板占位符 `[Library X docs](url)` 手工修会在下次生成时丢失）。
  - 2 条模板文档正文里的假脚本名（`.trellis/spec/big-question/native-module-{complex-deps,packaging}.md`）改为不写具体命令，保留守卫对所有项目文档的统一检查。
  - `AGENTS.md` 补进 `docs/README.md` 索引。

## Review Gates
- 每个小节结束 `pnpm test:core`。
- 阶段结束 `pnpm test:all` + `pnpm build:win` + 手动安装包冒烟。
- PR 标题：`chore(ci): 阶段 0 工具门与工程底座`；squash 合入 dev。

## Rollback
- 每小节一个 commit，可 `git revert` 单节。
- pnpm 切换若阻塞打包：revert 0.2 commit，恢复 `package-lock.json`，其余小节不受影响（都不依赖 pnpm）。
