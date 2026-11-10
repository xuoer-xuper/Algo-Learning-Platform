# Userscript idle synchronization after pre-push failure

On 2026-11-10 the normal pre-push hook for local commit `5e98409` stopped before any remote update. The full unit gate passed 197 files / 1736 tests and the normal startup Electron smoke passed, then userscript runtime smoke failed because the reload result lacked `v2-idle`. This follow-up was prompted by that actual hook failure; the preceding bounded installer CI review did not discover this separate pre-existing test race.

## Root cause

`userScriptRuntimeBridge.ts` handles `did-finish-load` by calling `markFrameIdle`, which posts a `runtime:phase` / `document-idle` message through the transferred MessagePort. `userScriptMainWorldRuntime.ts` runs the idle scripts when the renderer receives that message. The main-process load event and its promise resolution do not await renderer delivery.

The smoke test waited for `did-finish-load`, then immediately called `executeJavaScript` to read `__raceRuns`. That read can complete before the idle message arrives. The failing four-item array was `v2-start`, `inline-before-hold`, `page-script`, `v2-end`; the missing fifth item was `v2-idle`. The first `/main` load used the same incorrect load-complete assumption. There is no evidence here of a production runtime defect.

## Change

Only `algo-electron/tests/electron/userScriptRuntimeSmoke.test.ts` changed. After the first main-page load and the generation-2 reload, the test uses its existing bounded `waitFor` to observe the actual corresponding idle-script sentinel before reading the final result. The original order assertions and the exact generation-2 array remain unchanged, so unexpected, duplicate or reordered entries still fail. The existing 5-second readiness limit and 30-second watchdog are unchanged. No retries, fixed sleeps, runtime changes or assertion relaxation were added.

## Controlled reproduction and verification

All focused runs used Node 22.23.2 and the real installed development Electron 43.4.0. A launcher set userData, sessionData and logs to a fresh exclusive directory under the worktree's ignored `tmp/` before dynamically importing each bundle. No real application profile was accessed.

The ignored diagnostic script `algo-electron/tmp/userscript-idle-review.mjs` works only on a copied bundle. In delay mode it holds the generation-2 idle MessagePort event and releases it only after the first renderer read of `__raceRuns` has completed. It asserts that its exact mutation seams exist and that the hold/release was exercised. No production or tracked runtime source was modified.

- Red, old test: `algo-electron/tmp/userscript-idle-before-IQkASU/result.json`, exit 1. `stdout.log` records the held event and the exact four-item array before release; `stderr.log` contains the original missing-`v2-idle` assertion failure.
- Green, fixed test with the same controlled delay: `algo-electron/tmp/userscript-idle-after-IJaEcC/result.json`, exit 0. The first readiness read returns false, the held event is released, and the unchanged final array assertion passes.
- Green, fixed test with unmodified runtime bundle: `algo-electron/tmp/userscript-idle-normal-oSCRfF/result.json`, exit 0, full focused userscript runtime smoke passed.
- Lint: pass, scoped ESLint on `userScriptRuntimeSmoke.test.ts`; Prettier reports unchanged formatting.
- TypeCheck: pass, `pnpm run typecheck:tests`.

The existing Electron console-message deprecation notice remains visible and was not suppressed. No full suite, native rebuild, UI suite, hook, Git command or push was run by this follow-up. All three Electron processes and local check processes finished. The parent session owns the normal commit and complete pre-push gate before retrying the push.
