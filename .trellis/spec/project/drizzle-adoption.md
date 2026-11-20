# Drizzle Adoption Boundaries

## 1. Scope / Trigger

Phase 3 adopts Drizzle over the already-migrated SQLite database. ORM introduction
must not silently change migration 030's storage semantics, public IPC shapes,
connection ownership or transaction notifications.

## 2. Signatures

```ts
// algo-electron/src/main/db/client.ts
createDrizzleClient(sqlite: Database.Database): DrizzleClient
// Time columns in schema.ts
integer('created_at', { mode: 'timestamp_ms' })
// Default async lifecycle; explicit migrations remain the legacy test seam.
initDbAtPathWithMigrationSafety(dbPath: string, options: {
  backupDir: string
  migrations?: readonly Migration[]
  drizzle?: { folder: string; expected?: readonly KnownDrizzleMigration[] }
}): Promise<Database.Database>
loadMigrationResources(folder: string, expected?: readonly KnownDrizzleMigration[]): MigrationResources
inspectMigrationState(sqlite, resources, legacy): DrizzleMigrationPlan
applyDrizzleMigrations(sqlite, resources, legacy): void
// A2a keeps the existing synchronous public overview API.
getProblemCount(): number
getPlatformDistribution(): PlatformDistributionRow[]
getTodayVisitedCount(): number
getLastActiveTime(): number | null
getOverviewStats(): OverviewStats
// A2b selects only the stored ID and preserves the original nullish result.
findProblemIdByPlatformKey(platform: string, platformProblemId: string): string | null
// A2c remains a synchronous mutation over the existing connection.
upsertProblem(identity: ProblemIdentity): void
// A2f preserves runtime read results and corrects selected nullable output IDs.
getProblemDetail(problemId: string): ProblemDetail | null
listProblemVisitsByProblem(problemId: string): ProblemVisitRow[]
getOmniboxSuggestions(rawQuery: string): OmniboxSuggestion[]
// A2g keeps native LIMIT before status filtering and permits nullable recent IDs.
getRecentProblems(limit?: number, platform?: string, status?: string): RecentProblem[]
// Pure route/action policy shared by main and renderer.
isInternalPageId(value: unknown): value is string

```

Pinned A0 versions: drizzle-orm 0.45.4 and drizzle-kit 0.31.11. `db:generate` reads
schema code and emits SQL/snapshots; `pull` is the introspection command.

## 3. Contracts

- The existing `electron/db/connection.ts` owns opening, pragmas, backup, legacy
  migration, startup recovery and closing. The A0 client factory only wraps the
  supplied connection. No module-import side effects or second database connection.
- Schema describes 25 existing tables: 24 application tables and the legacy
  ledger. Preserve columns, nullability, defaults, PKs, explicit/partial indexes,
  CHECKs, unique constraints, FK actions and BLOBs. No new implicit defaults.
- SQLite legacy TEXT primary keys can be nullable. Use table-level primary keys
  where needed; column `.primaryKey()` can silently add NOT NULL. Test the actual
  generated SQLite definition rather than assuming TypeScript implies SQL parity.
- drizzle-kit 0.31.11 emits table-level UNIQUE as named unique indexes rather than
  SQLite's anonymous autoindexes. Equivalence checks normalize only that naming/
  origin representation while retaining key order, collation, uniqueness and
  predicates; existing explicitly named indexes still match by name. Verify actual
  duplicate/null acceptance behavior, not just normalized metadata counts.
- ORM timestamp_ms values are Dates; physical database and IPC values remain Unix
  integer milliseconds. Explicit `.getTime()` for output and `new Date(ms)` for
  ORM input. Test zero and null, and never cast Date into a numeric shared DTO.
- A0 schema generation is not migration activation. Do not write Drizzle ledger,
  run `push` against user databases, replace runtime queries or move directories
  before their separately validated slice.
