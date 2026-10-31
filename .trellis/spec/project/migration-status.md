# Migration Status: Legacy Layout → Template Layout

> Descriptive only. Tells a coding agent where each concern lives **today** and where the template says
> it must live. New code always goes to the template location, even when the surrounding module is still
> legacy. Update the table in the same PR that moves a module.
>
> Plan and evidence: `.trellis/tasks/archive/2026-09/00-bootstrap-guidelines/research/spec-alignment-plan.md`,
> `spec-alignment-report.md`, `reinvented-wheels-audit.md`.

Last updated: 2026-09-17 (phase 0.2 in progress on `chore/phase-0-tooling-gates`).

---

## Repository shape

| Concern | Today | Template target | Phase |
| --- | --- | --- | --- |
| App root | `algo-electron/` (single package, **pnpm 12.8.1** via `packageManager`; settings in `pnpm-workspace.yaml`: `nodeLinker: hoisted`, `allowBuilds`) | same directory, **pnpm** with hoisting and `packageManager` field | 0.2 |
| Main process | `algo-electron/electron/` (26 flat domain dirs + `main.ts` 945 lines) | `src/main/{index.ts, db/, ipc/, services/{domain}/{types.ts,procedures/,lib/}}` | 3.2, 3.3 |
| Preload | `electron/preload.ts` exposing `window.electronAPI` (158 string channels, 85 `as Promise<>` casts) | `src/preload/index.ts` exposing `window.api`, typed via `typeof api`, channels from `@shared/constants/channels` | 2.1, 2.3 |
| Renderer | `src/{App.tsx, components/, features/, hooks/, shared/, styles/}` flat features | `src/renderer/src/{components/{ui,layout}, features/, modules/{name}/{components,hooks,context,constants.ts,types.ts,index.ts}, hooks/, context/, lib/, styles/}` | 4.1 |
| Shared | none cross-process; `electron-env.d.ts` ambient types (112), `electron/shared/`, `src/shared/` | `src/shared/{types/*.ts (zod), constants/channels.ts}`; renderer imports `@shared/*`, main uses relative paths | 2.1, 2.2 |
| Tests | `tests/<module>/` × 26 dirs, `electronMock.ts` in `tests/electron/`, no factories | `tests/{setup,factories,mocks,unit/services/{domain},integration}` | 5.1, 5.2 |
| TypeScript | 7.0.2, babel eslint parser, no path alias | 6.0.3 (last stable before 6.1; fallback 5.9.3), typescript-eslint, `@shared` alias in tsconfig + vite + vitest | 0.3, 0.4, 0.8 |
| Formatting | `.editorconfig` only | prettier + `.editorconfig` | 0.5 |
| Commit gates | none locally | husky + commitlint + lint-staged | 0.6 |
| Versioning | hand-edited in 5 places; tags partly lightweight; `v1.1.0-beta.*` tags point at `2.0.0-beta.*` code; CHANGELOG dates wrong | release-it + conventional-changelog, annotated tags, package.json single source, app-semver rule (major = irreversible data change) | 0.10, 6.3 |

## Infrastructure libraries

| Concern | Today | Template target | Phase |
| --- | --- | --- | --- |
| Input validation | `electron/ipc/payloadSchema.ts` (14 combinators, 196 call sites) | **zod** schemas in `src/shared/types/`, `safeParse` in procedures / guarded IPC wrapper | 1.1 |
| Logging | `electron/shared/logger.ts` (custom rotation + redaction) | **electron-log** with `scope()` and a redaction hook that keeps the current regexes | 1.2 |
| Config | `electron/app/config.ts` (JSON file + hand-written normalizers) | **electron-store** with zod schema; `env-setup.ts` first import | 1.3 |
| Dev/prod isolation | none (`app.isPackaged` unused, shared userData) | `env-setup.ts` appends `-dev` to userData when not packaged | 1.3 |
| Database | bare better-sqlite3, 249 `prepare()` sites, 114 `as Row` casts, hand-written migration runner + 29 migrations | **Drizzle ORM** schema + `drizzle-kit` migrations; 001–029 imported as baseline; pre-migration backup kept | 3.1 |
| Timestamps | TEXT local-time strings (`nowBeijing()`), 65 columns, `local_day` string column | **Unix milliseconds INTEGER** (`{ mode: 'timestamp_ms' }`), `z.number()` in schemas, `Intl` formatting in UI only | 2.5 |
| Result shape | `{ ok }` (35) and `{ success }` (23) mixed, no `code` | `{ success: true, data } \| { success: false, error, code? }` via `createOutputSchema()` | 1.4 |
| Event bus | 9 hand-written `Set<callback>` buses + 3 `EventEmitter` | typed `EventEmitter` wrapper | 3.6 |
| Debounce | `DebouncedWindowFollower.ts` + 12 ad-hoc `setTimeout` pairs | one `shared/lib/timing.ts` | 3.6 |
| Snapshot store | `browser/tabSessionStore.ts` + `windows/applicationSessionStore.ts` (twins, 522 lines) | one generic `AtomicJsonSnapshotStore<T>` | 3.6 |

