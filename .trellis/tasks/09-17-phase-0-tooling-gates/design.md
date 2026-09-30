# 阶段 0 技术设计

> 本文件只放技术设计：边界、契约、依赖拓扑、风险、回滚。
> 需求与验收标准在 `prd.md`（R1–R10 / AC1–AC10），执行顺序与逐条命令在 `implement.md`。
> 三者冲突时以 `prd.md` 为准。

## 0. 基线与不变量

| 项 | 现状（2026-09-17，`dev` @ b16e775） | 阶段 0 目标 |
| --- | --- | --- |
| 包管理 | npm，`algo-electron/package-lock.json` | pnpm，`pnpm-lock.yaml` + `packageManager` |
| TypeScript | 7.0.2 | 6.0.3（6.x 最后一版） |
| vite-plugin-electron | 1.1.1 | 1.1.2 |
| Lint | `eslint@10.8.1` + `@babel/eslint-parser@8`（无类型信息） | `typescript-eslint` 8.x `recommendedTypeChecked` |
| 格式化 | 无 | prettier + `eslint-config-prettier` |
| 提交门 | 无 hook | husky：commit-msg + pre-commit + pre-push |
| 重复代码门 | 无（基线 1.76%） | jscpd threshold 3，挂 `test:core` |
| 路径别名 | 无 | `@shared/*`（tsconfig + vite + vitest 三处） |
| 版本管理 | 手工（`package.json` 2.0.0-rc.1） | release-it + conventional-changelog |
| CI 安装 | `npm ci`，cache `package-lock.json` | `pnpm install --frozen-lockfile`，cache pnpm store |

本机开发环境：Windows，node v24.13.0，pnpm 11.21.0（已装于 `~/AppData/Local/pnpm`），corepack 0.34.5，git 2.52.0。
CI：`windows-latest`，node 22.23.2。**两侧 node 大版本不同（24 vs 22）**，0.2 完成后必须确认 pnpm 行为一致（见 §11）。

本阶段不变量：

- 领域红线（`spec/project/domain-rules.md`）与业务行为不变；除 R4 要求的 13 处非空断言类型层修改、3 处 `console.*` → `appLogger` 调用替换外，不改业务代码。
- `.github/workflows/ci.yml` 的 **job 名不可改**：`Fast core, packaging and docs guard`、`Electron and renderer smoke` 是 GitHub 分支保护 required checks 的字面值。改名会让保护永久 pending，PR 无法合并。
- `tests/verify.mjs` 的套件语义不变（`core` 是每块改动的准入门）；只允许在其中**追加** jscpd 步骤。
- 已推送的 tag 与 migration 001–029 不重写。

## 1. 依赖拓扑：为什么是 R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9 → R1 → R10

```
R2 pnpm ──► R3 TS 6.0.3 ──► R4 typescript-eslint ──► R5 prettier ──► R6 husky 门 ──► R7 jscpd
                                  │                                      │
                                  └──────────► R8 @shared alias ◄────────┘
                                                                         │
                              R9 release-it ──► R1 CI/分支保护 ──► R10 COMMIT_RULES
```

约束来源（不是偏好，是依赖）：

1. **R3 在 R4 前**：typescript-eslint 的类型感知解析器跟不上 TS 7，这正是当前 `eslint.config.js` 用 Babel parser 并关掉 `no-unused-vars`/`no-undef` 的原因（见该文件 47–49 行注释）。TS 不降到 6.0.3，R4 开不了类型规则。
2. **R4 在 R5 前**：prettier 必须在 lint 规则定稿后只跑一次全仓格式化，否则规则一改又要重跑几百个文件、并产生第二个纯格式化 commit。
3. **R5 在 R6 前**：pre-commit 的 lint-staged 会调 prettier；格式化先落地，之后的提交才不会被"顺手格式化"污染成混合 commit。
4. **R6 在 R7 前**：jscpd 挂 `test:core`，而 `test:core` 是 pre-push 的内容。门先立，jscpd 才真正在推送时拦人。
5. **R1 在最后**：`dev` 加进 CI 触发并开启保护后，本阶段自己的 PR 才需要走完整流程；放前面等于给还没立好的门加锁。
6. **R10 在最后**：COMMIT_RULES 是对前面所有门的书面描述，门没定完就写文档必然返工。

