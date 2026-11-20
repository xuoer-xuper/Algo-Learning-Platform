# A3a Submission Reads: Independent Design Precheck

Date: 2026-11-20. Scope: design only; A2g remains another workers' implementation.
No product files, user data, Git state, global/native/UI/build suites changed.

## Verdict

Approved to implement all four submission reads as one coherent bounded slice,
with one additional required parameter-count constraint identified below. No
further product behavior decision is needed. Approval does not accept future
implementation, native results or whole-phase completion.

## Required Refinement: Keep AC Literal Unbound

The original aggregate embeds `verdict = 'AC'` and binds exactly one variable per
input ID. A straightforward `eq(submissions.verdict, 'AC')` adds another bound
variable, shifting SQLite's excessive-variable failure boundary by one. This
would violate the explicitly retained native-parameter-limit behavior even if
ordinary results match.

Use an SQL expression containing the fixed literal, for example
`sql` applied to the column plus literal `= 'AC'`, alongside the genuine `inArray`
builder. The fixed AC literal is not user input; all supplied IDs remain bound.
Do not deduplicate, chunk, normalize, sort, filter or repair the input array.
Independent installed-library generated-query probe with ['a','a','b'] confirmed
`eq(column, 'AC')` emits four parameters, while the fixed literal emits three and
preserves both duplicate IDs. Pin this invariant in native boundary tests.

## Accepted Type And Query Design

- `SubmissionRow` becomes the submission-domain authoritative schema-derived full
  row with raw submitted_at/created_at/updated_at numbers and deleted_at nullable
  number. Nullable id and both currently omitted fields (is_first_ac/deleted_at)
  are retained; current baseline has16 columns. Do not widen or reconstruct data.
- Preserve exported `ProblemSubmissionRow` name as a type-only alias of that
  authoritative row, avoiding duplicate derivation. Keep `FirstAcRow` used by
  unconverted mutation logic distinct. No runtime import/cycle is needed.
- Three full-row readers preserve exact equality, all columns, tombstones,
  NULL IDs/problem IDs where possible, ordering direction only and native text
  binding. Select all columns plus all four raw timestamp overrides without
  Date/Number decoding. A small module-local projection reused by those three
  reads is reasonable; no new shared query framework or problem-query rewrite.
- Platform query uses default50 and named limit Placeholder `.all({ limit })`.
  This keeps negative integer unlimited behavior and fractional/NaN/infinity
  errors. No validation, clamping, numeric-limit omission or SQL-to-type cast.
- Aggregate empty input returns[] before getDb, builder or statement creation,
  including before init/after close and with missing tables. Nonempty input runs
  one grouped query, uppercase AC only, no explicit order, no active-row/parent
  filter, and raw MIN(submitted_at). `min(timestampColumn)` decodes to Date;
  `min(rawExpression)` decodes to String, so neither is equivalent.
- Direct schema-inferred aggregate problem_id:string|null is safe conservative
  typing. Only CoachOrchestrator's internal Map key widens. It still creates
  outward ProblemAcStatus from the existing string-only input list; do not widen
  public metrics schemas or fabricate/replace IDs. Raw MIN numeric declaration
  is valid for nonempty baseline NOT NULL groups, not added storage validation.
- Make read-only TimelineSubmissionPoint.submission_id nullable end-to-end.
  Current SessionTimelineView does not use that ID for actions or keys; no UI
  action policy or renderer change is needed. Parent/request IDs and integer
  timestamps stay strict, and ContextGatherer's last10 ascending projection
  continues its exact privacy allowlist.
- Each nonempty reader wraps current getDb synchronously, with no cached adapter,
  new connection, transaction, writes, events, catch or return-value fallback.
  Query exceptions keep native identity; caller's existing catch is unchanged.

## Smallest Product Boundary

1. submission/queries.ts: all four reads, shared local raw projection if useful.
2. submission/types.ts: authoritative full row and any precise aggregate result.
3. problem/types.ts: type alias only, no problem query changes.
4. shared/types/coach.ts: submission_id output nullability only.
5. coach/CoachOrchestrator.ts: internal Map key type only.

Compatibility exports remain; add a type export only if consumers require it.
No submission mutations/firstAc, schema/migrations, ContextGatherer behavior,
shared metric DTO, renderer or directory changes belong to A3a. Parent owns
README/spec/task/evidence and full gates. Typed fixture additions are necessary
when the exact row contract exposes previously missing fields, not weakened tests.

## Required Independent Verification

- Freeze original four SQL functions in a test-only oracle with no production
  query/helper imports. Compare full rows/keys, aggregate results and original
  error name/message/code; no new-query-generated expected values.
- Full rows: missing and exact/case/whitespace/quoted/Unicode/NUL keys, NULL and
  empty submission IDs, nullable problem IDs, tombstones and allowed orphans,
  all16 columns, raw zero/null/fractional/extreme times, ties without new order.
- Platform LIMIT: default,0,-0,positive,negative integer,fractional,NaN,infinities
  and meaningful native boundary values. Native Electron must validate actual
  better-sqlite3 errors; Node SQLite's unsafe-integer behavior is not equivalent.