## Conventions

| Concern | Today | Template target | Phase |
| --- | --- | --- | --- |
| File names | class files PascalCase (54), others camelCase (229), 0 kebab | kebab-case; components PascalCase; hooks `useX.ts` | 3.7 |
| Directory names | 6 camelCase | kebab-case | 3.7 |
| `interface` vs `type` | 323 : 1 | `type` for object shapes, `interface` only when extended | as touched |
| Non-null assertions | 13 | 0, enforced by eslint | 0.4 |
| Explicit return types | main 551/553, renderer 179/219 | all exported functions | 0.4 (`explicit-module-boundary-types`) |
| CSS entry | `index.css` + `App.css`→8 files + 6 component-side imports | `styles/index.css` single entry, `tokens.css`, `base.css`, `components/`, `layout/`, `pages/` | 4.4 |
| CSS naming | `block-element-sub` (463 selectors, 0 BEM) | BEM `block__element--modifier` | 4.4 |
| Tailwind | installed, 0 utility classes used | utility classes for simple/one-off styles | 4.4 |
| Scrollable containers | 17, no `scrollbar-gutter` | `scrollbar-gutter: stable`, hover-reveal scrollbar | 4.4 |
| State | 0 Context, props drilled 5 levels | Context for shell actions / data refresh / preferences | 4.2 |
| Data fetching | `useEffect` + `await` in 15 components, 1 refresh event | `useIpcQuery()` hooks subscribing to `DataRefreshContext` | 2.4 |
| Test naming | 55% Chinese, 21 path-name cases, 61/178 files use `describe` | `describe` + four groups (Input Validation / Normal Operations / Error Handling / Boundary Conditions), `it('should …')` in English | 5.2 |
| Coverage gate | global 65/60/62/68 ratchet | per-layer: procedures & lib 80%, handlers 60% (global ratchet kept) | 5.3 |

## Already aligned (do not regress)

- No `any`, no `@ts-ignore`, no `eslint-disable` in main; 0 `alert/confirm/prompt/localStorage` in renderer.
- Renderer never imports electron/node; components never call the IPC API directly (155/156 calls in adapters).
- All 20 preload `ipcRenderer.on` subscriptions return an unsubscribe.
- IPC three-layer guard (`domain-rules.md` §2); 100% of parameterised channels have a schema.
- 9 `db.transaction` sites throw on failure, no silent return.
- WAL + `foreign_keys` + `busy_timeout` pragmas set.
- Migration files named `NNN_snake_case.ts`, applied in a transaction with pre-backup.
- jscpd duplication 1.76% (threshold 3% in CI from phase 0.7).

## Legacy artefacts to remove (phase 6)

`algo-coach-showcase.html`, `release-notes.txt`, `algo-electron/docs/ai coach技术栈.md` (rename to ASCII),
`algo-electron/docs/REFACTOR_HANDOFF.md`, `algo-electron/docs/TASKS.md`, root `AI_HANDOFF.md`,
`VERSION_PLAN.md` → `docs/ARCHIVE/`. `.trellis/` and `docs/PRODUCT/CHANGELOG.md` take over their role.

Stale `npm` command prose outside READMEs (`docs/OPERATIONS/RELEASE_PROCESS.md`, historical CHANGELOG / PLAN /
audit / handoff documents, `VERSION_PLAN.md`, `AI_HANDOFF.md`): phase 0.2 converted `CONTRIBUTING.md`,
`.github/COLLABORATION.md` and every covered `README.md` only; the rest is rewritten together with the
documents in 6.3, because those files describe what was run at the time and must not be rewritten as history.
