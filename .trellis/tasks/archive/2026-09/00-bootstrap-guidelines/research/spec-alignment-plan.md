# 分阶段规范对齐计划 v2（完全对齐模板）

- 2026-09-17 用户决策：**模板是唯一标准，不为旧习惯保留，不计迁移成本。** v1 里所有"保留现状"的建议作废。
- 依据：`spec-alignment-report.md`（高 9 / 中 23 / 低 22）+ `reinvented-wheels-audit.md`（A 类 13 项、B 类 15 项）。
- 每个阶段 = 一个 Trellis 子任务 = 一个 `feat/…` 或 `refactor/…` 分支 = 一次 squash 合入 dev。阶段内可再拆。
- 用时为单人 + AI 协作估计。总计约 **35 到 45 个工作日**。

---

## 决策记录（替代 v1 的 16 个待确认项）

| # | 项 | 决定 | 模板依据 |
|---|---|---|---|
| D1 | 时间戳 | **全栈 Unix 毫秒 INTEGER**，65 个 TEXT 时间列迁移；展示层用 `Intl.DateTimeFormat`，本地日从毫秒派生 | `shared/timestamp.md` |
| D2 | 主进程布局 | **`src/main/services/{domain}/{types.ts, procedures/, lib/}` + `src/main/ipc/*.handler.ts`**，26 个平铺目录逐域迁入 | `backend/directory-structure.md` |
| D3 | 三分目录 | **`src/main` / `src/preload` / `src/renderer/src` / `src/shared`**，`electron/` 目录退役 | `frontend/directory-structure.md` |
| D4 | 测试布局 | **`tests/{setup,factories,mocks,unit,integration}`**，用例 `describe` 四类分组 + `it('should …')` 英文 | `backend/directory-structure.md`、`shared/code-quality.md` |
| D5 | commit | `type(scope): 中文说明`，type/scope 英文；commitlint + husky 强制 | `shared/git-conventions.md` + 用户既定习惯 |
| D6 | 分支 | master ← dev ← feat/fix 分支；feature→dev squash；dev→master `--no-ff`；PR 必需；master 分支保护 | `shared/git-conventions.md` |
| D7 | 文件命名 | **kebab-case**（组件 PascalCase、hook `useX`），283 个文件 `git mv` | `shared/code-quality.md` |
| D8 | 返回形状 | `{ success: true, data } \| { success: false, error, code? }` 判别联合，`{ok}` 35 处改掉 | `shared/code-quality.md` |
| D9 | 共享目录 | `src/shared/{types,constants/channels.ts}`；renderer 用 `@shared` alias，main 用相对路径 | `backend/quality.md` |
| D10 | 日志 | **electron-log** + 脱敏 hook；自研 logger 删除 | `backend/logging.md` |
| D11 | 校验 | **zod**；`payloadSchema.ts` 删除 | `backend/type-safety.md` |
| D12 | ORM | **Drizzle + drizzle-kit**；001–029 作为基线导入；迁移前备份保留 | `backend/database.md` |
| D13 | 配置 | **electron-store** + zod schema | `backend/environment.md` |
| D14 | CSS | `styles/{index,tokens,base}.css` + `components/` `layout/` `pages/`；**BEM** 类名；简单样式用 Tailwind 工具类 | `frontend/css-design.md` |
| D15 | 预加载 API | **`window.api`**，`declare global` + `typeof api` 推导 | `frontend/ipc-electron.md` |
| D16 | 文档语言 | spec 目录**英文**（模板规则）；仓库其余文档、commit 说明、PR 保持中文 | `shared/index.md` 末行 |
| D17 | 包管理 | **pnpm** + `.npmrc`（`node-linker=hoisted`、`shamefully-hoist=true`）+ `packageManager` 字段；CI 改 pnpm | `frontend/quality.md`、`shared/pnpm-electron-setup.md` |
| D18 | 构建 | **保留 vite + electron-builder**（模板 README Tech Stack 明示 electron-builder；Forge 只是 pnpm 指南的示例） | `README.md` |
| D19 | TypeScript | **降到 6.0.3**（用户要求：6.1 之前的最后一个稳定版；`npm view` 核实 6.0.x 系列最新为 6.0.3，无 deprecated 标记，typescript-eslint 8.70 peer `>=4.8.4 <6.1.0` 覆盖）。6.0 是通往 7 的"弃用过渡版"，`tsc` 会对将在 7 移除的选项报弃用提示，阶段 0.3 逐条修掉。若 vite-plugin-electron / vitest 在 6.0 下出现无法绕过的问题，回退 5.9.3 并记录原因 | `shared/code-quality.md` |
| D20 | 格式化 | **prettier**（模板 spec 文件即 prettier 风格），一次性全仓 `style:` commit | — |
| D21 | AI 工具目录 | 全部跟踪（`.claude` 已从 `.gitignore` 解除，只忽略 `settings.local.json`）；runtime/cache 已由 `.trellis/.gitignore` 排除（`.runtime/`、`.developer`、`__pycache__`）。`.trellis/.template-hashes.json` 与 `workspace/*/journal-*.md` 是 Trellis 设计上要入库的 | Trellis 约定 |
| D22 | 残留 | 删 `algo-coach-showcase.html`、`release-notes.txt`；`ai coach技术栈.md` → `docs/ARCHIVE/AI_COACH_TECH_STACK.md`；`REFACTOR_HANDOFF.md`、`algo-electron/docs/TASKS.md`、根 `AI_HANDOFF.md`、`VERSION_PLAN.md` 归档到 `docs/ARCHIVE/`（职责由 `.trellis/` 与 CHANGELOG 接管） | — |
| D23 | 项目业务红线 | 不变，写入 `.trellis/spec/project/domain-rules.md`：WebContentsView 唯一、Cookie 不进渲染层、远程页无 Node、提交监测只记最终 verdict、rated 比赛静默 | `docs/GOVERNANCE/PROJECT_RULES.md` |
| D24 | 版本管理 | **单一来源 = `package.json`**；用 **release-it + @release-it/conventional-changelog** 一条命令完成"bump → 生成 CHANGELOG → annotated tag → push --follow-tags → GitHub Release 上传 exe + blockmap"；README 版本徽章改为 shields.io 读 GitHub Release，不再手写；`VERSION_PLAN.md`、`release-notes.txt` 退役；**历史 tag 不重写**（已推送、已有 Release），只在 CHANGELOG 顶部加一段"历史版本号说明"；从 v2.1.0 起版本号严格单调 | `shared/git-conventions.md` Tags；`docs/OPERATIONS/RELEASE_PROCESS.md` |

