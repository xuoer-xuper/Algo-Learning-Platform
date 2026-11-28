# A4d Runtime Recompute Verification

## Scope And Base

Branch codex/drizzle-stats-recompute starts at
aacbff0c2c1afe9df4fa2bda5698450f0d76e608 after A4c featureCI45978229533 and
PR8integrationCI45979282462 pass. Parent explicitly accepts the separately
reviewed runtime/historical split, bounded frozen030 INSERT12 compatibility,
late NULL-cache failure and legacy refresh exceptions in PRD/design/spec.

Historical030/core/shared-time exact paths and bytes stay frozen for A4d/R1.
R2 relocation has separate entry approval and exit equivalence/layout gates;
no move, import rewrite, forwarding shim or final-layout waiver is authorized.

Runtime worker owns new runtime helper, import-only live wrapper change,
independent old two-core/three-wrapper oracle, differential/native tests and
both test registrations. Historical worker owns only the new history guard.
Parent owns docs/spec/task and serial gates/Git. Total concurrency stays3.

## Status

- Governing contract and independent design/reconciliation review: accepted.
- Runtime implementation: pass/frozen; independent full-slice review passes.
- Historical guard implementation and independent review: pass/frozen.
- Independent full-slice review, focused/types/lint: pass; evidence recorded.
- Parent native/full/build/performance/history/recovery/source gates: pass.
- Normal hooks/push/feature CI/squash/PR8 integration CI: pass.

Accepted-base hashes independently verified by parent:

| File | SHA256 |
| --- | --- |
| stats/recompute-core.ts | d816c3ee693563e3a84e5333396eac4ab83eefb042cd33118158be1ea78bc508 |
| migrations/030_timestamps_to_unix_ms.ts | 0dd5967628e9074a0315933e6bf96f0efd404fe9463455e4c95d8a23b250c395 |
| src/shared/time.ts | 9ca11982850f6b13d082e60e34b1ed56aed4d7d0c28c68bdef756d32aa8435cf |

No new release, installation acceptance or whole-phase completion is claimed.

## Historical Guard Implementation

The historical worker adds only stats-recompute-history.test.ts, with8 cases.
It pins the three raw-byte hashes above and the seven-module runtime dependency
graph, distinguishes erased type imports from side-effect/re-export/lazy edges,
and rejects injected forwarding edges without changing disk sources. Real030
runs from the existing rc1 schema in a private explicit in-memory DB; full cache,
ledger, FK/integrity, uninitialized global DB and zero ORM-factory calls are
checked. This protects the030 execution branch, not an ORM-free modern process.

Worker evidence: both TypeScript programs, scoped ESLint/Prettier and the guard
plus unchanged030/historical-upgrade suites pass (3files19tests); guard-only UTC
and America/New_York runs pass8 each. Read-only accepted-base comparison confirms
all seven dependency modules unchanged. Initial frozen test SHA256:
032c697720e212b9d814d2fa70dc3f363594a03ca664ee025d37c9c375d7d344.
These focused results do not replace independent or parent native/full gates.

Independent guard review reports no findings or edits. It separately verifies
the three pins against aacbff0 and unchanged rc1 fixture/provenance plus existing
migration/recovery tests. Guard8, both types, scoped lint and format pass, with
the same frozen hash. Evidence: research/a4d-history-implementation-review.md.
At this guard-only checkpoint, runtime/full-slice and parent acceptance were
still pending. Subsequent results follow below.

## Runtime Implementation

The runtime worker adds the two explicit-DB Drizzle cores, switches only the
live wrapper import, freezes independent old two-core/three-wrapper oracles,
adds53 differential cases and8 native groups, and registers both new suites.
All53 focused cases pass separately in UTC, Asia/Shanghai, America/New_York and
Pacific/Apia; both types, owned-file lint/format and diff whitespace checks pass.
At that initial worker handoff, the8 native groups had not run; parent results
are recorded separately below.

Parent identified that public count()/countDistinct() attach Number decoding,
contrary to the adopted raw-aggregate contract for explicit handles. Before
freeze, the worker uses raw sql aggregates and adds defaultSafeIntegers(true)
differentials: empty-platform BigInt bindings remain native, while nonempty
platform JSON still fails after INSERT preparation. No public type/global mode
changes. This implements the existing no-decoder requirement, not a new policy.

Initial implementation freeze:

| File | SHA256 |
| --- | --- |
| recompute-runtime.ts | f64415faf923baa89d61c7db5410c68108a7ddc051415cf8a8e17bf9ab483164 |
| stats-recompute-oracle.ts | 441e59d947c27694518c8e2c6ef65cce5f3ae16536515342a3f11a7230d78dce |
| stats-recompute.test.ts | 8ef06d028dedeb1fc10914ac54be177b4578504e41044b3b215ff57150f2d73a |
| repositories.test.ts | f319816d011e50ba2061d5c6ee718e4c090325566691d3be18d2bb914303e4b8 |

Parent captures819 product/config/test hashes before review, separately from
the final serial-gate snapshot. Original D62dirty files and HEAD20ee62c remain
unchanged; dev/master/v2.0.1 and draft PR8 base dev remain unchanged.

## Independent Runtime Review

The reviewer reports no finding or edit. Five frozen oracle bodies, exact SQL
and ordered bindings match accepted-base AST after only function renames, typing,
three impossible missing-aggregate guards and Reflect.apply for old nullable
dispatch. The live wrapper differs only by its import source. Protected callers,
event bus, connection, facade, schema/time and historical sources remain intact.
Seven-file strict lint/format, both TypeScript programs, UTC6files250 focused and
5files60 caller tests pass. Independent America/New_York53 also passes. Final
full-slice artifact: research/a4d-runtime-implementation-review.md.

## Parent Native Gate

First authoritative standalone Electron repository run passes60/60, including8
new recompute groups. Node spawnSync bundles/runs the real Electron ABI and
captures actual output/status0; no GUI-launch-only acceptance. Evidence:
tmp/drizzle-a4d-initial-native.log/.exit. All819 implementation hashes stay
unchanged. A separate raw comparison confirms50 protected files unchanged from
aacbff0, including001-030, baseline/meta, historical fixtures, schema/validation,
core/time, warmed performance test, guard budgets, package and lockfile.

Final serial-gate snapshot captures819 product/config/test hashes. test:db
passes41files1046tests plus native60/60. It includes real backup/import, legacy
and Drizzle forced-exit/recovery matrices and unchanged historical21/24/29
upgrades. The unchanged warmed730-day performance gate passes at0.98ms against
the original<50ms limit. Source819 remains stable. Evidence:
tmp/drizzle-a4d-db.log/.exit. Subsequent full/build results follow below.

## Parent Full Gate

test:all exits0:225files2789tests, native60/60 and UI16/16. Both typechecks, full
lint, architecture/security, docs/packaging, backup/import, legacy/Drizzle crash
and recovery, startup/userscript/OJ bridge and renderer performance gates pass.
The unchanged warmed daily benchmark measures0.97ms (<50ms). Coverage is76.76%
statements /70.60% branches /74.12% functions /79.98% lines; duplication1.76%.
All819 product/config/test hashes remain unchanged. Logs:
tmp/drizzle-a4d-all.log/.exit. build:check also exits0, including compiled main,
preloads and the packaged-main native-external guard; evidence:
tmp/drizzle-a4d-build.log/.exit. No installer or release is produced.

The earlier A4b2 Tooltip incident does not recur in this run. This pass does not
establish its original root cause or claim a fix. Preserve the prior evidence
and stop for trusted-event/simultaneous-state capture if it recurs.

## Integration Closure

Work78f33b9e171be53b46ac51ebf820ccec28597b7d passes normal pre-commit and
immediate pre-push/test:ci hooks. PR29 feature CI45989652010 passes both required
jobs, then squashfb0dd45e16827117c4f3e4cb697e76105e40da34 integrates into
refactor/drizzle. The squash tree is byte-identical to the tested work commit.
PR8 integration CI45991420238 also passes both required jobs. PR8 remains
draft/open with base dev. dev/master and v2.0.1 are unchanged; no release.

Evidence: tmp/drizzle-a4d-{commit,push,feature-ci,integration-ci}.log/.exit.
All819 source hashes still match after hooks and integration. Original D remains
HEAD20ee62c with the same62 dirty-file hashes. Phase3 and its parent stay active.

Next-domain research a5-notes-queries.md and independent precheck
a5a-notes-file-path-review.md recommend a four-file-path-read slice. They are
future planning only: exact helper location, damaged-column native diagnostic
qualification and a real-app/native filesystem harness still need governing
artifact sync and parent GO. No notes code or budget changes are part of A4d.
