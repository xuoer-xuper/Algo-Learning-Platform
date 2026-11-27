# A4b2 Prepush Daily Hover Incident Review

Date: 2026-11-26. Independent read-only trellis-check.
Source: c45e86f, codex/drizzle-streak. No product/test changes or native reruns.

## Observed Evidence

- Original wide test fails at the first mixed visited chart, point index0,
  spec133 -> helper81. The earlier visibility assertion passed; the subsequent
  label assertion observed an empty paragraph 43 times over20s instead of the
  missing-day label. Those are sequential observations, not proof that the
  empty label and visible Tooltip coexisted at the failure moment.
- Preserved trace.zip has test.trace and two resources only, no browser trace,
  DOM snapshots, trusted input events or Redux state. Error context has correct
  four category labels but no Tooltip payload. That is compatible with an
  inactive/hidden Tooltip, but does not prove the cause.
- Parent trace extraction identifies first-dot bounds x293.666687..301.666687,
  y720.895874..728.895874, target298,724. This is inside the recorded bounds and
  incorporates the prior fractional-MouseEvent rounding repair. It does not
  prove actual delivered coordinates, hit target or unchanged later geometry.

## Installed Recharts 3.10.1 Mechanisms

Paths below are under algo-electron/node_modules/recharts/lib.

- chart/LineChart.js:12 allows axis Tooltips only. Item-mode labels are not a
  supported explanation for this chart. TrendPanel supplies no syncId,
  defaultIndex or active override; explicit cross-chart synchronization returns
  early without syncId (synchronisation/useChartSynchronisation.js:288).
- state/selectors/combiners/combineTooltipInteractionState.js:36 prioritizes
  active mouse, then keyboard, then sync; otherwise returns noInteraction with
  indexnull. state/tooltipSlice.js:161 mouseLeaveChart clears mouse active flags.
  setMouseOverAxisIndex at185 disables keyboard activity. Keyboard focus can
  activate index0, but original trace has no focus/state evidence implicating it.
- combineActiveLabel.js:11 returns undefined for a null active index or missing
  tick. component/DefaultTooltipContent.js:139 renders empty label for undefined
  and skips labelFormatter. Tooltip.js:152 empties payload when inactive;
  TooltipBoundingBox.js:96 hides without active/nonempty payload. Thus a leave
  or out-of-plot event after a successful visibility check can produce exactly
  the later empty-label assertion without invoking an invalid category mapping.
- TrendPanel.tsx:21 uses the current chart array in its inline formatter. NULL
  produces the explicit missing-day label; invalid category or absent row gives
  empty. Complete steady-state ordinal ticks map index0 to numeric category0.
  A visible-empty state would require evidence of missing/stale ticks or an
  invalid category; the original trace does not contain that evidence.
- mouseEventsMiddleware.js:69 captures relative pointer at event time, then
  reads fresh state in a default RAF callback at75/108. getRelativeCoordinate.js
  uses actual client coordinates, currentTarget bounds and scale, rounded to
  integers. util/getActiveCoordinate.js:83 includes both X and Y plot bounds.
  Geometry/data or a later event can therefore matter after boundingBox capture.
- RAF id/latestChartPointer are module variables at mouseEventsMiddleware.js:41,
  while each chart has its own store (state/RechartsStoreProvider.js). Another
  chart event can cancel pending work in that shared module. This is a concrete
  source-level mechanism, NOT evidence it happened in this incident.
- Chart data uses effect cleanup/setup (context/chartDataContext.js:15/24);
  XAxis replaces settings in layout effect (cartesian/XAxis.js:51/58) and removes
  only on unmount. Store identity is retained by useRef. Inline formatter
  identity alone is not proof of lost data or a need to remount/memoize charts.

## Findings (fixed)

None. No causal product/test repair is justified by the captured failure.

## Findings (not fixed)

The native UI incident remains unresolved. Missing original trusted-event,
geometry and interaction-state evidence prevents selecting between a later
leave/out-of-range event, stale selection/data or another native lifecycle
interaction. This is not a proven streak regression or repaired UI defect.

## Verification And Recommendation

- Source/static review only in this diagnosis; no lint/type/native reruns needed
  for a docs-only artifact. Prior A4b2 reviewer checks remain recorded separately.
- Parent reports bounded diagnostic passes: exact-spec traced two viewports,
  two additional instrumented wide runs, and one lean wide run. These establish
  non-reproduction, not root cause or a code fix. Source810 remains unchanged.
- Preserve original failure and diagnostic evidence. One normal unchanged
  prepush retry is reasonable after this bounded investigation, not a retry
  loop or a claim the defect is fixed. If it fails again, stop and capture trusted
  mouse/pointer/leave/focus/scroll events plus simultaneous Tooltip visibility,
  label/payload, target/geometry and interaction state before changing anything.
- Do not add sleeps, forced focus, generic remount/memoization, disabled animation,
  repeated hover retries, weaker label assertions or formatter fallbacks without
  causal evidence. No smallest causal code fix is established at present.
