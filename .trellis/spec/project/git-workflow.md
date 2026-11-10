# Git Workflow

> Narrows `../shared/git-conventions.md` for this repository. Everything in the template still applies
> (atomic commits, body for context, PR description template). This file fixes the three things the
> template leaves open: the branch model, the commit language, and the scope enum.

Chosen by the developer on 2026-09-17. Before that date all 248 commits were made directly on
`master` with no merges; the `dev` branch was created in the same session.

Release cadence was revised on 2026-11-08: validated increments may ship from `dev` through
`master` before the alignment program finishes. Completing the program no longer implies
`v3.0.0`; the final version and product positioning await the developer's new plan.

---

## Branch Model

```
master   ── stable only; receives --no-ff merges from dev; tags live here
  └── dev   ── integration branch; receives squash merges from feature branches
        ├── feat/<kebab-description>
        ├── fix/<kebab-description>
        ├── refactor/<kebab-description>
        └── docs/<kebab-description>
```

| Rule | Detail |
| --- | --- |
| Never commit on `master` | GitHub branch protection **enabled 2026-09-17**: PR required, checks `Fast core, packaging and docs guard` + `Electron and renderer smoke` (strict), no force push, no deletion, conversations resolved. Historical `enforce_admins: false` is not permission to bypass gates. The local `pre-commit` hook refuses when `git branch --show-current` is `master`; preparation metadata is committed on a PR branch, never during master publication. |
| Small edits may land on `dev` directly | Typo, doc line, single-line fix. Anything that needs more than one commit gets a branch. |
| feature → dev | **Squash merge** via PR. The PR title becomes the commit subject and must follow the commit format below. |
| dev → master | **Merge commit with `--no-ff`** via PR. Tag `vX.Y.Z` on that merge commit. |
| master → dev synchronization | Preserve shipped fixes and ancestry with a reviewed **merge commit** PR. Do not squash this branch-sync operation; the feature-branch squash rule does not apply. Resolve and test overlapping changes before the next release. |
| Branch names | English, kebab-case, `type/description` as in the template. Trellis task ids may be used: `feat/00-bootstrap-guidelines`. |
| CI | `.github/workflows/ci.yml` runs `fast-guard` on push to `dev` and `master`, and the full matrix on pull requests. Pushing to a feature branch alone does not run CI; open the PR. |
| Push | **Push immediately after every commit** (developer rule 2026-09-17: no local backlog). **Push discipline (2026-10-31, after two CI-only reds): before pushing, `pnpm test:ci` must be green locally — the pre-push hook enforces this; after pushing, watch CI to green with `gh run watch <run-id> --exit-status` before calling the work done; a red run gets a root cause and a locally-reproduced fix before the next push.** Always the developer's identity; no AI co-author trailers. `.claude/settings.json` sets `attribution` (`commit` and `pr` empty, `sessionUrl` false) so Claude Code stops requesting the trailer at the source (added 2026-09-17 after commit `ffba568` slipped through, had to be rewritten, and left a stale contributor avatar on GitHub). Repo merge settings: squash (title = PR title) and merge commit allowed, rebase merge disabled, branches auto-deleted after merge. |

---

## Commit Message Format

```
type(scope): 中文描述

[optional body, Chinese]

[optional footer: Refs #123 / BREAKING CHANGE: ...]
```

- `type` and `scope` are English lowercase so that commitlint and `git log --grep` work.
- The description is Chinese. Do not switch to English descriptions; the history is Chinese.
- One commit does one thing. A commit touching more than about 20 files should be a squash of a
  feature branch, not a hand-made commit.

### Types

| Type | Use | Scope |
| --- | --- | --- |
| `feat` | New behaviour visible to the user or to another module | required |
| `fix` | Bug fix | required |
| `refactor` | No behaviour change | required |
| `perf` | Performance | required |
| `test` | Tests only | optional |
| `docs` | Documentation only | optional |
| `chore` | Tooling, dependencies, release, config | optional; `chore(release): 发布 vX.Y.Z` for releases |
| `style` | Formatting only (prettier), no logic | optional |
| `ci` | Workflow / CI config | optional |

`release`, `design`, `tests`, `renderer`, `update`, `wip`, `misc` are not types. They appeared in the
history before this rule and are the reason commitlint is now enforced.

### Scope enum

Derived from the top-level module directories. Kept in `commitlint.config.js` as `scope-enum`; update
both when a module is added.

