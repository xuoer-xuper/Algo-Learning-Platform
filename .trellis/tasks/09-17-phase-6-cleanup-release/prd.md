# 阶段 6 仓库清理、文档与版本历史

## Goal

清掉各阶段开发残留，让仓库文档与新布局一致，整顿版本历史与发布流程，完成对齐计划的最终集成与发布验收。最终版本号与产品定位待用户确认，不预设为 `3.0.0`。

## Release Decision (2026-11-08)

- 已验收成果可在对齐期间通过 `dev` → `master` 发布，不等阶段3、4、5全部完成；阶段6不是首次发行的前置条件。
- `2.0.1`、`2.0.2` 等按每次实际范围和兼容性评估安排，不把所有变更自动算作 patch；完整测试、安装升级、数据恢复及风险说明要求不变。
- 取消旧 D24/V10 中“对齐完成即发布 `v3.0.0`”的结论；归档决策保留历史，新版本方案等待用户提供，不擅自替换成其他最终版本。
- 常规发布从可发布的 `dev` 合入 `master`；仅在 `dev` 不可发布且稳定线需要紧急修复时单独走维护分支，遵循父任务及 Git 规范。
- 用户要求发布 `2.0.1` 后暂停发行，现已同意先做 [安全升级与发行加固](../11-08-release-upgrade-safety/prd.md)。[此前发布准备](./release-201-plan.md)保留范围与证据，但其“版本规则例外”提议已撤回；不将请求误记为已完成发布。

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
- `docs/OPERATIONS/RELEASE_PROCESS.md`：改为经验证的 release-it 流程、实际交付的版本兼容性评估、阶段性 `dev` → `master` 发布及 hotfix 例外。首次阶段性发布前先修正影响发布的旧说明，本阶段做最终一致性收尾。
- `docs/OPERATIONS/TROUBLESHOOTING.md`：日志路径（electron-log）、`-dev` userData、drizzle 迁移排障。
- 各域 README 已在阶段 3/4 随迁移重写，本阶段只做一致性检查。

### R3 版本历史整理（D24，V1–V9）
- `docs/PRODUCT/CHANGELOG.md` 顶部加"历史版本号说明"段：`v1.1.0-beta.1/2` tag 指向 `2.0.0-beta.1/2` 代码、`1.1.0-beta.2` 曾出现在 `2.0.0-beta.2` 之后、v0.1–v0.4 期间 `package.json` 为 `0.0.0`；说明后续发行由经验证的 release-it 流程生成，相对实际已发布版本严格单调，不绑定尚未发布的版本起点。
- 修正 0.5.0 / 0.6.0 条目日期为 tag 日期（2026-06-04 / 06-28）；1.1.0-beta.x 条目注明代码日期 07-13 与 tag 日期 09-03；补 0.1.0-alpha–0.4.0 四条简要条目（来源：tag 信息与 GitHub Release 标题）。
- 已推送 tag 与 Release **不重写**；`v1.1.0-beta.1/2` 两个空壳 Release 在 GitHub 上补一句说明指向 CHANGELOG（不删）。
- README 版本徽章改 shields.io `github/v/release` 动态徽章；删除手写版本号。

### R4 migration-status 收尾
- `.trellis/spec/project/migration-status.md` 全部行 Today == Target 后删除该文件；`project/index.md` 去掉引用；`spec/README.md` Tech Stack 段核对。
- `.trellis/spec/project/git-workflow.md` 的 husky/release-it 段与实际配置核对。

### R5 阶段性发布与最终发布验收（修订 D24、V10）
- 每次发布评估完整的 `dev` → `master` 差异与实际用户价值，确认版本及兼容性风险；不因阶段编号或完成重构自动 major bump，最终版本另待用户确认。
- 首次阶段性发布前解决工具阻塞：构建不得早于目标版本写入；release-it 新增发布提交与“tag 在 merge commit 上”的规范必须统一；验证 `latest.yml` 等约定资产实际产生；发布文档中的 npm/package-lock 手工流程须与当前工具链统一。dry-run 不能替代构建、资产或上传验证。
- 按 `RELEASE_PROCESS.md` 使用 `release:prepare/build/check/draft/verify/publish` 分阶段执行；默认 `pnpm release` 拒绝一键发布。准备分支生成并评审版本与 CHANGELOG，普通提交经 PR 合入 `dev`，不将 release-it dry-run 当作构建或资产验收。
- `dev` → `master` PR（`--no-ff`）经过 CI 后，从已验收且版本一致的源码构建；发布不再改版本、写 CHANGELOG 或创建 master 提交。单独授权 annotated tag `v<确认版本>` 和草稿上传（exe + blockmap + latest.yml），下载核对后再次确认公开；正常 hooks 全程保留，必要的发布元数据通过 PR 同步回 `dev`。
- 每次公开发布前完成人工安装/升级验收，覆盖 `v2.0.0`、`v2.0.0-rc.1` 及适用的中间发行版；数据（题目、提交、笔记含图片、凭据、脚本、配置）完整，七站登录态保留。升级前备份，失败时验证恢复，不操作未获授权的用户原库。

## Acceptance Criteria

- [ ] `git ls-files | grep -E "showcase|release-notes|REFACTOR_HANDOFF|algo-electron/docs/TASKS|VERSION_PLAN|AI_HANDOFF"` 只命中 `docs/ARCHIVE/` 下路径。
- [ ] `git ls-files` 无含空格或非 ASCII 的路径。
- [ ] `pnpm test:docs` 通过；`docs/README.md` 无死链。
- [ ] `git shortlog -sn` 只有一个作者行。
- [ ] CHANGELOG 有历史说明段，0.1–0.4 条目存在，日期与 tag 一致（脚本核对 `git for-each-ref` 与 CHANGELOG 标题）。
- [ ] README 无手写版本号；徽章 URL 指向 GitHub Release。
- [ ] `migration-status.md` 已删除；`spec/project/index.md` 引用同步。
- [ ] 各次发行版本已确认，annotated tag 对应 `master` 上已验收源码（落点与修正后的 Git 规范一致）；Release 含 3 类约定资产；`package.json`、CHANGELOG、安装包和 tag 版本一致；最终版本不再固定为 `3.0.0`。
- [ ] 首次阶段性发布前，目标版本构建顺序、tag 落点、资产生成和发布说明通过实际验证；未完成的对齐阶段不构成独立发行的阻塞。
- [ ] 升级验收记录写入 `docs/OPERATIONS/`（沿用 `ALP_HARDENING_VALIDATION_*` 格式）。

## Out of Scope

- 重写 git 历史；删除已推送 tag / Release。

## Notes

- 最终目录/文档清理与完整集成验收前置：阶段3、4、5全部合入 `dev`。阶段性发布及发布工具修复可提前独立安排，不需要先完成或启动整个阶段6。
- R1–R4 收尾一个 PR `docs: 阶段 6 仓库清理与文档对齐`；R5 各次发布独立确认范围和版本，只用用户身份操作。本次规划更新不执行合并、改应用版本、打 tag 或上传 Release。
