# A2e recent-visit omnibox candidates: verification

Status: implementation, independent review, local/full/build gates and remote
integration passed. Merged into Drizzle on 2026-11-19.
No release or whole-phase completion is implied.

## Boundary

- Branch `codex/drizzle-problem-reads`, based on accepted A2d squash `85b95dc`.
- Production changes only imports and the complete `listRecentVisitCandidates`
  query in `electron/db/repositories/problem/omnibox.ts`.
- Unchanged equality INNER JOIN supports the non-null visit FK projection. Parent
  nullability, first candidate pipeline, final sorting/dedup and shared DTOs stay
  unchanged. Preserve the 64-row pre-filter horizon and raw millisecond projection.
- Tests freeze the old full function, repair only current-schema time fixtures,
  and cover observable output/error/lifecycle parity plus real Electron ABI.
- No migration, baseline, schema, version, release, actual-user data or D-worktree
  changes. PR8 remains draft/base dev. Reviewed design and check report are under
  `research/a2e-problem-reads*.md`.

## Required gates

- Independent complete-scope review; both typechecks and lint.
- Focused differential tests and native Electron repository tests.
- `pnpm test:db`, `pnpm test:all`, `pnpm build:check`.
- Normal hooks, immediate push, bounded PR and PR8 integration CI.
- Original D-worktree hash/HEAD verification and immutable release refs.

## Deferred policy

The first omnibox pipeline and list/detail/visit DTO queries still require an
explicit nullable-ID policy. A2e does not filter/coerce/fabricate those IDs or
claim that the existing runtime/DTO mismatch is resolved.

## Implementation and independent review

- Production diff is imports plus one complete recent-visit CTE/INNER JOIN. First
  pipeline, public function, constants/types and all final helpers equal `85b95dc`.
- Frozen oracle SQL/template literals equal the original implementation; explicit
  nullable comparator reproduces JS semantics (review probe:324 comparison pairs).
- No actionable new review finding; see `research/a2e-problem-reads-review.md`.
- Initial focused execution exposed a new test fixture's incorrect expectation:
  NULL visit PK leaves a canonical-URL candidate in the old first pipeline. The
  fixture's canonical URLs were corrected to actually exercise URL deduplication;
  production/oracle behavior and assertions were not weakened. Initial log retained.

## Executed local gates

- Node22.23.2 / pnpm12.8.1 from the package directory.
- Both TypeScript checks, scoped ESLint/Prettier and `git diff --check` passed.
- Focused: omnibox38 (original5 + new33), lookup14 and overview8 =60/60.
- `pnpm test:db`:30 Vitest files/374 tests; native repositories19/19 including
  horizon-before-filter and NULL visit PK/empty parent ID/read-only epoch-zero cases.
  Backup/import, migration safety, legacy5 and Drizzle4 real forced-kill/recovery
  cases and native daily-stats performance also passed, composite exit0.
- Documentation check passed. No installer/NSIS acceptance is claimed by A2e.
- Logs: `tmp/drizzle-a2e-impl-focused{,-final}.log`,
  `tmp/drizzle-a2e-impl-omnibox-final.log`, `tmp/drizzle-a2e-db.log`,
  `tmp/drizzle-a2e-docs.log` (under ignored `algo-electron/`).

## Final parent gates

- `pnpm test:all` exited0:206 files/2038 tests; UI11/11 and native repositories19/19.
  Both typechecks, zero-warning lint, architecture22, packaging12, docs/security,
  performance, native migrations/real forced-kill matrices and Electron smoke pass.
- Coverage:75.75% statements /69.82% branches /72.95% functions /78.89% lines.
  Production duplication1.73%, under the existing3% gate.
- `pnpm build:check` exited0, including packaged-main better-sqlite3 external guard.
  Existing bundle-size/resource fallback warnings remain. No fresh NSIS installer
  was built, and no installer acceptance or publication is inferred.
- Original D-drive HEAD20ee62c and all62 dirty file hashes still match the baseline.
  master/dev/public v2.0.1 refs remain unchanged. Frozen migrations, baseline,
  schema, queries.ts, mutation paths, shared DTOs and version/lockfile are untouched.
- Logs:`algo-electron/tmp/drizzle-a2e-{all,build}.log`.

## Remote integration

- Work commit `82a016397c1dd7134d730d97065123478f4ed396` passed normal commit
  hooks and immediate push with full pre-push `test:ci`2038/UI11. No bypasses.
- PR17 CI `44521575932` passed both required jobs; manual jobs skipped by design.
- PR17 squash `09272131a54b4d0f2a544a425099dfb0e7171955` merged only into
  `refactor/drizzle`; its tree equals the tested work commit.
- PR8 integration CI `44522362714` passed. PR8 remains draft/base dev. Released
  dev ancestry is reachable; public master/dev/tag/assets are unchanged.
- Product work is complete for this slice. Subsequent journal/archive metadata
  commits use their own normal hooks and CI; they do not constitute a release.