```
adapters  ai  app  backup  browser  coach  cookies  credentials  db  diagnostics  downloads
ipc  main  notes  parsers  preload  rating  scripts  shared  shortcuts  sites  submissions
tracking  windows  renderer  ui  tests  docs  ci  deps  release  trellis
```

(32 items. `main` added 2026-10-31 with the commitlint gate itself — the prose below names it as a
layer-level fallback, and the gate's enum must match `algo-electron/commitlint.config.js`; a commit
with a scope outside this list is rejected by `commit-msg`.)

After the migration to `src/main/services/{domain}/` the scope stays the domain name; `main`,
`renderer`, `preload`, `shared` are the layer-level fallbacks.

### Examples

```
feat(coach): 比赛模式期间静默所有干预并写审计记录
fix(db): 修复 computeSince 使用 UTC 字符串比较本地时间的 8 小时偏差
refactor(ipc): 把 scripts:importFile 的业务逻辑下沉到 procedures
test(adapters): 覆盖 VJudge 弹窗提交结果关联
docs: 更新数据库 schema 文档为 Unix 毫秒时间戳
chore(deps): 升级 electron 到 43.4.0
chore(release): 发布 v2.1.0
style: 全仓 prettier 格式化
```

---

## Local Gates (husky)

| Hook | Runs | Fails when |
| --- | --- | --- |
| `commit-msg` | `commitlint --edit` | type not in enum, scope not in enum, empty description |
| `pre-commit` | branch check (refuses `master` only; detached HEAD passes), `lint-staged` (prettier + eslint on staged files inside `algo-electron/`), `pnpm typecheck`, `pnpm typecheck:tests` | on `master`; lint or type error |
| `pre-push` | `pnpm test:ci` — the five-step CI-parity gate (`test:core` + `test:packaging` + `test:docs` + `test:electron` + `test:ui`) | any gate, smoke or unit failure |

`pre-commit`/`pre-push` hooks live in `algo-electron/.husky/` and `cd` into the package first (git
runs hooks with repo-root CWD). The former release-it bypass is removed: publication no longer
creates a master commit. Version and changelog preparation uses ordinary reviewed commits and
normal hooks. Do not use `--no-verify`, `HUSKY=0`, or a replacement hooks path for release work.

`pre-push` was upgraded from `pnpm test:core` to `pnpm test:ci` on 2026-10-31 after two CI-only reds
proved that `test:core` alone is not CI parity. `pnpm test:core` (typecheck ×2 + lint + architecture
+ security + jscpd + full vitest) remains the per-section gate; `test:packaging` and `test:docs` ride
along at push time, and the two smoke scripts cover what CI's `Electron and renderer smoke` job runs.

Windows large-change commits use `lint-staged --max-arg-length 6000` in the pre-commit hook.
The package manager's `.cmd` shims and argument quoting need headroom below the 8191-character
shell limit; the default limit was insufficient for the R5 batch on 2026-11-05. This only chunks
the same staged files into smaller commands. It does not skip formatting, lint, stashing or
either full typecheck; a command failure still blocks the commit.

---

## Trellis auto-commits

`.trellis/config.yaml` sets `session_auto_commit: false`. `task.py archive` and `add_session.py` write to disk
only; commit them by hand as `chore(trellis): 归档 <task-id> 任务` / `chore(trellis): 记录会话日志`.
Reason: the scripts' built-in message (`chore(task): archive <id>`) is English and `task` is not in the
scope enum, so commitlint would reject it once the gate is on.

## Pull Request Checklist

Use `.github/pull_request_template.md` (Chinese). In addition to the template's PR guidelines:

- [ ] Title follows `type(scope): 中文描述`.
- [ ] `pnpm test:core` passed locally; `pnpm test:all` for anything touching database, IPC, browser, packaging.
- [ ] Documentation synced per `docs/GOVERNANCE/COMMIT_RULES.md` §5 (schema → `DATABASE_SCHEMA.md`, IPC → `SYSTEM_ARCHITECTURE.md` + preload + tests, sites → `SITE_ADAPTER_GUIDE.md`, cookies → `PROJECT_RULES.md`).
- [ ] `.trellis/spec/project/migration-status.md` updated if a module moved layout.

---

## Tags and Releases

### Incremental release cadence (2026-11-08)

- Normal releases use feature branch -> `dev` -> `master` PR (`--no-ff`) -> annotated tag and
  GitHub Release. Ship useful, independently accepted increments rather than waiting for every
  alignment phase. `2.0.1`, `2.0.2` and later releases are candidates, not a promise that every
  change qualifies as a patch or every merge triggers a release.
