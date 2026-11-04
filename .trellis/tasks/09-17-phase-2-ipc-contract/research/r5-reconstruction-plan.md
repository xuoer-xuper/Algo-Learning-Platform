# Research: Reconstructing Historical Upgrade Fixtures

- Query: Replace the unavailable v1.0.0 user database prerequisite with reproducible, honestly labelled historical-code fixtures for schema versions 21, 24 and 29, without weakening migration safety.
- Scope: Internal; repository files and historical evidence supplied by the parallel history researcher. No application code, database or Git state was changed by this researcher.
- Date: 2026-11-04

## Findings

### 1. Recommended decision

Use **historical-schema reconstruction plus explicitly synthetic representative rows** as the repeatable CI upgrade matrix. Supplement it with isolated copies of the two existing real databases when doing final 030 acceptance. Do not continue demanding an unavailable 1.0.0 user database, and do not call a reconstruction an original historical database.

The smallest useful deliverable now is schema21/24/29 reconstruction upgrading through the **current 001-029 chain**, with provenance, relational and rollback assertions. It is fixture groundwork, not a completed 030 timestamp migration.

Do not check in SQLite binaries. `tests/security/check-sensitive-files.mjs:8` forbids `.sqlite`, `.sqlite3` and `.db`, including nonignored untracked files (`:53`); repository `.gitignore` also ignores them. The original `tests/db/fixtures/rc1.sqlite` plan conflicts with the existing security contract. Store schema/seed/manifests as readable text and create databases beneath ignored `algo-electron/tmp/` or checked temporary directories.

### 2. Verified historical identities

The parallel `r5_history` researcher supplied these read-only Git results; full producer history belongs in `r5-git-history.md`:

| Historical reference | Peeled commit | Package version | Highest migration |
| --- | --- | --- | --- |
| `v1.0.0` | `0758b253766db648f47418e95116437762001261` | `1.0.0` | 21 |
| `v1.1.0-beta.2` | `b27debfcac5a368da1a19113bd1a48dc87526b79` | `2.0.0-beta.2` | 24 |
| `v2.0.0-rc.1` | `7d052efcf37903ff22ad0a72d3147e62b600e0b9` | `2.0.0-rc.1` | 29 |
| `v2.0.0` | `d2d2b0c6b758e1936b00aa602ea172dbb848b065` | `2.0.0` | 29 |

Current migration blobs are **not byte-identical** to all historical tags (type/format changes and error-helper extraction exist). Applying current migrations up to 21 is useful, but cannot alone be described as exact historical-source reconstruction. Pin historical source hashes at regeneration and record the generator/runtime versions.

### 3. Minimal regeneration architecture

Suggested new paths (implementation proposal only):

- `tests/db/fixtures/historical-schema-manifest.json`: provenance, schema hashes, migration version/name lists and fixture classification.
- `tests/db/fixtures/schema-021.sql`, `schema-024.sql`, `schema-029.sql`: generated historical schema statements; no private rows.
- `tests/db/fixtures/README.md`: Chinese responsibility/current contents/key files/boundaries/verification sections, indexed in `docs/README.md` as required by `tests/docs/check-docs.mjs:17,204,410`.
- `tests/db/rebuildHistoricalFixtures.mjs`: explicit developer regeneration tool; never invoked by ordinary CI.
- `tests/db/historicalFixture.ts`: source-controlled loader plus deterministic synthetic seeds.
- `tests/db/historicalUpgrade.test.ts`: ordinary Vitest behavioral assertions for reconstruction and current upgrade paths.

Regeneration command can be `node tests/db/rebuildHistoricalFixtures.mjs` from the package directory. It should:

1. Resolve the **pinned commit OIDs**, not whatever a movable local tag currently names. Read historical migration paths and required relative-import closure with `git show <oid>:<path>` using argv, never shell interpolation. No checkout, reset, branch switch, package installation or network fetch is needed.
2. Extract those exact bytes into a uniquely named package `tmp/` directory, preserving relative paths. Record Git blob OID and SHA-256 for every extracted source. Type-only imports disappear at bundling, so they do not require an old dependency install.
3. Generate a temporary entry importing each `migrationNNN` directly, ordered by `version`. **Do not import the old connection/bootstrap**: it brings app, logger, metadata, startup recovery and global DB ownership into a schema-generation task. The old migration runner is small; its source hash can be recorded while the generator reproduces only its ledger and per-migration transaction protocol.
4. Bundle the temporary entry with installed esbuild, externalizing `better-sqlite3`; execute using the installed compatible Node runtime or the established Electron `ELECTRON_RUN_AS_NODE=1` path. Prefer Node if its native-binding probe succeeds; the project already has real SQLite Vitest tests. Record actual Node/Electron, `better-sqlite3` and `SELECT sqlite_version()` values. Never quietly fallback to a fake SQLite implementation.
5. Start an empty in-memory database with FK enforcement. Create the old `schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`, then run each exact historical `up` and ledger insertion inside one transaction. Use a documented deterministic ledger timestamp. Empty-schema generation has no domain rows for historical timestamp repair migrations to change; still load the real helpers rather than stubbing them.
6. Export canonical `sqlite_master` entries with non-null SQL, sorting tables before explicit indexes/triggers/views and sorting by name within kinds. Internal `sqlite_autoindex_*` rows have null SQL and are recreated by constraints; do not manually serialize them. Export ledger version/name separately in the manifest and seed deterministic `applied_at` values on fixture load. No AUTOINCREMENT was found in the current released migration set, but regeneration must detect/handle such internal state rather than assume forever.
7. Recreate a second empty DB from each generated SQL snapshot and compare normalized `table_info`, `foreign_key_list`, `index_list/index_xinfo`, CHECK/DDL text and migration ledger to the directly replayed DB. Persist generated schema/output hashes only after this equivalence check succeeds.
8. Re-run regeneration and require identical text output. Cleanup only resolved temporary paths under its own checked workspace prefix.

This keeps normal tests independent of local Git objects/tags, GitHub, historical dependency installation and the user's old data. A source archive with no `.git` can still execute the committed fixture tests. Regeneration is separately auditable from the pinned history.

### 4. Migration dependency closure

Current direct runtime imports identify the closure that must be resolved **at each pinned ref**, not reused from HEAD:

| Migration | Runtime helper dependency |
| --- | --- |
| 003, 004, 016, 017, 018 | `electron/shared/time.ts` (`nowBeijing`) |
| 004 | `electron/adapters/codeforcesUrls.ts`; at newer refs this re-exports `electron/adapters/sites/codeforces/urls.ts` |
| 016 | `electron/parsers/titleValidation.ts` (`isBadScrapedTitle`) |
| 009, 011 in newer revisions | `electron/shared/errors.ts` (`errorMessage`) |
| Other 001-029 migrations | Runtime logic local to the migration; `better-sqlite3` imports are type-only |

Evidence: `electron/db/migrations/003_fix_codeforces_canonical_urls.ts:2`, `004_fix_codeforces_gym_page_urls.ts:2`, `016_clear_codeforces_placeholder_titles.ts:2`, `017_backfill_problem_context.ts:2`, `018_normalize_codeforces_submission_ids.ts:2`, `009_user_scripts_file.ts:2`, `011_notes_content.ts:2`. Current Codeforces wrapper is a one-line re-export. The current helper leaf files are pure and require no Electron runtime.

Resolve further runtime imports from extracted source and fail on an unexpected non-relative runtime import rather than accidentally bundling current application modules. The temporary entry itself alone should import the installed native SQLite package. Historical `package.json` is evidence, not an instruction to install or execute arbitrary historical lifecycle scripts.

History researcher confirmed the exact known leaf closure at the selected refs:
`electron/shared/time.ts`, `electron/adapters/codeforcesUrls.ts`,
`electron/adapters/sites/codeforces/urls.ts`, `electron/parsers/titleValidation.ts`,
plus `electron/shared/errors.ts` at rc.1. The Codeforces wrapper re-exports the leaf;
the other leaves have no runtime imports. Historical `allMigrations` is not exported,
so a generated explicit import list avoids depending on private connection state.
No historical SQL `datetime/current_timestamp` timestamp defaults were found.

**Important production dependency:** the immutable legacy migrations still call `nowBeijing`. R5's instruction to delete every old time helper from `electron/shared/time.ts` is incompatible with fresh/historical migration replay unless the design explicitly preserves a legacy-only compatibility export or isolates the historical migration dependency. Do not edit 001-029 silently to make that deletion compile.

### 5. Why not invoke all old public writers?

It is possible by extracting their entire historical runtime import graph, but it is not the smallest sound schema21/24/29 fixture solution. Writers often depend on the old module-global `getDb`, application/logger initialization, filesystem note storage, stats and evolving entity contracts. Booting an old application to call them risks touching unrelated state and expands dependency closure far beyond schema compatibility.

Recommended fixture rows are explicit SQL data built from documented historical writer signatures and formatting rules, with deterministic IDs and times. Mark them `synthetic-representative`, and cite the writer blob/line that justifies each format. Pure historical time-format functions may be executed separately in isolated probes. Keep three evidence categories distinct:

1. Exact historical schema reconstructed from pinned migrations.
2. Representative rows authored for coverage using historical writer contracts.
3. Existing genuine user DB copies, processed locally only and never represented by category 1/2.