---

## 阶段 0　工具门与工程底座（2 天）

先把门建好，后面每一步都在门内进行。

| 步骤 | 内容 | 验证 |
|---|---|---|
| 0.1 | 推送 `dev`；GitHub master 分支保护（仅 PR、CI 必过、禁 force push）；`ci.yml` 加 `dev` 到 `on.push.branches` | push dev 触发 fast-guard |
| 0.2 | npm → **pnpm**：`.npmrc`、`pnpm-lock.yaml`、`packageManager`、CI `pnpm/action-setup`、`postinstall` 改 `pnpm rebuild` | `pnpm install` 干净；`test:packaged-main` 过（better-sqlite3 hoist） |
| 0.3 | TS 7.0.2 → **6.0.3**（D19）；`vite-plugin-electron` 升 1.1.2；跑 `typecheck` + `typecheck:tests`，修 6.0 的弃用提示与新报错；失败则回退 5.9.3 | 0 错、0 弃用提示 |
| 0.4 | ESLint 切 **typescript-eslint**（`recommended-type-checked`）+ 规则：`no-non-null-assertion` error、`no-explicit-any` error、`consistent-type-imports`、`explicit-module-boundary-types`、`no-floating-promises`、`no-console`（main 范围） | 当前 13 处 `!` 先修再开门 |
| 0.5 | **prettier** + `.prettierrc`（单引号、无分号、printWidth 100、与模板 spec 一致）；全仓一次格式化，单独 `style: 全仓 prettier 格式化` commit | `prettier --check` 过 |
| 0.6 | **husky + commitlint**：`commit-msg` 校验 `type-enum` / `scope-enum`；`pre-commit` 跑 `lint-staged`（prettier + eslint）+ `typecheck` | 故意提交 `update` 被拒 |
| 0.7 | **jscpd** 进 CI：阈值 3%，报告进 `tmp/` | 当前 1.76% 过 |
| 0.8 | `tsconfig`：`verbatimModuleSyntax`、`paths: { "@shared/*": ["src/shared/*"] }`；vite/vitest 同步 alias | |
| 0.9 | `COMMIT_RULES.md` 重写：scope 词表、必带规则、分支模型、合并方式；`.mailmap` | |
| 0.10 | **版本管理工具化（D24）**：装 `release-it` + `@release-it/conventional-changelog`，`.release-it.json` 配置：`git.tagAnnotation`、`git.commitMessage = "chore(release): 发布 v${version}"`、`github.release = true`、`github.assets = release/${version}/*.exe, *.blockmap`、`hooks.before:init = pnpm test:all && pnpm build:win`；`pnpm release` / `pnpm release -- --preRelease=rc`；删除手写 bump 流程 | 在 dev 上 `pnpm release --dry-run` 输出正确的下一版本与 CHANGELOG 片段 |

