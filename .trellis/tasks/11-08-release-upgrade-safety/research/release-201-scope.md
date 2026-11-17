# Research: v2.0.1 Release Scope and Upgrade Readiness

> Historical research copied into the hardening task. The later accepted policy in
> `standards-and-policy.md` and the current PRD supersedes the patch-version-exception proposal
> below. Source/verification observations remain evidence, not release approval.

- Query: Can completed dev work ship as v2.0.1 without unmerged Drizzle work, and what upgrade/release evidence remains necessary?
- Scope: Internal, read-only source and existing verification inspection. No Git commands, application startup, native/UI/build execution or private user-data access by this researcher.
- Date: 2026-11-08

## Findings

### Exact inputs and release boundary

The parent supplied these inputs:

- Shipped v2.0.0 source, commit `d2d2b0c6b758e1936b00aa602ea172dbb848b065`, exported under ignored `algo-electron/tmp/release-201-research/v2.0.0/`.
- Exact dev at `3702f01`, inspected in `C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform/`; no product edits existed when inspected.
- Ignored `algo-electron/tmp/release-201-research/master-to-dev.diff`, `master-only-commits.txt`, and the parent's `merge-tree.txt` output.
- Archived phase 0/1/2 verification records in the original workspace.

Unless prefixed otherwise, code references below are relative to the inspected **dev** checkout, not the current Drizzle feature checkout. Dev has package version `2.0.1`, Electron `43.4.0`, better-sqlite3 `13.0.3`, electron-store `^12.0.0`, electron-log `^5.4.4`, and zod `^4.6.7`. It has **no drizzle-orm dependency** (`algo-electron/package.json`). Do not reuse the current feature branch's installer as this release asset.

The parent found 22 merge conflicts between branch graphs. This is an integration gate, **not proof that 22 shipped fixes are missing**. Dev already contains shipped session-exit markers, Ctrl-click fallback, fullscreen/focus restoration, replacement-session behavior, credential-capture guards and matching tests. Examples:

- `algo-electron/tests/browser/tabManagerWindowOpen.test.ts:45`: Ctrl-click opens independent contents if Chromium provides none.
- `algo-electron/tests/browser/tabManagerFocusRestore.test.ts:15`: restore webpage focus without stealing it from shell UI.
- `algo-electron/tests/browser/tabManagerHtmlFullScreen.test.ts:11`: active-view fullscreen expansion and background-view isolation.
- `algo-electron/tests/browser/tabManagerSessionReplace.test.ts:20`: manual restoration replaces tabs in the existing window.
- `algo-electron/tests/windows/sessionExitMarker.test.ts:23` and `algo-electron/electron/main.ts:1033`: abnormal-exit versus clean-exit restoration.

Resolve actual differences explicitly and rerun against the final merge tree. Neither blindly taking master nor blindly taking dev is a safe conflict strategy. The parent's other integration researcher owns detailed conflict reconciliation.

### Positive evidence: rc.1 schema fixtures also cover v2.0.0 schema

`algo-electron/tests/db/fixtures/provenance.json:974` pins rc.1 to commit `7d052efcf37903ff22ad0a72d3147e62b600e0b9`, schema 29, with 36 source SHA256 entries. I hashed the corresponding exported **v2.0.0** files against those entries:

- **35/36 entries are byte-identical.** All migrations 001-029 and all migration/helper dependencies match.
- Only `algo-electron/package.json` differs, as expected for the release-version change.
- The six matching non-migration files are `electron/db/migrate.ts`, `electron/shared/time.ts`, `electron/shared/errors.ts`, `electron/parsers/titleValidation.ts`, `electron/adapters/codeforcesUrls.ts`, and `electron/adapters/sites/codeforces/urls.ts`.
- The rc.1 schema snapshot SHA256 is `af78d2d6024e4eb938d0fc5d2385edade53da58ceb2c6e0d683e3f16c4e30650`.

Thus the existing rc.1 fixture legitimately represents **v2.0.0's identical schema and historical migration semantics**. Reconstructing another schema merely to label it v2.0.0 is unnecessary. Synthetic test rows remain synthetic, not an authentic release-era private database.

Reproduction: load the committed provenance JSON, select `id == 'rc1'`, and SHA256 each `source.path` in the parent's v2.0.0 export against `source.sha256`; no Git or fixture regeneration is needed.

### Migration 030 and rollback contract