- Later baseline activation validates continuous known legacy history and physical
  post-030 schema, not MAX(version) alone. Drizzle-only pending migrations also
  require pre-backup, rollback/restore and retry markers. Installed migrator opens
  its own transaction and selects by journal timestamp; validate known hashes and
  prefix before delegation rather than trusting that it validates all history.
- R4 change notifications remain after actual synchronous commit; preserve nested
  rollback and real partial-autocommit semantics when replacing queries.
- Keep schema and migration resource access main-only. No renderer/preload/shared
  imports of database code or Drizzle native bindings.
- Convert application queries in bounded domain slices without coupling them to
  the later directory move. Wrap the current native connection at the call site;
  do not retain an adapter across close/reinitialization or introduce a new global
  connection/cache. Use synchronous `.get()`/`.all()` for synchronous repository APIs.
- In problem overview, `count()` counts rows, including nullable legacy IDs;
  `count(problems.id)` is not equivalent. Count/distribution filter active problems.
  Distinct daily visits intentionally include tombstones and visits for deleted
  problems, while latest activity also includes tombstones. Preserve these existing
  per-query differences; changing them is a separate behavior decision.
- Use existing local-day `[start,end)` helpers and Date parameters for timestamp_ms
  comparisons; do not add a fixed 24-hour interval. Latest activity emits `.getTime()`
  with nullish handling, never a truthiness fallback that converts epoch zero to null.
- Platform-key lookup uses two bound, case-sensitive equality predicates and
  `deleted_at IS NULL`. Do not trim/case-fold inputs, use LIKE, or add ID validity
  filters. Absent/null-ID matches return null, but an empty stored ID remains `''`.
  SQLite failures throw; they must not be disguised as a missing record.
- Problem upsert must keep a real UPDATE for every matched row, including null
  IDs. `eq(problems.id, sql.param(existing.id))` preserves bound SQL equality with
  null, not `IS NULL`; do not cast the nullable ID or return early. The successful
  legacy no-op still notifies; read-only/schema failures must still throw first.
- Preserve all six original SET targets using CASE/COALESCE, including retained
  title/contest/index values: SQLite UPDATE OF triggers observe the SET list.
  Nullish input retains contest/index, empty string overwrites; title quality rules,
  insert-only source fields, explicit visited status and tombstones stay unchanged.
- Capture one instant, write it via Date-backed timestamp_ms columns and keep UUID
  creation only on insert. Do not add conflict-upsert, transaction/cache, schema
  defaults, resurrection or notification scopes around autocommit batches.

### A2d Deletion Equivalence

- Affected-date UNION uses raw scalar `sql<number | null>` projections of the four
  stored instants with the same selected key. Do not attach a Date/Number decoder:
  fractional, unsafe, TEXT and out-of-Date-range values must still reach the old
  integer-millisecond validator and fail before mutation. Keep one distinct UNION,
  exact bound equality and all existing tombstone inclusion.
- Delete submissions, visits, activity events, then the parent with synchronous
  `.run()`, retaining the original native transaction inside the notification scope.
  The parent DELETE result alone determines the boolean and base notification.
  A missing parent can still remove orphan children but returns false without
  notification or stats recomputation. Notes are not part of the deletion scope.
- Keep derived-date recomputation after this function's transaction invocation.
  At top level it follows COMMIT, one sorted day at a time; a later-day failure
  logs once and preserves successful deletion and earlier day changes/events.
  Nested invocation follows the inner savepoint and is still inside the caller's
  outer native transaction/notification scope. Do not add an after-commit scheduler
  or promise support for arbitrary unwrapped transactions in this query refactor.
- Preserve raw row/error/event/warning equivalence against the frozen original SQL,
  including actual deferred-FK COMMIT failures, savepoints and outer rollback. A
  mocked transaction throw is not evidence that post-commit notification is correct.

### A2e Recent-Visit Candidate Equivalence

- Scope is only the second omnibox candidate pipeline, not the whole public
  `getOmniboxSuggestions(rawQuery: string): OmniboxSuggestion[]` implementation.
  Preserve the first pipeline and final rank/dedup/limit control flow unchanged.
