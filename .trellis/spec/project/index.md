# Project Layer — Algo Learning Platform

> The files under `../backend/`, `../frontend/`, `../shared/`, `../guides/` and `../big-question/` are the
> **electron-fullstack template, kept verbatim**. They are the standard this project is converging to.
> This directory holds only what the template cannot know: domain red lines, the git workflow the
> developer chose, and the migration status from the pre-Trellis layout to the template layout.

Decision recorded 2026-09-17 by the developer: the template is the single standard; no legacy habit is
preserved for cost reasons. Where a template file says "use X" (zod, Drizzle, electron-log,
electron-store, pnpm, Unix-millisecond timestamps, kebab-case files, BEM, `window.api`), that is the
target, even though the current code still does something else. `migration-status.md` says which is
which today.

---

## Files

| File | What it covers | When to read |
| --- | --- | --- |
| [domain-rules.md](./domain-rules.md) | Non-negotiable product/security rules: WebContentsView only, cookie and credential boundaries, OJ page isolation, submission monitoring, rated-contest silence, local-first data | Always, before touching browser, IPC, cookies, credentials, submissions, coach, backup |
| [git-workflow.md](./git-workflow.md) | Branch model (master ← dev ← feat/fix), merge strategy, commit format with Chinese description, scope enum, tooling gates | Before committing or opening a PR |
| [migration-status.md](./migration-status.md) | Current path → template path mapping per layer, what is already aligned, what is still legacy, which phase moves it | Before writing code in any layer; tells you whether to follow the current file or the template target |

---

## Reading order for a coding task

1. `../shared/index.md` and `../shared/code-quality.md` (mandatory rules).
2. The layer index: `../backend/index.md` or `../frontend/index.md`.
3. `migration-status.md` to find out whether the area you touch is already on the template layout.
4. `domain-rules.md` if the task touches anything listed there.
5. `../guides/pre-implementation-checklist.md`.

---

## Precedence

1. `domain-rules.md` overrides everything (security and product red lines).
2. Template files (`../backend`, `../frontend`, `../shared`, `../guides`) define how code is written.
3. `git-workflow.md` narrows `../shared/git-conventions.md` (Chinese description, fixed scope enum, dev branch); it does not relax it.
4. `migration-status.md` is descriptive only. It never justifies writing new code in the legacy style; new code goes to the template location even inside a legacy module.

---

**Language**: Files in `.trellis/spec/` are written in English (template rule in `../shared/index.md`).
Repository documentation under `docs/`, commit descriptions, PR bodies and issue templates stay in Chinese.
