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
- [x] `pnpm add -D prettier`；写 `.prettierrc`、`.prettierignore`。（2026-10-27 完成，实测 prettier 3.9.10；配置按 design.md §5 契约：semi:false / singleQuote / printWidth:100 / trailingComma:all。`.prettierignore` 在契约四项外追加 `*.tsbuildinfo`——未入库的构建增量文件，排除后免掉 `--check` 的 no-parser 噪音。）
- [x] `pnpm prettier --write .`；**单独** commit `style: 全仓 prettier 格式化`。（2026-10-27 完成，commit `601e3ea`，525 文件。范围是 `algo-electron/` 全树；仓库根 docs/ 与 `.trellis/` 不在 prettier 运行目录内，未格式化。该 commit 唯一非纯格式 diff：`guards.test.ts` 的 `@ts-expect-error` 从 import 前移入花括号——TS7016 报在模块说明符处，单行 import 拆成多行后原位置覆盖不到。）
- [x] `eslint.config.js` 末尾加 `eslintConfigPrettier`。（随 commit `b0f1671` 与依赖一起进。）
- 验证：`pnpm prettier --check .` 通过；`pnpm lint` 0/0。（2026-10-27 实测通过。**格式化的连带代价**：4 个按文本形状扫描源码的守卫测试变红，已改为对格式不敏感（守卫意图不变），见 commit `905de10`：tokenGovernance 的暗色块提取接受单双引号（prettier 统一 CSS 引号）、controlGovernance 的 `<Select>` 属性前瞻匹配、ipcContracts 压缩空白后比对 + 动态通道判定改为"首参必须以引号开头"（原 `(?!['"])` 在 `\s*` 回溯后误判换行的字面量调用）、mainResilience 容忍成员链换行。`noteTabIsolation` 单跑即绿，属并行负载下的既有超时抖动，未改动。收口验证 `pnpm test:core` 全绿：175 文件 / 1387 用例。回滚点：commit `b0f1671`（配置）+ `601e3ea`（格式化）+ `905de10`（守卫适配）。）