`implement.md` 的 0.1–0.10 编号与 R 编号的对应：0.2=R2、0.3=R3、0.4=R4、0.5=R5、0.6=R6、0.7=R7、0.8=R8、0.9=R9、0.1=R1（刻意排在最后执行）、0.10=R10。

## 2. R2 pnpm：契约与风险

### 契约（2026-09-17 实施中按 pnpm 12 官方机制核实后的最终形态）
- **设置入口是 `algo-electron/pnpm-workspace.yaml`，不是 `.npmrc`**：pnpm 12 只从 `.npmrc` 读认证/registry 设置，其余项目设置全部在 `pnpm-workspace.yaml`（其中 `nodeLinker`、`shamefullyHoist` **只能**在这里设）。内容：
  ```yaml
  nodeLinker: hoisted
  shamefullyHoist: true
  strictPeerDependencies: false
  allowBuilds:
    electron-winstaller: true
    esbuild: true
  ```
  `spec/shared/pnpm-electron-setup.md` 写的是 pnpm 8/9 时代的 `.npmrc` 方案，本阶段按官方机制落地，spec 在 3.3 同步（`migration-status.md` 已记）。
- `package.json` 加 `"packageManager": "pnpm@12.8.1"`（`npm view pnpm version` 的 latest）。CI 由 `pnpm/action-setup@v4` 读该字段，**不**在 workflow 里再写版本号。
- `postinstall` 内联为 `install-electron --no && electron-builder install-app-deps`（与 PRD R2 原文一致）。`install-electron` 由 `electron` 包提供（已确认 `node_modules/electron/package.json` 的 `bin`）。**不能**写成嵌套的 `pnpm run install:electron && …`：pnpm 生命周期里 `pnpm` 解析到 PATH 上的其它版本时会撞 `packageManager` 版本门（实测 `ERR_PNPM_...` + "Corepack invoked pnpm with this version, and pnpm does not switch versions when running under corepack"）。
- 删除 `package-lock.json`，提交 `pnpm-lock.yaml`。
- CI 四处改动：`pnpm/action-setup@v4`（**必须在 `actions/setup-node` 之前**，否则 `cache: pnpm` 无法定位；本仓库 `package.json` 在 `algo-electron/` 而非仓库根，所以必须传 `package_json_file: algo-electron/package.json`）、`setup-node` 的 `cache: pnpm` + `cache-dependency-path: algo-electron/pnpm-lock.yaml`、`pnpm install --frozen-lockfile`、Electron 下载缓存 key 的 `hashFiles` 换成 `pnpm-lock.yaml`。

### 环境偏差（已实测，记录以备复核）
- `corepack enable` 在本机失败：`EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarnpkg'`（需管理员权限写 Node 安装目录）。替代路径：pnpm 自身会按 `packageManager` 切换版本（实测裸 `pnpm` 11.21.0 在项目内切到 12.8.1），`corepack prepare pnpm@12.8.1` 也可用且无需提权。仓库不依赖 corepack 已被 enable。
- 副作用：`corepack pnpm <cmd>` 调用链下的嵌套 `pnpm` 会失败（见上），因此本机一律用裸 `pnpm`；CI 里 PATH 上的 pnpm 就是 12.8.1，不存在该问题。
- store 跨盘 hardlink 警告（`C:` 上的 store 与 `D:` 上的项目不同盘）由 pnpm 自动改用 `D:\.pnpm-store`，属机器级状态，不入库。
- **换 PM 会重新解析传递依赖**：npm 锁文件是几周前生成的，pnpm 今天对同一批 range 重新求解，于是约百条传递依赖拿到期间发布的 patch（例：`@testing-library/dom` 10.4.1 → 10.4.2）。实测**直接依赖版本全部一致**。没有为此固定上百条传递依赖（那等于把"当时恰好装到什么"固化下来，与既定决策相反）；风险由测试与 CI 兜底，若日后要复现旧图，用 `git show <rev>:algo-electron/package-lock.json` 作对照。