- The existing equality INNER JOIN on baseline TEXT/BINARY columns proves each
  returned parent ID equals the NOT NULL visit `problem_id`. Select that FK for
  truthful string inference; empty IDs remain empty. This does not solve nullable
  IDs in the first pipeline. Do not filter, coerce, assert or narrow that nullable
  parent column using a false SQL generic, nor change shared DTO/schema policy.
- Select the 64 most recent active visits before parent/tombstone/query filtering.
  Keep only `entered_at DESC`, with no new tie-break or wider search. Keep all five
  matching fields, title COALESCE, NOCASE, bound contains pattern and exactly one
  backslash ESCAPE character; `%`, `_` and backslash stay literal input characters.
- Give the CTE's raw entered-at scalar its explicit alias. Do not attach a Date
  decoder, normalize invalid storage or lose epoch zero; supported current rows
  return numeric milliseconds. Diagnostic corrupt/fractional values retain old
  behavior, not a newly promised supported data format.
- Reads use the lifecycle-owned native connection and stay synchronous, read-only
  and notification-free. Database errors propagate; no empty-result fallback.

### A2f Nullable Read Output Equivalence

- The detail, visit and first omnibox candidate queries preserve actual rows,
  while their reachable nullable IDs become honest in repository and shared
  output schemas. `OmniboxSuggestion.problemId`, embedded `SubmissionRecord.id`,
  and `ProblemVisitPoint.visit_id` allow null. This expands output validation
  acceptance, not input schemas or the stored database. Existing IPC has no new
  output parser, and no renderer action or filtering changes here.
- Detail's existing `problems.id = bound string` on baseline TEXT/BINARY columns
  proves its returned parent ID is the SQL-bound string. Project the parameter
  through SQL; never cast the nullable column or replace the ID with the original
  JS input afterward. Native UTF-8 encoding/result decoding may normalize lone
  surrogates or other text, so a JS replacement is not an equivalent proof.
- Preserve every baseline field selected by parent/submission `*`, computed
  solved/attempted priority, and COUNT(*) including NULL-ID/tombstoned submissions.
  Parent absence short-circuits before the child SELECT. Children order only by
  submitted_at DESC with LIMIT100; no transaction or extra snapshot is introduced.
  Visits keep ten selected fields, tombstones/orphans, entered_at ASC and no cap.
- All outward time scalars remain raw numbers/null with no Date/Number decoder.
  Preserve diagnostic fractional/extreme values without promising them as valid
  shared integer timestamps. Closed/broken connections and SQL failures still
  propagate; wrapping the current connection must not add writes or events.
- First omnibox CTE limits24 before the correlated latest-visit LEFT JOIN. Keep
  exact/prefix/contains ranking and the empty-query predicate, then join on the
  chosen latest visit ID (not problem ID). A chosen NULL visit ID still fails
  equality and uses canonical URL/source fallback. The second horizon64 and
  final sorting/dedup/limit8 remain unchanged. NULL is one Set dedup key; explicit
  null comparisons preserve JS abstract relational coercion, not null-first/last.
- A2f intentionally deferred the recent-list action policy; the reviewed A2g
  contract below resolves it without changing detail or route input guarantees.

### A2g Recent List And Internal Actions

- Preserve the complete recent query: active parents, truthy optional platform
  equality, AC/any-submission/stored status priority, COUNT(*) including NULL-ID
  and tombstoned children, only last_visited_at DESC, SQL LIMIT before JS status
  filtering. Raw nullable time and ID are emitted unchanged; no row dropping,
  repair, Date decoder, output parser, new transaction or notification.
- Drizzle0.45.4's typed limit accepts number or Placeholder, not SQL. Use
  `.limit(sql.placeholder('limit')).all({ limit })` for caller-supplied limits.
  This retains native LIMIT binding/errors for NaN, fractions, infinities and
  numeric boundaries; direct `.limit(limit)` drops negative/NaN LIMIT clauses.
  Do not cast SQL into a numeric limit or clamp/normalize arguments.
