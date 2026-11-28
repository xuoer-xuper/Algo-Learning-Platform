# A4d Historical Guard: Independent Implementation Review

Date: 2026-11-27. Accepted base:
aacbff0c2c1afe9df4fa2bda5698450f0d76e608. Review in the C worktree only.
Scope: tests/db/stats-recompute-history.test.ts, not the still-in-progress runtime
implementation or complete A4d acceptance. Code paths below are relative to
algo-electron/.

## Verdict / Findings

No issue found and no test or production edit made. The eight-test guard matches
the accepted A4d/R1 historical path/byte/execution-branch freeze. Its frozen
SHA256 remains 032c697720e212b9d814d2fa70dc3f363594a03ca664ee025d37c9c375d7d344.
Only this review artifact was added by the reviewer.

## Inspected Evidence

- The three raw-byte hashes are literal expectations tied to accepted base
  aacbff0, not calculated from current HEAD or production input at test time.
  An independent read-only Git-blob comparison confirmed each expected hash and
  exact current bytes for recompute-core.ts, migration030 and shared time.
  No newline normalization hides a freeze violation.
- The seven-file expected runtime graph is a literal edge map. The AST walker
  follows relative dependencies, checks external edge names and detects static
  imports, re-exports, import-equals, literal require and dynamic import. Its
  syntax probes exclude type-only declarations, comments and string contents;
  computed runtime module arguments fail closed.
- Negative mutations inject forwarding edges in memory into both the pinned
  historical core and unpinned legacy-ai-context dependency. Both must fail the
  graph assertion, independently of the byte-pin tests. The test never edits
  historical files. Direct migration/core behavior is also protected by their
  independently established exact-byte pins.
- The execution test runs actual migration030 through the existing guarded
  migration runner on a disposable in-memory DB using the existing schema29
  rc1 fixture. Populated visits/submission/solved facts yield an explicitly
  asserted complete daily row, platform JSON and numeric ledger time; FK state,
  integrity, transaction completion and caller-owned open connection are checked.
  Shared toLocalDay is reused only for the zone-specific expected epoch label;
  its bytes are separately pinned.
- The global DB is uninitialized before and after migration; getDb is spied and
  the ORM factory is spied with a throwing implementation. Neither may be
  invoked. This is execution-branch independence, not an unsupported claim that
  the modern connection module or whole process has no Drizzle dependency.
- Fixture/provenance and existing migration030/historicalUpgradePath tests are
  byte-identical to aacbff0. The rc1 schema hash independently matches its fixed
  version29 provenance. The new test supplements, not replaces, the existing
  preservation, malformed-key, late-failure and pinned21/24/29 safe upgrade and
  recovery gates. No fixture regeneration or recovery contract change occurs.
- Current verify.mjs includes the guard in the DB file list; registration stays
  owned by the runtime implementer and requires final full-slice review. Vitest
  includes the file under its normal isolated test configuration.

## Verification

Supported Node 22.23.2, package pnpm 12.8.1. Independent commands:

- Tests: PASS, UTC focused historical guard, one file/eight tests.
- Lint: PASS, strict scoped ESLint with zero warnings.
- TypeCheck: PASS, both application and tests programs at this review snapshot.
  These are not final runtime-source freeze gates while that worker is active.
- Format: PASS, scoped Prettier check.
- Baseline/provenance: PASS, independent raw Git-blob and fixed fixture checks.

Logs: tmp/drizzle-a4d-history-review-tests.log,
tmp/drizzle-a4d-history-review-lint.log,
tmp/drizzle-a4d-history-review-format.log,
tmp/drizzle-a4d-history-review-typecheck.log,
tmp/drizzle-a4d-history-review-typecheck-tests.log and
tmp/drizzle-a4d-history-review-baseline.log.

No native/global/build suite was run by this reviewer. Parent retains serial
native/performance/recovery/full/build/CI acceptance. No Git mutation, original
D-worktree edit or user-database access was performed. Later R2 relocation still
requires its own approved path mapping and graph/history/recovery evidence; this
review neither authorizes relocation nor changes the final layout requirement.
