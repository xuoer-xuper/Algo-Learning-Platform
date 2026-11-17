# Research: R5 Full-Stack Millisecond Contract Map

- Query: Define non-overlapping implementation ownership and exact live timestamp contracts for the 030 migration and full-stack numeric time transition.
- Scope: Internal, read-only source inspection. No Git operation, user database access or application edit.
- Date: 2026-11-04

All application paths below are relative to `algo-electron/`. The 82-column inventory and historical producer evidence remain in `r5-feasibility.md` and `r5-git-history.md`; this document maps consumers and implementation boundaries rather than duplicating the schema list.

## Findings

### 1. Freeze the boundary contracts before parallel edits

Recommended common API (parent-approved paths):

```ts
// src/shared/time.ts: pure; no Node/Electron/DB import
nowMillis(): number
toLocalDay(timestampMs: number): string // YYYY-MM-DD
formatForDisplay(timestampMs: number): string

// electron/shared/time.ts
// Re-export the pure helpers; retain frozen nowBeijing ONLY for released 001-029.

// electron/shared/legacyTimestamp.ts
parseLegacyTimestamp(value: string, policy: 'local' | 'utc8'): number
// Explicit Z/offset always wins; invalid non-null values throw.

// electron/db/timestampColumns.ts
// Explicit table/column inventory + legacy policy, shared by migration/import.
```

The exact parser API can accept an explicit zone/options object if the migration design needs it, but one owner must publish it before runtime/import work. Do not implement a second parser in backup or VJudge. Integer millisecond validation should reject nonfinite/unsafe values; nullable callers preserve null explicitly. Date-only values are not accepted as instants by accident.

Do not change the three shared helper names between workers. Frontend imports `@shared/time`; main imports relative paths or the main re-export. Keep parsing of legacy external text on the main side, not in renderer display.

### 2. Values that remain strings or existing numbers

- `local_day`, `snapshot_date`, period `start_date/end_date/prev_start_date/prev_end_date`, and IPC `startDate/endDate` are **calendar day keys**, not instants. Keep strings.
- `src/shared/types/ipc/stats.ts:25` `recomputeDailyInput`, and `ipc/ai.ts:34,42` summary period schemas remain YYYY-MM-DD. Correct misleading “Beijing-local” comments to system-local semantics without changing their wire shape.
- `electron/ai/summary/periodSummaryDates.ts:3,9`: implement calendar arithmetic using local day boundaries/UTC calendar ordinals, not `days*86400000` across DST. `getSnapshotsInPeriod` in `periodSummaryAggregation.ts:7` compares day keys lexically and stays valid.
- `duration_seconds`, `active_seconds`, `runtime_ms`, `latency_ms`, cache TTLs, user-script intervals and `ProblemSession.started_at/last_active_at` are already numeric in their stated units. Do not multiply all number fields by 1000.
- `user_scripts.run_at` is a lifecycle enum; `user_script_update_state.last_modified` is an HTTP validator. Neither is a date conversion target.
- `electron/browser/tabSessionSnapshot.ts` and `electron/windows/applicationSessionSnapshot.ts` persist version/window/tab/bounds data with no timestamps. `electron/app/config.ts` has no historical instant fields needing migration. Do not churn these snapshots/config files.
- `raw_json`, AI-generated Markdown/content, user-script value JSON, arbitrary metadata and URLs must not be recursively date-converted. Only explicitly application-owned fields have a numeric contract.

### 3. Core migration/repository owner

Own all `electron/db/**` live code and DB tests; do not edit released `migrations/001-029`. This avoids having SQL/date queries and their row types split between workers.