- Recent `ProblemRecord.id` and repository ID/time are nullable. Override
  `problemDetailRecordSchema.id` explicitly to string, preserving the existing
  equality-proven detail parent contract. Input schemas stay unchanged.
- The pure shared `isInternalPageId` is the exact extracted main predicate:
  string UTF-16 length1..200, unchanged by trim, no whitespace anywhere or code
  points below32/DEL127. Both main branches (including script-install) and
  sidebar action availability share it; do not tighten Unicode acceptance.
- Every recent row and its original-site navigation stays available. Invalid-ID
  notes/detail actions are disabled with persistent visible explanatory text and
  the reason in ListRow's existing accessible label; disabled-button tooltips
  alone are insufficient. Handlers narrow IDs; callbacks/routes remain string.
  This is a reviewed UI behavior correction, not SQL-only equivalence.
- Sidebar and home use `JSON.stringify([platform, platform_problem_id])` for
  stable collision-free keys over the supported unique text tuple. These keys
  are rendering identity only, never database or route ID replacements.
- Required evidence: frozen independent SQL whole-row/error comparisons;
  limit/filter/status horizon/null/tombstone and connection lifecycle coverage;
  real Electron limits; exact old/shared predicate parity; nullable list versus
  string detail schema; visible accessible invalid rows, retained URL actions,
  suppressed invalid callbacks, valid callbacks, tuple-key reorder and layout.

A3a submission read contracts and acceptance matrix are in
[Drizzle Submission Reads](./drizzle-submission-reads.md).

## 4. Validation & Error Matrix

| Case                                                            | Required behavior                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Import schema/client                                            | No userData access, open connection, ledger or schema mutation            |
| Wrap supplied connection                                        | Same native connection and unchanged lifecycle ownership                  |
| Read/write epoch 0 or nullable timestamp                        | Exact integer/Date mapping; null remains null                             |
| Generated table constraints differ                              | Fail A0 equivalence test, do not ignore/tighten silently                  |
| Unique/CHECK/FK/partial-index violation                         | Same acceptance/rejection behavior as post-030 database                   |
| Transaction throws                                              | Native changes roll back, no premature notification                       |
| Unsupported or future baseline state                            | Later A1 fails closed without marking a baseline                          |
| Missing/tampered resource or invalid journal                    | Reject before creating the target DB/data directory; no cwd fallback      |
| Gapped/wrong-name legacy history or nonempty DB without history | Close and reject, without marking the baseline                            |
| Unknown/duplicate/future Drizzle ledger entry                   | Reject instead of trusting the newest timestamp                           |
| Pending baseline/later Drizzle migration, no legacy pending     | Back up before writes; later failure restores the original whole attempt  |
| Malformed existing failure marker                               | Block startup; absent marker is normal                                    |
| Repaired hash with the same failed migration tag                | Stable `drizzle:<tag>` key still blocks automatic retry                   |
| Explicit legacy `migrations: []`                                | Skip default Drizzle resources and preserve the existing test route       |
| Active problem with null TEXT primary key                       | Still counted in total/distribution; no schema tightening                 |
| Overview on empty database                                      | Zero totals, empty distribution, null latest activity; synchronous        |
| Visit at local day start / next day start                       | Included / excluded respectively                                          |
| Latest activity at epoch 0                                      | Return numeric 0, not null or Date                                        |
| Read-only overview after connection reinitialization            | Uses new current connection; no writes/events/migrations                  |
| Platform-key lookup with quote/percent/underscore/backslash     | Exact bound literal matching; no SQL/pattern interpretation               |
| Matching lookup row has null / empty-string ID                  | Return null / empty string respectively                                   |
| Lookup row has deleted_at = 0                                   | Excluded, exactly like any non-null deletion timestamp                    |
| Lookup fails because schema/connection is invalid               | Throw; do not return a not-found null                                     |
| Matched problem upsert has a null ID                            | Execute bound-null UPDATE, retain rows and successful legacy notification |
| Matched null-ID upsert on query_only connection                 | Throw before notification; early-return is not equivalent                 |
| Update retains title/contest/index                              | Keep the columns in SET and preserve UPDATE OF trigger behavior           |
| Upsert outer transaction/savepoint/COMMIT fails                 | Roll back its facts and discard its buffered topics                       |
| Omnibox recent visit falls outside the first 64 active visits    | Remains absent even when it is the only URL match                         |
| Recent visit has NULL visit PK and empty joined problem ID      | Keep the joined empty problem ID and raw millisecond value                |
| First omnibox pipeline returns a NULL parent ID                 | Preserve null result/dedup; A2f explicitly allows null in its output schema |
| Read-only omnibox connection or database error                  | Reads succeed without writes/events; errors propagate synchronously       |
| Detail NULL child ID / missing parent | Preserve child null / return null without child query |
| Detail bound Unicode, NUL or empty ID | Match native binding/result representation; no JS ID replacement |
| Omnibox NULL parent / selected NULL visit ID | Preserve null dedup key / canonical source fallback |
| Selected output ID null / number | Shared schema accepts null and rejects non-string numbers |
| Recent LIMIT NaN / fraction / infinity | Same native errors as bound SQL, not omitted/clamped LIMIT |
| Recent limit followed by status filter | Filter only the already-limited rows, never refill the page |
| Recent unaddressable ID | Keep row/site action; disabled notes/detail with visible accessible reason |
| Recent list nullable ID versus detail ID | List accepts null; detail still rejects null |
| Multiple NULL-ID rows / reordered lists | Stable platform/key tuple identity, no fabricated route IDs |

