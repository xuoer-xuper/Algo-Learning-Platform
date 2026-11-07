# A1 Pre-Push Drag Incident

- Date: 2026-11-07; local commit: `1ba968b`.
- Scope: diagnosis only. No product/UI test changes, assertion relaxations, sleeps,
  forced retries, synthetic release events or hook bypasses were introduced.

## Evidence

The initial `git push` was blocked by the complete pre-push `test:ci` gate.
Core (197 files/1665 cases), Electron and the other ten UI cases passed. The native
tab-drag case at `tests/ui/rendererScreenshots.pw.spec.ts:837` timed out: the original
first tab remained at index 0 instead of moving beyond index 3.

The preceding same-checkout `test:all` had passed UI 11/11. The failed trace confirms
initial native/DOM focus, drag class count 1 and edge scroll beyond 250px passed.
It records mouseDown at (36,20), eight-step movement to (619,20) and mouseUp; it
does not contain renderer pointer/capture events or the `finishDrag` payload.
Therefore it cannot distinguish lost/misrouted release, cancellation, changed
target, native drag interception or mixed physical/CDP pointer input.

## Bounded Follow-Up

- An ignored diagnostic harness reproduced the exact original preconditions and
  one-drag flow across ten independent 800x600 Electron launches. It recorded
  pointer/capture/DnD/focus events, drag/scroll state, native window/cursor state
  and `finishDrag` calls without changing production behavior.
- All ten passed: one captured pointerup, no pointercancel/dragstart, targetIndex12,
  successful finishDrag, final index12 and scrollLeft476. The desktop cursor was
  outside the fixture on every run. This does not prove the cursor hypothesis.
- The original unmodified Playwright case then passed `--repeat-each=5` (5/5).
- Independent reviewer agrees there is no evidence-supported product/harness fix;
  the complete unmodified pre-push gate can be rerun, not skipped.
- The full unmodified pre-push retry passed (including UI11/11), then `1ba968b`
  pushed successfully. CI `42373778745` passed both jobs, including renderer smoke.

## Remaining Risk

The failure remains an unresolved transient native-input observation, not a fixed
root cause. A separate bounded test-observability change should attach pointer,
capture, native focus/cursor and finishDrag call/result data on failure so that a
recurrence is diagnosable. Do not replace genuine drag behavior with direct API
reorder calls or loosen final-order assertions.

Local ignored evidence: `algo-electron/tmp/drizzle-a1-push.log`,
`drizzle-a1-drag-failure-trace.zip`, `diagnose-tab-drag.{mjs,json,log}` and
`drizzle-a1-drag-focused.log`. A passing recheck establishes current-checkout gate
success, not an explanation for the original failure.
