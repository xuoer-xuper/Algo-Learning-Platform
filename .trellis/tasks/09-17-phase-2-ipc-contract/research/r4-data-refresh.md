# Research: R4 Data Refresh

- Query: Locate committed writes, renderer readers, IPC/test boundaries, and a safe implementation split for phase 2 R4.
- Scope: Internal; read-only repository investigation, no real user data access.
- Date: 2026-11-04
- Package: `algo-electron/`; code paths below are relative to this package unless explicitly prefixed `.trellis/`.

## Findings

### 1. Decisions needed before implementation

1. Preserve the PRD's eight logical domains: `problems`, `submissions`, `notes`, `stats`, `sites`, `scripts`, `credentials`, `coach`. These are invalidation topics, not physical SQL table names. Account/rating writes should invalidate `stats`, because Dashboard and CredentialsPage read them. Problem visits invalidate `problems` and `stats`. Do not add a domain for every physical table.
2. Keep the existing `PROBLEM.UPDATED = 'problems:updated'` value for one release. It is a compatibility event, not a literal alias of `DATA.CHANGED`: old event has no payload, new one has `{ tables }`. A bridge may send both after one coalesced change, but new renderer readers must subscribe only to the new event to avoid duplicate fetches. Keep an actual caller of `api.problem.onUpdated` only if necessary for the existing every-method-has-consumer guard; otherwise retaining the deprecated exposed method needs an explicit narrow allowlist instead of a fake caller.
3. The four App race templates are live snapshot/event subscriptions, **not table invalidation**. Use a separate typed `useIpcSubscription` hook (initial snapshot + live subscription, live event wins over old read), not table-driven `useIpcQuery`. Preserve capture-result handling and dismissal callbacks.
4. Repository-layer notifications must be transaction-aware. A 50ms debounce alone cannot guarantee rollback safety: queued changes would still broadcast after a rollback. Use explicit synchronous change scopes around the existing outer transaction invocations (details below), not monkeypatching Database/Statement objects or checking `inTransaction` after the fact.
5. **Exclude cookie metadata writes from this bus.** CookieVault summary reads write metadata every time; mapping them to `credentials` produces an endless query -> write -> refresh loop. The PRD does not include cookies in its eight domains.

### 2. Existing notification and lifecycle wiring

| File/line | Behavior / implication |
| --- | --- |
| `electron/main.ts:509` | Problem title/navigation tracking receives callback directly broadcasting `PROBLEM.UPDATED`. |
| `electron/main.ts:727` | IPC facade callbacks broadcast the same old event. |
| `electron/main.ts:925` | `initializeMainServices()` receives old broadcast callback for sync/realtime. |
| `electron/windows/WindowManager.ts:126` | `sendToAll()` iterates full shell windows; does not include OJ web contents or Coach pet. Use this existing API, not design's nonexistent `AppWindow.broadcast`. |
| `electron/windows/AppWindow.ts:26` | `send()` skips destroyed browser/window contents and catches teardown errors. |
| `electron/main.ts:752` | `before-quit` can fire more than once due to async session flush; disposal must be idempotent. Tracking finishes around line 806, DB closes around 816. |
| `electron/app/mainServices.ts:24` | DB init and builtin site seed happen before services/window boot completes; subscribe before live writes, but initial reads remain authoritative. |
| `src/preload/index.ts:144` | Generic `subscribe<T>` removes Electron event argument and returns unsubscribe; `problem.onUpdated` currently at 238 has `void` payload. |

Recommended main composition: `electron/shared/dataEvents.ts` imports only Node EventEmitter/shared types, with `emitDataChanged(tables)`, subscription returning cleanup, and synchronous transaction change-scope helper. Main registers one bridge, coalesces domains for 50ms, and calls `windowManager.sendToAll(IPC_CHANNELS.DATA.CHANGED, { tables })`; remove timer/listener on shutdown. Repositories must never import window classes or Electron. Keep the legacy callback paths either compatibility-only or route them through one well-defined bridge; do not emit the new event both at repository and IPC layers.

### 3. Mutation map and logical invalidations