| Area | Concrete touch points and semantic changes |
| --- | --- |
| Row/write types | `repositories/problem/types.ts:12,39,65`, `submission/types.ts:9`, `account/types.ts:8,23`, `cookieRecord/types.ts:7,22`, `credential/types.ts:16`, `userScript/types.ts:26`, `userScriptRuntimeRepository.ts:15,49,75`, `aiOutput/types.ts:15`, `aiContextSnapshot/types.ts:8` -> numeric instant fields; preserve nullable/optional semantics |
| All mutation clocks | problem/submission/account/site/cookie/credential/script/Coach/AI mutations replace live old clock calls with `nowMillis`; fixed UTC+8 formatting is no longer used for new writes |
| Visit input | `problemVisitRepository.ts:13,23` input now/leftAt numeric, localDay still string; preserve R4 transaction notification wrappers |
| Today overview | `problem/overview.ts:27` currently binds today/next-day strings against `entered_at`; compute numeric local-midnight bounds |
| Deletion/stat rebuild | `problem/mutations.ts:86-95`, `stats/recompute.ts:115-119` use `substr(instant,1,10)`; replace with numeric values converted through toLocalDay, preserving affected-date sets and transaction notifications |
| Stats | `stats/date.ts:30` localDayFromTimestamp must consume number; `stats/recompute.ts:18` numeric interval boundaries and numeric bookkeeping; explicit DB-injected internal recompute function needed during migration before global getDb exists |
| Overdue | `stats/insights.ts:178` currently julianday(text) and date-string cutoff; use bound nowMillis / day thresholds consistently, not julianday(integer-as-Julian-day) |
| Ordering/aggregation | SQL MIN/MAX/ORDER BY work on INTEGER, but annotations in `submission/queries.ts:51`, `firstAc.ts:16,70`, `stats/insights.ts:66`, `problem/overview.ts:52`, `problem/omnibox.ts:17` must change; `omnibox.ts:230` Date.parse -> finite numeric comparator |
| Coach repository APIs | `eventsRepository.ts:103,111,131,148`, `feedbackRepository.ts:68,91,102`, `interventionsRepository.ts:148,175,186,212,251,262`: since/until and created_at numeric; contest duration computes direct difference/1000 instead of Date.parse at235/273 |
| Cookie summary | `cookieRecord/queries.ts:42` type predicate/filter/sort assumes strings; use nullable numeric values and numeric min/max, including epoch zero |
| AI snapshot storage | `aiContextSnapshot/serialization.ts:9` createdAt numeric; context JSON handling must agree with runtime AI version contract; queries parse cached JSON by a bare cast today |

Core owns `src/shared/time.ts`, `electron/shared/time.ts`, `electron/shared/legacyTimestamp.ts`, `electron/db/timestampColumns.ts`, migration030, runner/connection safety and stats recompute seam. Runtime owner consumes these APIs; shared/renderer owner does not edit them.

### 4. Runtime owner: outside DB and shared schemas

Own `electron/**` except `db/**`, `shared/time.ts`, `shared/legacyTimestamp.ts`, and common helpers explicitly allocated to core. In particular own `electron/shared/types.ts` and `electron/adapters/types.ts`, which are not renderer shared schema files.

#### Submission/tracking ingress

- `electron/shared/types.ts:25`: `SubmissionData.submittedAt` is the canonical numeric boundary. Once an adapter returns a ScrapedSubmission, no date string should enter repositories.
- `adapters/types.ts:16`: `TableParseContext.now:()=>number`; `GenericTableScanner` / `adapters/shared/tables` / `domScraper` injection follows this.
- `adapters/sites/codeforces/submissions.ts`: API seconds -> `seconds*1000`, not format then parse. `rating/codeforces.ts:48` identical change for contestAt.
- `submissions/scrapers/luoguScraper.ts` epoch producer -> milliseconds directly. PTA, LeetCode, Nowcoder, generic realtime producers -> nowMillis when upstream time is absent.
- `adapters/sites/vjudge/submissions.ts:204-226` is the exceptional external text ingress: picks submittedAt/submitTime/createdAt strings verbatim today. Parse using the common strict local policy, honor explicit suffixes; retain the existing fallback only when no source value exists. A malformed supplied timestamp is not the same as absent and must not silently be replaced with now.
- `adapters/types.ts:30` `SubmissionDetectionPayload.detectedAt` is an internal hook event timestamp. Its injected producers in `submissions/scriptedRealtimeHook.ts:33`, `adapters/shared/frontendVerdictHook.ts:443,490`, site hooks `codeforces/leetcode/nowcoder/vjudge`, and PTA hook strings should emit `Date.now()` (numeric). These are our injected scripts, not an external protocol requiring ISO.
- Keep page payload `response`/`rawJson` raw for provenance, and do not trust detectedAt as verdict authenticity. Sender/token/payload protections remain unchanged.
- `TrackingService.ts:92`: now.slice(0,10) -> toLocalDay(now); elapsed seconds use direct number subtraction. `tracking/orphanProblemVisits.ts:9` updatedAt numeric, SQL fallback and existing tests must align.
- `SubmissionBatchWriter.ts:66` receives numeric submittedAt and retains string affected-day sets. Preserve partial-autocommit R4 notification behavior.