## 5. Good / Base / Bad Cases

- Good: generate SQL into test resources, create a temporary database and compare
  its complete metadata plus constraint behavior with a production 0-to-30 database.
- Good: expose an already-returned nullable output honestly while preserving rows;
  a detail-only equality proof does not permit narrowing unrelated list IDs.
- Good: retain a legacy recent row and its URL while disabling only ID-based
  actions using the exact shared route policy and a visible accessible reason.
- Bad: call `.limit(NaN)` and accept its omitted SQL clause, cast an SQL expression
  to a numeric API, or hide invalid-ID records to silence a TypeScript error.
- Base: repositories continue using the existing native connection until their
  bounded conversion is complete.
- Bad: silently add NOT NULL/defaults, treat generated SQL as already applied, open
  a fresh connection from a singleton import, or send ORM Dates over numeric IPC.

## 6. Tests Required

- Exact table/column/type/null/default/PK metadata; all 82 time columns use
  timestamp_ms; explicit index names/order/uniqueness/partial predicates and FKs.
- Exercise CHECKs, unique/nullable-key behavior, BLOBs, Date-zero/null values and
  synchronous rollback on real temporary SQLite databases.
- Re-running `db:generate` without schema changes produces no new migration.
- Typecheck config and both code/test projects, lint, full tests and build check.
  Real Electron ABI verification is required before activating runtime ORM paths.
- Preserve frozen migrations and pinned historical fixture SQL; no private database
  is a test input and no production initialization path changes in A0.
- A1 exercises fresh, reconstructed 21/24/29, existing 30 and baseline-only reopen;
  later successful/failing migrations must prove one backup and complete restoration.
- Negative schema tests include hidden generated columns, altered CHECKs, explicit
  index names and DDL semantics not exposed by PRAGMAs. `table_info` hides generated
  columns; use `table_xinfo`. A CHECK inside a SQL comment or string is not a constraint.
- Column collations, conflict clauses, deferred FKs and AUTOINCREMENT are absent from
  the accepted baseline but can change behavior without changing common PRAGMA results.
  Reject unsupported clauses in real SQL tokens, not comments/literals; do not claim
  metadata equality alone proves their absence.
- Object filters must match the literal reserved prefix (`GLOB 'sqlite_*'`), not
  `LIKE 'sqlite_%'`, whose underscore wildcard hides a custom `sqliteX...` table.
