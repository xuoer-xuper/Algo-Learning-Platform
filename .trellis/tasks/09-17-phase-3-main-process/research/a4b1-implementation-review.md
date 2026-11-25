# A4b1 Daily Reads: Independent Implementation Review

Date: 2026-11-21. Base: ac7478d. Review in the C worktree only. This is an
in-progress review record, not whole-slice acceptance or a completed phase.

## Scope And Current Findings

- Reviewed the explicit parent-approved four-query, nullable read shape and
  ordinal chart boundary. No design expansion into streak/list/recompute.
- No production finding or product/test edit so far. Frozen DB files are ready
  for the parent-owned native gate; reviewer has no pending DB modifications.
- UI worker owns diagnosis of the initial real-Electron hover failure. Both sizes
  reached mixed-chart dots, but the Tooltip stayed hidden. Keep the real pointer,
  count/label and responsive assertions. Do not claim native UI acceptance from
  jsdom keyboard tests; cause and final repair remain pending.

## Independent Verification So Far

- Supported Node22.23.2. Both real TypeScript programs pass; scoped strict ESLint
  passes for all thirteen changed/new source/test/runner files.
- Focused consumer tests: five files/71 tests pass (daily schema9, real mounted
  Recharts/loader8, AI/Coach/snapshot/period4, timestamp schema39, async surfaces11).
- Focused DB: daily differential99 plus unchanged statsDate2 pass (2files101).
- Independently extracted old HEAD and oracle via TypeScript AST: all six SQL
  literals match exactly; all four emitted function bodies match after only the
  explicit DB injection/name/type seams and comment/whitespace normalization.
- Protected schema, Drizzle resources, migrations, shared time, stats date/streak/
  recompute and runtime loader/exporter have no diff from the accepted base.
- Parent owns actual Electron native/UI/full/build/source-snapshot/CI gates. No
  native, UI, global or build command was run by this reviewer.

Logs: algo-electron/tmp/drizzle-a4b1-review-{types,lint,ui,db}.log.

## Contract Inspection

Queries wrap the current lifecycle connection each call, keep six actual SELECT
branches, named native LIMIT and the original if(days) branch. Filtered queries
prepare before the existing localDateDaysAgo evaluation. All columns, metric
sources, row order, lexical cutoff and tombstone inclusion are unchanged. No
Date decoding, extra tie sort, writes, repair, transactions or notifications.

Only the three daily read schemas widen local_day to string|null; the repository
alias and type-only AI import reuse the shared seven-field shape. Inputs and
integer instant validators remain unchanged. TrendPanel keeps the original two
arrays/count lines and presentation; each ordinal category maps through its own
array for tick and Tooltip, with guarded number/integer/nonnegative/existing-row
lookup. NULL is display-only missing date; raw strings retain old formatting.

The frozen oracle is independent of the replacement queries. Its unchanged date
helper is additionally pinned by explicit cutoff/errors/clock traces. Per-read
snapshots retain all rows/schema/ledgers/change counts/transaction state. Native
cross-fixture normalization is limited to migration initialization applied_at,
using the established A4a helper; per-read ledger immutability remains checked.

## Remaining Acceptance

Complete real-Electron hover diagnosis and review any test repair, then parent
serial native/UI/full/build gates, screenshot inspection, source hash verification
and remote CI. A4b2/A4c/A4d planning research is excluded from current product
acceptance. No release, Git operation, D-worktree edit or recursive agent used.

## Parent Native Gate Update

Parent reports the exploratory serial test:db gate passed:37 files/776 tests,
44 native repository groups (four new daily groups), import/safety/interruption
and performance checks. Log: algo-electron/tmp/drizzle-a4b1-db.log. No reviewer DB
fix is pending and no product/test file has been changed by this reviewer. Final
UI/full/build/source freeze/CI acceptance remains pending; this evidence does not
turn the unresolved UI test into a pass.

## UI Pointer Diagnostic And Repair Review

Reviewed the parent's real Electron captures in
algo-electron/tmp/drizzle-a4b1-hit-probe-{1280,800}/geometry.json and the worker
repair in tests/ui/daily-trends.pw.spec.ts. This is concrete fixture-coordinate
boundary evidence, not an inferred animation race or new production regression.