| Sources | Committed write points / proposed domains |
| --- | --- |
| `db/repositories/problem/mutations.ts:14` | `upsertProblem`: update or insert -> `problems`, `stats` (overview counts and recommendations depend on problem facts). Both branches return normally only after SQL succeeds. |
| `db/repositories/problem/mutations.ts:77` | `deleteProblem`: transaction at 101 deletes submissions/visits/activity/problem; after commit -> `problems`, `submissions`, `stats`; stats recompute after commit can warn/fail without undoing deletion. |
| `db/repositories/submission/mutations.ts:7` | `upsertSubmission`: duplicate returns false before SQL; emit only when inserted -> `submissions`, `problems`, `stats`. Detail counts derive directly from submissions. |
| `db/repositories/submission/firstAc.ts:6,47` | `updateFirstAc` / `recomputeProblemSubmissionState` mutate problem status/first solved -> `problems`, `stats`; use update `.changes` where available, not merely nonempty requested IDs. Import calls latter inside its transaction. |
| `db/repositories/problemVisitRepository.ts:26,78` | `startProblemVisit` outer transaction wraps `upsertProblem`, visit insert, activity insert; `finishProblemVisit` autocommit update -> `problems`, `stats`. Detail/timeline visit data must refresh even without a new title/submission. |
| `db/repositories/stats/recompute.ts:17` | `recomputeDailyStats` is sole daily aggregate writer -> `stats`; date/all variants at 102/108 compose it. |
| `electron/tracking/TrackingService.ts:97,144` | Starts/ends visits then recomputes stats; repository notifications cover both, including closing a visit on non-problem navigation. Existing problem-detected callback fires before start-write, so it is not a commit signal. |
| `electron/submissions/SubmissionBatchWriter.ts:37` | NOT a transaction: problems/submissions/first-AC writes autocommit individually; stats recompute errors are swallowed. Do not wrap only the notification queue around this entire operation and discard on error: partial writes really committed. Repository notifications plus 50ms coalescing cover actual writes even if later item errors. |
| `electron/submissions/syncService.ts:58,147` | Codeforces fetch/retry ends in writer; old notify only when `inserted > 0`. Repository notification also covers title/problem metadata updated on an all-duplicate sync. |
| `electron/submissions/SubmissionWatcher.ts:42,52` | Realtime uses same default batch writer. Keep separate `detected` EventEmitter event for Coach intact; do not replace its semantic notification with table invalidation. |
| `electron/tracking/problemTitleTracking.ts:51,144` | Calls `upsertProblem` then old callback; route old callback as compatibility only to avoid duplicate new events. |
| `electron/notes/NoteService.ts:77,151,165,209,223,242` | Direct SQL create/title/content/type/delete/delete-by-problem -> `notes` (possibly `problems` only where reader depends on note count). Create writes a file before SQL; content writes file then SQL; emit after successful SQL, no-op false results do not emit. `saveNoteImage:186` is asset-only, not a note-row mutation. |
| `db/repositories/site/crud.ts:30,60,96,105` | Create/update/toggle/delete -> `sites`; protected builtins deletion returns false. `site/importExport.ts:71` composes writes, skips failed items; no outer transaction, so keep notifications for successful partial imports. |
| `db/repositories/site/builtins.ts:136` | Startup seed/update -> `sites` if choosing total mutation coverage; no renderer usually mounted yet. |
| `db/repositories/credential/mutations.ts:7,51,67,82` | Upsert/soft-delete/mark-used/rename -> `credentials`; these are the real credential mutations (safeStorage data never enters payload). |
| `db/repositories/userScript/mutations.ts:6,64,174,178,184,206` | Create/update/toggle/delete/legacy-claim/update-with-claim -> `scripts`; toggle delegates update, do not emit twice unnecessarily. |
| `db/repositories/userScriptRuntimeRepository.ts:83,145,157,239,244,255,291,304,355` | Values/resources/permissions/update-state persistence -> `scripts` if all script-domain mutations are covered; none returns private data in event. Update checks can emit frequent events, coalesce. |
| `db/repositories/coach/eventsRepository.ts:32` | Insert event -> `coach`. |
| `db/repositories/coach/interventionsRepository.ts:45,116` | Insert intervention/user action -> `coach`. |
| `db/repositories/coach/feedbackRepository.ts:34` | Feedback insert -> `coach`. |
| `db/repositories/account/accounts.ts:6,34,45` and `account/ratingHistory.ts:6` | Account/current rating/peak/rating history -> `stats` (eight-domain shape has no `rating`). Rating sync has awaits between autocommit writes, so notifications may legitimately show intermediate committed state. |
| `electron/backup/learningDataExport.ts:235,293` | Import problems/visits/submissions/daily stats/accounts/rating in one transaction, then returns. Mark `problems/submissions/stats` only after success; conflicts at 220 exit before writes. Inside transaction status/daily recomputation must not leak events on failure. |