#### Coach/AI/runtime clocks

- `CoachFeedbackStore.ts:45,48,275,296,352`, `defaultFeedbackRepository.ts:29,38,43`: numeric repository rows/since/counter restoration; no Date.parse or string threshold comparison.
- `CoachEventBridge` builds events with numeric created_at. `rules/RuleEngine.ts:76` injectable `nowIso:()=>string` is a hidden producer contract: rename/replace with numeric clock (coordinate all tests), do not keep a second formatted clock.
- `CoachOrchestrator.ts:669,708-709,816-822,854-855,876,1366,1418`: current contest entry/time snapshots, metrics since/until, timeline last activity, firstAcMap and audit records numeric. ContestGuard's internal `enteredAt` is already numeric; stop converting it to ISO.
- `coach/llm/LlmHintTypes.ts:40` submitted_at numeric; `ContextGatherer`, `PromptBuilder` and `LlmHintService` should format only at human-readable prompt boundaries. Existing Date.now TTL timestamps remain numbers.
- `scripts/UserScriptInstaller.ts`, `UserScriptResourceCache.ts`, `UserScriptUpdateService.ts:161`: new scheduling/fetch timestamps and comparisons numeric; do not change HTTP last_modified/etag.
- `notes/NoteService.ts` updates clock and row types/returned shared NoteRecord; filesystem paths/body unchanged.

#### Non-DB cross-IPC instants (easy to miss)

| Producer | Shared counterpart | Required change |
| --- | --- | --- |
| `submissions/RealtimeSubmissionDiagnostics.ts:25,34,44,54,77` | `shared/types/submission.ts` lastPage/lastHook/lastDetection `.at` | numeric now |
| `diagnostics/BrowserDiagnostics.ts:15,41` | `shared/types/browser.ts:119` recent `.at` | numeric type+producer |
| `downloads/DownloadManager.ts:141,166,185` | `shared/types/browser.ts:104` finishedAt | use injected numeric clock directly |
| `downloads/userScriptNavigation.ts:146-147` | `shared/types/scripts.ts:36` PendingUserScriptInstall.createdAt | numeric createdAt; reuse numeric TTL clock rather than format then duplicate createdAtMs |
| `CoachOrchestrator` snapshot/event outputs | `shared/types/coach.ts:192,198,400` | numeric entered_at/last_event_at |

These are not excused as logs: they cross the app's typed IPC boundary even though not persisted in SQLite. Preserve actual logger timestamps and diagnostic file-name text as explicitly documented human/protocol exceptions, not payload formats.

#### Backup export/import owner and normalization

- `backup/types.ts:1,9`: export `schema_version:2`, `exported_at:number`; old1 is a distinct input compatibility path, not the canonical internal type.
- `learningDataExport.ts:158` parse old1/new2 into one canonical numeric object **before** preview, conflict equality, import confirmation caching and DB writes. `backupService.ts:72-88` caches parsed data from file, so normalization there propagates to both phases.
- Timestamp conversion should use the same column inventory/policy as030, limited to the six exported tables. Export still excludes cookies, credentials, raw_json, notes/assets and local paths.
- `markAffected` at file end currently receives both timestamp fields and `user_daily_stats.local_day`. Do not just change `typeof string` to number: split explicit day-key handling from instant handling, or supply discriminated parameter functions. Otherwise daily-stat imports lose affected-day recompute.
- `differs` stringifies scalar values. Canonicalize timestamps first so old UTC/offset spellings equivalent to stored millis do not generate false conflicts.
- Numeric v2 payloads need finite integer validation (do not accept seconds as inferred milliseconds). Malformed v1 timestamps fail preflight before writes.
- `backupService.backupTimestamp`, `registerBackupIpc` filename dates and `sqliteMigrationBackup` filename/failure-log ISO fields are human/audit conventions; leave/replace with explicit formatting, not DB data conversions. No new export fields.