---

## 阶段 1　基础设施换库（4 天）

替换三个自研基础设施，为后续所有代码提供标准积木。每项一个分支。

| 步骤 | 内容 | 涉及 |
|---|---|---|
| 1.1 | **zod 替换 payloadSchema**：新建 `src/shared/types/*.ts` 用 zod 定义所有 IPC 输入 schema（`z.object().strict()`）；`trustedSender` 的 `parseOrReject` 改调 `safeParse`；删 `payloadSchema.ts`；架构守卫 `UNSCHEMAD_IPC_BUDGET` 改查 zod schema 存在 | 196 处调用、`tests/ipc/*` |
| 1.2 | **electron-log 替换 logger**：`src/main/services/logger.ts` = electron-log + `hooks.push(redact)`（保留脱敏正则）+ `scope()`；102 处 `appLogger.x('模块.事件', …)` 改 `logger.scope('模块').x('事件', …)`；9 处 `console.*` 清零 | `tests/shared/logger*` 改测 hook |
| 1.3 | **electron-store 替换 config.ts**：`Store<AppConfig>` + zod `schema`；`env-setup.ts` 在 main 入口第一行 import（**同时完成 dev/prod userData 隔离**，高-6） | `tests/app/*` |
| 1.4 | 返回形状统一 `{ success, data } \| { success, error, code }`，定义 `src/shared/types/common.ts createOutputSchema()`；6 处 `errorMessage(error)` 直返改固定文案 + 日志 | 35 处 `{ok}`、23 处 `{success}` |
| 1.5 | 时间 bug 止血（不等 D1 大迁移）：`CoachFeedbackStore.computeSince`、`CoachOrchestrator` 三处 `toISOString` 改统一函数；删两份 `nowBeijing` 复制 | 高-5 |

---

## 阶段 2　IPC 契约与共享层（5 天）

| 步骤 | 内容 |
|---|---|
| 2.1 | 新建 `src/shared/constants/channels.ts`：158 个 channel 常量按域分组 `IPC_CHANNELS.PROBLEM.LIST_RECENT`；架构守卫加"channel 字面量预算 = 0" |
| 2.2 | `src/shared/types/`：`electron-env.d.ts` 112 个类型改为 zod schema + `z.infer` 导出（与 1.1 合并）；主进程 72 处、渲染 10 处 + 6 组改名副本全部改 import；删 `electron-env.d.ts` |
| 2.3 | `src/preload/index.ts`：`contextBridge.exposeInMainWorld('api', api)`，`declare global { interface Window { api: typeof api } }`；删 85 处 `as Promise<X>`；渲染层 `window.electronAPI` → `window.api`（155 处，在 `*Api.ts` 内）；`*Api.ts` 退化为 re-export 后删除 |
| 2.4 | 数据刷新：main 侧建 `DATA_CHANGED` 事件（按表名），preload 暴露 `onDataChanged`；渲染层 `DataRefreshContext` + `useIpcQuery()` hook；15 个取数组件迁入 |
| 2.5 | **时间 → Unix 毫秒（D1）**，单独分支：drizzle 之前先做数据迁移 030（65 列 TEXT → INTEGER，`local_day` 派生列保留）；repository 返回 `number`；11 处渲染格式化改 `Intl`；`user_daily_stats` 重算 |