- Packaged smoke launches the real app from an unrelated cwd, then a development
  Electron helper reads only the isolated smoke DB after exit. Copied-resource
  negative tests exercise the production safe initializer before DB creation; they
  are not evidence of launching a corrupted packaged executable. Keep RunAsNode off
  in the packaged executable.
- A2a compares overview against the original SQL under a frozen test clock. Include
  empty, nullable-ID, zero deletion timestamp, distinct visits, local-day boundaries,
  tombstones and millisecond/epoch-zero results; retain native Electron ABI coverage.
  Distribution ties are unspecified: do not invent a secondary sort for a refactor.
- Fix obsolete string timestamps only in current-schema fixtures when their query
  is converted. Historical migration/export fixtures intentionally contain strings.
  Do not make production Date decoding accept stale test data or assert Date as number.
- A2b compares lookup results to the original SQL for both key dimensions, case,
  whitespace, literal/injection-looking strings, null/empty IDs and tombstones.
  Use real query-only SQLite, transaction reads, notification observation and
  close/reinitialize coverage; retain a native Electron ABI case.
- A2c uses the original three-statement SQL as an independent temporary-DB oracle
  for full rows/events. Include null/empty/quoted IDs, query_only-null failure,
  UPDATE OF triggers, title rules, missing/null/empty fields, epoch-zero/milliseconds,
  insert-only sources/tombstones, statement failures and real COMMIT/savepoint tests.

- A2d uses a separate original-SQL oracle and real isolated databases. Compare
  boolean/errors, remaining facts/notes/stats, ordered events and warnings. Include
  local calendar/DST boundaries, epoch0, valid negative and invalid instants,
  nullable/empty/quoted IDs, tombstones, missing parent with orphans, query_only,
  child/parent trigger failures, actual COMMIT failure, nested success/rollback,
  second-day stats failure and close/reinitialize. Register deletion and existing
  notification tests in test:db and retain native Electron deletion cases.

- A2e freezes the complete original omnibox implementation in a test-only oracle.
  Compare full ordered outputs and actual thrown errors, not just generated SQL.
  Cover both 24/64 candidate horizons, URL-only matches, escaped input, timestamp
  ties, tombstones, null/empty IDs and raw zero/fractional instants. Confirm
  query_only/no writes/no events, transaction visibility and close/reinitialize.
  Native Electron coverage must exercise the 64-row horizon and joined empty IDs
  with NULL visit primary keys; node:sqlite feasibility alone is insufficient.

- A2f compares whole detail/submission rows and ten-field visits to independent
  frozen SQL; test all extra keys, NULL/empty child IDs, tombstones, 101+ children,
  order ties, raw instants, missing-parent short circuit, SQL failures, query-only,
  transaction visibility, no events and reinitialization. Real Electron cases
  include bound Unicode/NUL/surrogate IDs rather than only JS/native substitutes.
- Keep the frozen full omnibox oracle independent. Pin24/25 candidate boundaries,
  NULL parent dedup and selected NULL visit fallback, literal matching, all output
  schemas and URL-only UI behavior. Retain integer timestamp and string input gates.

A2g additionally compares recent rows/errors to `problem-recent-oracle.ts`,
including the original LIMIT-before-status horizon, and tests the exact shared
ID predicate, retained URL navigation, disabled invalid actions, detail schema
string override, tuple-key identity and responsive explanatory text.

## 7. Wrong vs Correct