#### AI-owned JSON / Markdown contract

- `ai/contextExporter.ts:18` `AI_CONTEXT_VERSION=1`, `contextTypes.ts` timestamps: exported_at, wrong_problems[].last_attempt, unreviewed_problems[].last_visited_at, recent_activity[].occurred_at. Make these numeric and bump context version to2.
- `ai_context_snapshots.context_json` already persists this app-owned shape. Core migration owner must convert exactly those known fields/version, or runtime decoder must normalize old1 with explicit policy; prefer conversion in030 plus defensive version-aware decode. Runtime/core must agree before writing either side. Do not recursively rewrite user script values/raw responses/AI free text.
- `ai/recommendations/rules.ts:9` daysSince accepts milliseconds; generated_at in recommendations/weakness/reviewPlan/periodSummary becomes number. `summary/periodSummaryTypes.ts:42` source snapshot created_at numeric while snapshot_date stays string.
- `contextMarkdown.ts:43`, `reviewPlanMarkdown.ts:7`, `periodSummaryMarkdown.ts:10` format these instants for human text. Without this, Markdown reports show bare 13-digit integers or call `.replace` on numbers.
- `repositories/site/importExport.ts:11` exportedAt is a versioned site-config document timestamp but preview ignores it. Core owner should either numericize metadata with a documented version policy or keep it as a named external-document exception; do not silently confuse it with the six-table learning-data schema_version.

### 5. Shared/renderer owner

Own `src/shared/types/**`, renderer sources excluding core-owned `src/shared/time.ts`, and renderer/component/UI fixtures. No main-process implementation edits.

Schema instant fields requiring z.number (retain optional/nullability):

- `problem.ts`: last_visited_at, first_seen_at, OmniboxSuggestion.lastVisitedAt.
- `submission.ts`: submitted_at and all diagnostic `.at` fields.
- `stats.ts`: lastActiveTime, TimelineEvent.occurred_at, last_visit, last_attempt, last_visited_at. `local_day` stays string.
- `ai.ts`: recommendation.source.last_attempt, generated_at, AIOutputRecord.created_at/updated_at.
- `notes.ts`: updated_at.
- `rating.ts`: last_synced_at, created_at/updated_at, contest_at.
- `credentials.ts`: lastUsedAt, createdAt/updatedAt; no secret shape changes.
- `cookies.ts`: earliest_expires_at, last_seen_at; never add values.
- `browser.ts`: finishedAt and recent diagnostic `.at`.
- `scripts.ts`: PendingUserScriptInstall.createdAt; `run_at` is not here and stays enum.
- `coach.ts`: event/intervention/feedback created_at; contest_start/end; audit exported_at; snapshot/event contest.entered_at and last_event_at; metrics/bundle since/until; visit entered_at/left_at; timeline submitted_at/created_at/first_seen_at/last_visited_at/first_ac_at/last_activity_at; ProblemAcStatus.first_ac_at. ProblemSession started_at/last_active_at already numeric.

Renderer conversion/format targets: `Dashboard.tsx:177`, `DashboardListsPanel.tsx:31`, `LearningOverviewPanel.tsx:9`, `CredentialsPage.tsx:48`, `RealtimeSubmissionPanel.tsx:13`, `ProblemDetail.tsx:166,173,211`, `NoteList.tsx:45`, `CoachMetricsView.tsx:71`, `SessionTimelineView.tsx:70`, `computeMetrics.ts:103,113`, `mockMetricsBundle.ts`. Also `RatingPanel` chart data can use numeric x values or format at chart boundary; do not convert labels back into persisted strings.

Numeric zero is a valid instant. Existing truthy checks like `if (!s)`, `if (firstAcAt)`, nullable sorts/filters and optional timestamp formatting must use null/undefined checks so epoch0 tests pass. Keep R4 query identity, refetch retention, selected account, note drafts and capture live-wins unchanged.

### 6. Concrete three-worker split and test ownership