AI outputs/context snapshots have no active list UI in this R4 reader set and are not one of the eight domains. Do not invent `ai` scope or emit `stats` on generated read-side artifacts without proving readers; local recommendation readers derive from existing problem/submission/visit facts.

### 4. Exhaustive transaction inventory

Search: `rg -n '\.transaction\(|\.immediate\(|\.exclusive\(|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b' electron --glob '*.ts'`.

Runtime transaction sites:

1. `db/repositories/problemVisitRepository.ts:28`: `db.transaction(... )()`.
2. `db/repositories/problem/mutations.ts:101`: `db.transaction(... )()`.
3. `db/repositories/userScript/mutations.ts:214`: created transaction invoked at 316 inside try/catch (false on rollback).
4. `db/repositories/userScript/mutations.ts:325`: `runUserScriptTransaction(operation)` wraps arbitrary script install persistence; `electron/scripts/UserScriptInstaller.ts:46` calls it, nesting legacy-claim/resources/update-state writes.
5. `electron/backup/learningDataExport.ts:235`: transaction invoked at 293; recompute functions run inside.
6. `db/repositories/cookieRecord/mutations.ts:88`: batch, invoked with `inputs` at 91.
7. `db/repositories/cookieRecord/mutations.ts:113`: replace calls batch (nested), invoked at 118. **Cookie metadata excluded, so these need no bus wrapper unless scope is deliberately expanded.**

Migration-only sites: `electron/db/migrate.ts:69` and historical `migrations/018_normalize_codeforces_submission_ids.ts:56`. They do not call the new live mutation repositories and must not be edited for R4. No `.immediate`, `.exclusive`, or raw SQL transaction commands found in runtime source.

Suggested scope contract: `withDataChangeTransaction(() => db.transaction(operation)())` pushes a fresh Set, runs synchronously, and merges its successful Set into parent or dispatches after return. On throw discard only its own Set and rethrow. Queue `emitDataChanged(tables)` into innermost Set while active; autocommit marks go to emitter immediately. Crucially wrap the **transaction invocation**, not merely its callback, so committing must succeed before dispatch. No unconditional tables at entry; rolled-back/no-op work must not emit. Nested failure caught by outer caller must discard inner changes but keep earlier outer ones. Never use this helper around async operations or an autocommit batch masquerading as a transaction.

Critical tests: successful outer commit emits once; failed outer transaction emits none; inner success followed by outer rollback emits none; inner rollback caught while outer commits emits only outer domains; no-op `.changes = 0` does not emit; autocommit before later exception still emits.

### 5. Cookie read-write loop hazard

`electron/cookies/CookieVault.ts:52` `getSafeSummaryForSite` -> line 29 `getCookiesForSite` -> line 63 `persistCookieMetadata` -> `replaceCookieMetadataForDomain`. This deletes/reinserts metadata on every renderer read, including fresh timestamps. CredentialsPage reads one summary per site (`src/features/settings/CredentialsPage.ts:69`). Emitting `credentials` from generic cookie-record writes would therefore refresh endlessly. Keep those writes outside R4. Real cookie changes would require separate native event observation or semantic comparison later, not a blanket mutation hook.

### 6. Renderer consumers and hooks