- Review the complete proposed `dev` -> `master` diff, including already-merged migrations.
  Passing one slice's tests does not certify all of `dev`. Keep unfinished work on feature
  branches; do not merge an unready `dev` merely to show maintenance activity.
- Each release requires local `pnpm test:all`, `pnpm build:win`, green required PR checks,
  install/upgrade/data-preservation acceptance and matching source/version/tag/assets. Fix
  release-tooling blockers before the first incremental release, not only in phase 6.
- `release/<major.minor>` is an exception for urgent shipped-line fixes when `dev` cannot ship,
  not a mandatory parallel track for all 2.x updates. Start from the actual shipped tag, not an
  obsolete RC. Sync maintenance fixes and release-only metadata back to `dev` via PR.
- No final version is preselected for alignment completion. Do not infer `3.0.0`, substitute
  another final version or auto-bump major from task completion. Evaluate actual compatibility
  and migration/restore risks before confirming each version; the semver rules below still apply.
- A package version or local installer is not a published release. Cadence approval alone does
  not authorize merging a particular PR, tagging or publishing.

### Tooling and version contracts

- Single source of the version number: `algo-electron/package.json`. Nothing else is hand-edited
  (README badge reads GitHub Releases; CHANGELOG is generated).
- Release preparation and publication are separate operations. Prepare package version and
  reviewed changelog on a PR branch against the explicit actual shipped baseline, then commit
  normally. Publication reads that version without bumping, rewriting changelog, or committing.
  The standalone publication configuration keeps the npm plugin for package-version discovery
  with `npm.publish: false`, omits conventional-changelog, and uses `git.commit: false`.
- `pnpm release` is not an automatic bump/upload command. Guarded `release:prepare`,
  `release:build`, `release:check`, `release:draft`, `release:verify`, and `release:publish` stages
  are defined in `docs/OPERATIONS/RELEASE_PROCESS.md`. Draft/tag authorization and public-release
  authorization are explicit, tied to the accepted SHA; task progress never supplies them.
- Require a clean `git status --porcelain=v1 --untracked-files=all`, accepted current master SHA
  and merge parents, green CI, local build/acceptance evidence and exactly the expected installer,
  blockmap and latest.yml. Installed release-it's clean check ignores untracked files and its
  asset globs can miss individual patterns, so neither substitutes for the explicit guards.
- Build with `--publish never`. Create an annotated tag on the accepted merge and a draft release,
  verify remote tag and downloaded asset hashes, then publish only after renewed explicit approval.
  On partial failure preserve evidence and inspect external state before retry; never silently
  delete/rewrite remote tags. Generating latest.yml is not implementing an automatic updater.
- Version policy revision (2026-11-08): **major** = incompatible changes to declared supported
  user/integration contracts; **minor** = compatible functionality; **patch** = compatible fixes.
  Declare the relevant contracts first, including supported upgrade sources and versioned export
  formats. Internal schema changes or lack of arbitrary binary downgrade do not by themselves
  force a major version. Conversely, do not label new functionality or a broken public contract
  as a patch merely because `package.json` already contains that number. Pre-releases use
  `-alpha.N` / `-beta.N` / `-rc.N`.
- Release safety is independent of the version label: require verified upgrade checkpoints,
  failure/interruption recovery, and final-artifact validation. Fix forward after successful use;
  any controlled restoration preserves the current state and declares the recovery point's limits.
  No arbitrary lossless downgrade is promised, and no disclaimer/"version exception" replaces
  safety checks. The accepted direction and pending implementation plan live in
  `.trellis/tasks/11-08-release-upgrade-safety/`; this policy is not evidence those gates passed.
- Tag only the `--no-ff` merge commit on `master`. Hotfixes for a shipped line go on
  `release/<major.minor>` branches.
- Future versions must increase from the actual published version, not a planned milestone.
  Older tags (`v1.1.0-beta.*` pointing at
  `2.0.0-beta.*` code, `0.0.0` in early tags) are historical and are never rewritten; the CHANGELOG
  carries a note explaining them.
- Full procedure: `docs/OPERATIONS/RELEASE_PROCESS.md`. Implementation and final-artifact acceptance
  are tracked by `11-08-release-upgrade-safety`; these rules do not certify that task as complete.
  Public release remains paused until its safety/installer/manual gates and user confirmation.