### 0.6 husky + commitlint + lint-staged
- [x] `pnpm add -D husky @commitlint/cli @commitlint/config-conventional lint-staged`；`pnpm exec husky init`。（2026-10-31 完成，实测 husky 9.1.7、@commitlint/cli 21.2.4、@commitlint/config-conventional 21.2.4、lint-staged 17.6.0。**husky init 在子目录不可用**：bin 检查 CWD 下的 `.git`，在 `algo-electron/` 报 ".git can't be found"（它已先写好 `prepare: "husky"` 才失败）。按 husky 官方"Project not in Git root directory"配方改为 `prepare: "cd .. && husky algo-electron/.husky"`，并从仓库根补跑一次安装：`core.hooksPath = algo-electron/.husky/_`（相对仓库根——钩子以仓库根为 CWD 运行，相对路径按此解析）；`.husky/_/.gitignore` 内容 `*`，`_` 目录由此不入库。`git branch --show-current` 为空的 detached HEAD 不按 master 处理。）
- [x] `commitlint.config.js`（type-enum、scope-enum、subject-case off）。（ESM。`type-enum` 九值同 git-workflow.md §Types；`scope-enum` 32 项 = §"Scope enum" 词表块 31 项 + 该块下方散文点名的层级兜底中尚未在块内的 `main`（renderer/preload/shared 已在块内）；`subject-case: [0]` 关闭以容纳中文描述。文件头注释引用 `.trellis/spec/project/git-workflow.md` 与 `.trellis/spec/shared/git-conventions.md` 两个来源。管道实测：`update`（type/subject 空）、`design: x`（type-enum）、`chore(bogus): y`（scope-enum）均拒；`feat(coach): x`、`chore(release): 发布 v2.1.0`、混合大小写 subject 均 0 退出。）
- [x] `.husky/commit-msg`、`.husky/pre-commit`（分支检查 + lint-staged + typecheck ×2）、`.husky/pre-push`（`pnpm test:core`）。（三支均为 POSIX sh，husky 以 `sh -e` 调用：先 `git rev-parse --show-toplevel` 解析仓库根再 `cd algo-electron`——钩子 CWD 是仓库根而 package.json/依赖都在子目录；commit-msg 先把 `$1` 规整为绝对路径（兼容盘符绝对路径）再 cd。**release-it 冲突决策（design.md §6 方案 1，2026-10-31 定案）**：pre-commit 无条件拒绝 `master`，无环境变量嗅探、无标记文件；release-it 侧改配 `git.commitArgs: ["--no-verify"]` 绕过，接线归 0.9 并在 dry-run 复核。lint-staged 从 `algo-electron/` 运行，包目录之外的 staged 文件（如 `.trellis/**`）由其以 warning 跳过，与 0.5 的格式化范围决策一致。）
- [x] `package.json` `lint-staged`：`*.{ts,tsx,js,mjs,cjs}` → `prettier --write`、`eslint --fix`；`*.{md,json,css,yml}` → `prettier --write`。（CI 平价已核：无操作时 `pnpm install --frozen-lockfile` 跳过 prepare（pnpm 对 no-op 安装不跑生命周期脚本，hooksPath 保持不变）；真实安装（`--force` 实测）输出 `. prepare: Done` 并恢复 hooksPath，全新 checkout 必然走真实安装，不受影响，退出码 0。）
- 验证：三条故意失败的 commit（非法 type、在 master、lint 错）均被拒。（2026-10-31 实测，退出码均为 1：①携带本节真实 staged 改动 `git commit -m "update"`——pre-commit 全链先通过（lint-staged 处理 commitlint.config.js/package.json，tsc ×2 全绿），commit-msg 拒绝（type/subject empty）；②`electron/app/chromiumFlags.ts` 尾部临时加 `const x = y!.z` 后提交——被 pre-commit 的 lint-staged/eslint 拒绝（`no-non-null-assertion` + `no-unused-vars` 两 error），测后文件还原；③`git checkout master` 后携带钩子文件提交 scratch 改动——被 pre-commit 分支检查拒绝。注意物理事实：master 工作树在阶段 0 的 PR 合入前不跟踪 `.husky/**`，husky 对"用户脚本缺失"静默放行（`h` 脚本 `[ ! -f "$s" ] && exit 0`），本次靠 staged 新文件随 checkout 带过去完成测试；合入后 master 自带钩子。④正向：scratch 文件以 pathspec 提交 `git commit <scratch> -m "feat(coach): x"` 通过三道门（lint-staged、tsc ×2、commitlint），生成提交后 `git reset --soft HEAD~1` 撤销并删除 scratch（此处用 soft 而非 hard：本节改动尚在 index，hard 会摧毁未提交工作；意图同为"移除测试提交"）。收口 `pnpm test:core` 全绿。回滚点：commit `chore(ci): 立起 husky 三道提交门`。）
- 追加（2026-10-31，pre-push 门首推实测）：pre-push 跑 test:core 时 `noteTabIsolation` 再次间歇红（`openNote` 的 `findByRole('textbox', { timeout: 5000 })` 在全量并行 fork 的重负载下顶穿 5 秒——该文件 stderr 长期有 flushSync 生命周期警告，单跑即绿），直接卡住推送。按 prd Notes 既有口径处理：不动断言、不改业务代码，把该 helper 的显式等待预算放宽到 15s（findByRole 与其后的 waitFor），复跑全绿后推送。此前的"单跑即绿、未改动"记录升级为"已治标：等待预算 15s"；若日后仍间歇红，属 flushSync 根因，随阶段 5 处理。
- 追加（2026-10-31，**pre-push 升级，偏离 design §6 / prd R6**）：pre-push 从 `test:core` 升级为 `test:ci`（五步同口径），用户当日在 CI 排查后拍板——"全绿再推"由纪律升级为机械保证，代价是每次推送多约 3 分钟。design §6 的 pre-push=test:core 视为被此决定取代；0.7 的 jscpd 挂 test:core 后仍随 pre-push 生效，不受影响。

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
  - 0.6 定案（design.md §6 方案 1）：pre-commit 无条件拒绝 `master`，release-it 侧必须在 `.release-it.json` 配 `git.commitArgs: ["--no-verify"]` 绕过钩子，并在 dry-run 时核实该字段生效（0.6 已在 `.husky/pre-commit` 注释与本注记录）。
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
- **推送纪律（2026-10-31 用户指令，覆盖本任务后续所有小节）**：本分支开着 PR #4，每次推送都触发 CI。推送前必须本地跑 **CI 同口径全集**并全绿——一键脚本 `pnpm test:ci`（= fast-guard 三步 `test:core`+`test:packaging`+`test:docs` + smoke 两步 `test:electron`+`test:ui`，2026-10-31 随本纪律新增）；只跑 `test:core` 不是全绿（两次 CI 红都出在这个盲区）。**同日起 pre-push 钩子已升级为 `test:ci`（见 0.6 追加），纪律成为机械保证**。推送后必须 `gh run watch <run-id> --exit-status` 盯到两个 job 全绿才算该节收口；红了解根因并本地复现修复后才允许下一次推送。

