# Migration Status: Legacy Layout → Template Layout

> Descriptive only. Tells a coding agent where each concern lives **today** and where the template says
> it must live. New code always goes to the template location, even when the surrounding module is still
> legacy. Update the table in the same PR that moves a module.
>
> Plan and evidence: `.trellis/tasks/archive/2026-09/00-bootstrap-guidelines/research/spec-alignment-plan.md`,
> `spec-alignment-report.md`, `reinvented-wheels-audit.md`.

Last reviewed: 2026-11-28. Released v2.0.1 at `de89ce4` has passed final validation and
publication. Phase 3 A0/A1/A2a-A2c remain on the Drizzle branch: schema/client, migration
coordinator and bounded problem queries are implemented. The current synchronization
slice combines released durable recovery with Drizzle adoption; independent review,
206 files/1967 tests, native crash matrices, UI11 and Windows packaged build passed.
PR15 merge317cd9f preserves release ancestry; PR15 and PR8 CI passed. This
unpublished build is not v2.0.1. A2d deletion passed local differential/native/full gates
and build check; PR16 squash85b95dc merged into Drizzle with PR16 CI44049450301 and
PR8 integration CI44505395427 green. PR8 remains draft against dev.
A2e converts only the recent-visit omnibox candidate CTE, retaining the first pipeline
and nullable-ID policy. Independent review, full2038/UI11/native19 and build check
passed; PR17 squash0927213, PR17 CI44521575932 and PR8 CI44522362714 passed. Other queries and
main-process layout work remain separate later slices.
A2f completes detail/visits and the first omnibox candidate pipeline, with explicit
nullable output IDs rather than filtering/casts. Independent review, full2104/UI11/
native22 and build check passed; PR19CI44657463867 passed and squash2112734
merged into Drizzle; PR8CI44658098990 passed. Integration evidence is in phase3's
`a2f-verification-2026-11-20.md`.
A2g finishes the remaining recent problem query and the reviewed invalid-ID action
policy: retain all rows/site navigation, disable only notes/detail with visible
accessible explanation and share the unchanged route predicate. Native LIMIT and
nullable recent output are preserved; detail ID stays string. Independent review,
full2157/UI14/native23 and build check passed; PR21CI44675893865 and squash6c42a38
merged into Drizzle, then PR8CI44676609924 passed.
Evidence: phase3 `a2g-verification-2026-11-20.md`.
A3a converts all4 submission reads, preserving full raw rows/native limits and
correcting read-only nullable timeline IDs. Independent review, full2204/UI14/
native26 and build check passed; PR22CI44680385928 green, squash001e23a into
Drizzle and PR8CI44681049295 green. A3b1 upsert passes full2244/UI14/native30/
build and independent review with explicit frozen030 scope/argument ordering;
PR23CI44684516349 green, squash1a39af0 into Drizzle and PR8CI44685222637 green.
A3b2 first-AC passes independent review/full2321/UI14/native36/build and UTC/
NewYork77 each; PR24CI44691480140, squashfa13260 and PR8CI44692300627 green.
All submission queries/writes are converted. A4a basic reads pass independent
review, corrected DB677/native40, full2364/UI14 and build; PR25CI44725568294,
squashac7478d and PR8CI44728103063 passed. Transient prepush rename EPERM has
no proven cause; isolated3x49 and normal fullhook retry pass, no source workaround.
A4b1 daily reads/nullable outputs/ordinal charts and a bounded router lifecycle
fix pass independent review/full2490/native44/UI16/build with808stable hashes.
Work66760b6 passed normal hooks; PR26CI45606492783 passed, squash4d60368 has
the same tested tree, and PR8CI45608688612 passed. A4b2 streak implementation
starts from that integrated base. A4b2 local gates pass DB854/native48,
full219files2568/UI16 and build:check with810 stable source hashes. Independent
review has no findings/fixes. Workc45e86f/PR27CI45955883109/squash93c0df2 and
PR8CI45958456569 pass with identical tested tree. Initial prepush daily Tooltip
incident has no established root; preserved evidence, bounded diagnostics and
one unchanged fullhook retry passed, without a code workaround. A4c four insight
lists and bounded nullable-output/row-key contracts pass independent review,
DB985/native52, full223files2728/UI16 and build with815 stable source hashes.
Two new native-test assertions were corrected; no production review fix was
needed. Work54f0c25 passes normal hooks; PR28CI45978229533/squashaacbff0 and
PR8CI45979282462 pass with identical tested tree. A4d runtime-only recompute
passes independent review, DB41files1046/native60, full225files2789/UI16 and
build; all819 source hashes stay stable. The unchanged warmed benchmark is
0.97ms<50ms. Historical paths/bytes remain frozen, with a separate later R2
relocation gate. Work78f33b9 passes normal hooks/immediate push;
PR29CI45989652010/squashfb0dd45 and PR8CI45991420238 pass with the same tested
tree. A5a notes research/precheck is accepted in governing artifacts after
handoff PR30/squash299b0e3 and PR8CI45994240435. Only four explicit-handle
file-path reads are converted with original service tails and8otherSQL unchanged.
Independent review/focused164, DB42files1109/native65/realapp21, full226files2852/
UI16 and build pass on2026-11-28;823source hashes stable. The test runner uses
notes-only split ESM and parent-owned cleanup after actual child exit. Work0e4054a
passes normal hooks/immediatepush; PR31CI46099297905/squasheafbed7 and
PR8CI46099803141 pass, with identical tested tree. Handoff PR32CI46100897809/
squash41ef2e6 and PR8CI46101370107 pass. A5b title/type independent precheck
is accepted in governing artifacts; parent GO2026-11-28 authorizes only the two
explicit-handle metadata UPDATEs with raw placeholders/native result semantics.
Independent review fixes two test typings only; both types/lint/UTC261,
DB43files1206/native71/realapp32, full227files2949/UI16 and build pass.
All826source/57protected hashes are stable. Work8a32133 normal hooks/immediate
push, PR33CI46105693154/squash26be448 and PR8CI46106465603 pass with identical
tested tree. A5c DELETE-only6-to5 local acceptance passes independentUTC309/
both types/lint, DB44files1254/native75/realapp34, full228files2997/UI16/build.
All829source hashes stable;59protected exact+1approved A5a observer qualifier
correction. Workdbc50d7 normal hooks/immediatepush, PR34CI46108945322/
squashf1a5d5d and PR8CI46109392717 pass with identical tested tree.
A5c handoff PR35/squash48ba2c0 and PR8CI46110868010 pass. A5d parent GO accepts
the independently reviewed public scalar-CTE content UPDATE, backed by actual
native92 feasibility checks, preserving raw4binds/file-first catch/ignored result
and legacy successful-zero notification. Exactly two fixed-prefix test observer
additions are approved without weaker assertions. Independent review has no
findings/fixes; both types/lint/UTC352, DB45files1297/native81/realapp36,
full229files3040/UI16 and build pass first run. All832source hashes and63original
protected hashes (62exact+1precise exception file) remain stable. Work640c557
passes normal hooks/immediatepush; PR36CI46131000311/squashf169848 and
PR8CI46131596412 pass with identical tested tree. Four notesSQL remain. A5e
creation has construction-only research/precheck but remains NOTGO pending
actual-native proof and explicit getter/schema/event acceptance; full reads/types
and UI remain separately reviewed work.
Later domain/layout work remains incomplete.
See phase3 a3a/a3b1/a3b2 verification artifacts; PR8 stays draft.