`src/RendererRoot.tsx:10` selects App versus independent CoachPet and wraps lazy imports. `src/main.tsx:18` mounts under StrictMode. Add DataRefreshProvider high enough to cover app routes; decide explicitly if pet needs the provider (pet currently has dedicated config/state events). Tests often mount App/individual components directly, so wrap their render helpers/harnesses consistently or design a documented context default rather than leaking subscriptions per component.

Architecture guard `tests/architecture/check-architecture.mjs:379` permits `window.api` only in `*Api.ts`, `src/hooks/`, and entry `main.tsx`. Context provider cannot directly call it: use `src/hooks/dataRefreshApi.ts`/existing permitted adapter to subscribe, with type imports from shared.

| Reader / line | Migration shape / topics |
| --- | --- |
| `features/home/HomePage.tsx:36` | Currently parallel primary reads plus legacy subscription. Queries: overview+recent (`problems/stats/submissions`), recommendations same facts, shortcuts initial-only. Preserve independent error/fallback policies. |
| `features/problems/ProblemSidebar.tsx:28,46` | Query key `[platform,status]`, topics `problems/submissions`; remove old subscription. Filter changes must invalidate earlier in-flight results. |
| `features/analytics/Dashboard.tsx:52,62,93` | Core/AI/rating and trends; topics `problems/submissions/stats`; trends keyed range. Distinguish first load and refetch; no old-null skeleton after background changes. |
| `features/problems/ProblemDetail.tsx:36` | Key problemId, topics `problems/submissions/stats`; `loadProblemDetail` joins two calls. Current null means both absent and loading: use `isLoading` then real absent/error state. |
| `features/problems/NotePanelModal.tsx:35` | List key problemId, topic `notes`; refresh list only, do NOT overwrite dirty active title/body or auto-reset editor from event. Existing note switch/title-save tests are critical. |
| `features/coach/SessionTimelineView.tsx:103` | Key problemId, topics `problems/submissions/stats/coach`; replaces cancelled flag. |
| `features/coach/CoachMetricsView.tsx:84` | Topics `coach/problems/submissions`, because conversion reads first AC. Retain explicit mock demonstration mode; disable live query while mock selected and restore on user action. Never show initial skeleton during live refetch. |
| `features/settings/CredentialsPage.tsx:60` | Topics `credentials/sites/stats`; combined safe-summary/account loader. Keep typed editable name/ratingHandle drafts independent, avoid overwriting user edits on every refresh. |
| `features/settings/SiteManagementPanel.tsx:39` | Topic `sites`; preserve import preview/add draft state. Mutations may await `refetch` for immediate local feedback. |
| `features/scripts/UserScriptManager.tsx:38` | Topics `scripts/sites`; preserve selected/edit script state and success/error UX. |
| `features/settings/SettingsPage.tsx:44,52` | Overview topics `problems/submissions/stats`; realtime diagnostic read initial/manual (not a DB row topic). |
| `features/settings/CodeforcesSyncPanel.tsx:22` | Account query `stats`, preserve edit handles; after submission sync rely on bus instead of only parent stats refresh. |
| `features/settings/AppearancePanel.tsx:29` | Query for initial preference only (empty tables), preserve save/rollback behavior; theme not in eight domains. |
| `features/settings/SearchEnginePanel.tsx:55` | Initial query only, preserve draft and timer cleanup. |
| `features/settings/CoachPanel.tsx:44` | Initial query or `coach` only if config save marks same topic; query result must not overwrite optimistic edits unexpectedly. |
| `features/settings/LlmConfigPanel.tsx:22` | Initial/manual query; preserve API key input semantics and no secret transport. |
| `features/scripts/UserScriptInstallPage.tsx:26` | Key installId, initial-only pending/preview query (registry is not DB); retain stale-read protection. |

There are more than the PRD's outdated 15 fetch components. `CoachPet` uses live snapshot streams (not ordinary table reads), and `CoachChatPanel` sends explicit user requests (not auto-refresh query). Do not turn chat into background refetch. Prefer inventory-based migration over artificially matching 15.