---

## 阶段 3　主进程重构到模板布局（10 天）

| 步骤 | 内容 |
|---|---|
| 3.1 | **Drizzle**（D12）：`src/main/db/{client,schema,migrate}.ts`；21 张表 schema；`drizzle-kit generate` 基线 = 029 之后的空 diff；`initDbAtPathWithMigrationSafety` 保留备份逻辑改包 `migrate()`；249 处 `prepare` 分域改写（先 problem/submission/stats，后 coach/userScript/site）；114 处 `as Row` 消失 |
| 3.2 | 目录迁移 `electron/` → `src/main/`（D2、D3）：按域建 `services/{problem,submission,coach,browser,user-script,site,credential,note,backup,ai,tracking,rating}/{types.ts,procedures/,lib/}`；IPC 改 `ipc/{domain}.handler.ts` 薄层；3 个胖 handler 主体进 procedures |
| 3.3 | `main.ts` → `src/main/index.ts` < 150 行：`env-setup` → `bootstrap-services` → `create-shell-window` → `register-ipc`；22 个模块级 `let` 收进 `AppContext` |
| 3.4 | `TabManager` 2278 行拆：`services/browser/lib/{navigation-policy,view-lifecycle,tab-events}.ts` + procedures；目标 < 600 |
| 3.5 | `CoachOrchestrator` 1415 行拆：`services/coach/lib/{contest-auditor,llm-hint-coordinator,session-event-router}.ts` |
| 3.6 | 收敛 A6/B2（session store 合一）、A9（`shared/lib/timing.ts`）、A12（EventEmitter）、B7（guarded IPC 参数化）、B9（registry 合一） |
| 3.7 | 文件名 kebab-case（D7）：`git mv` 一次性，单独 `refactor: 文件名统一 kebab-case` commit，紧接目录迁移做以免两次大 diff |

---

## 阶段 4　渲染层重构到模板布局（6 天）

| 步骤 | 内容 |
|---|---|
| 4.1 | `src/renderer/src/{components/{ui,layout},features/{settings,navigation},modules/{problems,analytics,coach,scripts,home},hooks,context,lib,styles}`；每个 module `{components,hooks,context,constants.ts,types.ts,index.ts}` |
| 4.2 | Context：`ShellActionsContext`（onNavigate/onClose/onOpenTab）、`DataRefreshContext`、`AppPreferencesContext`；`App.tsx` → `< 200` 行 |
| 4.3 | 三个 > 300 行组件拆分；`NoticeBarStack` 独立 |
| 4.4 | CSS（D14）：`styles/index.css` 单入口 + `tokens.css` + `base.css` + `components/*.css` + `layout/` + `pages/`；5 个 > 500 行文件拆；**BEM 重命名** 463 个选择器；旧别名 `--bg/--text` 372 处改语义 token；简单布局改 Tailwind 工具类；17 处 `scrollbar-gutter: stable`；滚动条 hover 淡入 |
| 4.5 | 加载态三态统一、refetch 不闪骨架；9 处吞错改 `reportRendererError`；33 处布尔 state 加 `is/has` 前缀；40 处组件补返回类型 |

---

## 阶段 5　测试体系对齐（4 天）