```ts
// Wrong: .limit(limit) silently omits NaN in Drizzle0.45.4.
// Correct for legacy bound LIMIT: .limit(sql.placeholder('limit')).all({ limit })

// Wrong: hide null-ID rows or enable notes/detail using Boolean(id).
// Correct: keep rows/URLs, use unchanged isInternalPageId for internal actions,
// and provide a persistent accessible explanation for disabled actions.

// Wrong when the legacy table permits a null TEXT primary key:
id: text("id").primaryKey();
// Correct: mirror nullability with a table-level key and verify SQLite behavior.
id: text("id");
// extraConfig: primaryKey({ columns: [table.id] })

// Wrong: sql<string>`${problems.id}` to hide a nullable primary key.
// Correct only after the unchanged equality INNER JOIN: select the NOT NULL visit FK.
// A2f widens unmatched omnibox IDs; A2g separately reviews recent-list actions.

// Wrong: row.id = originalInput after reading a normalized native result.
// Correct only with WHERE problems.id = input: project sql<string>`${input}`
// through the same native binding/result path as the original selected ID.

// Wrong: leaking a Date into a public numeric DTO by assertion.
// Correct: row.created_at.getTime(), with explicit null handling if nullable.

// Wrong: adopting solely because MAX(version) === 30 or the last hash matches.
// Correct: validate resources, all legacy/Drizzle rows, full baseline schema and
// integrity, then back up before baseline marking and later migration writes.

// Wrong: count(problems.id), or latest?.occurred_at.getTime() || null.
// Correct: count() for total rows; latest?.occurred_at.getTime() ?? null for zero.

// Wrong: row?.id || null, trim/case-folding keys, or catch(() => null).
// Correct: bound equality and row?.id ?? null, preserving database exceptions.

// Wrong: null-ID early return, isNull(problems.id), or conflict-upsert by key.
// Correct: eq(problems.id, sql.param(existing.id)) and an actual .run() before emit.
```

## A1 Safe Migration Activation

- Default asynchronous initialization validates compiled trusted migration tags,
  journal indexes/timestamps and exact SQL hashes before opening the target file.
  Resource resolution uses explicit application-root/package-resource paths,
  never process cwd or a production environment-variable SQL override.
- Read legacy history as a known continuous version/name prefix. A populated
  database with no ledger, gaps or unknown versions is not a fresh database.
- After legacy 1-30, adoption requires physical post-030 schema equality (including
  semantic constraints and original explicit index names), FK and integrity checks.
  Missing/empty Drizzle ledger requires backed-up baseline marking, not replaying
  CREATE TABLE over existing data. Baseline-only reopen revalidates the schema.
- Read every Drizzle ledger row and validate the exact known hash/timestamp prefix;
  duplicate, unknown or future rows fail closed. Upstream's newest-timestamp check
  is insufficient. Later known schema versions need their own physical-schema
  contracts; do not compare them to the old baseline or replay arbitrary DML in an
  empty expected database to invent a schema oracle.
- One verified standalone backup and durable format2 checkpoint cover pending
  legacy, baseline marking and later Drizzle work. Even with legacy source/target30,
  baseline or Drizzle-only work is protected. Composite source and exact target
  Drizzle identities must survive sidecar, restore, audit and retention validation.
  Restore the whole unexposed attempt if a stage fails, including a previously
  committed baseline marker. Completion follows both histories, cleanup and integrity.
- Failure markers retain `pendingMigrations` and optional `pendingMigrationKeys`:
  `legacy:<version>` / `drizzle:<tag>`. Unresolved records always block before DB
  open, even with no pending work or repaired resources; keys are evidence, not an
  overlap-based permission to retry. Malformed markers fail closed. Old markers
  can be explicitly associated only when a verified backup and keys prove a known
  exact composite target; never disguise timestamps as legacy numeric versions.
- Preserve released format1 checkpoints, sidecars, audits and historical28-to29
  recovery. Format2 explicit resolution compares both histories and physical schema
  against a bounded disposable replay using trusted resources, stopping at the
  recorded target rather than latest. `keep-current` protects later user rows;
  `retry-source` permits a later fresh protected attempt, not an immediate migration.
  The complete cross-version protocol is in `upgrade-recovery.md`.
- Synchronous `initDbAtPath` stays the legacy-only test helper. Explicit
  `options.migrations`, including an empty array, retains that test override route;
  it must not activate default Drizzle implicitly. Production uses the default
  asynchronous safe initializer and has no such override.
- Package only migration SQL and `meta/_journal.json` into `resources/drizzle`;
  generated snapshots, test fixtures and private files are not runtime resources.
  Test packaged resource resolution and ledger adoption with the real native ABI.