- `algo-electron/electron/db/migrations/030_timestamps_to_unix_ms.ts:117` declares version 30, `requiresForeignKeysDisabled: true`; 25 tables/82 instant columns become INTEGER milliseconds, including the migration ledger.
- `algo-electron/electron/db/migrate.ts:66` disables foreign keys outside the transaction; rebuild, ledger insert and integrity/FK checks happen before commit. Original failure is preserved if FK restoration also fails.
- `algo-electron/electron/db/connection.ts:133` runs the production safety wrapper: back up pending migrations, run, restore after failure, write retry-blocking marker. It still uses `userData/data/algo-learning.sqlite` and `userData/backups` (`:101`). No Drizzle ledger is part of this release.
- `algo-electron/electron/backup/sqliteMigrationBackup.ts:52` uses SQLite `backup()` (line 70), so WAL data participates. Retention is three SQLite migration backups; this is **not** a complete backup of notes/assets, config, scripts and browser session files.
- `docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md:176` describes the schema030 restore boundary. Returning to 2.0.0 requires restoring the **pre-030** database/full userData backup with the app closed. Reinstalling the old binary alone is unsafe. Never delete ledger30 or convert integers back to guessed strings.
- Legacy suffixless general times retain system-local interpretation; scripts/credential/runtime families use known UTC+8, explicit offsets win, DST gaps reject and folds use the earlier occurrence. Changing the system timezone before first upgrade can therefore change interpretation of old zone-less values. This is a documented compatibility assumption, not recoverable provenance.
- Learning JSON exports now use schema version 2 (`electron/backup/types.ts:1`); v1 import is normalized (`learningDataExport.ts:185`). An old 2.0.0 binary is not a supported importer for the new format. User-facing release notes must not describe the export format as unchanged.

**Version policy decision:** the original-workspace Git spec still defines major for a data-format migration requiring backup restoration/manual action (`.trellis/spec/project/git-workflow.md:186`). User requests v2.0.1, but canceling the final v3.0.0 milestone did not itself waive this compatibility rule. The parent should explicitly record the accepted version-policy exception/revision and expose migration/downgrade risk before publishing; do not silently portray this as a no-migration patch.

### Config, userData and credentials compatibility

- `electron/app/envSetup.ts:19` only appends `-dev` when `!app.isPackaged` and no explicit smoke path. Production path remains unchanged; the module is the first import of main and guarded by architecture tests.
- `electron/app/config.ts:75` opens electron-store with `name: config`, explicit `cwd: app.getPath('userData')`, `clearInvalidConfig: false`, two-space JSON serialization, and lazy construction. `:187` retains legacy defaultHomeUrl migration. Zod normalization has field-level defaults and preserves legacy Coach unknown keys.
- `tests/app/configCompatibility.test.ts:46` checks all known fields; `:75` preserves the encrypted API-key envelope but removes it from the renderer view; `:89` checks byte-identical canonical files; `:122` and `:135` preserve corrupt files and reject destructive writes. These use a sanitized sample of the established rc.1 format, not a shipped application's full profile.
- Shipped `v2.0.0:electron/app/config.ts:65` has the same five top-level fields. Both shipped and dev `electron-builder.json5` keep appId `com.algo.learning`, productName `AlgoLearningPlatform`, NSIS x64 and `deleteAppDataOnUninstall: false`; both `electron/browser/ojSession.ts:19` use `persist:oj-main`.
- This supports structural compatibility, not proof that safeStorage decrypts and all seven logged-in OJ sessions survive an actual NSIS upgrade. No real profiles or credentials were read during this research.

### Valid release-note candidates

Only claim verified changes relative to shipped v2.0.0, not all items already under its unchanged CHANGELOG "Unreleased" heading:

1. Tab/site favicon reliability: shell HTTPS image CSP, robust initial-load error fallback and AcWing Referer behavior (`electron/app/appProtocol.ts:17`, `src/components/TabStrip.tsx:65`). Journal session6 records user acceptance of the packaged seven-site icons; there is no need to claim an unimplemented main-process favicon proxy.
2. Live learning-data refresh after successful writes/sync/import: dashboard, detail and other surfaces update without a navigation/remount; loaded content and editing drafts are retained. `tests/ui/dataRefresh.pw.spec.ts:30` verifies real Codeforces-sync dashboard/detail updates within a shared two-second budget; `src/hooks/useIpcQuery.ts:33` protects against stale response overwrite.
3. Corrected timestamp comparison/day aggregation and legacy export compatibility: uniform millisecond instants, preserved epoch zero, explicit old formats, numeric-TEXT Luogu handling, and repaired derived day buckets (`migration030.test.ts:118`, `tests/app/recentSitePreconnect.test.ts:25`, `tests/integration/learningDataTimestampCompatibility.test.ts:65`). Prominent migration/downgrade notice belongs with this item.
4. Safer config persistence and development/production isolation; no promised new data-location move for installed users (`configCompatibility.test.ts`, `envSetup.ts`).
5. Maintenance details may mention stronger IPC validation/shared contracts and redacted startup diagnostics, but should not replace user-facing benefits or imply Drizzle has shipped.

### Existing tests: what they do prove

