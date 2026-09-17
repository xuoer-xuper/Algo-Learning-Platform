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

### 0.3 TypeScript 6.0.3
- [ ] `pnpm add -D typescript@6.0.3 vite-plugin-electron@1.1.2`。
- [ ] `pnpm typecheck`、`pnpm typecheck:tests`；逐条处理 6.0 弃用提示（预期：`tsconfig.node.json` 的 `composite` / `moduleResolution` 提示）。
- [ ] `pnpm build:check`（确认 vite-plugin-electron 与 esbuild 正常）。
- [ ] 失败则回退 5.9.3 并在 `prd.md` Notes 记录。
- 验证：`pnpm test:core`。回滚点：commit `chore(deps): TypeScript 降级到 6.0.3`。

### 0.4 typescript-eslint
- [ ] `pnpm add -D typescript-eslint eslint-config-prettier`；`pnpm remove @babel/core @babel/eslint-parser @babel/plugin-syntax-jsx @babel/preset-typescript`。
- [ ] 重写 `eslint.config.js`（见 `prd.md` R4）。
- [ ] 修 13 处非空断言：`TabManager.ts:546,663,984,1564,1254,1295`、`main.ts:314`、`problem/mutations.ts:23`、`SubmissionProblemAttacher.ts:201`、`syncService.ts:68`、`windowBounds.ts:78`、`src/main.tsx:9`、`computeMetrics.ts:123`。`NavigationDecision` 改判别联合一次消 5 处。
- [ ] 修 40 处渲染层导出组件/hook 返回类型（`: JSX.Element` / hook 返回对象类型）。
- [ ] 修 `no-floating-promises` 报错（预期集中在 `App.tsx`、`main.ts` 的 `void` 缺失）。
- [ ] `registerCoachIpc.ts:160,306,325` 三处 `console.*` 改 `appLogger`（其余 6 处进 override）。
- 验证：`pnpm lint` 0/0；`pnpm test:unit`。回滚点：commit `chore(lint): 接入 typescript-eslint 并修复现存违规`。

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

## Review Gates
- 每个小节结束 `pnpm test:core`。
- 阶段结束 `pnpm test:all` + `pnpm build:win` + 手动安装包冒烟。
- PR 标题：`chore(ci): 阶段 0 工具门与工程底座`；squash 合入 dev。

## Rollback
- 每小节一个 commit，可 `git revert` 单节。
- pnpm 切换若阻塞打包：revert 0.2 commit，恢复 `package-lock.json`，其余小节不受影响（都不依赖 pnpm）。