### 风险（实测结论）
- **`ERR_PNPM_IGNORED_BUILDS`**：pnpm 10+ 不执行依赖的构建脚本，pnpm 12 把它从警告升级为**安装直接失败**，列出 `esbuild@0.28.2`、`electron-winstaller@5.4.0`。解法是上面的 `allowBuilds`（由 `pnpm approve-builds --all` 写入）。已在 `tests/packaging/check-packaging.mjs` 加守卫：该配置或 `nodeLinker: hoisted` 缺失即红灯。
- `electron@43.4.0` 与 `better-sqlite3@13.0.3` **本身不带 install/postinstall 脚本**（已核对包内 `scripts`），Electron 二进制与 native ABI 重建完全由根 `postinstall` 负责；`better-sqlite3` 走 `prebuilds/*.node`，不需要 `build/Release`。
- **hoisted 布局对 `electron-builder.json5` 的 `asarUnpack`/`files` 白名单的影响**：判定命令是 `pnpm build:win` 后的 `test:packaged-app`；`test:packaging` 只验静态配置。
- **旧 `node_modules` 残留**：切换 linker 前必须整体删除 `algo-electron/node_modules`。本次即按"删 `node_modules` + 删 `package-lock.json` → `pnpm install`"验证。
- 守卫不能用字面量断言包管理器写法：`tests/packaging/check-packaging.mjs` 原来的 `postinstall === 'npm run install:electron && npm run install:app-deps'` 这类断言在本阶段必然变红，已改为断言**顺序**（先装 Electron 二进制、再重建 native 依赖；`build`/`build:win` 在 `electron-builder` 之前跑 `test:packaged-main`）。

### 回滚
revert 0.2 的单个 commit，恢复 `package-lock.json`，其余小节都不依赖 pnpm（R3–R10 只用 npm 也能跑），因此 pnpm 若阻塞打包不会拖垮整个阶段。

## 3. R3 TypeScript 6.0.3

### 契约
- `typescript` 7.0.2 → `6.0.3`（精确版本，不用 `^`）；`vite-plugin-electron` 1.1.1 → 1.1.2。
- `pnpm typecheck` 与 `pnpm typecheck:tests` 均 0 error **且 0 deprecation 提示**。6.0 会对将在 7 移除的选项发提示，逐条处理而不是忽略。
- 预期提示点：`tsconfig.node.json` 的 `composite` 与 `moduleResolution: bundler`；`tsconfig.tests.json` extends 主配置后继承 `verbatimModuleSyntax`（R8 引入）的连带提示。修复方向是改写该选项，而不是加 `ignoreDeprecations`。

### 风险与出口
- 依赖侧类型定义（vite 8 / vitest 4 / electron 43 / @types/react 19）是按 TS 7 发布的，6.0.3 下可能出现第三方 `.d.ts` 报错。区分办法：只看**本项目源码**的报错；第三方 `.d.ts` 报错用 `skipLibCheck`（已开）应被压掉，压不掉的即不可绕过。
- 出口已在 `prd.md` R3 给定：不可绕过时回退 5.9.3，并在 `prd.md` Notes 记录原因。但注意回退 5.9.3 会**连带削弱 R4 的类型规则可用性**（typescript-eslint 8.x 支持 5.9 是没问题的，支持 6.0 才需要确认），因此若回退，R4 的规则清单需要重新确认一遍版本支持范围。

### 回滚
单 commit revert。TS 与 R4 是耦合对：回滚顺序必须先 R4 后 R3。

## 4. R4 typescript-eslint 接入

### 目标配置形态
`eslint.config.js` 从 Babel parser 换成：

```js
import tseslint from 'typescript-eslint'
export default tseslint.config(
  { ignores: [...] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { /* prd.md R4 的规则清单 */ },
  },
  { files: ['electron/app/startupSmoke.ts', 'electron/scripts/userscriptBootstrapPreload.ts'],
    rules: { 'no-console': 'off' } },
)
```