| Worker | Files/responsibility | Tests owned |
| --- | --- | --- |
| A: core migration | `electron/db/**` including all row types/mutations/query SQL, migration runner/connection/030, `src/shared/time.ts`, `electron/shared/{time,legacyTimestamp}.ts`, inventory | `tests/db/**`, new shared time/parser tests, `tests/verify.mjs` native wiring; historical fixture SQL remains immutable, upgrade assertions become30 |
| B: runtime | `electron/**` outside A, including `electron/shared/types.ts`, adapters/submissions/tracking/notes/scripts/credentials/cookies/Coach/AI/backup/download/diagnostics + necessary IPC declarations | `tests/{adapters,submissions,tracking,notes,scripts,coach,ai,security,downloads,diagnostics}/` affected tests; coordinate `tests/security` only timestamp fixtures, no trust-rule changes |
| C: shared+renderer | `src/shared/types/**`, renderer format/arithmetic/mock data, preload only if genuinely required (types normally infer), component/UI fixtures | `tests/components/**`, `tests/ui/**`, `tests/ipc/**` type/output fixtures; avoid UI-gate fix worker overlap until it finishes |

Parent owns docs/spec/task metadata, commit/push/full gates and actual-user-data safe-copy validation. Do not allow A/B both to edit AI snapshot JSON conversion or stats helper signatures independently: A publishes parser/inventory/recompute signatures first; B publishes AIContext v2 field mapping to A; C publishes zod changes to both. Core owns repository typechecking fixes even when discovered by B/C.

### 7. Required behavioral checks beyond compilation

1. Fresh install, reconstructed21/24/29→30, second initialization, rollback after commit/error, FK/index/BLOB/nondate JSON preservation, all82 columns and ledger integer.
2. Explicit UTC/offset equality and local/fixed+8 distinction under UTC/Shanghai/DST zone; milliseconds, null, zero, invalid dates and DST policy.
3. Day-boundary visits/submissions/deletions/imports update correct local aggregates; no `substr(number)`/julianday(number) regression; period day-string interfaces still valid.
4. v1 learning export normalization vs equivalent v2 has no false conflict; invalid timestamp rejects before transaction; import recompute sees numeric instants and direct day keys.
5. AI snapshot old JSON fields converted/versioned while user date-like strings remain untouched; Markdown readable, traceability and sensitive-data tests remain green.
6. Adapters write numeric submittedAt; hook detectedAt numeric; preserved trusted sender and final-verdict checks; no seconds/milliseconds confusion in rating/Codeforces/Luogu.
7. Coach numeric since comparisons and contest audit durations; mock metrics expected ratios unchanged; zero instants and refetch data retention in renderer.
8. R4 notifications remain after commits only. Migration-time stats work must not call global getDb before assignment or leak precommit invalidations.

## Files Found / Related Specs

- Main source and shared/renderer files cited above form the exact working map; targeted searches excluded `electron/db/migrations/**` from live-helper lists.
- `.trellis/spec/shared/timestamp.md`: millisecond target and display-only formatting.
- `.trellis/spec/project/domain-rules.md`: immutable migrations, IPC trust, credential/Cookie/AI boundaries.
- `.trellis/spec/project/data-refresh.md`: postcommit notification and renderer identity guarantees.
- `.trellis/spec/project/historical-database-fixtures.md`: reconstructed vs real evidence distinction.
- `.trellis/spec/backend/quality.md`, frontend type-safety: main relative imports, renderer `@shared` imports.

## External References

No web sources required. Decisions derive from current checked-in source, known historical research, and the project's pinned TypeScript/Electron/SQLite test setup. Migration-specific FK/DST parser details belong to the parallel `r5-030-design.md`, not a second competing implementation here.

## Caveats / Not Found

- Broad textual matches include slice-of-array and string IDs; do not mass-convert every `.slice`, `At`, `_at` or string type.
- These are ownership/interface recommendations, not completed implementation or proof of all producer coverage. Full typechecks plus targeted source scans and native/renderer tests remain required.
- Site export metadata version policy and AI snapshot decoder strategy need one explicit final decision by parent/core/runtime, not divergent worker assumptions.
- No real user data was accessed; no application/test/spec/Git files were changed by this researcher.