| 步骤 | 内容 |
|---|---|
| 5.1 | `tests/{setup/global-setup.ts, setup/test-helpers.ts, factories/*.factory.ts + resetAllCounters, mocks/electron.ts}`；`electronMock.ts` 移入 `mocks/` |
| 5.2 | 178 个测试文件按 `unit/services/{domain}/{lib,procedures}` 与 `integration/` 重排；`describe` 四类分组；1212 个用例名统一英文 `should …`；21 个路径名用例重写 |
| 5.3 | 覆盖率：目录级门 procedures/lib 80%、handlers 60%；全局棘轮保留 |
| 5.4 | vitest `test.projects` 按目录切 jsdom/node，删 21 处文件头注释；加 `@testing-library/jest-dom` + `user-event` |
| 5.5 | `tests/verify.mjs` 保留为真实 Electron 编排器（模板无等价物），文档化为项目扩展 |

---

## 阶段 6　仓库清理与文档（1 天）

| 步骤 | 内容 |
|---|---|
| 6.1 | D22 残留归档/删除；`docs/README.md` 索引同步；`test:docs` 过 |
| 6.2 | `SYSTEM_ARCHITECTURE.md`、`DATABASE_SCHEMA.md`（Unix 毫秒 + Drizzle）、`CONTRIBUTING.md`（pnpm、husky、分支模型）、各目录 README 随迁移重写 |
| 6.3 | 版本历史整理（D24）：CHANGELOG 顶部加"历史版本号说明"（见下方审计 V1–V4）；修正 0.5.0 / 0.6.0 条目日期为 tag 日期 2026-06-04 / 2026-06-28；补 0.1.0-alpha–0.4.0 四条简要条目（从 tag 信息与 GitHub Release 标题取）；README 徽章改 shields.io；`RELEASE_PROCESS.md` 改为 release-it 流程 |
| 6.4 | `.trellis/spec/project/migration-status.md` 逐阶段更新至"全部完成"，然后删除该文件（spec 回到纯模板 + domain-rules） |

---

## 附：版本管理审计（2026-09-17）

用户反馈"版本管理非常混乱"。以下为实测（`git for-each-ref`、`git show <tag>:package.json`、`gh release list`、CHANGELOG 标题）。

