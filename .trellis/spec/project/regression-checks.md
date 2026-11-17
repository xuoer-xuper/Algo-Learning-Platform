# Refactor Regression Checks

Project-specific checks learned during the phase 2 IPC review on 2026-11-04.
These extend the template quality rules without changing production contracts.

## 1. Scope / Trigger

Apply when moving IPC code, replacing channel strings with constants, changing
shared/main import boundaries, or testing lazy renderer routes.

A green scanner is not evidence of coverage if its file roots or recognized syntax
no longer match production. A passing assertion is not a passing test run if work
continues after the test environment is destroyed.

## 2. Signatures

- `tests/architecture/guards.mjs`: `countUnschemadIpc(text)` and
  `countIpcChannelLiterals(text)` return violation counts.
- `findDuplicateExportedTypes(sources)` checks top-level exported type/interface
  definitions using the TypeScript AST; re-exports are not new definitions.
- `node tests/architecture/check-architecture.mjs`: exits nonzero on a violation
  and identifies the failed rule and source path.
- Renderer tests: `afterEach(cleanup)`, `await vi.dynamicImportSettled()`, and
  `findBy*` / `waitFor` for observable page readiness.
- Typed IPC stubs: `vi.fn<typeof window.api.stats.getOverview>()`; resolved fixture
  values must match the actual preload-derived return type.

All command and source paths here are relative to `algo-electron/`.

## 3. Contracts

- The channel-literal rule scans both `electron/` and `src/`, including
  `src/preload/index.ts`. Moving an entrypoint must not remove it from the scan.
- The missing-schema rule recognizes `IPC_CHANNELS.DOMAIN.METHOD` and channel
  identifiers as well as historical string literals. A handler accepting payload
  parameters needs an inline schema tuple or the established `*Input` tuple.
- `src/shared/` must not import the Electron package or relative modules beneath
  the main-process `electron/` tree. Check static imports, re-exports, side-effect
  imports, and dynamic imports when adjusting this rule.
- Shared entity types have one declaration source. Main-process consumers import
  the shared type instead of copying an interface, even when both shapes happen
  to match. `CoachLlmConfig` is inferred from the shared schema; the renderer-facing
  read still removes `encrypted_api_key` at runtime.
- Vitest does not enable globals in this repository. Do not assume Testing Library
  installed automatic cleanup; register `afterEach(cleanup)` explicitly unless a
  documented shared setup already does so.
- A lazy-route container can exist while its page is still suspended. Await both
  import settlement and the page's visible loaded state before teardown. Wire all
  IPC reads made by that route and its mounted children.
- Nested lazy content needs another settlement after the action/read that mounts it.
  For the note route, settle the route, await the note-selection action in `act`,
  then settle MilkdownEditor/Crepe imports before asserting the editable body. A
  larger DOM polling timeout alone does not synchronize either module boundary.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Constant channel, payload handler, no schema | Missing-schema count increases; architecture check fails |
| Constant channel with `*Input` tuple | No missing-schema violation |
| Handler has no payload parameters | No missing-schema violation |
| String channel added to relocated preload | Channel-literal architecture check fails |
| Shared module imports `../../../electron/...` | Process-neutrality architecture check fails |
| Shared module imports shared constants | No process-neutrality violation |
| A second exported interface/type defines an existing name | Exported-type uniqueness check fails |
| A barrel re-exports an existing type | No duplicate-definition violation |
| Lazy route reaches its loaded state and is cleaned up | No missing-API or environment-teardown errors |
| All assertions pass but Vitest reports an unhandled error | Test run fails; do not report the gate green |

## 5. Good / Base / Bad Cases

- Good: change scanner syntax and roots with the refactor, and prove the real
  runner rejects an injected violation at each affected boundary.
- Base: production sources pass unchanged and existing no-payload registrations
  remain exempt.
- Bad: test only the pure scanner with old string channels, omit the relocated
  preload from traversal, or hide unfinished lazy imports behind a fixed sleep.

## 6. Tests Required

- Extend `tests/architecture/guards.test.ts` when changing scanner behavior.
  Include a real-runner mutation that removes `getDetailInput` from a constant
  registration, literalizes a preload channel, or injects a shared-to-main import.
  Assert nonzero exit plus the intended rule and path, not just any failure.
- Add an AST-guard regression and a real-runner mutation when closing a duplicate
  type. Preserve tests that encrypted keys remain in storage but not renderer DTOs.
- Apply mutations to reads in an isolated subprocess, not to tracked source files;
  this keeps concurrent review and tests independent.
- For lazy route tests, assert loaded page content and no leaked mounted route
  before finishing. Use typed fixtures so return-shape changes fail typechecking.
- Run `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm lint`,
  `pnpm exec vitest run tests/architecture/guards.test.ts tests/components/transitions.test.tsx`,
  and `pnpm test:all`. Coverage-enabled parallel execution is necessary to catch
  teardown races that a focused run can miss.

## 7. Wrong vs Correct

```ts
// Wrong: only the route shell is ready; lazy children may still run later.
await waitFor(() => expect(container.querySelector('.shell-route-settings')).toBeTruthy())
await new Promise((resolve) => setTimeout(resolve, 500))

// Correct: wait for the page and its initial read, then clean up every test.
afterEach(cleanup)
await vi.dynamicImportSettled()
expect(await screen.findByRole('heading', { name: settingsHeading })).toBeTruthy()
await waitFor(() => expect(themeSelector.hasAttribute('disabled')).toBe(false))
```

## Native Electron Interaction Tests

- Electron's `did-finish-load` is not acknowledgement that a MessagePort event sent by
  its handler has run in the renderer. Userscript document-idle smoke assertions must
  wait for the actual idle script sentinel before checking the exact execution order.
  Keep duplicate/stale-generation/order assertions; a page-load event or fixed sleep
  alone cannot establish completion of the asynchronous runtime phase.
- Chromium DOM focus is not native BrowserWindow activation. Wait for the window
  to be visible/focused and `document.hasFocus()` before keyboard assertions;
  focus the fixture window explicitly when the test requires keyboard input.
- Playwright CDP pointer input does not move the desktop cursor. A transparent
  fixture using native mouse forwarding must start fully on-screen away from the
  physical cursor, rather than mixing two pointer sources or moving the user's
  cursor. Keep `forward: true` and original hit-test assertions enabled.
- Observe capture state synchronously beside `setIgnoreMouseEvents` in the main
  process. A Node-side mirror updated after an async binding acknowledgement can
  regress to an older value when acknowledgements finish out of order.
- Pin that observation bug with a controlled delayed-acknowledgement regression,
  not a fixed sleep. Attach native state plus recent pointer/focus events on failure.
- These test-harness controls do not establish the exact cause of an old trace
  without event data, and do not replace cross-application/manual native-pointer
  testing. Do not solve intermittent failures by weakening assertions or retries.