- Aggregate: empty before init/after close/broken schema, duplicates, missing IDs,
  case-sensitive exact AC, deleted rows, NULL problem exclusion, minimum0 and
  fractional raw minimum, no String/Date decoder, original variable limit and
  one-over-limit error with repeated input IDs. Native limit must be discovered
  or independently controlled without production knobs; assert AC adds no bind.
- query_only/no writes/events, current transaction visibility and rollback,
  close/reinit lifecycle, missing-table prepare errors and step failures.
- Real Coach timeline receives nullable submission ID unchanged; metrics keeps
  string problem IDs and zero minima; shared timeline schema allows null ID but
  rejects numeric ID/fractional time. ContextGatherer privacy/last10/order tests
  remain, with exact full-row fixtures and sentinel assertions preserved.
- Run both TypeScript programs, scoped lint and focused differential/caller tests;
  parent runs serial native repositories, test:db/test:all/build:check and hooks/CI.

## Evidence

Source audit confirmed sole timeline/metrics caller paths, ContextGatherer
allowlist, existing mutations only checking duplicate row object truthiness, and
schema nullability/columns. Installed inArray maps every array element without
deduplication; installed min attaches column/String decoding; fillPlaceholders
forwards raw supplied values. The generated SQL probe above writes no files and
uses drizzle.mock(), not a native database. No implementation test pass is claimed.

## A3a Implementation Review

Date: 2026-11-20. Reviewed the frozen implementation on
`codex/drizzle-submission-reads`, based on `6c42a38`, in the C worktree. The
earlier sections record design precheck evidence; this section records the
independent implementation review. No product/test corrections were needed.

### Findings (fixed)

None. The implementation follows the approved bounded design. This reviewer
only appended this review record; no product, test, Git or original D-worktree
changes were made.

### Findings (not fixed)

None within A3a. No actionable correctness, privacy, type-safety or scope issues
were found. Submission writes/first-AC updates remain explicitly deferred A3b
work, not an A3a acceptance gap or permission to mark phase3 complete.

### Reviewed Evidence

- Mechanically extracted all four SQL templates from the independent test oracle
  and `git show 6c42a38:algo-electron/electron/db/repositories/submission/queries.ts`.
  All four matched exactly after line-ending normalization. The oracle imports
  only the native Database type and does not share production row types/builders.
- Production preserves all16 schema fields and raw submitted_at/created_at/
  updated_at/deleted_at values. Nullable IDs, tombstones/orphans, exact text
  equality, submitted_at-only ordering and uncapped problem reads are retained.
  The authoritative schema-derived row has a type-only problem-domain alias.
- Named LIMIT Placeholder forwards raw values; first-AC retains its pre-getDb
  empty guard, fixed AC literal, one input bind per element and raw numeric MIN.
  Focused tests exercise native maximum/one-over duplicate binds and17 LIMIT
  values without deduplication, clamping, Date/String conversion or fallback.
- Traced real Coach timeline/metrics consumers: nullable submission IDs pass
  through, epoch-zero minima survive, and outward metrics still use string-only
  problem IDs. Shared request IDs and integer timestamp schemas stay strict.
  The unchanged ContextGatherer still takes the last10 ascending rows and only
  verdict/language/runtime_ms/submitted_at; strengthened privacy sentinels pass.
- Verified submission mutations/firstAc, compatibility exports, problem queries,
  ContextGatherer production, schema/migrations, timeline renderer and request
  schema are unchanged. No new cached client, connection, write, transaction,
  event, sort tie or catch is introduced by the four synchronous readers.
- New submission-read spec is indexed, linked from Drizzle adoption and present
  in both task context manifests. Its executable contracts cover the fixed AC
  literal, raw MIN, full-row shape, native limits, lifecycle and caller policy.
  README/architecture changes describe the same bounded behavior.

### Verification

Independent reviewer commands ran with Node22.23.2 in `algo-electron/`:

- Lint: PASS. Scoped eslint on all12 changed/new TS/MJS files with
  `--report-unused-disable-directives --max-warnings 0`.
- TypeCheck: PASS. `pnpm typecheck` and `pnpm typecheck:tests`.
- Tests: PASS. `pnpm exec vitest run tests/db/submission-reads.test.ts
  tests/db/problemReads.test.ts tests/coach/contextGatherer.test.ts
  tests/coach/coachOrchestratorLifecycle.test.ts tests/ipc/timestampSchemas.test.ts
  --maxWorkers 2`:5 files,192 tests (43/27/14/69/39).
- Product/test `git diff --check`: PASS.
- Logs: `algo-electron/tmp/drizzle-a3a-review-typecheck.log`,
  `drizzle-a3a-review-typecheck-tests.log`, `drizzle-a3a-review-lint.log`,
  `drizzle-a3a-review-lint-files.log`, `drizzle-a3a-review-focused.log` in the same
  ignored tmp directory.

Parent separately reported test:db33files517tests plus26 native repository tests
passing, including native bind limits,17 LIMIT values, raw MIN and lifecycle.
Those gates were not rerun by this reviewer. Parent owns authoritative full,
native, UI/build and Git/CI evidence; no full-suite/build/CI/release acceptance is
claimed by this review. A3a is approved from the independent review side, subject
to the parent's remaining gates.
