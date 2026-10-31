# 提交规范

本文是提交门与发版流程的**书面镜像**：权威实现在配置——`algo-electron/commitlint.config.js`（type / scope 词表）、`algo-electron/.husky/`（三道提交门）、`algo-electron/.release-it.json`（发版）、`.github/workflows/ci.yml`（CI 触发）。文档与配置不一致时以配置为准并回改本文——`pnpm test:docs` 只校验链接与覆盖，校验不出语义漂移。

项目层规范源：[.trellis/spec/project/git-workflow.md](../../.trellis/spec/project/git-workflow.md)（分支模型、type 表、scope 词表的定义处，改词表先改它）；模板基线：`.trellis/spec/shared/git-conventions.md`。

## 1. 分支模型

```
master   ── 稳定分支；只收 dev 的 --no-ff 合并；tag 打在这里
  └── dev   ── 集成分支；只收 feature 分支的 squash 合并
        ├── feat/<kebab-description>
        ├── fix/<kebab-description>
        ├── refactor/<kebab-description>
        └── docs/<kebab-description>
```

- `master` 受 GitHub 分支保护（2026-09-17 起）：必须走 PR；required checks 为 `Fast core, packaging and docs guard` 与 `Electron and renderer smoke`（strict）；禁 force push、禁删除、对话须解决。`enforce_admins` 关闭——solo 开发保留 admin 绕过，供 release-it 在 `master` 上做发布提交（见 §8）。
- 本地 pre-commit 钩子同样拒绝在 `master` 上提交（见 §6），保护是双层的。
- 小改动（typo、单行修复、一行文档）可以直接提交到 `dev`；需要不止一个 commit 的改动一律开分支。
- 分支名用英文 kebab-case、`type/description` 形式；可直接用 Trellis 任务 id（如 `feat/00-bootstrap-guidelines`）。

## 2. 合并方式

- **feature → dev：squash merge，经 PR。** PR 标题即合并后的提交主题，必须符合 §3 的格式。
- **dev → master：merge commit（`--no-ff`），经 PR。** tag `vX.Y.Z` 打在该合并提交上。
- 仓库合并设置：允许 squash 与 merge commit，rebase merge 禁用，合并后自动删除分支。

## 3. 提交信息格式

```text
type(scope): 中文描述

[可选 body，中文]

[可选 footer：Refs #123 / BREAKING CHANGE: ...]
```

- `type` 与 `scope` 用英文小写（commitlint 与 `git log --grep` 都依赖这一点）；描述用**中文**——历史是中文，不要切换成英文描述。
- 一个 commit 只做一件事。改动超过约 20 个文件的提交应该是 feature 分支的 squash，而不是手搓的大提交。

### 3.1 Type 表（九个）

即 `commitlint.config.js` 的 `type-enum`，与 git-workflow.md §Types 一致。

| Type | 用途 | scope |
| --- | --- | --- |
| `feat` | 新功能（用户可感知，或对其他模块可见） | 必带 |
| `fix` | 缺陷修复 | 必带 |
| `refactor` | 不改变行为的结构调整 | 必带 |
| `perf` | 性能优化 | 必带 |
| `test` | 仅测试 | 可选 |
| `docs` | 仅文档 | 可选 |
| `chore` | 工具、依赖、配置、发版 | 可选；发版固定 `chore(release): 发布 vX.Y.Z` |
| `style` | 仅格式化（prettier），无逻辑改动 | 可选 |
| `ci` | workflow / CI 配置 | 可选 |

`release`、`design`、`tests`、`renderer`、`update`、`wip`、`misc` 不是合法 type——它们出现在 2026-09-17 定规范之前的历史里，正是现在要立 commit-msg 门的原因。

### 3.2 Scope 词表（32 项）

即 `commitlint.config.js` 的 `scope-enum`。词表由顶层模块目录派生；定义在 git-workflow.md §"Scope enum"，实现在 `commitlint.config.js`——**加模块时两处双向同步，本文随动**。

```text
adapters  ai  app  backup  browser  coach  cookies  credentials  db  diagnostics  downloads
ipc  main  notes  parsers  preload  rating  scripts  shared  shortcuts  sites  submissions
tracking  windows  renderer  ui  tests  docs  ci  deps  release  trellis
```

迁移到 `src/main/services/{domain}/` 之后 scope 用域名；`main`、`renderer`、`preload`、`shared` 是层级兜底四个。

### 3.3 禁止格式

commit-msg 门会直接拒绝无法判断范围的提交信息：

```text
update
fix bug
wip
misc
改了一点
临时提交
```

## 4. 提交粒度

好的粒度：

- `feat(coach): 比赛模式期间静默所有干预并写审计记录`
- `fix(db): 修复 computeSince 使用 UTC 字符串比较本地时间的 8 小时偏差`
- `test(adapters): 覆盖 VJudge 弹窗提交结果关联`
- `docs: 更新数据库 schema 文档为 Unix 毫秒时间戳`

不好的粒度：

- 一次提交完成多个无关功能。
- 一次提交同时改数据库、UI、Cookie、AI 和打包。
- 无说明地大规模移动目录或格式化无关文件（全仓格式化必须独立成 commit，如 `style: 全仓 prettier 格式化`）。

## 5. 文档同步要求

以下修改必须伴随文档更新：

