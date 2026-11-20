# Research: Phase 3 Start Readiness

- Query: Assess phase 3 plans against completed phase 2 and identify a safe first deliverable.
- Scope: mixed; repository inspection and official Drizzle/npm documentation.
- Date: 2026-11-06
- Baseline: post-030 tree; parent reports dev b74773b and dev CI 42224226176 passed. Researcher ran no Git operations.

## Findings

### First Delivery: PR-A0

Limit first delivery to Drizzle dependencies/configuration, complete post-030 schema, a typed adapter over the existing better-sqlite3 connection, and schema/Date-boundary smoke tests. No second connection or import-time startup side effects. Establish baseline provenance and recovery contracts before enabling the migration runner. Then migrate bounded repository groups (problem, submission, stats, others); keep directory relocation separate.

Plans conflict on paths: PRD specifies `src/main/db`, while design/implementation describe old-directory R1 and later relocation. Settle explicitly. Recommended: new infrastructure in `src/main/db`, adapter to existing connection lifecycle, legacy repositories retained until their slices.

### Correct Planning Inventory

- `electron/`: 321 TypeScript files, 250 `.prepare(` sites across 54 files.
- Excluding migrations: 291 files, 222 sites across 43 files.
- Repositories: 57 files, 162 sites across 29 files.
- Line counts: `electron/main.ts` 1164; `electron/browser/TabManager.ts` 2494; `electron/coach/CoachOrchestrator.ts` 1474.
- Schema: **25 tables (24 application tables plus `schema_migrations`)**, not 21.

These are regex/planning counts, not semantic query counts. Replace stale plan values.

### Baseline Safety

`MAX(version) == 30` is insufficient. Require known contiguous legacy history, validate actual post-030 columns/types/defaults/nullability/indexes/FKs/CHECK constraints, and verify baseline file/journal provenance. Reject unknown, malformed, and newer schemas. Inspect the chosen installed Drizzle migrator's real hash/timestamp ledger contract before implementing baseline marking. Keep legacy ledger separate and released migrations 001-029 unchanged.

Startup currently detects legacy pending migrations, backs up, migrates, closes startup orphans, then publishes the connection (`electron/db/connection.ts:143`, `electron/db/connection.ts:148`, `electron/db/connection.ts:160`, `electron/db/connection.ts:161`, `electron/db/connection.ts:163`). Extend pending detection to Drizzle migrations before the existing backup/failure-marker protocol, or later Drizzle-only migrations can lack backups. Baseline marking and migration belong in that recovery contract. Preserve FK handling (`electron/db/migrate.ts:65`, `electron/db/migrate.ts:73`, `electron/db/migrate.ts:101`).

Test fresh/21/24/29/30 databases, idempotence, invalid history/schema/resources, and failed later migration restoration using synthetic public fixtures.

### Generate Versus Pull

Correct the instruction to run `drizzle-kit generate` against the database: `generate` compares schema-code snapshots and emits SQL; introspection is `pull`. Generate a complete schema baseline and compare it to actual post-030 schema, including CHECK constraints, partial indexes, FK cascades, BLOBs, defaults and nullability. Do not assume introspection/snapshot roundtrips are lossless.

### Preserve Runtime Contracts

- `timestamp_ms` returns ORM Date values; public/shared DTOs remain integer milliseconds. Explicit `Date.getTime()` outputs and `new Date(ms)` writes; epoch-zero/null tests; no blanket casts or Date IPC leaks.
- Preserve strict legacy parsing, SQLite numeric-text `.0` compatibility, audited 10-digit cache repair, and existing 82-column policy. ORM adoption performs no further data conversion.
- `withDataChangeTransaction` wraps the actual synchronous transaction invocation, not merely its callback (`electron/shared/dataEvents.ts:33`), and publishes after success (`electron/shared/dataEvents.ts:44`). Preserve commit-failure/rollback suppression, nested/savepoint behavior and partial-autocommit BatchWriter semantics.
- Phase 3 procedure examples must not introduce result unions where current APIs return arrays or other shapes. Preserve current public IPC results and security guards unless separately reviewed.

### SQL Guard, Packaging And Releases

Literal project-wide zero `.prepare()` conflicts with immutable migrations, metadata introspection, bootstrap and migration-030 safety. Use narrow responsibility-based native SQL exemptions and guard tests; migrate application queries without hiding SQL in arbitrary callers. Existing SQL guard assumes `electron/db/` (`tests/architecture/check-architecture.mjs:286`, `tests/architecture/check-architecture.mjs:364`); update boundaries deliberately for `src/main/db`.

Package SQL migration resources explicitly, typically `extraResources`, with tested dev/packaged resolution. Current `electron-builder.json5` lacks a corresponding entry. Missing files/hash mismatches must fail clearly. Preserve asar, Electron fuses and better-sqlite3 native handling.

Plan's alpha tag from dev conflicts with project Git rules and `.release-it.json:6` (`requireBranch: master`). Defer/remove that instruction; continuation permission is not permission to invent a release workflow.

## Files Found And Related Specs

- `.trellis/tasks/09-17-phase-3-main-process/prd.md`: scope, target paths, stale inventory.
- `.trellis/tasks/09-17-phase-3-main-process/design.md`: staged architecture, schema/procedure examples.
- `.trellis/tasks/09-17-phase-3-main-process/implement.md`: sequencing, baseline and release steps needing correction.
- `electron/db/connection.ts`: connection lifecycle, backup and publication.
- `electron/db/migrate.ts`: legacy ledger and FK lifecycle.
- `electron/shared/dataEvents.ts`: transaction-scoped invalidation buffering.
- `tests/architecture/check-architecture.mjs`: SQL/IPC ratchets.
- `electron-builder.json5`: packaging, asar, fuses and native handling.
- `.trellis/workflow.md`: phase sequencing and task handoff.
- `.trellis/spec/backend/database.md`: integer instants, legacy parsing, frozen migrations, numeric cutoffs, epoch zero.
- `.trellis/spec/project/git-workflow.md`: integration and release constraints.

## External References

Checked 2026-11-06:

- https://registry.npmjs.org/drizzle-orm/latest : latest 0.45.4; better-sqlite3 peer >=7; no engines metadata.
- https://registry.npmjs.org/drizzle-kit/latest : latest 0.31.11; no engines metadata.
- https://orm.drizzle.team/docs/drizzle-kit-generate : HTTP 200; schema/snapshot-based generation confirmed.
- https://orm.drizzle.team/docs/drizzle-kit-pull : HTTP 200; introspection command documentation.
- https://orm.drizzle.team/docs/column-types/sqlite : HTTP 200; timestamp/timestamp_ms Date mappings.

## Caveats / Not Found

Neither drizzle-orm nor drizzle-kit is installed. Registry availability does not prove project/Electron/native compatibility. Pin and test the selected stable pair; exact migrator ledger behavior remains to be verified from that installed version. Official get-started-sqlite page timed out and was not used as evidence. No code was changed, dependencies installed, tests run, Git operations performed, or private databases accessed during this research. Inventory may change as implementation proceeds.
