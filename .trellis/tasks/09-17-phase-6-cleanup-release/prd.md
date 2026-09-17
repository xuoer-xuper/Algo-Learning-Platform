# 阶段 6 仓库清理、文档与版本历史

## Goal

清掉各阶段开发残留，让仓库文档与新布局一致，整顿版本历史与发布流程，发布对齐后的第一个版本 `v3.0.0`。

## Requirements

### R1 残留处理（D22，中-23、低-20）
- 删除：`algo-coach-showcase.html`（40 KB，无引用）、`release-notes.txt`（与 CHANGELOG 重复）。
- 归档到 `docs/ARCHIVE/`：`algo-electron/docs/REFACTOR_HANDOFF.md`、`algo-electron/docs/TASKS.md`、`algo-electron/docs/ai coach技术栈.md`（重命名 `AI_COACH_TECH_STACK.md`，去空格与中文文件名）、根 `AI_HANDOFF.md`（职责由 `.trellis/tasks` + `workspace` journal 接管）、`VERSION_PLAN.md`（职责由 release-it + CHANGELOG 接管）。
- `docs/README.md` 索引同步；`test:docs` 覆盖规则更新；`BROWSER_SHELL_REFACTOR_PLAN.md`（234 KB）已完成阶段 B0–B6 的账本段落拆到 `docs/ARCHIVE/`，主文件只留结论。
- `.mailmap` 合并三个作者身份。

### R2 文档重写
- `docs/DESIGN/SYSTEM_ARCHITECTURE.md`：目录树、分层、IPC 流程（`window.api` / `IPC_CHANNELS` / zod / Drizzle）。
- `docs/DESIGN/DATABASE_SCHEMA.md`：Drizzle `schema.ts` 为准；时间规则 Unix 毫秒。
- `docs/GOVERNANCE/CONTRIBUTING.md`：pnpm、husky 门、分支模型、PR 流程、release-it。
- `docs/GOVERNANCE/PROJECT_RULES.md`：技术栈表更新（Drizzle、zod、electron-log、electron-store、pnpm、TS 6.0）。
- `docs/OPERATIONS/RELEASE_PROCESS.md`：改为 release-it 一条命令 + 应用版 semver 定义（V10）+ hotfix `release/x.y` 分支。
- `docs/OPERATIONS/TROUBLESHOOTING.md`：日志路径（electron-log）、`-dev` userData、drizzle 迁移排障。
- 各域 README 已在阶段 3/4 随迁移重写，本阶段只做一致性检查。

### R3 版本历史整理（D24，V1–V9）
- `docs/PRODUCT/CHANGELOG.md` 顶部加"历史版本号说明"段：`v1.1.0-beta.1/2` tag 指向 `2.0.0-beta.1/2` 代码、`1.1.0-beta.2` 曾出现在 `2.0.0-beta.2` 之后、v0.1–v0.4 期间 `package.json` 为 `0.0.0`；说明从 `v3.0.0` 起由 release-it 生成、严格单调。
- 修正 0.5.0 / 0.6.0 条目日期为 tag 日期（2026-06-04 / 06-28）；1.1.0-beta.x 条目注明代码日期 07-13 与 tag 日期 09-03；补 0.1.0-alpha–0.4.0 四条简要条目（来源：tag 信息与 GitHub Release 标题）。
- 已推送 tag 与 Release **不重写**；`v1.1.0-beta.1/2` 两个空壳 Release 在 GitHub 上补一句说明指向 CHANGELOG（不删）。
- README 版本徽章改 shields.io `github/v/release` 动态徽章；删除手写版本号。

### R4 migration-status 收尾
- `.trellis/spec/project/migration-status.md` 全部行 Today == Target 后删除该文件；`project/index.md` 去掉引用；`spec/README.md` Tech Stack 段核对。
- `.trellis/spec/project/git-workflow.md` 的 husky/release-it 段与实际配置核对。

### R5 发布 v3.0.0（D24、V10）
- 在 `dev` 上 `pnpm release --dry-run` 确认 major bump（Drizzle + 毫秒迁移 = 不可回滚数据变更）。
- `dev` → `master` PR（`--no-ff`）；在 `master` 上 `pnpm release`（before:init 跑 `test:all` + `build:win`），生成 annotated tag `v3.0.0`、CHANGELOG、GitHub Release（exe + blockmap + latest.yml）。
- 发布后人工验收：从 `v2.0.0-rc.1` 安装包升级到 `v3.0.0`，数据（题目、提交、笔记含图片、凭据、脚本、配置）完整；七站登录态保留。

## Acceptance Criteria

- [ ] `git ls-files | grep -E "showcase|release-notes|REFACTOR_HANDOFF|algo-electron/docs/TASKS|VERSION_PLAN|AI_HANDOFF"` 只命中 `docs/ARCHIVE/` 下路径。
- [ ] `git ls-files` 无含空格或非 ASCII 的路径。
- [ ] `pnpm test:docs` 通过；`docs/README.md` 无死链。
- [ ] `git shortlog -sn` 只有一个作者行。
- [ ] CHANGELOG 有历史说明段，0.1–0.4 条目存在，日期与 tag 一致（脚本核对 `git for-each-ref` 与 CHANGELOG 标题）。
- [ ] README 无手写版本号；徽章 URL 指向 GitHub Release。
- [ ] `migration-status.md` 已删除；`spec/project/index.md` 引用同步。
- [ ] `v3.0.0` annotated tag 在 `master` 的 merge commit 上；Release 含 3 个资产；`package.json` = `3.0.0`；CHANGELOG 顶部为 `## 3.0.0 - <日期>`。
- [ ] 升级验收记录写入 `docs/OPERATIONS/`（沿用 `ALP_HARDENING_VALIDATION_*` 格式）。

## Out of Scope

- 重写 git 历史；删除已推送 tag / Release。

## Notes

- 前置：阶段 3、4、5 全部合入 dev。
- R1–R4 一个 PR `docs: 阶段 6 仓库清理与文档对齐`；R5 是独立操作，由用户在 `master` 上执行 `pnpm release`（推送与发布只用用户身份）。
