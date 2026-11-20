# A3a Submission Reads Verification

Date: 2026-11-20. Branch `codex/drizzle-submission-reads`, base A2g squash6c42a38.
This is one bounded read slice, not completed submission writes, phase3 or release.

## Contract

- All four submission reads use real Drizzle builders on the current connection;
  full rows retain16 fields, nullable IDs and four raw numeric time projections.
  SubmissionRow is schema-derived and ProblemSubmissionRow is a type-only alias.
- Exact equality, tombstones/orphans and submitted_at direction-only order remain.
  Platform LIMIT uses named placeholder; first-AC empty input returns before getDb.
  Nonempty input preserves every bind including duplicates and literal uppercase
  AC adds no variable, maintaining native maximum/one-over behavior. MIN is raw.
- Timeline submission ID output accepts already-returned null. Only Coach's
  internal aggregate Map key widens; metrics IDs/input/time contracts remain
  strict. ContextGatherer production is byte-identical; its last10 privacy
  allowlist and strengthened exact-field/sentinel tests remain intact.
- No submission mutations/firstAc writes, schema/migration/baseline/dependency,
  route/input, renderer, connection/recovery or version/release change.

## Local Evidence

- Implementers: DB3 files81 focused tests and cross-layer3 files122 passed;
  both TypeScript programs and scoped lint passed. Frozen independent oracle
  matches all4 original SQL template bodies. New differential suite43 tests.
- Parent `pnpm test:db`:33 files517 tests plus actual Electron repositories26;
  all native safety/forced-interruption matrices passed. New native3 cases test
  full rows/native text binding,17 limits/raw minima, discovered maximum bind
  count/one-over duplicates and empty/read-only/transaction/lifecycle behavior.
- Parent `pnpm test:all`:211 files2204 tests, repositories26, UI14, both
  typechecks, zero-warning lint, architecture/security/docs/packaging/performance,
  native startup/userscript/OJ negative sender and crash matrices all passed.
- Coverage75.80% statements/69.88% branches/73.08% functions/78.95% lines.
  Duplicated lines1.75%, below unchanged3% gate. Existing transition/deprecation/
  bundle-size/resource-fallback notices remain, not new functional failures.
- `pnpm build:check` passed including packaged-main native external guard;
  no new installer was built, no publication/installer acceptance is claimed.
- All796 product/test hashes remain unchanged since freeze. Original D HEAD20ee62c
  and62 dirty file hashes remain identical; master/dev/public2.0.1 unchanged.
- Logs: ignored `algo-electron/tmp/drizzle-a3a-{db,all,build}.log`.

## Independent Review

Full-diff review found no actionable issues and made no product/test fixes.
All4 frozen SQL templates match base6c42a38; both typechecks/scoped lint and
independent5 files192 tests passed. Review evidence:
`research/a3-submission-queries-review.md`.

## Pending Remote Gates

Normal hooks/push/feature+PR8 integration CI are recorded when complete. A3b write research is separate and not implementation.
Phase3 remains in_progress; PR8 remains draft/base dev; no incomplete task archive.
