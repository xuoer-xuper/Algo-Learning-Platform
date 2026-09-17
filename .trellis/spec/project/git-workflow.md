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
| Never commit on `master` | GitHub branch protection: PR only, CI required, no force push. A local `pre-commit` hook refuses when `git branch --show-current` is `master`. |
| Small edits may land on `dev` directly | Typo, doc line, single-line fix. Anything that needs more than one commit gets a branch. |
| feature → dev | **Squash merge** via PR. The PR title becomes the commit subject and must follow the commit format below. |
| dev → master | **Merge commit with `--no-ff`** via PR. Tag `vX.Y.Z` on that merge commit. |
| Branch names | English, kebab-case, `type/description` as in the template. Trellis task ids may be used: `feat/00-bootstrap-guidelines`. |
| CI | `.github/workflows/ci.yml` runs `fast-guard` on push to `dev` and `master`, and the full matrix on pull requests. Pushing to a feature branch alone does not run CI; open the PR. |
| Push | Pushing is done by the developer, with the developer's identity only. No AI co-author trailers in commit messages. |

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
ipc  notes  parsers  preload  rating  scripts  shared  shortcuts  sites  submissions  tracking
windows  renderer  ui  tests  docs  ci  deps  release  trellis
```

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
| `pre-commit` | branch check, `lint-staged` (prettier + eslint on staged files), `pnpm typecheck`, `pnpm typecheck:tests` | on `master`; lint or type error |
| `pre-push` | `pnpm test:core` | any guard, lint, type or unit failure |

`pnpm test:core` is this repository's equivalent of the template's `npm run lint && npm run typecheck && npm test`; it additionally runs the architecture and security guards.

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

- Semver with `v` prefix; pre-releases `-beta.N` / `-rc.N`. Existing tags: `v0.1.0-alpha` … `v2.0.0-rc.1`.
- Tag only the `--no-ff` merge commit on `master`. `git push --follow-tags`.
- Release notes live in `docs/PRODUCT/CHANGELOG.md` ("未发布" section becomes the version heading at
  release time). No separate `release-notes.txt`.
- Full procedure: `docs/OPERATIONS/RELEASE_PROCESS.md`.