At DPR1.5 both captures hit the actual first circle with a trusted pointer event;
elementFromPoint reports that same chart/dot and no active transition. The chart
left edges are260.666687 and196.666672 CSSpx. Its first dot is SVGcx37. The requested
centers are297.666687 and233.666672, but delivered trusted MouseEvent.clientX is
297 and233. PointerEvent retains the fraction. Recharts listens to mousemove and
getRelativeCoordinate computes round((clientX-left)/scaleX), yielding36 for both.
The pinned3.10.1 isInCartesianRange requires x>=offset.left. Default left margin5
plus the existing YAxis width32 makes that boundary37. These samples are outside
the plot even though they hit the visible circle. The observed Tooltip remains
hidden; no sleep or animation change can establish a valid in-range input.

Independently called the installed getRelativeCoordinate/isInCartesianRange
functions using the captured geometry/events. Both original inputs yield x36 and
false; ceil toward the interior yields x37 and true. This numerical probe supports
the cause; it is not itself replacement real-Electron acceptance.

The worker repair changes only test pointer coordinates: round each dot center to
an integer inward toward its chart center, assert that point remains inside the
dot bounds, then execute the same real page.mouse.move and unchanged visible/
label/count assertions. No production changes, synthetic dispatch/state injection,
forced tooltip, retry, wait, animation disable, timeout or weakened assertion.
For the fixed small finite fixtures, at most a one-CSS-pixel center adjustment
remains within the circle and does not cross category midpoints. Existing point
count/coordinate and tooltip count assertions remain decisive. Scoped strict ESLint
passes after repair; parent native UI rerun and visual inspection remain required.

No reviewer source/test edits. Repair is ready for parent-owned UI validation.


## Resumed Console Diagnostic Review (2026-11-23)

The repaired native UI run reached its final console assertion: both widths
passed chart coordinates, real hover labels/counts, range transitions and raw/
NULL/reorder/empty cases, but captured two React flushSync lifecycle warnings.
This is a failed test, not accepted UI evidence. Parent owns exact native replay.

Independent source inspection finds only ShellRouter calling flushSync in
application source, at the passive-effect burst branch (line153) and transition
callback (line172). The absent-View-Transition fallback invokes that callback
synchronously inside the effect; the native View Transition callback normally
runs later. Recharts lib/es6 contains no flushSync call. This narrows likely
origins, but does NOT identify the original two warning stacks/stages.

Focused Node22.23.2 transitions.test.tsx passes8 tests but emits the same warning
in three cases: synchronous transition mock, no-API fallback, skipped-transition
mock. Log: tmp/drizzle-a4b1-review-transition-probe.log. Those tests assert visible
routes and rejection handling, not console cleanliness. Thus an existing router
lifecycle misuse is real in the no-API/synchronous path; it cannot be used as
proof of the native A4b1 failure's source or as permission to filter warnings.

Parent's diagnostic native driver home/early/ready modes captured no errors.
Those bounded probes do not contain every hover/refetch/empty stage of the
failing test. Exact full-scenario console stacks and stage capture are pending.
No product/test file changed by this reviewer. If the stack proves ShellRouter,
fixing the passive-effect/fallback lifecycle is outside the approved daily chart
boundary and needs a separately recorded parent acceptance plus route-burst/
stale-callback/no-API/real-transition regression coverage. Do not add sleeps,
console filters, production animation disabling or a test-only mock workaround.

Resumed reviewer checks: both TypeScript programs pass and strict scoped ESLint
passes for the13 A4b1 production/test/runner files, including diagnostic UI spec.
Logs: tmp/drizzle-a4b1-final-review-{types,lint}.log. Parent must still supply the
exact native console stack before either an in-scope test fix or separately
approved router change; no full acceptance claim.

## Router Lifecycle Scope Recommendation (2026-11-23)

Independent extraction of both current full-test trace ZIPs confirms two warning
stacks each, captured at wait-api and mixed-all. Each enters ReactDOM.flushSync
from App-BlbaxEXM.js zero-based line1 column42027. Source extraction resolves this
to the ShellRouter burst effect branch, not a Recharts call. Parent's bounded
no-warning probes therefore do not exonerate this existing router defect.

GO for a separately parent-approved local lifecycle correction, not a general
routing redesign. Preferred minimal shape: let private maybeTransition pass a
boolean nativeSnapshot context to its callback (false only in synchronous
no-API fallback; true only inside native startViewTransition callback). Keep
its capability check, skip/promise handlers and liveTransition identity cleanup
at their existing locations. The effect callback first retains the exact
version check, then uses flushSync only for nativeSnapshot=true; false uses
direct setRenderTab. Burst branch also uses direct setRenderTab. This preserves
stale callback no-op BEFORE any flush, which would be lost if the helper simply
wrapped every callback in flushSync. No new timers, microtasks, cancellation,
clock calls, threshold changes, readiness delays or transition teardown policy.

