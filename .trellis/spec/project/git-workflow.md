# Git Workflow

> Narrows `../shared/git-conventions.md` for this repository. Everything in the template still applies
> (atomic commits, body for context, PR description template). This file fixes the three things the
> template leaves open: the branch model, the commit language, and the scope enum.

Chosen by the developer on 2026-09-17. Before that date all 248 commits were made directly on
`master` with no merges; the `dev` branch was created in the same session.

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
| Never commit on `master` | GitHub branch protection **enabled 2026-09-17**: PR required, checks `Fast core, packaging and docs guard` + `Electron and renderer smoke` (strict), no force push, no deletion, conversations resolved; `enforce_admins` off so `release-it` can commit on master. A local `pre-commit` hook (phase 0) refuses when `git branch --show-current` is `master`. |
| Small edits may land on `dev` directly | Typo, doc line, single-line fix. Anything that needs more than one commit gets a branch. |
| feature → dev | **Squash merge** via PR. The PR title becomes the commit subject and must follow the commit format below. |
| dev → master | **Merge commit with `--no-ff`** via PR. Tag `vX.Y.Z` on that merge commit. |
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
runs hooks with repo-root CWD). `release-it` is the only sanctioned `--no-verify` bypass: it must
commit on `master` (which `pre-commit` refuses), so `.release-it.json` carries
`git.commitArgs: ["--no-verify"]` — decided 2026-10-31, no env sniffing, no marker files.

`pre-push` was upgraded from `pnpm test:core` to `pnpm test:ci` on 2026-10-31 after two CI-only reds
proved that `test:core` alone is not CI parity. `pnpm test:core` (typecheck ×2 + lint + architecture
+ security + jscpd + full vitest) remains the per-section gate; `test:packaging` and `test:docs` ride
along at push time, and the two smoke scripts cover what CI's `Electron and renderer smoke` job runs.

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

- Single source of the version number: `algo-electron/package.json`. Nothing else is hand-edited
  (README badge reads GitHub Releases; CHANGELOG is generated).
- Releases are cut with **release-it** (`pnpm exec release-it`, `pnpm exec release-it -- --preRelease=rc`)
  which bumps from conventional commits, regenerates `docs/PRODUCT/CHANGELOG.md`, commits
  `chore(release): 发布 v${version}` (via `git.commitArgs: ["--no-verify"]` — the sanctioned pre-commit
  bypass on `master`), creates an **annotated** tag `v${version}`, pushes with `--follow-tags`, and
  uploads `.exe` + `.blockmap` + `latest.yml` to the GitHub Release.
  - pnpm 12 nuance (2026-10-31): `pnpm release -- --dry-run` passes the `--` separator itself to
    release-it and fails with "Unexpected positional argument" — use `pnpm exec release-it …` forms.
  - Prerequisites for a real release: `GITHUB_TOKEN` set (otherwise release-it falls back to a
    web-based release), clean working dir (`requireCleanWorkingDir` counts untracked files as dirty),
    on `master` (`requireBranch`). `hooks.before:init` (`pnpm test:all`, `pnpm build:win`) runs for
    real only outside `--dry-run` (dry-run logs them skipped).
- Semver for a desktop app: **major** = data format / migration that cannot be rolled back or needs the
  user to act; **minor** = new feature; **patch** = fix. Pre-releases `-alpha.N` / `-beta.N` / `-rc.N`.
- Tag only the `--no-ff` merge commit on `master`. Hotfixes for a shipped line go on
  `release/<major.minor>` branches.
- Version numbers are monotonic from `v2.1.0` on. Older tags (`v1.1.0-beta.*` pointing at
  `2.0.0-beta.*` code, `0.0.0` in early tags) are historical and are never rewritten; the CHANGELOG
  carries a note explaining them.
- Full procedure: `docs/OPERATIONS/RELEASE_PROCESS.md` (rewritten in alignment phase 0.10 / 6.3).