---

## Repository shape

| Concern | Today | Template target | Phase |
| --- | --- | --- | --- |
| App root | `algo-electron/` (single package, **pnpm 12.8.1** via `packageManager`; settings in `pnpm-workspace.yaml`: `nodeLinker: hoisted`, `allowBuilds`) | same directory, **pnpm** with hoisting and `packageManager` field | 0.2 |
| Main process | `algo-electron/electron/` (26 flat domain dirs + `main.ts` 945 lines) | `src/main/{index.ts, db/, ipc/, services/{domain}/{types.ts,procedures/,lib/}}` | 3.2, 3.3 |
| Preload | ✅ 2.3（2026-11-01）：`src/preload/index.ts` 暴露域分组 `window.api`（16 域 + `browserLayout`，144 个方法），类型由 `typeof api` 推导，`as Promise<X>` 只在 preload；多参数 invoke 收成单对象（27 通道）；31 个无消费者方法删除（`tests/ipc/apiConsumers` 守卫守住零基线） | 同左（已达成模板目标） | 2.1, 2.3 |
| Renderer | `src/{App.tsx, components/, features/, hooks/, shared/, styles/}` flat features | `src/renderer/src/{components/{ui,layout}, features/, modules/{name}/{components,hooks,context,constants.ts,types.ts,index.ts}, hooks/, context/, lib/, styles/}` | 4.1 |
| Shared | Phase 2 R2/R3: domain schemas and types in `src/shared/`; legacy environment types removed; `ProcessEnv` in `src/main/env.d.ts`, `Window.api` inferred from `src/preload/index.ts`. Renderer uses `@shared`, main uses relative imports. Review closure 2026-11-04: `CoachLlmConfig` has one shared definition; AST guard rejects duplicate exported type/interface declarations. | Shared type layout reached. `electron/shared/` remains main-only until phase 3. | 2.1, 2.2 |
| Tests | `tests/<module>/` × 26 dirs, `electronMock.ts` in `tests/electron/`, no factories | `tests/{setup,factories,mocks,unit/services/{domain},integration}` | 5.1, 5.2 |
| TypeScript | 7.0.2, babel eslint parser, no path alias | 6.0.3 (last stable before 6.1; fallback 5.9.3), typescript-eslint, `@shared` alias in tsconfig + vite + vitest | 0.3, 0.4, 0.8 |
| Formatting | `.editorconfig` only | prettier + `.editorconfig` | 0.5 |
| Commit gates | none locally | husky + commitlint + lint-staged | 0.6 |
| Versioning | Candidate tooling separates prepare/build/check/draft/verify/publish, refuses automatic bump/commit/upload and verifies source/merge/assets/evidence. v2.0.1 is public and verified at master merge `de89ce4`; later versions need renewed explicit source, safety, installer and publication gates. Historical tag/CHANGELOG inconsistencies remain. | Prepared version/changelog then annotated master merge tag; version by declared compatibility contracts, not internal migration alone; independently verified upgrade/recovery gates | 0.10, 6.3; `11-08-release-upgrade-safety` |