An explicit no-API branch in the effect after the existing version increment is
also safe, but do not leave a second fallback that still invokes the flushing
callback; avoid moving the feature check ahead of same-ID/burst decisions.
Do not newly skip/clear an old transition on no-API fallback: old behavior only
invalidates its callback by version. Old finished handlers must remain unable
to clear a newer live transition. Leave same-ID metadata behavior and component
unmount semantics alone; those are not this demonstrated lifecycle bug.

Required tests before acceptance:
- Capture console errors without message filters; controlled performance clock
  covers initial/sub200 burst and exactly200 nonburst, retaining Date fallback.
- Native-like transition double queues callback outside the effect, does not
  suppress it on skip, handles all three promises. Existing synchronous mocks
  manufacture lifecycle misuse and must no longer represent the native API.
- No-API path directly updates rendered route with no warning and no new API
  call; same-ID update does not transition; version invalidates prior callback.
- Burst skips prior transition, increments version and renders newest route;
  manually deliver skipped old callback later and prove it cannot overwrite.
- Native callback makes a preloaded route wrapper DOM observable BEFORE callback
  return, proving flushSync is retained for the snapshot boundary. Lazy content
  need not resolve before snapshot; route wrapper/fallback is the contract.
- Prior finished/rejected promises do not clear/cancel the newer live transition;
  skipped ready/update/finished rejections remain handled without page errors.
- At least burst/no-API no-console regressions fail against old source; do not
  merely test the new helper in isolation. Parent real Electron full scenario
  keeps every current console/hover/count/range assertion and screenshot checks.

Product scope should remain ShellRouter.tsx plus existing component transitions
suite; new native routing coverage only if existing daily full scenario cannot
prove the required native callback boundary. This is a recommendation, not
implementation approval or a claim that code/tests have been changed.

## Final Router And Slice Review (2026-11-25)

No actionable production/test finding remains in the approved A4b1 slice or its
explicit router prerequisite. This reviewer made no source/test edits. The
ShellRouter delta is limited to direct effect updates for burst and no-API
fallback, with nativeSnapshot=true only inside the real native callback. The
version guard precedes both update/flush paths. Existing200ms threshold, clock
selection, same-ID behavior, skip/live/version ordering, rejection handlers and
identity-guarded settlement remain intact. No scheduler, route API, CSS or
unmount policy was added.

Independently inspected the queued transition tests: native callbacks are
explicitly delivered outside the effect, including callbacks delivered after
skip. Assertions cover wrapper commit before callback return, burst199 versus
native200, no-API fallback without extra cancellation, stale no-op before flush,
older fulfilled/rejected settlement, no unhandled rejections, same-ID metadata,
and the Date fallback. Lazy mounted routes finish before teardown. No new
warning filter or assertion/type bypass was introduced.

The recorded original-source red run has FOUR relevant warning failures:
no-API, initial sub200 burst,199ms burst/stale, and fallback invalidation. Its
fifth failure was an overbroad performance.now total-call assertion also counting
React's own calls; that test-authoring issue was corrected separately and is not
regression evidence for the router defect. The final test still verifies same-ID
no-transition behavior, while the source clock branch is unchanged.

Native UI screenshot readiness waits for the actual Recharts line draw dasharray
to disappear; installed Line.js produces this animation-only dasharray until its
visible-length animation completes. It does not disable animation or replace
mouse input. Original zero-console, precise count/label/visibility, independent
NULL slots, finite/All and responsive assertions remain.

Independent Node22.23.2 validation: both TypeScript programs PASS; strict scoped
ESLint for all15 A4b1 source/test/runner files PASS; focused4files35 tests PASS,
including all14 transition tests with no lifecycle warnings. Logs are
algo-electron/tmp/drizzle-a4b1-router-final-review-{tests,types,lint}.log.
Previously independently verified oracle/query/native contracts remain unchanged.

Parent reports final full gate PASS:218files2490tests, native44 and UI16, with
four settled screenshots visually inspected and all existing guards/smokes green.
Coverage76.21/70.30/73.65/79.39. Parent owns final build/source-hash/Git/CI gates;
this reviewer ran no native/UI/global/build command, changed no D-worktree file,
and spawned no agents. Review is ready for the normal commit/CI sequence after
those parent gates; this does not mark phase3 complete or authorize a release.