### 关键机制：`projectService` 要求每个被 lint 的 TS 文件都在某个 tsconfig 的 include 内
当前 `tsconfig.node.json` 只 include `vite.config.ts`，而 lint 范围是 `eslint .`。因此下列文件会报 "was not found by the project service"：

- `algo-electron/playwright.config.ts`（现状：任何 tsconfig 都不收）
- 之后新增的任意根级 `.ts` 配置

处理方式（择一，实现时按报错清单决定并写进 PR 描述）：把根级配置文件补进 `tsconfig.node.json` 的 `include`；或对这批文件单独一段 config 用 `projectService: { allowDefaultProject: [...] }`。**不能**用 `parserOptions.project` 逐项目罗列后漏掉文件——那是同类问题的复发形态。

### 开门顺序（避免"门一开全红，改不完就关掉"）
1. 先按 R4 修完：13 处非空断言（点位见 `implement.md` 0.4；`NavigationDecision` 改判别联合一次消 5 处）、40 处渲染层导出组件/hook 缺返回类型、`no-floating-promises`、`registerCoachIpc.ts:160,306,325` 三处 `console.*` → `appLogger`。
2. 再把规则设为 `error` 并跑 `pnpm lint --max-warnings 0`。
3. 最后删除 `@babel/*` eslint 相关四个依赖。

`no-undef` 关闭（TS 已覆盖），`globals` 只对 `.js/.mjs/.cjs` 有意义；`no-console` 的 override 必须与 PRD 字面一致——PRD 允许的两个文件以外的 `console.*`（其余 6 处）走 override 还是改代码，以实现时的报错清单为准并在 `implement.md` 勾选时记录。

### 验收
`prd.md` AC4，含"故意写一行 `const x = y!.z` 使 lint 变红"的反向验证——只跑绿灯的门等于没门。

## 5. R5 prettier

### 契约
`.prettierrc`：`semi: false`、`singleQuote: true`、`printWidth: 100`、`trailingComma: 'all'`。
`.prettierignore`：`dist*`、`release`、`tmp`、`pnpm-lock.yaml`（锁文件由包管理器生成，格式化它是无意义冲突源）。
`eslint.config.js` 末尾追加 `eslintConfigPrettier`，关闭与格式化冲突的规则。

### 顺序不变量
`prettier --write .` **只跑一次**，且必须是**独立 commit** `style: 全仓 prettier 格式化`，不与任何逻辑改动混合。理由有二：一是 R6 的 lint-staged 之后会对每个改动文件自动格式化，混在一起后无法分辨"格式化造成的 diff"与"真实改动"；二是格式化 commit 覆盖大量文件，按 `git-workflow.md` 的"一个 commit 只做一件事"，它必须能被单独 revert 和单独 blame-skip。

### 验收
`pnpm prettier --check .` 通过；`pnpm lint` 仍 0/0（证明 `eslint-config-prettier` 生效且没有规则互相打架）。

## 6. R6 husky 门

### 契约

| Hook | 内容 | 失败条件 |
| --- | --- | --- |
| `commit-msg` | `commitlint --edit`（`type-enum`、`scope-enum`、`subject-case: off`） | type/scope 不在词表、描述为空 |
| `pre-commit` | 分支检查 → `lint-staged`（prettier + eslint --fix）→ `pnpm typecheck && pnpm typecheck:tests` | 在 `master` 上提交；lint 或类型错 |
| `pre-push` | `pnpm test:core` | 任一门失败 |

`lint-staged` 只处理 staged 文件，但 `pre-commit` 的两次 typecheck 是全量的（类型检查没有增量可信路径）。墙钟代价已知并接受。

### 必须解决的冲突：release-it 要求在 master 提交，pre-commit 拒绝 master 提交
两者直接互斥。若不在阶段 0 解决，v3.0.0 的 `pnpm release` 会卡在 pre-commit。候选方案（0.9 与 0.1 之间必须选一个并落地到 `.release-it.json` 与 hook 脚本）：

