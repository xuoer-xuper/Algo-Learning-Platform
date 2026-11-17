# Release hardening synchronization: validation record

Status: synchronization accepted and merged into `refactor/drizzle` through PR15.
No release or whole-phase completion is implied.

## Scope and source

- Synchronization branch: `codex/drizzle-release-sync`, from Drizzle `20ee62c`.
- Incoming released integration history: `dev 7d8da9c`, containing public v2.0.1 `de89ce4`.
- Merge is a real two-parent branch synchronization, not a squash of release ancestry.
- Current workspace is the existing C-drive worktree. Original D-drive working tree
  stays at `20ee62c`; its 62 dirty files match the recorded SHA256 baseline.
- PR #8 was accidentally retargeted by remote automatic deletion of `dev` during
  release. Restored its base to `dev` on 2026-11-17; it remains draft and unmerged.

## Evidence protected before build

The complete local `algo-electron/release/2.0.1/` output was copied to
`algo-electron/tmp/release-acceptance/preserved-local-v2.0.1-before-drizzle-sync/`.
All 156 files were SHA256 compared. The sibling `.manifest.json` records full
paths, sizes and hashes. Other release acceptance records remain in place.

- Installer: `b0220023f58d5d141f805cdb98e0505a1926bdb38a69579ac4dae6c1d07db081`.
- ASAR: `d8f6862c9ede8c768aae69c0bb5150a6edc7496c00ecc0fb163e161c47591a1f`.
- Later same-version Drizzle build output is unpublished validation material,
  not the v2.0.1 release or a replacement for its manual acceptance.

## Completed preliminary checks

- `pnpm install --frozen-lockfile`: passed under Node22.23.2/pnpm12.8.1, native
  Electron43.4.0 install completed; Drizzle0.45.4/Kit0.31.11 retained.
- `pnpm test:packaging`: 12/12 passed with both Drizzle resources and release guards.
- `pnpm test:docs`: passed after merge navigation/spec updates.
- Preliminary architecture guard: 22/22 passed; production jscpd: 1.73%.
- Core handoff: both TypeScript programs, scoped ESLint and 9 focused Vitest
  files/183 tests passed; independent review and final complete gate remain required.
- `pnpm test:release`: 97/97 passed; log `algo-electron/tmp/drizzle-sync-release-tooling.log`.
- First native snapshot: legacy `migrationInterruption` 5/5 (4 actual forced kills
  plus later-use preservation), composite `drizzleMigrationInterruption` 4/4
  (baseline/Drizzle-only data migration x prepared/committed). Both ran serially
  under Electron RUN_AS_NODE with waited child exit. Logs are
  `algo-electron/tmp/drizzle-sync-migrationInterruption.log` and
  `algo-electron/tmp/drizzle-sync-drizzleMigrationInterruption.log`. Final full gate
  must repeat after implementation/review freeze.
- Journal auto-merge interleaved session blocks despite no textual conflict.
  Reconstructed all 17 intact blocks from committed parents, checking shared
  sessions match; index now records 582 lines.

## Required before completion

- Composite runtime and persisted state/audit compatibility focused tests: passed;
  independent full-scope review found no remaining actionable issues. See
  `release-hardening-sync-review.md` (full lint, both typechecks, 110 focused tests).
- Independent contract review, type/lint/architecture/duplication gates: passed.
  Final `test:all` passed: 206 files/1967 Vitest tests, both native crash matrices,
  native repositories15/15, startup/userscript/OJ smoke, docs/packaging, performance,
  and UI11/11. Coverage: statements75.70%, branches69.72%, functions72.93%,
  lines78.85%. Log: `algo-electron/tmp/drizzle-sync-all.log`.
- Serial native forced-kill matrix and full `pnpm test:all`: passed.
- `pnpm build:win`: passed with `--publish never`. Native-external guard, production
  fuses, real packaged resource/ledger checks, copied-resource negative cases and
  unrelated-cwd two-instance smoke all passed. Log: `algo-electron/tmp/drizzle-sync-build.log`.
  Existing large-chunk and test-fallback URL warnings remain; real packaged resource
  resolution is exercised successfully. No actual NSIS install/uninstall was run for
  this unpublished synchronization, and no release was uploaded.
- Frozen legacy001-030 and baseline SQL/meta comparison: no diff. Application
  package version remains2.0.1; this is unpublished branch validation output.
- Normal hooks commit/push: `57690f6` retains parents `20ee62c` and `7d8da9c`.
  Required pre-push `test:ci` passed unchanged, including1967 tests and UI11.
- PR15 (base `refactor/drizzle`) CI `44025304964` passed; merge commit
  `317cd9f3b414391f55541132b839c7f2db426f46` preserves released dev ancestry.
  PR8 remains draft againstdev; its integrated CI `44025992234` also passed.
  master/dev/tag/public Release were not changed by this synchronization.
- Original D-drive dirty-file hash comparison: all62 files and HEAD unchanged
  after full validation/build. The release task technical handoff is now complete;
  final journal/archive bookkeeping is separate.
- A2d remains a separate later slice, not part of this merge acceptance.

Unpublished synchronization build `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe` SHA256: `60485a1eef4d663c432f8a064bc229b2b226efbcb9e31f62c1ca78233fdb2a5b`.

Unpublished synchronization build `win-unpacked/resources/app.asar` SHA256: `3b6846a23b77be68be5b513a464b67f3d179075d21b1bcc3565568ba6e44074c`.