- `tests/db/historicalUpgradePath.test.ts:350`: pinned schema21/24/29 -> 30, full representative facts, 82 integer declarations/storage, ledger continuity, BLOB/FK/index/CHECK/UNIQUE behavior, one consistent original backup and repeat-start idempotence.
- `tests/db/migration030.test.ts:76`: rowid/view/trigger/owned-AI-JSON preservation; `:198`: late-column failure restores schema29 and blocks retry without exposing the bad value.
- `tests/shared/legacyTimestamp.test.ts:10`: explicit offset/milliseconds/epoch0 and strict integer-TEXT compatibility; existing phase2 acceptance also records three timezone/DST subprocess coverage.
- `tests/integration/learningDataTimestampCompatibility.test.ts:65`: v1 normalization avoids false conflicts; `:78`: original excluded-only metadata; `:97`: invalid/missing/v2-nonnumeric required timestamps reject before writes.
- `tests/verify.mjs:21` explicitly includes the historical and 030 suites in test:db, and `:156` invokes real Electron migrationSafety.
- Archived R5 final record (`.trellis/tasks/archive/2026-11/09-17-phase-2-ipc-contract/r5-verification-2026-11-05.md:45`) reports a packaged rc.1-schema29 synthetic upgrade, plus isolated real schema24/29 copies. It explicitly distinguishes synthetic/source evidence from actual private copies and reports constraints/counts without claiming exact release-era authenticity.

### Remaining release gates and bounded recommendations

1. Resolve the master/dev graph integration on a separate release-preparation branch; preserve the already-present shipped fixes and rerun targeted browser/window/session/credential tests after conflict resolution. No need to reimplement features merely because commit ancestry differs.
2. Fix the known release-tool blockers before real publication: version-before-build order, merge-tag versus release-commit target, and actual `latest.yml` generation. Dry-run is not upload/build evidence. Existing `.release-it.json:25` builds before version bump.
3. Run targeted `configCompatibility`, `configMigration`, `historicalUpgradePath`, `migration030`, `legacyTimestamp`, `learningDataTimestampCompatibility`, and recentSitePreconnect tests, then the required complete `pnpm test:all` and `pnpm build:win` on the **actual release tree**. Serialize native/UI/build jobs.
4. Repeat packaged schema29 -> 30 synthetic upgrade with the release artifact, now citing the proven v2.0.0 schema equivalence. Assert numeric values, row counts, BLOB/note references, backup, idempotent second start, FK/integrity, config retention and no unexpected -dev suffix. Do not point production launch at a private profile.
5. Perform/install acceptance in an isolated Windows profile or VM: fresh install, 2.0.0 -> 2.0.1 upgrade, application launch, app identity/data path, uninstall-with-data-retained and reinstall. If not performed, report the gap; neither win-unpacked smoke nor a week-old user test of an earlier 2.0.1 build covers it.
6. Before publication confirm final source SHA, package/tag/changelog/binary version agreement, complete release assets and their hashes, and required CI on the actual merge. Review final notes so the old CHANGELOG "Unreleased" entries are not falsely advertised as newly introduced.

## Files Found and Related Specs

- `electron/db/connection.ts`, `migrate.ts`, migration030, `timestampColumns.ts`: production migration ownership and timestamp inventory.
- `electron/backup/sqliteMigrationBackup.ts`, `learningDataExport.ts`, `types.ts`: consistent DB backup, recovery and export version boundaries.
- `electron/app/envSetup.ts`, `config.ts`, `tests/app/configCompatibility.test.ts`: data-path and persistent-config compatibility.
- `tests/db/fixtures/provenance.json`, `rc1.schema.sql`, historicalUpgradePath/migration030 tests: pinned historical schema and synthetic upgrade evidence.
- `tests/ui/dataRefresh.pw.spec.ts`: integrated live-refresh acceptance.
- `.trellis/spec/project/domain-rules.md`: protected credentials/session data, immutable released migrations and full-data backups.
- `.trellis/spec/project/unix-millisecond-time.md`: millisecond/legacy conversion and restoration contracts.
- `.trellis/spec/project/historical-database-fixtures.md`: source/synthetic/private evidence classification.
- `.trellis/spec/project/git-workflow.md`: release and version-policy gates.

## External References

None required. Package versions above are from the exact inspected dev package.json; historical identities and schema provenance are source-controlled. No network research was performed by this agent.

## Caveats / Not Found

- No application tests or release commands were run by this researcher. Prior pass records are evidence of their recorded commits, not new verification of a merged release tree.
- The 35-file SHA256 comparison was executed and passed; it is schema/helper equivalence evidence only.
- No independent v2.0.0 installation wizard/uninstall, current release safeStorage decryption, real seven-site login retention, or full-profile upgrade was proved here.
- No additional production-code blocker was established in this bounded source inspection. Known integration/tooling/acceptance/version-policy gates remain open; this report is not release approval.