1. release-it 侧 `git.commitArgs: ["--no-verify"]`——**待确认**当前 release-it 版本是否支持该字段；
2. pre-commit 检测 release-it 注入的环境变量后放行 master 提交；
3. hook 里同时要求 `git branch --show-current == master` **且** 工作树有 release 标记文件才拒绝。

选 1 或 2 都行，但必须写进 `prd.md` R9/R6 的最终配置，不能只是"碰巧能过"。

### Windows / detached HEAD 细节
- husky v9 通过 `core.hooksPath` 生效；hook 脚本由 Git for Windows 的 sh 执行。当前仓库 `core.hooksPath` 为空（已确认），`pnpm exec husky init` 会设置。
- `git branch --show-current` 在 detached HEAD（rebase、CI、release-it 的某些步骤）返回空字符串。空值**不**按 `master` 处理（否则 rebase 与 CI 全被拦），但分支检查脚本必须显式写这条分支，不能靠 `[ "$b" = "master" ]` 的隐式行为让读者猜。

### 验收
`prd.md` AC6：三条故意失败的提交（非法 type、在 master、lint 错）都必须被拒。这是门类改动唯一可信的验证方式。

## 7. R7 jscpd

- `.jscpd.json`：`threshold: 3`、`format: ["typescript","tsx","css"]`、`ignore: ["tests","dist","dist-electron","release","tmp","node_modules"]`、`output: "tmp/jscpd"`。
- 挂载点：`tests/verify.mjs` 的 `runCoreSuite()`（当前顺序 `runTypecheck → runLint → runArchitecture → runSecurity → runVitest`），jscpd 放在 `runSecurity()` 与 `runVitest()` 之间。
- 基线 1.76%，门 3%：留约一倍余量，能拦住成段复制粘贴而不至于让正常相似代码误伤。
- `tmp/` 已在根 `.gitignore` 与 `algo-electron/.gitignore` 的忽略范围（`tmp/`），报告产物不会入库。

## 8. R8 `@shared` 别名 + `verbatimModuleSyntax`

### 契约（三处必须同步，漏一处就是"类型过、运行炸"）
1. `tsconfig.json`：`paths: { "@shared/*": ["src/shared/*"] }`；
2. `vite.config.ts`：renderer 的 `resolve.alias['@shared']`；
3. `vitest.config.ts`：同样的 alias（测试走 vitest 自己的解析，不看 vite 配置）。

`src/shared/index.ts` 本阶段只建空导出，内容在阶段 2 填（`prd.md` R8）。

### `verbatimModuleSyntax: true` 的连带影响
开启后所有**纯类型** import 必须写成 `import type`，否则编译报错。这条与 R4 的 `consistent-type-imports` 规则指向同一目标（两个门、同一份修改），所以 R8 放在 R4/R5 之后代价最小：届时格式化已完成，`import type` 的批量修改不会与格式化 diff 纠缠。

### 验证
临时测试文件 `import '@shared/index'` 在 renderer 与 vitest 两侧都解析通过后删除（`implement.md` 0.8）。不要把这个临时文件留在仓库里——它会变成第二个"永远绿的假测试"。

## 9. R9 release-it

### 契约
`.release-it.json` 按 `prd.md` R9 的字段清单：`git.commitMessage = "chore(release): 发布 v${version}"`、`git.tagName/tagAnnotation = "v${version}"`、`git.requireBranch = master`、`github.release = true`、`github.assets = ["release/${version}/*.exe", "release/${version}/*.blockmap", "release/${version}/latest.yml"]`、`plugins.@release-it/conventional-changelog.infile = docs/PRODUCT/CHANGELOG.md`、`preset: conventionalcommits`、`hooks.before:init = ["pnpm test:all", "pnpm build:win"]`。`package.json` 加 `"release": "release-it"`。