## Infrastructure libraries

| Concern | Today | Template target | Phase |
| --- | --- | --- | --- |
| Input validation | ✅ 1.1（2026-11-01）：**zod 4.6.7** `*Input` 元组在 `src/shared/types/ipc/`（13 域），`safeParse` 在 `ipcPayload.ts`/guarded wrapper；`payloadSchema.ts` 已删除；raw 棘轮 4 | 同左（已达成模板目标） | 1.1 |
| Logging | ✅ 1.1（2026-11-01）：**electron-log 5.4.4**，`logger.scope()` + 脱敏 hook（原 regex 全量迁移 + `cookie=`）；RUN_AS_NODE 下文件 transport 关闭 | 同左 | 1.2 |
| Config | ✅ 1.1（2026-11-01）：**electron-store 12**（原子存储层）+ zod 单层校验（`.default()`/`.catch()` 取代 normalizers）；conf 16 的 schema 校验会"坏文件即拒启"，与不清空红线冲突——故 schema 不传给 electron-store | 同左 | 1.3 |
| Dev/prod isolation | ✅ 1.1（2026-11-01）：`envSetup.ts` 为 main.ts 首个 import（架构守卫强制），非打包且无冒烟 env 时 userData 加 `-dev`；冒烟覆盖优先 | 同左 | 1.3 |
| Database | Drizzle0.45.4/Kit0.31.11 schema/client and trusted legacy/baseline coordinator; released2.0.1 recovery synchronized with preserved ancestry. Problem/submission/stats plus notes4file-path reads,2metadata writes andDELETE integrated through PR34. A5c passes independent/full2997/UI16/native75/realapp34/build and both CI gates. | Frozen historical branch; notes5queries/content-binding decision and full-read contracts pending, later domains/layout remain | 3.1; archived release-upgrade-safety |
| Timestamps | R5: 82 INTEGER Unix-ms columns, numeric live writers/IPC/shared schemas, display-only Intl; strict history-derived local/UTC+8/SQLite `.0` conversion. Reconstructed 21/24/29 and isolated actual 24/29 copies pass; original user DBs unchanged. | Numeric timestamp target reached; future Drizzle uses timestamp_ms. See `unix-millisecond-time.md`. | 2.5 |
| Result shape | ✅ 1.1（2026-11-01）：20 处真正的 IPC 返回统一为 `createOutputSchema()` 判别联合（6 个封闭 `code`）；34 处 `{ok:}` 经复核确认是内部校验器/运行时协议形状、不跨 IPC 边界，不转换 | 同左 | 1.4 |
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
| State | `DataRefreshProvider` owns the shell invalidation subscription; other shell actions/preferences remain legacy state | Context for shell actions / data refresh / preferences | 2.4, 4.2 |
| Data fetching | R4: 17 readers use `useIpcQuery`; eight-topic `data:changed` follows committed writes, with 50ms coalescing. `useIpcSubscription` preserves four App snapshot/live streams. | R4 refresh target reached; see `data-refresh.md` for transaction, draft and lifecycle invariants | 2.4 |
| Test naming | 55% Chinese, 21 path-name cases, 61/178 files use `describe` | `describe` + four groups (Input Validation / Normal Operations / Error Handling / Boundary Conditions), `it('should …')` in English | 5.2 |
| Coverage gate | global 65/60/62/68 ratchet | per-layer: procedures & lib 80%, handlers 60% (global ratchet kept) | 5.3 |

## Already aligned (do not regress)

- Candidate automatic config normalization protects exact original bytes through
  `src/main/services/backup/lib/config-normalization-backup.ts`; ordinary explicit
  saves still use electron-store. See `config-normalization-protection.md`.
- Candidate DB recovery contracts are in `upgrade-recovery.md`. These bounded
  helpers do not justify relocating unrelated legacy modules in this release task.

- No `any`, no `@ts-ignore`, no `eslint-disable` in main; 0 `alert/confirm/prompt/localStorage` in renderer.
- Renderer never imports electron/node; components never call `window.api` directly (144/144 call sites live in `*Api.ts` adapters + the `src/main.tsx` entry exemption; guard: only `*Api.ts`, `src/hooks/` and the entry may reference `window.api`).
- All 20 preload `ipcRenderer.on` subscriptions return an unsubscribe.
- R4 adds `data.onChanged` with unsubscribe; `problem.onUpdated` remains a deprecated no-payload compatibility method for one release, explicitly exempted from the caller guard.
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