Hook invariants for `useIpcQuery(fetcher, deps, {tables,enabled})`:

- Keep latest fetcher in a ref; arbitrary inline functions/arrays must not cause perpetual effect restarts. Compare declared deps and stable table membership, not the options object's identity.
- Subscribe before/with first read; a change arriving during initial fetch must trigger a newer request or queued rerun, not get lost.
- Track request generation and mounted/enabled state so old-key, superseded, or unmounted results/errors/finally cannot overwrite newer state.
- `isLoading` is initial/identity-change with no value; `isRefetching` keeps last value. Successful `null`, `false`, `0`, or `[]` still counts as loaded.
- On key changes clear stale entity data; on same-key refresh errors retain prior value and expose error; no rejected unhandled promise from automatic refresh.
- Disabled means no initial read/no event refresh and cancels application of prior results. Explicit refetch semantics must be documented, especially restoring real Coach metrics.
- Unrelated tables do not refetch; unsubscribe idempotently on cleanup; StrictMode mount/unmount/remount must leave exactly one native subscriber per provider.

### 7. App live subscription scope

`src/App.tsx:126` host permissions, 144 credential capture (+ result), 173 credential autofill, 191 Coach contest mode each subscribe before initial read and guard with `disposed`/`receivedLiveUpdate`. This is important security/UX sequencing. `useIpcSubscription` should return current value/setter or expose an updater needed for explicit dismiss/response flows. On every subscription generation: subscribe first, start initial read, ignore initial read after any live event, and ignore all work after cleanup. Capture result callback at 153 clears only matching captureId and preserves failure feedback; keep it separate or combine intentionally. Parent accepted this separate-hook direction.

### 8. Test and guard touch points

- `src/shared/constants/channels.ts`: add distinct DATA group; `tests/ipc/channels.test.ts:218` exact count changes 178 -> 179, add sorted `'data:changed'`.
- Add shared DataTable/DataChangedPayload schema/types in `src/shared/types/` (no Node/Electron reverse import). Payload only names, no IDs/rows/secrets.
- `src/preload/index.ts`: new `data.onChanged`, retain deprecated old event behavior.
- `tests/ipc/ipcContracts.test.ts:172,309`: expected method/channel entry and fixed subscription channel array; text sender scanner must recognize actual main bridge's `sendToAll` call.
- `tests/ipc/preloadSurface.test.ts`: generic unsubscribe/payload tests discover new method; add explicit new payload if desired.
- `tests/ipc/apiConsumers.test.ts`: ensure real caller inside permitted adapter. Resolve deprecated `problem.onUpdated` exception explicitly if all readers migrate.
- `tests/ui/rendererScreenshotHarness.tsx` returns full `typeof window.api`, add data subscription and provider wiring. `coachPetHarness.tsx` and typed mocks also may need the new required domain. Component suites mostly use partial mocks: provider placement changes must not introduce TypeErrors.
- New `src/context/`, new test dirs if any require README (`test:docs`), per existing docs coverage guard.
- Existing `tests/components/noteTabIsolation.test.tsx`, `appContestNotice.test.tsx`, credentials prompt tests, transitions and settings read-error tests protect state/race semantics; retain them.

### 9. Honest UI acceptance test

Existing UI screenshot harness builds real components but substitutes `window.api` (`tests/ui/rendererScreenshotHarness.tsx`); `electronScreenshotApp.mjs` has no real preload/DB. A test that merely changes harness arrays and emits data events proves renderer behavior, **not** PRD's real background sync write-through.

Recommended `tests/ui/dataRefresh.pw.spec.ts` uses a dedicated test Electron app with temporary userData/database, real `SyncService` + `createDefaultSubmissionBatchWriter`, real typed main event bus/bridge and preload. Inject deterministic Codeforces adapter response in the **test harness**, not a production bypass and not public network. Mount Dashboard and ProblemDetail together in the dedicated renderer (or use two shell windows), record baseline; call the real shell `api.submissions.syncCodeforces('fixture-handle')`; assert both visible stats/detail change within an explicit 2000ms timeout after sync, without remount/manual refresh. Use actual trusted shell ownership registration or reuse startup harness pattern; do not disable IPC trust checks in production. Main sync can also be triggered from a test-only callback after components subscribe while preserving real service/writer path.

