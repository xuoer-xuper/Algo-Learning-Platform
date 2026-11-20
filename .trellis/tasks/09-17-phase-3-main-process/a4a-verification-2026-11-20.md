# A4a Basic Statistics Read Verification

Date2026-11-20. Branch codex/drizzle-stats-basic, basefa13260 (PR24 accepted).
Only getPlatformDistribution/getProblemVisitStats/getLastActiveTime and imports
in stats/insights.ts change. Other stats functions/types/callers/recompute/030
remain unchanged. Daily nullable outputs/chart correction are A4b1 planning only.

## Contract And Independent Review

Genuine public Drizzle SELECTs preserve active COUNT(*), exact grouping/count DESC,
raw COALESCE SUM/AVG and NULL denominator, native integer overflow, raw latest
ordered row/??null and current handle/read-only lifecycle. No writes/events/new
transactions, cache, new filters/order or overview/Date decoder redirect.

Frozen original three-function oracle,43 differential cases and4 native groups.
Independent review found no product issue: normalized AST3/3/SQL3/3 identical,
other5stats functions untouched. Both typechecks/scoped lint/Prettier and focused
5files103 tests passed. See research/a4a-stats-basic-review.md implementation part.

## First Native Failure And Fix

Initial test:db passed36files677 Vitest but all4 new native groups falsely failed
because independently initialized DBs have different legacy applied_at clocks.
Date.now replacement does not intercept historical new Date. Reviewer fixed only
cross-fixture final snapshots to omit applied_at, retaining version/name/order.
Each read still compares every full table/schema/ledger/total_changes/transaction
field before/after; mutation-detection probe confirms ledger writes are caught.
No production/migration clock change or dropped read-only assertion. Initial
failure log remains tmp/drizzle-a4a-db.log; correction is spec-documented.

## Current Gates

- Corrected serial test:db36files677 and actual Electron repositories40/40 pass;
  import11, migration safety/forced interruption/recovery/performance also pass.
- Serial test:all214files2364tests, native40, UI14, both typechecks/lint and all
  architecture/docs/security/packaging/performance/startup/OJ/user-script gates pass.
- Coverage75.84/69.99/73.13/78.99; duplicated lines1.77%, unchanged gates.
- build:check plus packaged-main native external guard pass. Existing size/URL/
  deprecation/transition notices remain non-failing; no new installer was built.
- All802 product/config/test hashes unchanged after fixed DB/full/build gates;
  D62dirty unchanged. Original migration/core/schema/deps/version untouched.
- Normal commit/hooks/push, feature/integration CI remain pending. No release or
  installer acceptance claimed. PR8 stays draft/base dev, phase3 in_progress.