### 6. Current test and upgrade entrypoints

- `electron/db/connection.ts:51` holds private `allMigrations`; `initDbAtPathWithMigrationSafety` at `:132` defaults to the complete production chain. It accepts an explicit migration list for failure injection.
- `initDbAtPath` at `:109` skips backup safety; do not use it as the only upgrade acceptance entrypoint. Prefer `initDbAtPathWithMigrationSafety` with a fixture-private `backupDir` and deterministic `now`.
- Initialization runs migrations, then `closeStartupOrphans`, then assigns global DB (`:158-161`). Seed closed visits for strict round-trip comparisons and test open/orphan recovery separately; otherwise the test may misattribute intentional startup recovery to migration conversion.
- `tests/db/userScriptIdentityMigration.test.ts:137` already rebuilds legacy table shapes in memory. `userScriptRuntimeMigration.test.ts:21` uses real SQLite with FK enforcement and `:175` verifies failure restore. These are useful patterns, not exact historical-provenance artifacts.
- `tests/verify.mjs:21` has an explicit `dbVitestFiles` list; add the new historical fixture tests so `pnpm test:db` actually runs them. `test:core` and coverage `test:all` run all Vitest files already.
- For actual Electron ABI proof, add an upgrade scenario/helper call to existing `tests/db/migrationSafety.test.ts` or `repositories.test.ts`, which `runDbElectronTests` already invokes (`tests/verify.mjs:151`). If a new Electron-only test file is introduced instead, wire it in `runDbElectronTests` and exclude it in `vitest.config.ts`; otherwise it either never runs or runs under the wrong process.
- `runElectronNodeTest` (`tests/verify.mjs:68`) bundles to ignored tmp and externalizes `better-sqlite3`, `electron` and `electron-log`, then starts the Electron executable with `ELECTRON_RUN_AS_NODE=1`. Preserve this externalization.
- Backup uses SQLite's consistent backup API (`electron/backup/sqliteMigrationBackup.ts:52,69`), not raw copy of a live WAL DB. Failed startup closes, restores and writes a retry-blocking marker (`electron/db/connection.ts:164` onward). Fixture acceptance must exercise that path.

### 7. Representative data and assertions

Groundwork schema21/24/29 -> current29 should seed at least:

- Linked problems, submissions and closed visits; duplicate submission identities; first-AC ordering; nullable/deleted fields; day-boundary activity and known aggregate values.
- Schema21/24 legacy user-script duplicate names and deleted duplicates, so 025's deterministic `created_at,id` rank and partial unique indexes are exercised (`025_userscript_identity.ts:20,42`).
- Script metadata declarations for 027 backfill, including `run_at='document-start'` as a non-timestamp exclusion, URLs and JSON arrays.
- In schema29, site+credential child rows and all four script runtime child tables. Use synthetic encrypted envelope-shaped data only, never real keys. Resource BLOB includes zero and high bytes. Preserve constraints, FK cascades and partial-index semantics (`026_site_credentials.ts:19`, `027_userscript_runtime.ts:73-132`).
- At least 20 individually asserted timestamp values across distinct tables/formats, with literal expected values independent of the converter under test; all timestamp columns covered by typed inventory, not only `*_at` regex.

Before 030 exists, assert the replayed historical TEXT values remain semantically unchanged through 029, and assert schema migration sequence, row counts, relationships, indexes, constraints and one-time backup. Do **not** assert INTEGER conversion or mark R5 done yet.

Once 030 lands, expand to matrix:

| Producer format | Example | Expected interpretation |
| --- | --- | --- |
| System-local suffixless | `2026-01-15T10:20:30.123` | Chosen historical/system-local timezone policy |
| Explicit instant | `2026-01-15T02:20:30.123Z`, `2026-01-15T10:20:30.123+08:00` | Equal UTC milliseconds in every host timezone |
| Fixed UTC+8 suffixless | `2026-01-15T10:20:30.123` in documented script/credential/runtime columns | UTC+8 regardless of host timezone |

Run each in separate Node/Electron processes with `TZ=UTC`, `TZ=Asia/Shanghai`, `TZ=America/New_York`; verify the runtime actually adopted the requested offset before trusting results. Include UTC/offset day crossings, leap-day dates, millisecond precision, DST nonexistent/ambiguous wall times, nulls, invalid calendar dates, empty/non-date strings and numeric values. Ambiguous/invalid policy must be explicit and fail safely, not silently NULL 45 NOT NULL columns.