### 实现时必须核实的三点（不要凭印象写死）
1. **dry-run 是否执行 `hooks.before:init`**：若执行，一次 dry-run 就是一次 `test:all` + `build:win`（数十分钟）；若不执行，则 dry-run 无法证明 hooks 配置有效，需要单独一次真实前置命令验证。
2. **`git.commitArgs` 是否可用**：见 §6 的互斥冲突，这是选择放行方案的前提。
3. **资产 glob 与 electron-builder 输出路径是否一致**：当前 `release/` 目录布局由 `electron-builder.json5` 决定，`release/${version}/*` 是否成立需实际核对；不一致就改 glob，不要改打包输出目录（那属于阶段 6 的范围）。

本阶段只做配置与 dry-run，不发版。

## 10. R1 / R10 收尾

- `ci.yml`：`on.push.branches` 增加 `dev`；`pull_request` 触发全部 job。**job 名与 `name:` 字面值不动**（§0 不变量）；若确需改 `name`，必须同步更新 GitHub 分支保护的 required checks——阶段 0 不做这件事。
- `docs/GOVERNANCE/COMMIT_RULES.md` 重写为 `spec/project/git-workflow.md` 的书面镜像：格式、type 表、scope 词表、分支模型、合并方式（squash / `--no-ff`）、husky 三条门、release-it 流程。文档与配置不一致时以配置为准并改文档，因为 `test:docs` 只校验链接与覆盖，校验不了语义漂移。

## 11. 兼容、边界与验收映射

### 边界
- 不做：任何业务逻辑修改、目录搬迁（阶段 3/4）、换库（阶段 1）、实际发版（阶段 6）、`ci.yml` job 改名。
- 与阶段 1–6 的接口：R8 建的 `src/shared/` 空目录是阶段 2 的落点；R4 的 lint 规则是后续所有阶段的准入条件；R6 的门决定了后续每个子任务都走 `feat/*` → squash → `dev`。

### 环境差异待确认
本机 node v24.13.0 vs CI node 22.23.2。`engines` 允许 `>=22.18.0 <25`，两者都在范围内，但 pnpm 的 `node-linker=hoisted` 与 `packageManager` 字段解析在两侧应一致——0.2 后用一次 PR 触发 CI 验证（这也正是 AC1 的内容）。

### 验收映射

| PRD 验收 | 由哪一小节产出 | 判定命令 |
| --- | --- | --- |
| AC1 dev 触发 CI、master 直推被拒 | 0.1 / 0.2（ci.yml 与 pnpm 缓存） | push `dev` 看 `fast-guard`；`git push origin master` 被拒 |
| AC2 干净安装 + 打包可用 | 0.2 | `pnpm install --frozen-lockfile && pnpm test:all && pnpm build:win`；`pnpm test:packaged-main` |
| AC3 TS 6.0.3 且 0 error 0 deprecation | 0.3 | `pnpm typecheck`、`pnpm typecheck:tests`、读 `node_modules/typescript/package.json` |
| AC4 lint 0/0 且规则齐全 | 0.4 | `pnpm lint`；故意写 `const x = y!.z` 变红 |
| AC5 prettier 通过 | 0.5 | `pnpm prettier --check .` |
| AC6 三条失败提交被拒 | 0.6 | 三次故意失败的 commit |
| AC7 jscpd 进门且通过 | 0.7 | `pnpm test:core` 输出 jscpd 段 |
| AC8 `@shared` 双端可解析 | 0.8 | 临时 `import '@shared/index'`（renderer + vitest） |
| AC9 release dry-run 输出正确 | 0.9 | `pnpm release --dry-run --no-git.requireBranch` |
| AC10 COMMIT_RULES 更新、test:docs 过 | 0.10 | `pnpm test:docs` |

### 回滚
每小节一个 commit，可单节 revert。全局回滚按逆序：R10 → R1 → R9 → R8 → R7 → R6 → R5 → R4 → R3 → R2；其中 R3/R4 必须成对逆序回滚（§3）。pnpm（R2）与 TS（R3）互相独立，可单独回滚任一个：R3 回退 5.9.3 后 R2 的 pnpm 仍工作，R2 回退 npm 后 R3 的 TS 版本也仍工作。