## CI 事故记录（2026-10-31）
- **10-27 run `40430001623` 红**：`check-packaging.mjs` 的 `readJson5Like`（剥 `//` 注释后 `JSON.parse`）读不了 prettier 重排后的 `electron-builder.json5`（单引号 + 裸键，601e3ea 连带）；格式化当天本地只跑了 `test:core`，`test:packaging` 在推送前没人跑过，此雷埋了 4 天。修复：devDependency 落 `json5@2.2.3`，守卫改 `JSON5.parse`（commit `5d0dee1`）。
- **10-31 run `41162618391` 红**：`transitions.test.tsx` 的 electronAPI 夹具只有 HomePage 的 4 个方法；设置页是懒加载，CI 时序下其挂载/effect 重连发生在用例结束之后，`getTheme is not a function` 以 uncaught exception 把 vitest 进程炸成退出码 1（1387 用例全过也红）。修复：补全设置页挂载读取的 6 个 API 为 rejecting mock——各 panel 挂载 handler 全带 `.catch`，走自己的「读取失败」路径，不猜返回形状（commit `0464019`）。
- 修复后本地同口径五步全绿，run `41164161434` 两个 required check 全绿收口。另注意：本机 node 已是 v26.13.0（design §0 记的 v24.13.0 已过时），CI 是 node 22.23.2——时序类差异（如本例）只会在 CI 暴露，这正是要本地跑全集的原因。

## CI 合理性审查（2026-10-31，用户要求"顺便检查 CI 是不是不够合理"）
- **[P1] node 版本漂移（CI-only 时序失败的土壤）→ 已定案 Volta**：本机 v26.13.0 超出 engines `>=22.18 <25`，CI 固定 22.23.2。用户选定 Volta 方案：`package.json` 落 `"volta": {"node": "22.23.2"}`（与 ci.yml 精确一致；Volta 未安装时配置惰性，安装后凡在 `algo-electron/` 下调 node/pnpm 自动切 22）。engines 保持不动。
- **[P2] 缺一键同口径门 → 已落地**：新增 `test:ci` 脚本（commit `7b2317a`），pre-push 同步升级（见 0.6 追加）。
- **[P3] 记录在案、暂不动**：①push.branches 里的 `main` 是死分支（仓库用 master，dev 归 0.1 加），0.1 改 ci.yml 时顺手清；②pnpm/action-setup@v4 有 Node 20 actions 弃用警告（上游动作升级，非本仓代码）；③四个 job 的五步 setup 重复（composite action 候选，当前规模不值得）；④smoke job 的 Playwright 浏览器每次现下载、无缓存（可仿 electron cache 加一步，~20s 收益）；⑤fast-guard 三步串行——拆并行会 3× 消耗 runner 分钟数，单人仓不划算，维持。
- **结构上判为合理、不动的**：`persist-credentials: false`、`permissions: contents: read`、concurrency 按 ref 取消、`--frozen-lockfile`、pnpm action 先于 setup-node、job 名与分支保护 required check 字面值一致（design §0 不变量）、manual-only 的 validate/packaged-smoke 门。

## Rollback
- 每小节一个 commit，可 `git revert` 单节。
- pnpm 切换若阻塞打包：revert 0.2 commit，恢复 `package-lock.json`，其余小节不受影响（都不依赖 pnpm）。