| # | 问题 | 证据 | 影响 | 处理 |
|---|---|---|---|---|
| V1 | **tag 名与代码里的版本号不一致** | `v1.1.0-beta.1` 指向的 commit `package.json` 是 `2.0.0-beta.1`；`v1.1.0-beta.2` 指向 `2.0.0-beta.2`。两个 tag 创建于 2026-09-03，指向的 commit 是 2026-07-13 的（事后补打并改名） | 安装包文件名（`${version}` 来自 package.json）与 Release 标题对不上；electron-updater 比对版本会混乱 | 不重写（已推送、已有 Release）。CHANGELOG 加说明；今后 tag 由 release-it 从 package.json 生成，不可能再错位 |
| V2 | **版本号不单调** | 序列：1.0.0 → 2.0.0-beta.1 → 2.0.0-beta.2 → **1.1.0-beta.2**（c569adc "统一版本号"）→ 2.0.0-rc.1。semver 下 1.1.0-beta.2 < 2.0.0-beta.1，是倒退 | 依赖版本比较的任何逻辑（更新检查、`npm version` 校验）都会被绊 | 同上；`.release-it.json` 开 `git.requireUpstream` + conventional bump，人工不再手填版本号 |
| V3 | **CHANGELOG 日期与 tag 日期不符 / 早期版本缺条目** | CHANGELOG `0.5.0 - 2026-07-03`、`0.6.0 - 2026-07-03`，实际 tag 日期 06-04、06-28；0.1.0-alpha–0.4.0 无条目；`1.1.0-beta.x - 2026-07-13` 而 tag/Release 创建于 09-03 | 无法据 CHANGELOG 追溯 | 阶段 6.3 修正；今后 CHANGELOG 由 conventional-changelog 从 commit 自动生成 |
| V4 | **版本号散落 5 处手工维护** | `package.json`、`package-lock.json`、`README.md:36`（手写 `v2.0.0-rc.1`）、`CHANGELOG.md` 标题、`VERSION_PLAN.md`（"当前状况"段） | 每次发布要改 5 处，历史上已漏改（V1 就是这样产生的） | 单一来源 package.json；README 徽章动态；`VERSION_PLAN.md` 归档 |
| V5 | **tag 类型混用** | 6 个 lightweight（v0.1–v0.5、v1.0.0）+ 4 个 annotated；annotated 的 message 风格各异（"AI Coach Beta 1"、"Release v2.0.0-rc.1 候选版本"） | `git describe` 默认只看 annotated tag，会跳过 v1.0.0 | release-it 统一 annotated，message 固定 `v${version}` |
| V6 | **早期 tag 打在 `package.json = 0.0.0` 的 commit 上** | v0.1.0-alpha–v0.4.0 期间 package.json 一直是 0.0.0，首次 bump 是 0.5.0 | 打包产物文件名曾是 `…-0.0.0-…` | 历史，不动；记入 CHANGELOG 说明 |
| V7 | **Release 资产不完整** | `v2.0.0-rc.1` 只有 `.exe`，缺 `.blockmap`（v1.0.0 有）；`v1.1.0-beta.1/2` Release 无任何资产 | electron-updater 差分更新不可用；beta Release 是空壳 | release-it `github.assets` 固定上传 exe + blockmap + latest.yml |
| V8 | **发布流程有三份互相矛盾的文档** | `VERSION_PLAN.md`（`npm version` 流程）、`docs/OPERATIONS/RELEASE_PROCESS.md`、`release-notes.txt`（beta.2 片段） | 不知道以哪份为准 | 只留 `RELEASE_PROCESS.md`，内容改为 release-it 一条命令 |
| V9 | **bump commit 类型不合规** | `chore: bump version to 2.0.0-beta.1`（英文）、`release: 发布 v2.0.0-rc.1`（非法 type） | commitlint 上门后会被拒 | `chore(release): 发布 v${version}` 由工具生成 |
| V10 | **major 版本语义未定义** | 1.0.0 → 2.0.0 的依据是"AI Coach 上线"，不是不兼容变更；VERSION_PLAN 写的是库语义（"不兼容的 API 修改"） | 桌面应用没有公共 API，规则套不上 | 在 `RELEASE_PROCESS.md` 定义应用版 semver：**major = 数据格式/迁移不可回滚或需要用户手动操作；minor = 新功能；patch = 修复**。阶段 3 的 Drizzle + 毫秒时间迁移是不可回滚的数据变更 ⇒ 对齐完成后发 **v3.0.0**，不是 v2.1.0 |

未发布状态：rc.1 之后 7 个 commit 未打 tag，CHANGELOG"未发布"段有 6 条修复，与代码一致，正常。

**修订**：因 V10，前文"阶段 3 结束打 `v2.1.0-alpha.1`，阶段 6 结束打 `v2.1.0`"改为 **`v3.0.0-alpha.1` / `v3.0.0`**；对齐期间如需给用户发修复版，从 `v2.0.0-rc.1` 拉 `release/2.0` 分支打 `v2.0.0-rc.2`，不与 dev 混合。

## 总览与依赖

```
0 工具门 ──┬── 1 换库 ──┬── 2 IPC/共享层 ──┬── 3 主进程 ──┐
           │            │                  └── 4 渲染层 ──┼── 6 清理
           └── 5 测试（可与 1–4 并行，但 5.2 重排要在 3.2 目录迁移后）┘
```

| 阶段 | 用时 | 风险最高项 |
|---|---|---|
| 0 | 2 天 | pnpm hoist 对 better-sqlite3 打包（有 `test:packaged-main` 兜底） |
| 1 | 4 天 | 无 |
| 2 | 5 天 | 2.5 时间迁移（用户数据） |
| 3 | 10 天 | 3.1 Drizzle 改写 249 处查询 |
| 4 | 6 天 | 4.4 BEM 重命名影响 Playwright 选择器 |
| 5 | 4 天 | 无 |
| 6 | 1 天 | 无 |
| **合计** | **32 天** + 20% 缓冲 ≈ **38 天** | |

每阶段结束：`pnpm test:all` 全绿 + PR 合入 dev + `.trellis/spec/project/migration-status.md` 更新。阶段 3 结束打 `v3.0.0-alpha.1`，阶段 6 结束打 `v3.0.0`（见附录 V10）。