- 数据库 schema 变更：更新 `docs/DESIGN/DATABASE_SCHEMA.md`。
- IPC / Preload API 变更：更新 `docs/DESIGN/SYSTEM_ARCHITECTURE.md`、`electron/preload.ts`、`electron/electron-env.d.ts` 和相关模块 README。
- 站点适配变更：更新 `docs/DESIGN/SITE_ADAPTER_GUIDE.md`、`docs/DESIGN/SUBMISSION_MONITORING_DESIGN.md` 和相关 adapter README。
- Cookie 行为变更：更新 `docs/GOVERNANCE/PROJECT_RULES.md`、`docs/DESIGN/SYSTEM_ARCHITECTURE.md` 或 `algo-electron/electron/cookies/README.md`。
- 同步、导入导出或备份变更：更新 `docs/DESIGN/DATA_EXPORT_AND_IMPORT.md` 或 `algo-electron/electron/backup/README.md`。
- 打包发布变更：更新 `docs/OPERATIONS/RELEASE_PROCESS.md`、`docs/PRODUCT/CHANGELOG.md` 或 `algo-electron/electron-builder.json5` 相关说明。

## 6. 提交门（husky 三道）

钩子经 `core.hooksPath = algo-electron/.husky/_` 生效（本仓库不在 Git 根目录装 husky，`prepare` 脚本按官方 "Project not in Git root directory" 配方写成 `cd .. && husky algo-electron/.husky`）。钩子以仓库根为 CWD 运行，脚本内部先解析仓库根再切进 `algo-electron/` 用 `pnpm exec` 调工具——依赖都装在子目录里。

| Hook | 内容 | 失败条件 |
| --- | --- | --- |
| `commit-msg` | `pnpm exec commitlint --edit`（type-enum / scope-enum / subject-case off） | type 或 scope 不在词表、描述为空 |
| `pre-commit` | `master` 分支拒绝 → `pnpm exec lint-staged`（对 staged 文件跑 prettier + eslint --fix）→ `pnpm run typecheck && pnpm run typecheck:tests` | 在 `master` 上提交；lint 或类型错误 |
| `pre-push` | `pnpm run test:ci`（五步 CI 同口径：`test:core` + `test:packaging` + `test:docs` + `test:electron` + `test:ui`） | 任一步失败 |

- 两次 typecheck 是全量的：类型检查没有增量可信路径，墙钟代价已知并接受。
- `pre-push` 原为 `pnpm test:core`，2026-10-31 升级为 `pnpm test:ci`——"全绿再推"从口头纪律变成机械保证（当天两次 CI 红都源于本地只跑 `test:core` 的盲区）。jscpd 重复代码门挂在 `test:core` 里，随 pre-push 一起生效。
- detached HEAD（rebase、CI checkout）下 `git branch --show-current` 返回空串；空串**不**按 `master` 处理——只在字面等于 `master` 时拒绝。
- `pre-commit` 无条件拒绝 `master`；release-it 的发布提交通过 `.release-it.json` 的 `git.commitArgs: ["--no-verify"]` 绕过钩子（见 §8），不做环境变量嗅探、不设标记文件。
- lint-staged 从 `algo-electron/` 运行，包目录之外的 staged 文件（`.trellis/**`、`.github/**`、`docs/**`）由其以 warning 跳过——与 prettier 的格式化范围（`algo-electron/` 全树）一致，属预期行为而非错误。

## 7. 推送纪律

- **每个 commit 之后立即 push**，不留本地积压（2026-09-17 起的开发者规则）。push 到 `master` 与 `dev`、以及所有 PR，都会触发 CI。
- 推送前本地必须跑 `pnpm test:ci` 且全绿——pre-push 钩子已把这条纪律机械化，绕不过去。
- 推送后用 `gh run watch <run-id> --exit-status` 盯到两个 required check 全绿才算收口；红了先本地复现、修复根因，才允许下一次推送。
- 推送一律用开发者本人的身份，不加 AI co-author trailer。

## 8. 发版流程（release-it）

- 版本号单一来源：`algo-electron/package.json`；`docs/PRODUCT/CHANGELOG.md` 由 conventional commits 生成，不手写。
- 调用形式：**`pnpm exec release-it ...`**（预发布 `pnpm exec release-it --preRelease=rc`）。不要写 `pnpm release -- --dry-run` 这类带 `--` 分隔符的形式——pnpm 12 下分隔符本身会被传给 release-it，报 "Unexpected positional argument"（2026-10-31 实测）。
- 前提与约束（`.release-it.json`）：
  - `git.requireBranch: master`——发版必须在 `master` 上执行；
  - `git.requireCleanWorkingDir: true`——工作树必须干净，**untracked 也算脏**（发版前清掉，包括仓库常驻的 untracked 目录）；
  - 环境需要 `GITHUB_TOKEN`——缺失时 GitHub Release 步骤回退为在网页上手动发；
  - `hooks.before:init: ["pnpm test:all", "pnpm build:win"]`——真实发版前自动跑全量验证与打包。
- 流程产出：提交 `chore(release): 发布 v${version}`（经 `--no-verify` 绕过 pre-commit 的 master 拒绝）、打 annotated tag `v${version}`、推送，并上传 `release/${version}/*.exe`、`*.blockmap`、`latest.yml` 到 GitHub Release；changelog 写入 `../docs/PRODUCT/CHANGELOG.md`（`conventionalcommits` preset，从 `algo-electron/` 运行所以带 `../`）。
- 版本语义（桌面应用）：**major** = 数据格式 / 无法回滚的迁移；**minor** = 新功能；**patch** = 修复；预发布 `-alpha.N` / `-beta.N` / `-rc.N`。tag 只打在 `master` 上 `--no-ff` 的合并提交上。
- 完整操作手册：[RELEASE_PROCESS.md](../OPERATIONS/RELEASE_PROCESS.md)。