For bounded implementation, combine real service/DB integration tests of emitted domains with a renderer Playwright harness of those exact domains, but label that split coverage honestly; do not claim real end-to-end sync acceptance from a mock-only page.

No-skeleton tests: load CredentialsPage/CoachMetricsView, hold next read promises pending, dispatch relevant event, assert old content remains and loading label absent; release and assert updated text. Hook unit tests cover unrelated domains, stale resolution order, errors, disabled, unmount and unsubscribe; integration tests cover rollback/noop/partial-autocommit and 50ms coalescing. Do not use arbitrary sleeps.

## Proposed Two-Worker Boundaries

### Worker A: shared/main/backend and real DB integration

- Own `src/shared/constants/channels.ts`, new `src/shared/types/data.ts`, `src/preload/index.ts`, `electron/shared/dataEvents.ts`, main bridge/lifecycle, mutation sources/transaction wrappers, IPC contracts/channels/preload tests, DB/integration tests.
- Publish type/helper contract immediately to worker B (`DataTable`, `DataChangedPayload`, `api.data.onChanged` shape). Shared API is fixed; no renderer edits.
- Existing `problems:updated` callbacks remain compatibility paths until renderer migration checked. Do not change SQL/business semantics or timestamp representation.

### Worker B: renderer hooks/context, consumers and UI tests

- Own `src/context/`, `src/hooks/{dataRefreshApi,useIpcQuery,useIpcSubscription}`, relevant features/App/root, component tests and existing UI mocks/harnesses.
- Coordinate `tests/ipc/apiConsumers` deprecated exception and real integration Playwright harness with A/parent to avoid simultaneous edits.
- Keep provider subscription adapter architecture-compliant and preserve note drafts/Coach mock mode/live prompt sequencing.

Smallest verifiable chunks: (1) shared bus+transaction helper+preload contract tests; (2) repository mutations/main bridge+real DB rollback/noop coverage; (3) provider/hooks unit tests; (4) readers+live subscription migration; (5) cross-layer UI acceptance/full gates. These can be one coherent R4 commit after both workers integrate rather than pushing broken half-contracts.

## Related Specs

- `.trellis/spec/project/domain-rules.md`: IPC sender/schema boundaries, credentials, local-first data, table write authority.
- `.trellis/spec/project/regression-checks.md`: real-runner mutations, moved source scan roots, lazy route cleanup.
- `.trellis/spec/frontend/ipc-electron.md`: Data Refresh Subscription Pattern.
- `.trellis/spec/frontend/hooks.md`, `react-pitfalls.md`: dependency stability, initial/refetch distinction, subscription disposal.
- `.trellis/spec/backend/error-handling.md`: transactions must throw, not silently report success.
- `.trellis/tasks/09-17-phase-2-ipc-contract/{prd,design,implement}.md`: R4 payload/domain scope and corrected current paths.

## External References

No external sources required. Installed repository versions: React 19.2.8, Electron 43.4.0, better-sqlite3 13.0.3, Vitest 4.1.10, Playwright 1.62.1 (package.json). Runtime behavior above is grounded in source, not inferred from online versions.

## Caveats / Not Found

- Design names `AppWindow.broadcast`, but only `WindowManager.sendToAll` exists.
- No DataRefreshContext/useIpcQuery implementation yet. Correct stage-2 paths are `src/context` and `src/hooks`, not future `src/renderer/src`.
- No runtime transaction variants (`.immediate/.exclusive`) found; adding one later must also use scope wrapper.
- Eight-domain enum does not name account/rating/cookie/config; proposed mappings deliberately avoid expanding public contract. Config preference views can use initial/manual queries without table subscription.
- Legacy channel consumer guard conflicts with preserving a deprecated unused public method; make the exception explicit rather than adding dead references.
- This research writes only this file; application source and tests were not modified or executed. Concurrent R2 fix agents may shift line numbers.