030 safety assertions: all target non-null values INTEGER; explicit semantic expected instants; `foreign_key_check` and `integrity_check`; preserved BLOB/JSON/user strings; row count and FK relationships; unique/CHECK behavior; late failure restores original TEXT schema/data; failed retry marker blocks repeated migration; repeat successful startup does not migrate again; fresh installation and three legacy starting schemas converge.

Statistics: compare independent fact-based expected local-day aggregates. Rows with explicit offset may correctly move local days; do not require unconditional equality to old prefix-grouped aggregates. Keep a same-semantics baseline case whose stats must match and a timezone-crossing case whose corrected expected delta is asserted.

### 8. Existing real copies: supplementary local verification

The earlier feasibility report located schema29 current data and schema24 pre-migration backup. They remain valuable, but neither must be recast as original tag-era contents. Suggested later validation tool accepts an explicit source path, opens it read-only, uses SQLite `backup()` to a new ignored temporary destination, closes the source, and only migrates the destination with its own backup directory. Do not run the whole application against the source path.

Record source file size/hash, schema version, copied-row counts and pass/fail aggregates locally; do not publish raw row values, credential envelopes, cookies, private scripts, URLs, paths or original databases. Sanitization is needed only if representative source-derived text is ever promoted into version control, and must not destroy the relationships/timestamp distributions being tested. A generator from historical source avoids that need for the CI baseline.

### 9. Suggested acceptance-criteria revision

Replace "three authentic historical DB copies are mandatory before any progress" with:

> Rebuild schema21/24/29 from pinned historical Git migrations and helper dependencies. Check in reproducible text schema/seed/provenance inputs, not private DB files. Mark fixture rows as synthetic and compare each upgrade to independent expected schema/data/time assertions. CI requires no Git history or network. Where available, verify isolated genuine DB copies as supplemental local evidence. Missing original v1.0.0 user data is not a blocker; it remains a documented coverage limitation rather than fabricated evidence.

Keep separate milestones: **fixture groundwork to 029** versus **migration030 + full-stack milliseconds + actual backup/import/rollback acceptance**. The first enables the second and cannot be reported as completing it.

## Files Found

- `electron/db/migrations/001_initial.ts` through `029_site_credential_labels.ts`: current legacy migration source and dependency map.
- `electron/db/migrate.ts`: TEXT migration ledger and transactional runner.
- `electron/db/connection.ts`: private migration list, explicit path initialization, backup restoration and startup recovery.
- `electron/backup/sqliteMigrationBackup.ts`: SQLite backup/restore/retry-marker mechanisms.
- `tests/db/userScriptIdentityMigration.test.ts`, `userScriptRuntimeMigration.test.ts`, `siteCredentialMigration.test.ts`: real SQLite legacy reconstruction/constraint/failure patterns.
- `tests/db/migrationSafety.test.ts`: existing real Electron ABI suite suitable for additional upgrade assertions.
- `tests/verify.mjs`, `vitest.config.ts`: native process orchestration and test-discovery/exclusion boundaries.
- `tests/security/check-sensitive-files.mjs`, root `.gitignore`: database artifact prohibition.
- `tests/docs/check-docs.mjs`, `docs/README.md`: new fixture directory documentation/index requirements.

## Related Specs

- `.trellis/spec/project/domain-rules.md`: immutable 001-029, sensitive data, backup-before-migration.
- `.trellis/spec/project/git-workflow.md`: separate R5 branch/PR and local/remote validation gates.
- `.trellis/spec/backend/database.md`, `.trellis/spec/shared/timestamp.md`: target integer-millisecond contract.
- `.trellis/tasks/09-17-phase-2-ipc-contract/research/r5-feasibility.md`: actual 82-column inventory and migration hazards.
- `.trellis/tasks/09-17-phase-2-ipc-contract/research/r5-git-history.md`: pinned historical timestamp producer evidence from the parallel researcher.

## External References

No external service or web evidence was needed. Installed package contract: Node 22.23.2, Electron 43.4.0, better-sqlite3 13.0.3, esbuild 0.28.2 (package.json). Historical schemas are rebuilt using the current SQLite runtime, so runtime version must be recorded; this does not claim reproduction of the exact binary SQLite engine shipped in the old installers.

## Caveats / Not Found

- This researcher did not run a generator, create fixtures, execute historical code, or access any real user DB. The plan is implementation-ready but not evidence that an upgrade test has already passed.
- Pinned historical migration hashes and exact transitive paths must be populated by the regeneration tool; do not infer byte identity from same filenames or version numbers.
- Normal CI need not execute all historic writers. Source-derived synthetic rows test migration behavior, not historical end-to-end application behavior.
- Keep migration030 design hazards visible: legacy helper imports, FK-safe table rebuild, global DB initialization order, invalid-value rules and application-owned JSON compatibility still require implementation/review.
